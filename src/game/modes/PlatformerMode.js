import Phaser from 'phaser';
import BaseMode from './BaseMode';
import Projectile from '../objects/Projectile';
import MeleeAttack from '../objects/MeleeAttack';

export default class PlatformerMode extends BaseMode {
  init() {
    const theme = this.scene.activeTheme || {};
    this.moveSpeed = theme.moveSpeed || 300;
    this.jumpForce = theme.jumpForce || (this.scene.gameConfig.actionJumpHeight || 600);
    this.gravity = theme.gravity || (this.scene.gameConfig.actionGravity || 1500);
    
    // Feature hooks for future combat implementation
    this.enemyCount = this.scene.gameConfig.actionEnemyCount || 5;
    this.projectilesEnabled = this.scene.gameConfig.actionProjectileEnabled || false;
    
    // Determine world width based on theme
    this.worldWidth = theme.worldWidth || 4000;
    
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
    this.uiContainer = null;
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
    
    // Spawn at theme-defined position
    const theme = this.scene.activeTheme || {};
    const spawnX = theme.spawnX || 150;
    const spawnY = typeof theme.spawnY === 'number' ? (this.scene.LOGICAL_FLOOR_Y + theme.spawnY) : (this.scene.LOGICAL_FLOOR_Y - 250);
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
      keyCodes.E, keyCodes.F,
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
    const camera = this.scene.cameras.main;
    const viewWidth = camera.width || safeWidth;
    const viewHeight = camera.height || safeHeight;
    this.updateMobileControlSizing(viewWidth, viewHeight);
    this.repositionMobileControls(viewWidth, viewHeight);
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
    const theme = this.scene.activeTheme || {};
    const isSmallWorld = (theme.worldWidth || 4000) < 2000;
    const layout = isSmallWorld ? [
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

    const TILE_W = theme.tileWidth || 64;
    const PLATFORM_H = theme.platformHeight || 32;
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
      padding: { left: 10, right: 10, top: 10, bottom: 10 },
      resolution: 3 // Forces high-DPI rendering to remove blur
    };

    this.uiContainer = this.scene.add.container(0, 0).setDepth(100).setScrollFactor(0);

    // Left Button — track pointer ID for multitouch
    this.btnLeft = this.scene.add.text(0, 0, '←', controlStyle)
      .setOrigin(0, 0)
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
    this.btnJump = this.scene.add.text(0, 0, '⤴', controlStyle)
      .setOrigin(1, 0)
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
    this.btnMelee = this.scene.add.text(0, 0, '⚔', controlStyle)
      .setOrigin(1, 0)
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
      this.btnShoot = this.scene.add.text(0, 0, '⦿', controlStyle)
        .setOrigin(1, 0)
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
    this.uiContainer.add(this.mobileControls);
    const camera = this.scene.cameras.main;
    const viewWidth = camera.width;
    const viewHeight = camera.height;
    this.updateMobileControlSizing(viewWidth, viewHeight);
    this.repositionMobileControls(viewWidth, viewHeight);
  }

  updateMobileControlSizing(screenWidth, screenHeight) {
    const minSide = Math.min(screenWidth, screenHeight);
    // Bigger base for thumb-friendly touch targets
    const baseSize = Phaser.Math.Clamp(Math.round(minSide * 0.12), 44, 64);
    const moveFont = Math.round(baseSize * 0.75);
    const actionFont = Math.round(baseSize * 0.95);
    const movePadding = Math.round(baseSize * 0.35);
    const actionPadding = Math.round(baseSize * 0.3);
    const marginScreen = Math.round(baseSize * 0.45);
    const gapScreen = Math.round(baseSize * 0.3);

    this.applyMobileControlStyles({ moveFont, actionFont, movePadding, actionPadding });

    this.mobileLayout = {
      marginScreen,
      gapScreen
    };
    this.refreshMobileHitAreas();
  }

  applyMobileControlStyles({ moveFont, actionFont, movePadding, actionPadding }) {
    const setTextStyle = (btn, fontSize, padding) => {
      if (!btn) return;
      btn.setFontSize(fontSize);
      btn.setPadding(padding, padding, padding, padding);
    };

    setTextStyle(this.btnLeft, moveFont, movePadding);
    setTextStyle(this.btnRight, moveFont, movePadding);
    setTextStyle(this.btnJump, actionFont, actionPadding);
    setTextStyle(this.btnMelee, actionFont, actionPadding);
    if (this.btnShoot) setTextStyle(this.btnShoot, actionFont, actionPadding);
  }


  refreshMobileHitAreas() {
    const HIT_PAD = 12; // Extra touch area beyond the visible text
    const setHitArea = (btn) => {
      if (!btn) return;
      const width = btn.displayWidth;
      const height = btn.displayHeight;
      btn.setInteractive(
        new Phaser.Geom.Rectangle(-HIT_PAD, -HIT_PAD, width + HIT_PAD * 2, height + HIT_PAD * 2),
        Phaser.Geom.Rectangle.Contains
      );
    };

    setHitArea(this.btnLeft);
    setHitArea(this.btnRight);
    setHitArea(this.btnJump);
    setHitArea(this.btnMelee);
    setHitArea(this.btnShoot);
  }

  repositionMobileControls(screenWidth, screenHeight) {
    const safeBottomInset = window?.__pmSafeAreaBottom || 0;
    const safeRightInset = window?.__pmSafeAreaRight || 0;
    const safeLeftInset = window?.__pmSafeAreaLeft || 0;
    const safeTopInset = window?.__pmSafeAreaTop || 0;

    const marginScreen = this.mobileLayout?.marginScreen || 28;
    const gapScreen = this.mobileLayout?.gapScreen || 12;

    const margin = marginScreen;
    const gap = gapScreen;
    const safeRight = safeRightInset + 12;
    const safeLeft = safeLeftInset + 12;
    const safeBottom = safeBottomInset + 12;

    const leftBaseY = screenHeight - safeBottom - (this.btnLeft ? this.btnLeft.displayHeight : 0);
    const leftBaseX = safeLeft + margin;
    const moveGap = (this.btnLeft ? this.btnLeft.displayWidth : 0) + gap;

    if (this.btnLeft) this.btnLeft.setPosition(leftBaseX, leftBaseY);
    if (this.btnRight) this.btnRight.setPosition(leftBaseX + moveGap, leftBaseY);

    const rightNudge = Math.round(gap * 0.6);
    const rightBaseX = screenWidth - safeRight - margin + rightNudge;
    const actionWidth = this.btnJump ? this.btnJump.displayWidth : 0;
    const actionHeight = this.btnJump ? this.btnJump.displayHeight : 0;
    const actionLeftX = rightBaseX - actionWidth - gap;

    const bottomRowY = screenHeight - safeBottom - actionHeight;
    const topRowY = bottomRowY - actionHeight - gap;

    if (this.btnJump) this.btnJump.setPosition(rightBaseX, bottomRowY);
    if (this.btnShoot) this.btnShoot.setPosition(actionLeftX, bottomRowY);
    if (this.btnMelee) this.btnMelee.setPosition(rightBaseX, topRowY);

    const topLimit = safeTopInset + margin;
    if (topRowY < topLimit) {
      const shift = topLimit - topRowY;
      if (this.btnJump) this.btnJump.setY(bottomRowY + shift);
      if (this.btnShoot) this.btnShoot.setY(bottomRowY + shift);
      if (this.btnMelee) this.btnMelee.setY(topRowY + shift);
    }
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
    if (!enemy || !enemy.active || enemy._dying) return;
    
    enemy.health -= 1;
    this.awardScore(10);
    
    if (enemy.health <= 0) {
      // Mark dying immediately to prevent double-processing from rapid overlaps
      enemy._dying = true;

      // Death particles
      for (let i = 0; i < 8; i++) {
        const bit = this.scene.add.rectangle(enemy.x, enemy.y, 6, 6, 0xff4444);
        this.scene.physics.add.existing(bit);
        bit.body.setVelocity(
          Phaser.Math.Between(-120, 120),
          Phaser.Math.Between(-250, -50)
        );
        bit.body.setAllowGravity(true);
        this.scene.time.delayedCall(600, () => bit.destroy());
      }

      // Fade-out + shrink before removal
      this.scene.tweens.add({
        targets: enemy,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        duration: 200,
        ease: 'Power2',
        onComplete: () => {
          if (enemy.scene) {
            this.enemies.remove(enemy, true, true);
          }
        }
      });

      this.awardScore(100);
    } else {
      // Damage flash
      enemy.setTintFill(0xffffff);
      this.scene.tweens.add({
        targets: enemy,
        duration: 60,
        yoyo: true,
        onComplete: () => {
          if (enemy.active) enemy.setTint(0xff0000);
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
    const enemyTexture = this.scene.activeTheme?.enemyTexture || 'dude';

    const enemySpots = [];
    const fallbackSpots = [];

    this.platforms.children.iterate((block) => {
      if (!block || !block.leftEdge || !block.rightEdge) return;
      if (block.hasEnemySpot) enemySpots.push(block);
      else fallbackSpots.push(block);
    });

    const spawnOnBlock = (block) => {
      if (!block || enemiesCreated >= maxEnemies) return;
      const enemy = this.enemies.create(block.x, block.y - 40, enemyTexture);
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
    if (this.uiContainer && this.uiContainer.scene) {
      this.uiContainer.destroy();
      this.uiContainer = null;
    }
  }
}
