import Phaser from 'phaser';
import BaseMode from './BaseMode';
import { normalizeRunnerPacing } from '../../game/promptUtils';
import {
  RUNNER_GRAVITY,
  RUNNER_JUMP_FORCE,
  RUNNER_OBSTACLE_DELAY_MS,
  RUNNER_SPEED,
  runnerAirtimeMs,
  runnerMinObstacleInterval,
  runnerMinObstacleLead,
  runnerObstacleWarningS
} from '../../gameConfig';

// Hard backstop for the spawn guard: an obstacle is never born closer than this
// many seconds of travel ahead of the player, whatever the speed, screen size or
// jump physics. The physics-derived warning window is the real constraint; this
// just makes "never spawn on the player" true unconditionally.
const OBSTACLE_CLEARANCE_S = 0.25;

export default class RunnerMode extends BaseMode {
  init() {
    const theme = this.scene.activeTheme || {};
    // Prioritize gameConfig (prompt modifiers) -> theme defaults -> hardcoded fallback
    this.baseSpeed = this.scene.gameConfig.runSpeed || theme.moveSpeed || 350;
    this.runSpeed = this.baseSpeed;
    this.obstacles = null;
    this.obstacleTimer = null;
    this.coins = null;
    // Airborne/grounded edge detection, for landing feedback. `lastVy` is the
    // previous frame's vertical velocity: a grounded edge only counts as a
    // landing when the player was actually FALLING — `touching.down` can
    // flicker on a resting body and must never spawn dust or a squash.
    this.wasGrounded = true;
    this.lastVy = 0;
    this.lastLandingAt = 0;
    // One console note per run, not per clamp. `init()` runs again on every
    // scene.restart(), so a retry gets to report its own config.
    this.timingWarned = false;
  }

  create() {
    const theme = this.scene.activeTheme || {};
    this.scene.player.setGravityY(this.scene.gameConfig.gravity || (theme.gravity || 1800));
    this.scene.playPlayerAnim('run');

    this.obstacles = this.scene.physics.add.group();

    // Obstacles are paced by a TIMER whose interval is `config.obstacleDelay`
    // (MILLISECONDS), the value the tuning table, the Creator Panel slider and
    // the AI editor all speak. The two multipliers give the feel the config
    // asked for: a slightly shorter interval as the run speeds up, which is the
    // difficulty curve a runner needs. It is still one TimerEvent named
    // `obstacleTimer`, re-armed after each spawn, so the pause path's by-name
    // reach-in is unchanged.
    this.armObstacleTimer();

    this.scene.physics.add.collider(this.obstacles, this.scene.floor);
    this._collisionsEnabled = !window.__GAME_IS_TRANSITIONING;
    if (!this._collisionsEnabled) {
      this._transitionListener = () => { this._collisionsEnabled = true; };
      window.addEventListener('transition-complete', this._transitionListener);
    }
    this.scene.physics.add.collider(this.scene.player, this.obstacles, (player, obstacle) => {
      if (!this._collisionsEnabled) return;
      this.scene.hitObstacle(player, obstacle);
    }, null, this);

    // Coin pickups: spawned in an arc over obstacles (see spawnCoinArc), collected
    // on overlap for score. Same pattern as PlatformerMode's collectibles.
    this.coins = this.scene.physics.add.group();
    this.scene.physics.add.overlap(this.scene.player, this.coins, (player, coin) => {
      if (!coin || !coin.active) return;
      const value = this.scene.gameConfig.coinValue ?? 25;
      // Read the position before destroying — the burst needs to spawn where the
      // coin was, not where the (fixed-position) player is.
      this.scene.fx?.pickup(coin.x, coin.y, value);
      coin.destroy();
      this.scene.score += value;
      window.dispatchEvent(new CustomEvent('update-score', { detail: this.scene.score }));
    }, null, this);

    this.gameInputListener = (e) => {
      if (!e.detail) return;
      const { action, state } = e.detail;
      const isDown = state === 'down';

      if (action === 'jump' && isDown) {
        this.jump();
      }
    };
    window.addEventListener('game-input', this.gameInputListener);

    this.resizeListener = (gameSize) => {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.handleResize(gameSize);
      }, 150);
    };
    this.scene.scale.on('resize', this.resizeListener, this);
  }

  /**
   * Milliseconds until the next obstacle.
   *
   * `config.obstacleDelay` is a real interval in milliseconds — it is the value
   * the tuning table (`promptUtils.js`, whose runner rows are all at or above
   * their own airtime floor), the Creator Panel slider (400-2500) and the AI
   * editor's whitelist all mean by it.
   *
   * An earlier revision divided it by the run speed to "re-derive" a distance
   * budget. That was wrong twice over: it returned SECONDS into a millisecond
   * timer, and the 320ms floor then swallowed the result, so EVERY config
   * spawned an obstacle every 320ms — a 112px gap at 350px/s against a 833ms
   * jump, i.e. unsurvivable, with the config's difficulty knobs all dead.
   *
   * The interval is then floored at the run's own minimum jumpable interval
   * (`runnerMinObstacleInterval`): the player has no double jump, so anything
   * shorter than one airtime plus a landing window means the next obstacle
   * arrives mid-air and the level is physically unwinnable rather than hard.
   * The floor is applied AFTER the speed curve, which shortens the interval as
   * the run accelerates and would otherwise walk back under it late in a run.
   */
  nextObstacleDelay() {
    const gapMs = this.scene.gameConfig.obstacleDelay || RUNNER_OBSTACLE_DELAY_MS;
    const speed = Math.max(this.runSpeed || 1, 1);
    const speedFactor = Phaser.Math.Clamp(speed / (this.baseSpeed || speed), 0.5, 2.5);
    const curveMs = Phaser.Math.Clamp(gapMs * (1 - (speedFactor - 1) * 0.12), 320, 2600);
    const minMs = runnerMinObstacleInterval(this.runnerPhysics());
    if (minMs > curveMs) {
      this.logTimingClamp(
        `obstacle interval ${Math.round(curveMs)}ms -> ${Math.round(minMs)}ms`,
        `an interval under one jump's airtime (${Math.round(runnerAirtimeMs(this.runnerPhysics()))}ms) leaves no room to land and re-jump`
      );
    }
    return Math.max(curveMs, minMs);
  }

  /** The jump physics the pacing budget is measured against. */
  runnerPhysics(extra = {}) {
    const cfg = this.scene.gameConfig;
    return {
      jumpForce: cfg.jumpForce,
      gravity: cfg.gravity,
      runSpeed: this.runSpeed || this.baseSpeed,
      ...extra
    };
  }

  /** One-time console note when a clamp overrides a config value, so an impossible config is visible instead of silently rewritten. */
  logTimingClamp(detail, why) {
    if (this.timingWarned) return;
    this.timingWarned = true;
    console.info(`[RUNNER] Obstacle pacing clamped to a playable level — ${detail} (${why}).`);
  }

  /**
   * Where the next obstacle is born.
   *
   * The right edge of the viewport is the natural spawn point — it keeps
   * obstacles from popping into existence in view — and in runner mode that is
   * also a FIXED world x, because the camera's `scrollX` is pinned at 0 (the
   * world scrolls past a stationary player; `virtualScrollX` is parallax-only).
   *
   * A fixed spawn x therefore hands the player a warning of
   * `(spawnX - viewportWidth) / runSpeed` seconds, and that shrinks as the
   * screen narrows — a phone got ~0.7s to react to the first obstacle of the
   * run, wide desktop screens got 3-4s. So the spawn is additionally pushed
   * off-screen by the distance needed to give a full warning window at the
   * current speed (`runnerMinObstacleLead`), plus a small backstop so an
   * obstacle can never be born on top of the player at all.
   *
   * Applied to EVERY spawn, not just the first: the stream is born at a fixed x
   * while the run speed ramps, so a first-spawn-only guard would let a later
   * obstacle inherit the old margin. The floors are lower bounds only, so they
   * can never bring two obstacles closer than the spawn interval already
   * spaces them.
   */
  nextSpawnX() {
    const camera = this.scene.cameras.main;
    const speed = Math.max(this.runSpeed || 1, 1);
    const edge = camera.scrollX + camera.width + 16;
    const player = this.scene.player;
    const playerX = player ? player.x : edge;

    // Born just off the right edge, but only once it is far enough out that
    // crossing into view leaves a full warning window. This is the normal path
    // at every speed, so it is deliberately NOT logged as a clamp.
    const withWarning = edge + runnerMinObstacleLead(this.runnerPhysics());
    // Backstop: never inside the player, whatever the speed or screen size.
    // Only reachable when the viewport is so narrow that the warning lead would
    // land the obstacle on top of the player — that IS a clamp worth reporting.
    const clearOfPlayer = playerX + speed * OBSTACLE_CLEARANCE_S;

    if (clearOfPlayer > withWarning) {
      this.logTimingClamp(
        `spawn pushed ${Math.round(clearOfPlayer - edge)}px past the screen edge`,
        `a ${Math.round(camera.width)}px viewport at ${Math.round(speed)}px/s only leaves ${((edge - playerX) / speed).toFixed(2)}s of warning, under the ${runnerObstacleWarningS(this.runnerPhysics()).toFixed(2)}s a jump needs`
      );
    }
    return Math.max(withWarning, clearOfPlayer);
  }

  /** (Re)arms the single pending obstacle-spawn timer. */
  armObstacleTimer() {
    if (this.obstacleTimer) this.obstacleTimer.remove();
    this.obstacleTimer = this.scene.time.addEvent({
      delay: this.nextObstacleDelay(),
      callback: () => {
        this.spawnObstacle();
        // One-shot re-arm, never `loop: true`: the delay has to be recomputed
        // from the speed at the moment of the spawn.
        if (!this.scene.isGameOver) this.armObstacleTimer();
      },
      callbackScope: this
    });
  }

  spawnObstacle() {
    if (this.scene.isGameOver) return;

    const scale = Phaser.Math.FloatBetween(this.scene.gameConfig.obstacleScaleMin || 0.8, this.scene.gameConfig.obstacleScaleMax || 1.2);
    const spawnX = this.nextSpawnX();
    
    this._spawnCount = (this._spawnCount || 0) + 1;
    const sceneUptime = this.scene.time.now - (this.scene._createTime || 0);
    console.log(`[RUNNER] Obstacle #${this._spawnCount} spawned at x=${spawnX.toFixed(1)}, sceneUptime=${Math.round(sceneUptime)}ms, playerX=${this.scene.player?.x?.toFixed(1)}`);

    const obstacleTexture = this.scene.gameConfig.dynamicAssetUrls ? 'dyn_obstacle' : (this.scene.activeTheme?.obstacleTexture || 'crate');

    // Obtain frame dimensions for proper obstacle scaling normalization
    const textureObj = this.scene.textures.get(obstacleTexture);
    const frame = textureObj?.get(0);
    const frameWidth = frame ? frame.width : 64;
    const frameHeight = frame ? frame.height : 64;

    const targetSize = this.scene.gameConfig.dynamicAssetUrls ? 54 : 64;
    const normalizedScaleX = (targetSize / frameWidth) * scale;
    const normalizedScaleY = (targetSize / frameHeight) * scale;

    // Center origin and adjust position based on scaled height so it sits on the ground
    const obstacle = this.scene.add.sprite(spawnX, this.scene.LOGICAL_FLOOR_Y - (targetSize * scale) / 2, obstacleTexture);
    obstacle.setScale(normalizedScaleX, normalizedScaleY);
    this.scene.physics.add.existing(obstacle);
    this.obstacles.add(obstacle);

    if (this.scene.gameConfig.dynamicAssetUrls) {
      obstacle.body.setSize(obstacle.width, obstacle.height);
      obstacle.body.setOffset(0, 0);
    }

    const theme = this.scene.activeTheme || {};
    obstacle.body.setGravityY(this.scene.gameConfig.gravity || (theme.gravity || 1800));
    obstacle.body.setVelocityX(-this.runSpeed);

    this.spawnCoinArc(spawnX);
  }

  // A 3-coin arc traced over the obstacle so collecting rewards the jump the
  // obstacle forces anyway. Piggybacks on the obstacle spawn — no second timer,
  // so pause handling (which reaches into obstacleTimer by name) needs no changes
  // and physics.pause() freezes coins like everything else.
  spawnCoinArc(obstacleX) {
    if (!this.coins || Math.random() > 0.7) return; // ~70% of obstacles carry coins
    const useDyn = this.scene.gameConfig.dynamicAssetUrls && this.scene.textures.exists('dyn_collectible');
    const textureKey = useDyn ? 'dyn_collectible' : 'coin';
    const frame = this.scene.textures.get(textureKey)?.get(0);
    // Max-dimension normalization: generated art is cropped to content and can be
    // any aspect; the static coin.svg is square. Target ~28px either way.
    const coinScale = 28 / Math.max(frame?.width || 28, frame?.height || 28);
    const floorY = this.scene.LOGICAL_FLOOR_Y;
    [[-70, -110], [0, -150], [70, -110]].forEach(([dx, dy]) => {
      const coin = this.coins.create(obstacleX + dx, floorY + dy, textureKey);
      coin.setScale(coinScale);
      coin.body.setAllowGravity(false);
      coin.body.setVelocityX(-this.runSpeed);
    });
  }

  update(time, delta) {
    if (this.scene.isGameOver || this.scene.isGamePaused) return;

    const player = this.scene.player;
    const grounded = player.body.touching.down || player.body.blocked.down;
    if (grounded) {
      if (!this.wasGrounded && this.lastVy > 140 && time - this.lastLandingAt > 120) {
        // Touchdown after a real fall: a squash and a puff of dust, so landings
        // have weight. Velocity-gated + rate-limited (see init).
        this.lastLandingAt = time;
        this.scene.fx?.landing(player.x, player.body.bottom);
        this.scene.fx?.pulse(player, 1.16, 0.84, 90);
      }
      this.scene.playPlayerAnim('run');
      // Tie playback rate to actual speed. The run cycle is authored at one
      // fixed frame rate, so as speedIncrement ramps the feet visibly skate.
      if (player.anims) {
        player.anims.timeScale = Phaser.Math.Clamp(this.runSpeed / (this.baseSpeed || 1), 0.6, 1.5);
      }
    }
    this.wasGrounded = grounded;
    this.lastVy = player.body.velocity.y;

    // Scroll floor
    if (this.scene.floorSegments) {
      this.scene.floorSegments.forEach((tile) => {
        tile.x -= (this.runSpeed * (delta / 1000));
      });
      const tileWidth = this.scene.floorSegments[0]?.displayWidth || 16;
      this.scene.floorSegments.forEach((tile) => {
        if (tile.x + tileWidth < this.scene.cameras.main.scrollX) {
          const maxX = Math.max(...this.scene.floorSegments.map(seg => seg.x));
          tile.x = maxX + tileWidth;
        }
      });
    } else {
      this.scene.floor.tilePositionX += (this.runSpeed * (delta / 1000)) / this.scene.floor.tileScaleX;
    }

    // Cleanup off-screen obstacles
    if (this.obstacles && this.obstacles.children) {
      this.obstacles.children.iterate((obstacle) => {
        if (obstacle && obstacle.x < -50) {
          obstacle.destroy();
        }
      });
    }

    // Cleanup off-screen (missed) coins
    if (this.coins && this.coins.children) {
      this.coins.children.iterate((coin) => {
        if (coin && coin.x < -50) {
          coin.destroy();
        }
      });
    }

    // Progressive speed
    this.runSpeed += this.scene.gameConfig.speedIncrement || 0.05;
  }

  jump() {
    if (this.scene.isGameOver) return;
    
    if (this.scene.player.body.touching.down || this.scene.player.body.blocked.down) {
      this.scene.player.body.setVelocityY(-(this.scene.gameConfig.jumpForce || RUNNER_JUMP_FORCE));
      this.scene.playPlayerAnim('jump');
      this.scene.fx?.pulse(this.scene.player, 0.86, 1.18, 80); // stretch on takeoff
      this.wasGrounded = false;
    }
  }

  handleResize(gameSize) {
    if (!this.scene || !this.scene.cameras || !this.scene.cameras.main) return;
    const safeWidth = Math.max(1, gameSize.width);
    const safeHeight = Math.max(1, gameSize.height);
    
    if (this.scene.cameraManager) {
      this.scene.cameraManager.handleResize({ width: safeWidth, height: safeHeight });
    }
  }

  onConfigUpdate(newConfig, oldConfig) {
    // Every live tweak — the Creator Panel sliders, the difficulty dial, the AI
    // editor's clamped patch — lands here, so this is where the run's physics
    // get one last plausibility check. Without it a slider combination exists
    // that no amount of pacing can rescue (the AI editor's `jumpForce` floor of
    // 400 under heavy gravity leaves an apex below the tallest obstacle, i.e. a
    // level that cannot be completed at all).
    normalizeRunnerPacing(newConfig);
    // The scene already merged the UNNORMALIZED values into `gameConfig` before
    // calling us, so re-merge: `jump()` reads `gameConfig.jumpForce` at the
    // moment of the jump and must see the raised value, not the one we just
    // replaced. (`this.scene.gameConfig` is a plain merged copy, never frozen.)
    this.scene.gameConfig = { ...this.scene.gameConfig, ...newConfig };

    this.baseSpeed = newConfig.runSpeed || RUNNER_SPEED;
    this.runSpeed = this.baseSpeed;

    if (this.scene.player && this.scene.player.body) {
      this.scene.player.body.setGravityY(newConfig.gravity || RUNNER_GRAVITY);
    }

    if (this.obstacles && this.obstacles.children) {
      this.obstacles.children.iterate((obstacle) => {
        if (obstacle && obstacle.body) {
          obstacle.body.setGravityY(newConfig.gravity || RUNNER_GRAVITY);
          obstacle.body.setVelocityX(-this.runSpeed);
        }
      });
    }

    if (this.coins && this.coins.children) {
      this.coins.children.iterate((coin) => {
        if (coin && coin.body) coin.body.setVelocityX(-this.runSpeed);
      });
    }

    // runSpeed, the interval budget and the JUMP PHYSICS all feed the pending
    // spawn's delay (the minimum is derived from jumpForce/gravity, so a live
    // gravity or jump tweak can raise the floor the timer has to respect), so
    // any of them re-arms it rather than waiting out an interval computed for
    // the old numbers.
    const pacingInputs = ['obstacleDelay', 'runSpeed', 'jumpForce', 'gravity'];
    if (pacingInputs.some((key) => oldConfig[key] !== newConfig[key])) {
      // The new config may be playable where the old one was not — let it
      // report its own clamps.
      this.timingWarned = false;
      this.armObstacleTimer();
    }
  }

  cleanup() {
    if (this.obstacleTimer) {
      this.obstacleTimer.remove();
    if (this._transitionListener) {
      window.removeEventListener('transition-complete', this._transitionListener);
      this._transitionListener = null;
    }
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    if (this.resizeListener) {
      this.scene.scale.off('resize', this.resizeListener, this);
    }
    if (this.obstacles && this.obstacles.scene) {
      try { this.obstacles.clear(true, true); } catch (e) {}
    }
    if (this.coins && this.coins.scene) {
      try { this.coins.clear(true, true); } catch { /* scene already torn down */ }
    }
    if (this.gameInputListener) {
      window.removeEventListener('game-input', this.gameInputListener);
      this.gameInputListener = null;
    }
  }
}

