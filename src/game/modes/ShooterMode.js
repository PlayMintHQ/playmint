import Phaser from 'phaser';
import BaseMode from './BaseMode';
import Projectile from '../objects/Projectile';

// AUTO is the default; the config flag (or the localStorage dev override, same
// shape as the other PM_* switches) turns on the manual twin-stick scheme.
function readManualAim(cfg) {
  if (cfg?.shooterManualAim === true) return true;
  try {
    return window.localStorage.getItem('PM_SHOOTER_MANUAL_AIM') === '1';
  } catch {
    return false; // private mode / storage disabled — auto is the default anyway
  }
}

// Top-down arena survival shooter. No gravity, 360° movement.
//
// AIMING has two modes and AUTO is the default (client direction 2026-09-27 —
// the manual twin-stick scheme had replaced v1's auto-targeting and made mobile
// unplayable for a casual player):
//   AUTO  (config.shooterManualAim !== true, also the PM_SHOOTER_MANUAL_AIM='1'
//          dev override to flip it) — the player turns toward the NEAREST enemy
//          inside shooterFireRange in ANY direction and fires at it on the
//          shooterFireRate cooldown, holding the trigger by itself. The only
//          input is "move". No target in range = no shot, so the gun never
//          fires into an empty arena (v1's tell-tale broken-button behavior).
//   MANUAL — the previous scheme, unchanged: the player faces the mouse cursor
//          (desktop) or the right analog stick's last direction (touch) and
//          F / click / stick-release fires along that aim, with a cone
//          aim-assist when a touch device fires with no aim input at all.
// Auto-aim also never snaps: facing is rate-limited toward the target (and the
// projectile flies at the target's own position), so a chasing enemy reads as
// the turret tracking, not teleporting. A thin reticle marks the locked target.
// Player/enemy art is a single static top-down sprite rotated at render time,
// never a directional sheet — GameManagerScene skips SpriteAlignmentManager's
// ground-anchor/flip logic for this mode and leaves the sprite origin centered.
export default class ShooterMode extends BaseMode {
  init() {
    const cfg = this.scene.gameConfig;

    this.moveSpeed = cfg.shooterMoveSpeed || 260;
    this.fireRate = cfg.shooterFireRate || 500;
    this.projectileSpeed = cfg.shooterProjectileSpeed || 500;
    this.fireRange = cfg.shooterFireRange || 400;
    this.enemySpeed = cfg.shooterEnemySpeed || 100;
    this.waveCount = cfg.shooterWaveCount || 5;
    this.enemiesPerWave = cfg.shooterEnemiesPerWave || 4;

    this.worldWidth = cfg.worldWidth || 2000;
    this.worldHeight = cfg.worldHeight || 1500;

    this.currentWave = 0;
    this.fireCooldown = 0;
    this.fireTrigger = false;
    this.mouseAimActive = false;
    this.mouseAiming = false;
    this.manualAim = readManualAim(cfg);
    // rad/s the player turns toward its auto-target. Snappy enough to keep a
    // 100px/s chaser inside a 400px range, smooth enough to read as turning.
    this.turnRate = 7;
    // Auto-aim lock reticle color — a light cyan that reads on all five
    // static themes and on generated art alike.
    this.reticleColor = 0x8ff7ff;
    this.reticle = null;
    this.lockedTarget = null;
    // Touch aim-assist cone: half-angle (radians) around the player's facing
    // direction that an enemy must fall inside to be auto-targeted. ±45° keeps
    // the assist forgiving without snapping shots sideways. MANUAL mode only.
    this.aimAssistCone = Math.PI / 4;
    this.moveInput = { up: false, down: false, left: false, right: false, x: 0, y: 0 };
    // Twin-stick aim (right analog stick, MANUAL mode): deflection vector,
    // whether it is currently deflected, and the last aim angle it produced —
    // the fire-on-release shot travels along lastAimAngle, not the post-release
    // rotation.
    this.aimInput = { x: 0, y: 0 };
    this.stickAiming = false;
    this.lastAimAngle = null;

    this.enemies = null;
    this.projectiles = null;
    this.collectibles = null;
  }

  create() {
    const { scene } = this;
    const player = scene.player;

    // World bounds/camera are already configured by GameManagerScene/cameraManager
    // before this runs — no gravity, full 360° movement, clamped to the arena.
    player.body.setAllowGravity(false);
    player.setCollideWorldBounds(true);
    player.setPosition(this.worldWidth / 2, this.worldHeight / 2);
    player.rotation = -Math.PI / 2; // face "up" by default, matches the art's authored facing

    this.enemies = scene.physics.add.group();
    this.projectiles = scene.physics.add.group({
      classType: Projectile,
      maxSize: 20,
      runChildUpdate: true
    });
    this.collectibles = scene.physics.add.group();

    scene.physics.add.overlap(player, this.enemies, this.handlePlayerEnemyCollision, null, this);

    scene.physics.add.overlap(this.projectiles, this.enemies, (proj, enemy) => {
      scene.fx?.projectileImpact(proj.x, proj.y);
      if (proj.deactivate) proj.deactivate();
      this.damageEnemy(enemy);
    });

    scene.physics.add.overlap(player, this.collectibles, (p, collectible) => {
      if (!collectible || !collectible.active) return;
      const value = scene.gameConfig.coinValue ?? 25;
      scene.fx?.pickup(collectible.x, collectible.y, value);
      this.awardScore(value);
      collectible.destroy();
    });

    // Auto-aim lock indicator. One persistent Graphics, cleared and restroked
    // each frame, created only in AUTO mode. Depth 5 so the ring draws over the
    // enemy it brackets.
    if (!this.manualAim) {
      this.reticle = scene.add.graphics().setDepth(5);
    }

    this.gameInputListener = (e) => {
      if (!e.detail) return;
      const { action, state } = e.detail;
      const isDown = state === 'down';
      if (action === 'up') this.moveInput.up = isDown;
      else if (action === 'down') this.moveInput.down = isDown;
      else if (action === 'left') this.moveInput.left = isDown;
      else if (action === 'right') this.moveInput.right = isDown;
      else if (action === 'shoot' && isDown) this.fireTrigger = true;
      else if (action === 'move') {
        // Left analog stick (twin-stick). x/y are normalized -1..1; the
        // boolean d-pad flags above stay supported for any legacy dispatcher.
        this.moveInput.x = e.detail.x || 0;
        this.moveInput.y = e.detail.y || 0;
      } else if (action === 'aim' && this.manualAim) {
        // Right analog stick: deflection drives facing; release fires.
        this.aimInput.x = e.detail.x || 0;
        this.aimInput.y = e.detail.y || 0;
        const mag = Math.hypot(this.aimInput.x, this.aimInput.y);
        if (mag > 0.2) {
          this.stickAiming = true;
          this.lastAimAngle = Math.atan2(this.aimInput.y, this.aimInput.x);
        } else if (state === 'up') {
          this.stickAiming = false;
        }
      }
    };
    window.addEventListener('game-input', this.gameInputListener);

    // Mouse aim engages on the first real (non-touch) pointer move — guards
    // against snapping the player to face (0,0) before the mouse has ever
    // moved, and keeps touch devices (which never fire a non-touch move) on
    // the assisted movement-facing/nearest-enemy behavior below. AUTO mode
    // never registers the pointer at all: it owns rotation outright.
    if (this.manualAim) {
      this.pointerMoveHandler = (pointer) => {
        if (pointer.wasTouch) return;
        this.mouseAimActive = true;
      };
      scene.input.on('pointermove', this.pointerMoveHandler, this);
    }

    this.resizeListener = (gameSize) => {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.handleResize(gameSize);
      }, 150);
    };
    scene.scale.on('resize', this.resizeListener, this);

    this.spawnWave();
  }

  handleResize(gameSize) {
    if (!this.scene || !this.scene.cameras || !this.scene.cameras.main) return;
    const safeWidth = Math.max(1, gameSize.width);
    const safeHeight = Math.max(1, gameSize.height);
    if (this.scene.cameraManager) {
      this.scene.cameraManager.handleResize({ width: safeWidth, height: safeHeight });
    }
  }

  // Places enemies at randomized points on the arena perimeter, clear of the
  // camera's current framing, clamped inside the world bounds.
  spawnWave() {
    const { scene } = this;
    const count = this.enemiesPerWave + this.currentWave;
    const centerX = this.worldWidth / 2;
    const centerY = this.worldHeight / 2;
    const radius = Math.min(this.worldWidth, this.worldHeight) / 2 - 40;
    // Static/keyless path prefers the top-down placeholder figure over the
    // side-view theme sprite (which reads as lying down once rotated).
    const useTopdownPlaceholder = !scene.gameConfig.dynamicAssetUrls && scene.textures.exists('topdown_enemy');
    const enemyTexture = scene.gameConfig.dynamicAssetUrls ? 'dyn_enemy'
      : useTopdownPlaceholder ? 'topdown_enemy'
      : (scene.activeTheme?.enemyTexture || 'dude');

    for (let i = 0; i < count; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const x = Phaser.Math.Clamp(centerX + Math.cos(angle) * radius, 20, this.worldWidth - 20);
      const y = Phaser.Math.Clamp(centerY + Math.sin(angle) * radius, 20, this.worldHeight - 20);

      const enemy = this.enemies.create(x, y, enemyTexture);
      enemy.health = 3;
      enemy.body.setAllowGravity(false);

      if (scene.gameConfig.dynamicAssetUrls) {
        const textureObj = scene.textures.get(enemyTexture);
        const frame = textureObj?.get(0);
        const h = frame ? frame.height : 128;
        enemy.setScale(50 / h);
        enemy.body.setSize(enemy.width, enemy.height);
        enemy.body.setOffset(0, 0);
      } else if (useTopdownPlaceholder) {
        // SVG authored at its in-game size (44px), already red — no tint needed.
        enemy.body.setSize(enemy.width, enemy.height);
        enemy.body.setOffset(0, 0);
      } else {
        enemy.setFrame(5);
        enemy.setTint(0xff0000);
        enemy.body.setSize(20, 42);
        enemy.body.setOffset(6, 6);
      }
      enemy.rotation = -Math.PI / 2;
    }

    this.currentWave += 1;
  }

  update(time, delta) {
    const { scene } = this;
    if (scene.isGameOver || scene.isGamePaused) return;

    const player = scene.player;
    const keys = scene.keyStates || {};
    const pointer = scene.input.activePointer;
    const dt = delta / 1000;
    this.mouseAiming = this.manualAim && this.mouseAimActive && !pointer.wasTouch;

    // Movement: the left analog stick (twin-stick) wins when deflected; the
    // keyboard/d-pad boolean flags remain the fallback (and the only path on
    // desktop). Both produce a normalized vector.
    let vx = 0;
    let vy = 0;
    const stickMag = Math.hypot(this.moveInput.x, this.moveInput.y);
    if (stickMag > 0.15) {
      vx = this.moveInput.x;
      vy = this.moveInput.y;
    } else {
      vx = (keys.ArrowRight || keys.KeyD || this.moveInput.right ? 1 : 0)
        - (keys.ArrowLeft || keys.KeyA || this.moveInput.left ? 1 : 0);
      vy = (keys.ArrowDown || keys.KeyS || this.moveInput.down ? 1 : 0)
        - (keys.ArrowUp || keys.KeyW || this.moveInput.up ? 1 : 0);
    }

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      const len = Math.hypot(vx, vy);
      vx /= len; vy /= len;
      player.body.setVelocity(vx * this.moveSpeed, vy * this.moveSpeed);
    } else {
      player.body.setVelocity(0, 0);
    }
    const travelAngle = moving ? Phaser.Math.Angle.Between(0, 0, vx, vy) : null;

    // AUTO: the nearest live enemy anywhere inside fireRange, 360°. This is the
    // whole mode — one target, one input, no aiming.
    const autoTarget = this.manualAim ? null : this.findTargetInRange();
    this.lockedTarget = autoTarget;

    // Facing is written in exactly ONE place, in priority order, each step
    // overriding the last: movement -> auto-target -> right stick -> mouse.
    if (this.manualAim) {
      if (this.mouseAiming) {
        // Face the cursor every frame, independent of movement.
        player.rotation = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);
      } else if (this.stickAiming && this.lastAimAngle !== null) {
        player.rotation = this.lastAimAngle;
      } else if (travelAngle !== null) {
        player.rotation = travelAngle;
      }
    } else if (autoTarget) {
      const desired = Phaser.Math.Angle.Between(player.x, player.y, autoTarget.x, autoTarget.y);
      player.rotation = Phaser.Math.Angle.RotateTo(player.rotation, desired, this.turnRate * dt);
    } else if (travelAngle !== null) {
      player.rotation = Phaser.Math.Angle.RotateTo(player.rotation, travelAngle, this.turnRate * dt);
    }
    this.drawLockReticle(autoTarget);

    // Enemy AI: chase the player, rotate to face travel direction (same
    // rotate-at-render-time treatment as the player — locked art decision).
    this.enemies.children.iterate((enemy) => {
      if (!enemy || !enemy.active) return;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
      enemy.body.setVelocity(Math.cos(angle) * this.enemySpeed, Math.sin(angle) * this.enemySpeed);
      enemy.rotation = angle;
    });

    if (this.fireCooldown > 0) this.fireCooldown -= delta;
    const canFire = this.fireCooldown <= 0;

    if (!this.manualAim) {
      // AUTO FIRE: the trigger is held for the player. Fires at the locked
      // target's own position and does NOT snap the sprite to the shot (the
      // rate-limited turn above is what the player sees). Nothing in range =
      // nothing fired, so an empty arena reads as "no target", not as a jam.
      if (autoTarget && canFire) {
        this.fireAt(autoTarget, false);
        this.fireCooldown = this.fireRate;
      }
    } else if ((keys._shootTrigger || this.fireTrigger) && canFire) {
      // MANUAL: F key / click (GameManagerScene) / right-stick release
      // (gameInputListener above) set the trigger; cooldown still rate-limits
      // it so holding/mashing the trigger can't out-fire fireRate. Mouse aim
      // fires a real directional shot toward the cursor; the right stick fires
      // along its last aim angle; a touch device with NO aim input falls back
      // to cone aim-assist, otherwise a straight shot — the trigger ALWAYS
      // fires (a dead button on an empty arena read as broken).
      if (this.mouseAiming) {
        this.fireInDirection(player.rotation);
        this.fireCooldown = this.fireRate;
      } else if (this.lastAimAngle !== null) {
        // Twin-stick aim: the shot travels along the aim stick's last
        // direction, even though the stick is already released. Cleared after
        // firing (unless the stick is still held) so a later F-key/click/tap
        // falls back to cone-assist instead of a stale angle.
        this.fireInDirection(this.lastAimAngle);
        this.fireCooldown = this.fireRate;
        if (!this.stickAiming) this.lastAimAngle = null;
      } else {
        const target = this.findTargetInRange(this.aimAssistCone);
        if (target) {
          this.fireAt(target);
        } else {
          this.fireInDirection(player.rotation);
        }
        this.fireCooldown = this.fireRate;
      }
    }
    if (scene.keyStates) scene.keyStates._shootTrigger = false;
    this.fireTrigger = false;

    // Wave clear / win condition.
    if (this.enemies.countActive(true) === 0) {
      if (this.currentWave < this.waveCount) {
        this.spawnWave();
      } else if (scene.winGame) {
        scene.winGame();
      }
    }
  }

  /**
   * Nearest live enemy within fireRange, measured edge to edge.
   *
   * `cone` optionally restricts candidates to that half-angle around the
   * player's facing (the MANUAL touch aim-assist). Omit it (or pass Math.PI)
   * for an unrestricted 360° pick — which is what AUTO aim uses, so the
   * turret can lock a target behind the player.
   */
  findTargetInRange(cone = Math.PI) {
    if (!this.enemies || !this.scene || !this.scene.player) return null;
    const player = this.scene.player;
    const halfWidth = (player.displayWidth || player.width || 0) / 2;
    const halfHeight = (player.displayHeight || player.height || 0) / 2;
    let nearest = null;
    let nearestDist = Infinity;
    this.enemies.children.iterate((enemy) => {
      if (!enemy || !enemy.active || enemy._dying) return;
      // Edge-to-edge, not center-to-center: a 50px-wide enemy must be in
      // range when its edge is, not half a body too late.
      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y)
        - (enemy.displayWidth || enemy.width || 0) / 2
        - Math.max(halfWidth, halfHeight);
      if (dist > this.fireRange) return;
      if (cone < Math.PI) {
        const toEnemy = Phaser.Math.Angle.Between(player.x, player.y, enemy.x, enemy.y);
        if (Math.abs(Phaser.Math.Angle.Wrap(toEnemy - player.rotation)) > cone) return;
      }
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    });
    return nearest;
  }

  // Auto-aim lock indicator: a thin ring with four ticks on the current target.
  // Cleared every frame (including when the target is lost) so it can never
  // linger on a dead enemy.
  drawLockReticle(target) {
    const g = this.reticle;
    if (!g || !g.scene) return;
    g.clear();
    if (!target) return;
    const r = Math.max(22, (target.displayWidth || target.width || 40) * 0.7);
    g.lineStyle(2, this.reticleColor, 0.85);
    g.strokeCircle(target.x, target.y, r);
    g.lineStyle(2, this.reticleColor, 0.45);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      g.lineBetween(
        target.x + cos * (r + 3), target.y + sin * (r + 3),
        target.x + cos * (r + 9), target.y + sin * (r + 9)
      );
    }
  }

  fireAt(target, faceShot = true) {
    this.spawnProjectileToward(target.x, target.y, faceShot);
  }

  // Directional fire: no target sprite, just a travel direction — project a
  // point far along it and reuse the same spawn path as fireAt().
  fireInDirection(angle) {
    const player = this.scene.player;
    this.spawnProjectileToward(
      player.x + Math.cos(angle) * this.fireRange,
      player.y + Math.sin(angle) * this.fireRange
    );
  }

  spawnProjectileToward(targetX, targetY, faceShot = true) {
    const { scene } = this;
    const player = scene.player;
    const projectile = this.projectiles.get();
    if (!projectile) return;

    const useDynamic = scene.gameConfig.dynamicAssetUrls && scene.textures.exists('dyn_projectile');
    const textureKey = useDynamic ? 'dyn_projectile' : 'projectile';
    projectile.setTexture(textureKey);
    projectile.setScale(useDynamic ? 32 / projectile.frame.width : 1);

    projectile.fireAt(player.x, player.y, targetX, targetY, this.projectileSpeed);
    // Manual shots snap the sprite to where they went (it shows the aim);
    // auto-aim leaves rotation to the rate-limited turn in update().
    if (faceShot) {
      player.rotation = Phaser.Math.Angle.Between(player.x, player.y, targetX, targetY);
    }
  }

  jump() {
    // No-op — shooter has no jump concept. Inherited BaseMode default is fine
    // too, but kept explicit for clarity since GameManagerScene's Space/W
    // handler unconditionally calls gameModeManager.jump().
  }

  damageEnemy(enemy) {
    if (!enemy || !enemy.active || enemy._dying) return;
    const { scene } = this;

    enemy.health -= 1;
    this.awardScore(10);

    if (enemy.health <= 0) {
      enemy._dying = true;
      if (enemy.body) enemy.body.enable = false;

      scene.fx?.enemyKilled(enemy, 100);
      scene.fx?.hitstop(60);

      scene.tweens.add({
        targets: enemy,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        duration: 200,
        ease: 'Power2',
        onComplete: () => {
          if (enemy.scene) this.enemies.remove(enemy, true, true);
        }
      });

      this.awardScore(100);
    } else {
      scene.fx?.enemyHit(enemy);
      enemy.setTintFill(0xffffff);
      scene.time.delayedCall(70, () => {
        if (enemy.active) enemy.setTint(0xff0000);
      });
    }
  }

  handlePlayerEnemyCollision(player, enemy) {
    if (enemy._dying) return;
    this.scene.hitObstacle();
  }

  onConfigUpdate(newConfig) {
    this.moveSpeed = newConfig.shooterMoveSpeed || 260;
    this.fireRate = newConfig.shooterFireRate || 500;
    this.projectileSpeed = newConfig.shooterProjectileSpeed || 500;
    this.fireRange = newConfig.shooterFireRange || 400;
    this.enemySpeed = newConfig.shooterEnemySpeed || 100;
    // Wave/enemy-count changes apply starting the next wave, not mid-wave.
    this.waveCount = newConfig.shooterWaveCount || 5;
    this.enemiesPerWave = newConfig.shooterEnemiesPerWave || 4;
    // The aim mode is read once at init: switching it mid-run would leave a
    // half-wired input scheme (a right stick that no longer aims, a mouse that
    // no longer rotates), so a change takes effect on the next boot.
  }

  awardScore(points) {
    if (!points) return;
    this.scene.score += points;
    window.dispatchEvent(new CustomEvent('update-score', { detail: this.scene.score }));
  }

  cleanup() {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    if (this.resizeListener) this.scene.scale.off('resize', this.resizeListener, this);
    if (this.pointerMoveHandler && this.scene?.input) {
      this.scene.input.off('pointermove', this.pointerMoveHandler, this);
      this.pointerMoveHandler = null;
    }
    if (this.reticle) {
      this.reticle.destroy();
      this.reticle = null;
    }

    if (this.scene && this.scene.cameras && this.scene.cameras.main) {
      this.scene.cameras.main.stopFollow();
      if (this.scene.cameras.main.removeBounds) this.scene.cameras.main.removeBounds();
    }

    if (this.enemies && this.enemies.scene) {
      try { this.enemies.clear(true, true); } catch { /* scene already torn down */ }
    }
    if (this.projectiles && this.projectiles.scene) {
      try { this.projectiles.clear(true, true); } catch { /* scene already torn down */ }
    }
    if (this.collectibles && this.collectibles.scene) {
      try { this.collectibles.clear(true, true); } catch { /* scene already torn down */ }
    }

    if (this.gameInputListener) {
      window.removeEventListener('game-input', this.gameInputListener);
      this.gameInputListener = null;
    }
  }
}
