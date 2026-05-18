import Phaser from 'phaser';
import BaseMode from './BaseMode';
import Projectile from '../objects/Projectile';
import MeleeAttack from '../objects/MeleeAttack';

export default class PlatformerMode extends BaseMode {
  init() {
    const isForest = this.scene.activeTheme?.key === 'forest';
    this.moveSpeed = isForest ? 80 : 300; // Fixed speed as per new schema
    this.jumpForce = isForest ? 200 : (this.scene.gameConfig.actionJumpHeight || 600);
    this.gravity = isForest ? 500 : (this.scene.gameConfig.actionGravity || 1500);
    
    // Feature hooks for future combat implementation
    this.enemyCount = this.scene.gameConfig.actionEnemyCount || 5;
    this.projectilesEnabled = this.scene.gameConfig.actionProjectileEnabled || false;
    
    // Determine world width based on our fixed level layout
    this.worldWidth = isForest ? 960 : 4000;
    
    // We will track input state directly
    this.cursors = null;
    this.keys = null;
    this.movingLeft = false;
    this.movingRight = false;
    
    // Multitouch: track which pointer is pressing each button
    this.leftPointerId = null;
    this.rightPointerId = null;
    
    this.platforms = null;
    this.enemies = null;
    this.projectiles = null;
    this.meleeAttacks = null;   // Pool of MeleeAttack animated sprites
    this.winZone = null;
    this.collectibles = null;
    this.progressMilestones = new Set();

    // Melee cooldown: prevent spamming (ms)
    this.meleeCooldown = 0;
    this.MELEE_COOLDOWN_MS = 400;
    
    // Mobile controls container
    this.mobileControls = [];
  }

  create() {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    
    // Set explicit bounds to prevent walking into the void
    this.scene.physics.world.setBounds(0, 0, this.worldWidth, this.scene.LOGICAL_FLOOR_Y + 100);
    
    // Note: this.scene.floor is created by GameManagerScene and scaled. 
    // In GameManagerScene, we'll ensure floor width covers the world bounds if in platformer mode.

    // Config Player
    this.scene.player.setGravityY(this.gravity);
    this.scene.player.setCollideWorldBounds(true);
    
    // Center-left spawn
    const isForest = this.scene.activeTheme?.key === 'forest';
    const spawnX = isForest ? 48 : 150;
    const spawnY = isForest ? (this.scene.LOGICAL_FLOOR_Y - 48) : (this.scene.LOGICAL_FLOOR_Y - 250);
    this.scene.player.setPosition(spawnX, spawnY);

    // Camera follow
    this.updateCameraBounds(this.scene.scale);
    this.scene.cameras.main.startFollow(this.scene.player, true, 0.08, 0.08);

    // Create fixed platforms for Level 1
    this.platforms = this.scene.physics.add.staticGroup();
    this.enemies = this.scene.physics.add.group();
    this.collectibles = this.scene.physics.add.group();
    this.projectiles = this.scene.physics.add.group({
      classType: Projectile,
      maxSize: 10,
      runChildUpdate: true
    });
    this.meleeAttacks = this.scene.physics.add.group({
      classType: MeleeAttack,
      maxSize: 5,
      runChildUpdate: false
    });

    this.buildLevel1(height);

    this.spawnEnemiesForPlatforms();
    
    // Enable collision
    this.scene.physics.add.collider(this.scene.player, this.platforms);
    this.scene.physics.add.collider(this.enemies, this.platforms);
    this.scene.physics.add.collider(this.enemies, this.scene.floor);
    this.scene.physics.add.collider(this.projectiles, this.platforms, (proj) => {
      if (proj.deactivate) proj.deactivate();
    });

    this.scene.physics.add.overlap(this.scene.player, this.collectibles, (player, collectible) => {
      if (!collectible || !collectible.active) return;
      this.awardScore(25);
      collectible.destroy();
    });
    
    // Player hits enemy -> Game Over (if not attacking)
    this.scene.physics.add.overlap(this.scene.player, this.enemies, this.handlePlayerEnemyCollision, null, this);

    // Projectile hits enemy -> Kill Enemy
    this.scene.physics.add.overlap(this.projectiles, this.enemies, (proj, enemy) => {
      if (proj.deactivate) proj.deactivate();
      this.damageEnemy(enemy);
    });

    // Melee hits enemy -> Kill Enemy (only once per swing via hasHit flag)
    this.scene.physics.add.overlap(this.meleeAttacks, this.enemies, (atk, enemy) => {
      if (!atk.hasHit) {
        atk.hasHit = true;
        this.damageEnemy(enemy);
      }
    });

    // Player reaches Win Zone
    if (this.winZone) {
      this.scene.physics.add.overlap(this.scene.player, this.winZone, () => {
        if (this.scene.winGame) this.scene.winGame();
      });
    }

    // Keyboard inputs
    this.cursors = this.scene.input.keyboard.createCursorKeys();
    this.keys = this.scene.input.keyboard.addKeys('W,A,S,D,E,F');
    
    // Explicitly prevent Phaser from swallowing keystrokes, so HTML inputs work normally!
    const keyCodes = Phaser.Input.Keyboard.KeyCodes;
    this.scene.input.keyboard.removeCapture([
      keyCodes.W, keyCodes.A, keyCodes.S, keyCodes.D,
      keyCodes.SPACE, keyCodes.UP, keyCodes.DOWN, keyCodes.LEFT, keyCodes.RIGHT
    ]);

    // Create Mobile D-Pad
    this.createMobileControls();

    this.resizeListener = (gameSize) => {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.handleResize(gameSize);
      }, 150);
    };
    this.scene.scale.on('resize', this.resizeListener, this);
  }

  handleResize(gameSize) {
    if (!this.scene || !this.scene.cameras || !this.scene.cameras.main) return;
    const safeWidth = Math.max(1, gameSize.width);
    const safeHeight = Math.max(1, gameSize.height);
    this.repositionMobileControls(safeWidth, safeHeight);
    this.updateCameraBounds({ width: safeWidth, height: safeHeight });
  }

  updateCameraBounds(gameSize) {
    if (!this.scene || !this.scene.cameras || !this.scene.cameras.main) return;
    
    // The camera bounds must be at least as tall as the screen, otherwise the camera breaks
    const minHeight = this.scene.LOGICAL_FLOOR_Y + 100;
    const boundsHeight = Math.max(minHeight, gameSize.height);
    
    this.scene.cameras.main.setBounds(0, 0, this.worldWidth, boundsHeight);
    
    // Nudge the follow target to ensure the camera re-centers after a bounds update
    if (this.scene.player) {
      this.scene.cameras.main.startFollow(this.scene.player, true, 0.08, 0.08);
      // Force an immediate snap to prevent the camera from "flying" or being stuck if it lost focus during rotation
      this.scene.cameras.main.centerOn(this.scene.player.x, this.scene.player.y);
    }
  }

  buildLevel1(sceneHeight) {
    const floorY = this.scene.LOGICAL_FLOOR_Y;
    
    // Very simple hand-placed static map
    const isForest = this.scene.activeTheme?.key === 'forest';
    const layout = isForest ? [
      { x: 80, y: floorY - 16, scaleX: 6, hasEnemy: false },
      { x: 160, y: floorY - 32, scaleX: 6, hasEnemy: true },
      { x: 240, y: floorY - 16, scaleX: 5, hasEnemy: false },
      { x: 320, y: floorY - 40, scaleX: 6, hasEnemy: true },
      { x: 400, y: floorY - 56, scaleX: 6, hasEnemy: false },
      { x: 480, y: floorY - 32, scaleX: 5, hasEnemy: true },
      { x: 560, y: floorY - 16, scaleX: 6, hasEnemy: false },
      { x: 640, y: floorY - 32, scaleX: 5, hasEnemy: true },
      { x: 720, y: floorY - 48, scaleX: 12, hasEnemy: false }, // Big finish block
    ] : [
      { x: 400, y: floorY - 80, scaleX: 1.5, hasEnemy: false },
      { x: 800, y: floorY - 150, scaleX: 2.0, hasEnemy: true },
      { x: 1200, y: floorY - 80, scaleX: 1.0, hasEnemy: false },
      { x: 1500, y: floorY - 180, scaleX: 1.5, hasEnemy: true },
      { x: 1900, y: floorY - 250, scaleX: 1.5, hasEnemy: false },
      { x: 2300, y: floorY - 150, scaleX: 1.0, hasEnemy: true },
      { x: 2600, y: floorY - 80, scaleX: 1.5, hasEnemy: false },
      { x: 3000, y: floorY - 120, scaleX: 1.0, hasEnemy: true },
      { x: 3400, y: floorY - 200, scaleX: 3.0, hasEnemy: false }, // Big finish block
    ];

    const maxEnemies = this.enemyCount;

    const TILE_W = isForest ? 16 : 64;
    const PLATFORM_H = isForest ? 16 : 32;
    const themePlatformTexture = this.scene.activeTheme?.platformTexture || 'stone_tile';
    const collectibleTexture = this.scene.activeTheme?.collectibleTexture || 'crate';

    layout.forEach((p, index) => {
      const platWidth = p.scaleX * TILE_W;

      // Visual: tileSprite (repeats the stone texture instead of stretching)
      const block = this.scene.add.tileSprite(p.x, p.y, platWidth, PLATFORM_H, themePlatformTexture);

      // Physics: add static body matching the tileSprite dimensions
      this.scene.physics.add.existing(block, true);
      this.platforms.add(block);

      // Store edges for patrol logic
      block.leftEdge = p.x - (platWidth / 2);
      block.rightEdge = p.x + (platWidth / 2);
      
      if (p.hasEnemy && maxEnemies > 0) {
        block.hasEnemySpot = true;
      }

      if (!p.hasEnemy && index % 2 === 0) {
        const collectible = this.collectibles.create(p.x, p.y - 80, collectibleTexture);
        collectible.setScale(0.5);
        collectible.body.setAllowGravity(false);
      }

      // Add win zone on the last block
      if (index === layout.length - 1) {
        this.winZone = this.scene.physics.add.sprite(p.x, p.y - 100, 'crate').setVisible(false);
        this.winZone.body.setAllowGravity(false);
        this.winZone.body.setSize(100, 200);
      }
    });
  }

  createMobileControls() {
    // Robust check: render mobile controls if the device supports touch natively, 
    // OR if screen is sufficiently narrow (like a developer simulating mobile on Desktop)
    const isTouch = this.scene.sys.game.device.input.touch;
    if (!isTouch && this.scene.scale.width > 1024) {
      return;
    }
    
    const controlStyle = {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: '28px',
      fontStyle: 'italic',
      fontWeight: '900',
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
      shadow: { offsetX: 3, offsetY: 3, color: '#000000', blur: 0, stroke: true, fill: true },
      padding: { left: 14, right: 14, top: 14, bottom: 14 },
      resolution: 3 // Forces high-DPI rendering to remove blur
    };

    // Left Button — track pointer ID for multitouch
    this.btnLeft = this.scene.add.text(0, 0, '←', controlStyle)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setAlpha(0.6)
      .setInteractive()
      .on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        this.movingLeft = true;
        this.leftPointerId = pointer.id;
        this.btnLeft.setAlpha(1);
      })
      .on('pointerup', (pointer) => {
        if (pointer.id === this.leftPointerId) {
          this.movingLeft = false;
          this.leftPointerId = null;
          this.btnLeft.setAlpha(0.6);
        }
      });

    // Right Button — track pointer ID for multitouch
    this.btnRight = this.scene.add.text(0, 0, '→', controlStyle)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setAlpha(0.6)
      .setInteractive()
      .on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        this.movingRight = true;
        this.rightPointerId = pointer.id;
        this.btnRight.setAlpha(1);
      })
      .on('pointerup', (pointer) => {
        if (pointer.id === this.rightPointerId) {
          this.movingRight = false;
          this.rightPointerId = null;
          this.btnRight.setAlpha(0.6);
        }
      });

    // Jump Button
    this.btnJump = this.scene.add.text(0, 0, 'JUMP', controlStyle)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setAlpha(0.6)
      .setInteractive()
      .on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        this.jump();
        this.btnJump.setAlpha(1);
      })
      .on('pointerup', () => { this.btnJump.setAlpha(0.6); });

    // Melee Button
    this.btnMelee = this.scene.add.text(0, 0, 'MELEE', controlStyle)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setAlpha(0.6)
      .setInteractive()
      .on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        this.melee();
        this.btnMelee.setAlpha(1);
      })
      .on('pointerup', () => { this.btnMelee.setAlpha(0.6); });

    // Shoot Button (if enabled)
    if (this.projectilesEnabled) {
      this.btnShoot = this.scene.add.text(0, 0, 'SHOOT', controlStyle)
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(100)
        .setAlpha(0.6)
        .setInteractive()
        .on('pointerdown', (pointer, localX, localY, event) => {
          event.stopPropagation();
          this.shoot();
          this.btnShoot.setAlpha(1);
        })
        .on('pointerup', () => { this.btnShoot.setAlpha(0.6); });
    }

    this.mobileControls.push(this.btnLeft, this.btnRight, this.btnJump, this.btnMelee);
    if (this.btnShoot) this.mobileControls.push(this.btnShoot);
    this.repositionMobileControls(this.scene.scale.width, this.scene.scale.height);
  }

  repositionMobileControls(width, height) {
    const bottom = height - 80;
    if (this.btnLeft) this.btnLeft.setPosition(16, bottom);
    if (this.btnRight) this.btnRight.setPosition(88, bottom);
    if (this.btnJump) this.btnJump.setPosition(width - 16, bottom);
    if (this.btnMelee) this.btnMelee.setPosition(width - 16, bottom - 70);
    if (this.btnShoot) this.btnShoot.setPosition(width - 120, bottom);
  }

  isInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) return true;
    return false;
  }

  update(time, delta) {
    if (this.scene.isGameOver) return;

    if (this.isInputFocused()) {
      this.scene.player.setVelocityX(0);
      this.scene.player.anims.stop();
      this.scene.player.setFrame(5); // Default standing frame
      this.movingLeft = false;
      this.movingRight = false;
      this.leftPointerId = null;
      this.rightPointerId = null;
      return;
    }

    // Safety: release stuck mobile buttons if their pointer is no longer active
    this.cleanupStaleTouchPointers();

    const { player } = this.scene;
    let isMoving = false;

    // Movement Logic
    if (this.cursors.left.isDown || this.keys.A.isDown || this.movingLeft) {
      player.setVelocityX(-this.moveSpeed);
      player.setFlipX(true);
      isMoving = true;
    } else if (this.cursors.right.isDown || this.keys.D.isDown || this.movingRight) {
      player.setVelocityX(this.moveSpeed);
      player.setFlipX(false);
      isMoving = true;
    } else {
      player.setVelocityX(0);
    }

    // Combat Input Polling (keys)
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.melee();
    if (this.projectilesEnabled && Phaser.Input.Keyboard.JustDown(this.keys.F)) this.shoot();

    // Tick down melee cooldown
    if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

    // Enemy Patrol Logic
    this.enemies.children.iterate((enemy) => {
      if (!enemy || !enemy.active) return;
      
      // Face direction of movement
      if (enemy.body.velocity.x > 0) enemy.setFlipX(false);
      else if (enemy.body.velocity.x < 0) enemy.setFlipX(true);
      
      // Edge detection
      if (enemy.patrolPlatform) {
        const p = enemy.patrolPlatform;
        const eX = enemy.x;
        if (enemy.body.velocity.x > 0 && eX > p.rightEdge - 10) {
          enemy.setVelocityX(-50);
        } else if (enemy.body.velocity.x < 0 && eX < p.leftEdge + 10) {
          enemy.setVelocityX(50);
        }
      }
    });

    const progressIndex = Math.floor(player.x / 400);
    if (!this.progressMilestones.has(progressIndex)) {
      this.progressMilestones.add(progressIndex);
      if (progressIndex > 0) this.awardScore(10);
    }

    // Animation Logic
    const touchingDown = player.body.touching.down || player.body.blocked.down;
    
    if (touchingDown) {
      if (isMoving && !player.anims.isPlaying) {
        player.play('run', true);
      } else if (!isMoving) {
        player.anims.stop();
        player.setFrame(5);
      }
    } else {
      player.anims.stop();
      player.setFrame(6); // Jump frame
    }
  }

  cleanupStaleTouchPointers() {
    if (this.leftPointerId != null) {
      const ptr = this.scene.input.manager.pointers.find(p => p.id === this.leftPointerId);
      if (!ptr || !ptr.isDown) {
        this.movingLeft = false;
        this.leftPointerId = null;
        if (this.btnLeft) this.btnLeft.setAlpha(0.6);
      }
    }
    if (this.rightPointerId != null) {
      const ptr = this.scene.input.manager.pointers.find(p => p.id === this.rightPointerId);
      if (!ptr || !ptr.isDown) {
        this.movingRight = false;
        this.rightPointerId = null;
        if (this.btnRight) this.btnRight.setAlpha(0.6);
      }
    }
  }

  jump() {
    if (this.scene.isGameOver || this.isInputFocused()) return;

    const touchingDown = this.scene.player.body.touching.down || this.scene.player.body.blocked.down;
    if (touchingDown) {
      this.scene.player.setVelocityY(-this.jumpForce);
    }
  }

  melee() {
    if (this.scene.isGameOver || this.isInputFocused()) return;
    if (this.meleeCooldown > 0) return;   // Respect cooldown

    this.meleeCooldown = this.MELEE_COOLDOWN_MS;

    // Flash the player white to show an attack was registered
    this.scene.player.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => this.scene.player.clearTint());

    // Retrieve an inactive MeleeAttack from the pool
    const atk = this.meleeAttacks.get();
    if (!atk) return;   // Pool exhausted – silently skip

    const isFacingLeft = this.scene.player.flipX;
    // Place the slash in front of the player
    const offsetX = isFacingLeft ? -72 : 72;
    atk.swing(
      this.scene.player.x + offsetX,
      this.scene.player.y,
      isFacingLeft
    );
  }

  shoot() {
    if (this.scene.isGameOver || this.isInputFocused() || !this.projectilesEnabled) return;
    
    // Retrieve an inactive projectile from the pool
    const projectile = this.projectiles.get();
    
    if (projectile) {
      const isFacingLeft = this.scene.player.flipX;
      const offsetX = isFacingLeft ? -20 : 20;
      
      // Set the themed texture, defaulting to 'projectile'
      const textureKey = this.scene.gameConfig.actionProjectileType || 'projectile';
      projectile.setTexture(textureKey);

      // Fire it
      projectile.fire(this.scene.player.x + offsetX, this.scene.player.y, isFacingLeft);
    }
  }

  damageEnemy(enemy) {
    if (!enemy || !enemy.active) return;
    
    enemy.health -= 1;

    this.awardScore(10);
    
    if (enemy.health <= 0) {
      // Spawn particle-like tiny rectangles
      for (let i = 0; i < 5; i++) {
        const bit = this.scene.add.rectangle(enemy.x, enemy.y, 8, 8, 0xff0000);
        this.scene.physics.add.existing(bit);
        bit.body.setVelocity(Phaser.Math.Between(-100, 100), Phaser.Math.Between(-200, 0));
        this.scene.time.delayedCall(500, () => bit.destroy());
      }
      this.enemies.remove(enemy, true, true);

      this.awardScore(100);
    } else {
      // Tint and shake
      enemy.setTintFill(0xffffff);
      this.scene.tweens.add({
        targets: enemy,
        x: enemy.x + (enemy.body.velocity.x > 0 ? -5 : 5),
        duration: 50,
        yoyo: true,
        ease: 'Power1',
        onComplete: () => {
          enemy.clearTint();
          enemy.setTint(0xff0000);
        }
      });
    }
  }

  handlePlayerEnemyCollision(player, enemy) {
    // Only hit if player touches enemy from side or bottom (basic)
    this.scene.hitObstacle();
  }

  onConfigUpdate(newConfig, oldConfig) {
    this.jumpForce = newConfig.actionJumpHeight || 600;
    this.enemyCount = newConfig.actionEnemyCount || 5;
    this.projectilesEnabled = !!newConfig.actionProjectileEnabled;
    
    if (newConfig.actionGravity !== oldConfig.actionGravity) {
      this.gravity = newConfig.actionGravity || 1500;
      if (this.scene.player && this.scene.player.body) {
        this.scene.player.body.setGravityY(this.gravity);
      }
    }
    if (newConfig.actionEnemyCount !== oldConfig.actionEnemyCount) {
      this.refreshEnemies();
    }
  }

  awardScore(points) {
    if (!points) return;
    this.scene.score += points;
    window.dispatchEvent(new CustomEvent('update-score', { detail: this.scene.score }));
  }

  refreshEnemies() {
    if (!this.enemies) return;
    this.enemies.clear(true, true);
    this.spawnEnemiesForPlatforms();
  }

  spawnEnemiesForPlatforms() {
    if (!this.platforms) return;
    let enemiesCreated = 0;
    const maxEnemies = this.enemyCount;

    const enemySpots = [];
    const fallbackSpots = [];

    this.platforms.children.iterate((block) => {
      if (!block || !block.leftEdge || !block.rightEdge) return;
      if (block.hasEnemySpot) enemySpots.push(block);
      else fallbackSpots.push(block);
    });

    const spawnOnBlock = (block) => {
      if (!block || enemiesCreated >= maxEnemies) return;
      const enemy = this.enemies.create(block.x, block.y - 40, 'dude');
      enemy.health = 3;
      enemy.setTint(0xff0000);
      enemy.setGravityY(this.gravity);
      enemy.setFrame(5);
      enemy.setVelocityX(50);
      enemy.setBounceX(1);
      enemy.setCollideWorldBounds(true);
      enemy.patrolPlatform = block;
      enemiesCreated++;
    };

    enemySpots.forEach(spawnOnBlock);
    fallbackSpots.forEach(spawnOnBlock);
  }

  cleanup() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    if (this.resizeListener) {
      this.scene.scale.off('resize', this.resizeListener, this);
    }
    // Reset camera follow securely
    if (this.scene && this.scene.cameras && this.scene.cameras.main) {
      this.scene.cameras.main.stopFollow();
      if (this.scene.cameras.main.removeBounds) {
        this.scene.cameras.main.removeBounds();
      }
    }
    
    if (this.platforms && this.platforms.scene) {
      try { this.platforms.clear(true, true); } catch (e) {}
    }
    
    if (this.enemies && this.enemies.scene) {
      try { this.enemies.clear(true, true); } catch (e) {}
    }

    if (this.collectibles && this.collectibles.scene) {
      try { this.collectibles.clear(true, true); } catch (e) {}
    }

    if (this.meleeAttacks && this.meleeAttacks.scene) {
      try { this.meleeAttacks.clear(true, true); } catch (e) {}
    }
    
    this.mobileControls.forEach(ctrl => {
      if (ctrl && ctrl.scene) ctrl.destroy();
    });
    this.mobileControls = [];
  }
}
