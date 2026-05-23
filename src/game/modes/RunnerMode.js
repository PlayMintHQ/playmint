import Phaser from 'phaser';
import BaseMode from './BaseMode';

export default class RunnerMode extends BaseMode {
  init() {
    const theme = this.scene.activeTheme || {};
    this.baseSpeed = this.scene.gameConfig.runSpeed || (theme.moveSpeed ? Math.round(theme.moveSpeed * 1.2) : 350);
    this.runSpeed = this.baseSpeed;
    this.obstacles = null;
    this.obstacleTimer = null;

    // Mobile control and keyboard state
    this.mobileControls = [];
    this.uiContainer = null;
    this.keys = null;
    this.cursors = null;
  }

  create() {
    const theme = this.scene.activeTheme || {};
    this.scene.player.setGravityY(this.scene.gameConfig.gravity || (theme.gravity || 1800));
    this.scene.playPlayerAnim('run');

    // Register SPACE key and cursors exactly like in PlatformerMode
    this.keys = this.scene.input.keyboard.addKeys('SPACE');
    this.cursors = this.scene.input.keyboard.createCursorKeys();

    this.obstacles = this.scene.physics.add.group();

    this.obstacleTimer = this.scene.time.addEvent({
      delay: this.scene.gameConfig.obstacleDelay || 1200,
      callback: this.spawnObstacle,
      callbackScope: this,
      loop: true
    });

    this.scene.physics.add.collider(this.obstacles, this.scene.floor);
    this.scene.physics.add.collider(this.scene.player, this.obstacles, this.scene.hitObstacle, null, this.scene);

    // Create Mobile Controls (Jump button)
    this.createMobileControls();

    this.resizeListener = (gameSize) => {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.handleResize(gameSize);
      }, 150);
    };
    this.scene.scale.on('resize', this.resizeListener, this);
  }

  spawnObstacle() {
    if (this.scene.isGameOver) return;

    const scale = Phaser.Math.FloatBetween(this.scene.gameConfig.obstacleScaleMin || 0.8, this.scene.gameConfig.obstacleScaleMax || 1.2);
    const spawnX = this.scene.cameras.main.scrollX + this.scene.cameras.main.width + 16;
    const obstacleTexture = this.scene.activeTheme?.obstacleTexture || 'crate';

    // Obtain frame dimensions for proper obstacle scaling normalization
    const textureObj = this.scene.textures.get(obstacleTexture);
    const frame = textureObj?.get(0);
    const frameWidth = frame ? frame.width : 64;
    const frameHeight = frame ? frame.height : 64;

    const targetSize = 64;
    const normalizedScaleX = (targetSize / frameWidth) * scale;
    const normalizedScaleY = (targetSize / frameHeight) * scale;

    // Center origin and adjust position based on scaled height so it sits on the ground
    const obstacle = this.scene.add.sprite(spawnX, this.scene.LOGICAL_FLOOR_Y - (targetSize * scale) / 2, obstacleTexture);
    obstacle.setScale(normalizedScaleX, normalizedScaleY);
    this.scene.physics.add.existing(obstacle);
    this.obstacles.add(obstacle);

    const theme = this.scene.activeTheme || {};
    obstacle.body.setGravityY(this.scene.gameConfig.gravity || (theme.gravity || 1800));
    obstacle.body.setVelocityX(-this.runSpeed);
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

    // Check keyboard jump if input is not focused
    const spaceJustDown = (this.keys?.SPACE && Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) || 
                          (this.cursors?.space && Phaser.Input.Keyboard.JustDown(this.cursors.space));
    if (!this.isInputFocused() && spaceJustDown) {
      this.jump();
    }

    if (this.scene.player.body.touching.down || this.scene.player.body.blocked.down) {
      this.scene.playPlayerAnim('run');
    }

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

    // Progressive speed
    this.runSpeed += this.scene.gameConfig.speedIncrement || 0.05;
  }

  jump() {
    if (this.scene.isGameOver || this.isInputFocused()) return;
    
    if (this.scene.player.body.touching.down || this.scene.player.body.blocked.down) {
      this.scene.player.body.setVelocityY(-(this.scene.gameConfig.jumpForce || 750));
      this.scene.playPlayerAnim('jump');
    }
  }

  generateMobileIcons() {
    const iconSize = 64;
    const h = iconSize / 2;

    const makeIcon = (key, draw) => {
      const g = this.scene.make.graphics({ add: false });
      draw(g, h);
      g.generateTexture(key, iconSize, iconSize);
      g.destroy();
    };

    // Jump: upward chevron arrow with base line
    makeIcon('icon_jump', (g, c) => {
      g.fillStyle(0xffffff, 1);
      // Arrow head (chevron)
      g.fillTriangle(c, c - 18, c - 16, c + 4, c + 16, c + 4);
      // Arrow shaft
      g.fillRect(c - 5, c + 4, 10, 18);
      // Base line
      g.fillRect(c - 12, c + 22, 24, 4);
    });
  }

  createMobileButton(x, y, textureKey, size, onPress, onRelease) {
    const btn = this.scene.add.image(x, y, textureKey)
      .setDepth(100)
      .setAlpha(0.65)
      .setScale(size / 64)
      .setInteractive({ useHandCursor: false })
      .on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        btn.setAlpha(1);
        if (onPress) onPress(pointer);
      })
      .on('pointerup', (pointer) => {
        btn.setAlpha(0.65);
        if (onRelease) onRelease(pointer);
      })
      .on('pointerupoutside', (pointer) => {
        btn.setAlpha(0.65);
        if (onRelease) onRelease(pointer);
      })
      .on('pointerout', () => {
        btn.setAlpha(0.65);
      });

    this.uiContainer.add(btn);
    this.mobileControls.push(btn);
    return btn;
  }

  createMobileControls() {
    const isTouch = this.scene.sys.game.device.input.touch;
    if (!isTouch && this.scene.scale.width > 1024) return;

    if (!this.scene.textures.exists('icon_jump')) {
      this.generateMobileIcons();
    }

    this.uiContainer = this.scene.add.container(0, 0)
      .setDepth(100)
      .setScrollFactor(0);

    const btnSize = 56;

    this.btnJump = this.createMobileButton(0, 0, 'icon_jump', btnSize,
      () => this.jump()
    );

    const camera = this.scene.cameras.main;
    this.updateMobileControlSizing(camera.width, camera.height);
    this.repositionMobileControls(camera.width, camera.height);
  }

  updateMobileControlSizing(screenWidth, screenHeight) {
    const minSide = Math.min(screenWidth, screenHeight);
    const baseSize = Phaser.Math.Clamp(Math.round(minSide * 0.12), 44, 64);
    const marginScreen = Math.round(baseSize * 0.45);
    const gapScreen = Math.round(baseSize * 0.3);

    this.mobileLayout = {
      marginScreen,
      gapScreen,
      targetSize: baseSize
    };

    // Apply scale to all image-based buttons
    const scale = baseSize / 64;
    this.mobileControls.forEach((btn) => {
      if (btn) btn.setScale(scale);
    });

    this.refreshMobileHitAreas();
  }

  refreshMobileHitAreas() {
    const HIT_PAD = 12;
    this.mobileControls.forEach((btn) => {
      if (!btn) return;
      const w = btn.width;
      const h = btn.height;
      btn.disableInteractive();
      btn.setInteractive(
        new Phaser.Geom.Rectangle(-HIT_PAD, -HIT_PAD, w + HIT_PAD * 2, h + HIT_PAD * 2),
        Phaser.Geom.Rectangle.Contains
      );
    });
  }

  repositionMobileControls(screenWidth, screenHeight) {
    const safeBottomInset = window?.__pmSafeAreaBottom || 0;
    const safeRightInset = window?.__pmSafeAreaRight || 0;
    const safeTopInset = window?.__pmSafeAreaTop || 0;

    const margin = this.mobileLayout?.marginScreen || 28;
    const gap = this.mobileLayout?.gapScreen || 12;
    const btnSize = this.mobileLayout?.targetSize || 64;
    const safeRight = safeRightInset + 12;
    const safeBottom = safeBottomInset + 12;

    const rightNudge = Math.round(gap * 0.6);
    const rightEdgeX = screenWidth - safeRight - margin + rightNudge;
    const bottomCenter = screenHeight - safeBottom - btnSize / 2;

    if (this.btnJump) this.btnJump.setPosition(rightEdgeX - btnSize / 2, bottomCenter);

    // Safety: ensure buttons don't overlap the top safe area
    const topLimit = safeTopInset + margin + btnSize / 2;
    if (bottomCenter < topLimit) {
      const shift = topLimit - bottomCenter;
      if (this.btnJump) this.btnJump.setY(bottomCenter + shift);
    }
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
  }

  onConfigUpdate(newConfig, oldConfig) {
    this.baseSpeed = newConfig.runSpeed || 350;
    this.runSpeed = this.baseSpeed;

    if (this.scene.player && this.scene.player.body) {
      this.scene.player.body.setGravityY(newConfig.gravity || 1800);
    }

    if (this.obstacles && this.obstacles.children) {
      this.obstacles.children.iterate((obstacle) => {
        if (obstacle && obstacle.body) {
          obstacle.body.setGravityY(newConfig.gravity || 1800);
          obstacle.body.setVelocityX(-this.runSpeed);
        }
      });
    }

    if (oldConfig.obstacleDelay !== newConfig.obstacleDelay) {
      if (this.obstacleTimer) this.obstacleTimer.remove();
      this.obstacleTimer = this.scene.time.addEvent({
        delay: newConfig.obstacleDelay || 1200,
        callback: this.spawnObstacle,
        callbackScope: this,
        loop: true
      });
    }
  }

  cleanup() {
    if (this.obstacleTimer) {
      this.obstacleTimer.remove();
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
