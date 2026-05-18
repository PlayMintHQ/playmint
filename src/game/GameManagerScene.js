import Phaser from 'phaser';
import { DEFAULT_CONFIG } from '../gameConfig';
import { getTheme } from './themes';
import GameModeManager from './GameModeManager';

export default class GameManagerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameManagerScene' });
  }

  preload() {
    this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });
    this.load.image('crate', 'assets/crate.png');
    this.load.image('ground', 'assets/ground.png');
    this.load.svg('projectile', 'assets/shuriken.svg', { width: 48, height: 16 }); // Laser bolt
    this.load.svg('shuriken', 'assets/shuriken.svg', { width: 32, height: 32 });
    this.load.svg('fireball', 'assets/fireball.svg', { width: 32, height: 32 });
    this.load.svg('laser', 'assets/laser.svg', { width: 48, height: 16 });
    // Melee slash animation frames
    this.load.svg('slash_f0', 'assets/slash_f0.svg', { width: 128, height: 128 });
    this.load.svg('slash_f1', 'assets/slash_f1.svg', { width: 128, height: 128 });
    this.load.svg('slash_f2', 'assets/slash_f2.svg', { width: 128, height: 128 });
    this.load.svg('slash_f3', 'assets/slash_f3.svg', { width: 128, height: 128 });
    this.load.svg('slash_f4', 'assets/slash_f4.svg', { width: 128, height: 128 });
    this.load.svg('slash_f5', 'assets/slash_f5.svg', { width: 128, height: 128 });
    this.load.image('stone_tile', 'assets/stone_tile.png');
    this.load.image('lava_ground', 'assets/themes/lava/lava_ground.png');
    this.load.image('lava_tile', 'assets/themes/lava/lava_tile.png');
    this.load.image('ice_tile', 'assets/themes/ice/ice_tile.png');
    this.load.image('bg_default_base', 'assets/themes/forest/bg_far.png');
    this.load.image('bg_lava_base', 'assets/themes/lava/bg.png');
    this.load.image('bg_lava_mountains', 'assets/themes/lava/mountains.png');
    this.load.image('bg_lava_clouds', 'assets/themes/lava/clouds.png');
    this.load.image('bg_ice_sky', 'assets/themes/ice/sky.png');
    this.load.image('bg_ice_mountains', 'assets/themes/ice/mountains.png');
    this.load.image('bg_ice_clouds', 'assets/themes/ice/clouds.png');
    this.load.image('forest_bg_far', 'assets/themes/forest/bg_far.png');
    this.load.image('forest_bg_mid', 'assets/themes/forest/bg_mid.png');
    this.load.image('forest_ground', 'assets/themes/forest/ground_tile.png');
    this.load.image('forest_platform', 'assets/themes/forest/ground_tile.png');
  }

  init(data) {
    this.gameConfig = {
      ...DEFAULT_CONFIG,
      ...(window.__GAME_LIVE_CONFIG || {}),
      ...data
    };

    this.gameModeManager = new GameModeManager(this);
  }

  create() {
    this.isGameOver = false;
    this.score = 0;
    window.dispatchEvent(new CustomEvent('update-score', { detail: this.score }));
    this.activeTheme = getTheme(this.gameConfig.themeKey);

    // Enable multitouch for mobile controls (movement + jumping)
    this.input.addPointer(2);

    const width = this.scale.width;
    const height = this.scale.height;

    this.LOGICAL_FLOOR_Y = 1000;
    const floorHeight = this.activeTheme.floorHeight || this.gameConfig.floorHeight || 100;

    // Create a smooth background gradient
    this.bgGraphics = this.add.graphics();
    this.bgGraphics.setScrollFactor(0); // Pinned to camera
    this.bgGraphics.setDepth(-20);
    this.bgLayers = [];
    this.createBackgroundLayers();
    this.drawBackground(width, height); // Draw background immediately (fixes black screen)

    // Score state is managed in React. Update via DOM event.
    if (this.gameConfig.gameType === 'runner') {
      this.scoreTimer = this.time.addEvent({
        delay: this.gameConfig.scoreTimerDelay || 100,
        callback: () => {
          if (!this.isGameOver) {
            this.score += 1;
            window.dispatchEvent(new CustomEvent('update-score', { detail: this.score }));
          }
        },
        loop: true
      });
    }

    // Floor - Make it wide enough to cover the world width if we are in platformer mode.
    const floorWidth = this.gameConfig.gameType === 'platformer' ? 4000 : Math.max(width * 2, 4000);
    const floorTexture = this.activeTheme.floorTexture || 'ground';
    const textureSource = this.textures.get(floorTexture)?.getSourceImage();
    if (textureSource && textureSource.width && textureSource.height) {
      const tileWidth = textureSource.width;
      const tileHeight = textureSource.height;
      const scaleY = floorHeight / tileHeight;
      const scaledWidth = tileWidth * scaleY;
      const repeatCount = Math.ceil(floorWidth / scaledWidth);

      this.floorSegments = [];
      for (let i = 0; i < repeatCount; i++) {
        const tile = this.add.sprite(i * scaledWidth, this.LOGICAL_FLOOR_Y, floorTexture).setOrigin(0, 0);
        tile.setScale(scaleY);
        this.floorSegments.push(tile);
      }

      this.floor = this.add.rectangle(0, this.LOGICAL_FLOOR_Y, floorWidth, floorHeight, 0x000000, 0);
      this.floor.setOrigin(0, 0);
    } else {
      this.floor = this.add.tileSprite(0, this.LOGICAL_FLOOR_Y, floorWidth, floorHeight, floorTexture).setOrigin(0, 0);
      const themeTileScale = this.activeTheme.floorTileScale || 0.15;
      this.floor.tileScaleX = this.gameConfig.floorTileScale || themeTileScale;
      this.floor.tileScaleY = this.gameConfig.floorTileScale || themeTileScale;
    }
    this.physics.add.existing(this.floor, true); // Static

    // Bounds must accommodate the static depth
    this.physics.world.setBounds(0, 0, floorWidth, this.LOGICAL_FLOOR_Y + floorHeight);

    // Animations
    if (!this.anims.exists('run')) {
      this.anims.create({
        key: 'run',
        frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
        frameRate: 10,
        repeat: -1
      });
    }

    // Melee slash animation — 6 SVG textures cycled as individual frames
    if (!this.anims.exists('slash_anim')) {
      this.anims.create({
        key: 'slash_anim',
        frames: [
          { key: 'slash_f0' },
          { key: 'slash_f1' },
          { key: 'slash_f2' },
          { key: 'slash_f3' },
          { key: 'slash_f4' },
          { key: 'slash_f5' },
        ],
        frameRate: 18,  // ~333 ms total — snappy but readable
        repeat: 0        // play once then fire ANIMATION_COMPLETE
      });
    }

    // Player Base Logic
    const playerYOffset = 150;
    const playerX = 150;
    this.player = this.physics.add.sprite(playerX, this.LOGICAL_FLOOR_Y - playerYOffset, 'dude');
    this.player.setScale(this.gameConfig.playerScale || 1.5);
    this.physics.add.collider(this.player, this.floor);

    // Core game mode handling
    this.gameModeManager.setMode(this.gameConfig.gameType);
    this.gameModeManager.create();

    // Generic Input for runner or generic jumps
    this.input.keyboard.on('keydown-SPACE', (e) => {
      if (this.isGameOver) {
        const el = document.activeElement;
        const isTextInput = el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')));
        if (!isTextInput) {
          this.scene.restart();
        }
      } else {
        this.gameModeManager.jump();
      }
    });

    // Prevent default browser scrolling, except inside input fields
    this.preventKeyScrollListener = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        const el = document.activeElement;
        const isTextInput = el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')));
        if (!isTextInput) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', this.preventKeyScrollListener, { passive: false });

    // Mobile/pointer input for jumping (primarily for Runner mode)
    this.input.on('pointerdown', (pointer) => {
      if (this.isGameOver) {
        this.scene.restart();
      } else {
        this.gameModeManager.jump();
      }
    }, this);

    // Dynamic resize handler - ONLY updates camera and UI
    this.scale.on('resize', this.handleResize, this);
    this.handleResize(this.scale); // Force initial camera alignment

    // Live tuning integration
    this.updateConfigListener = (e) => {
      const newConfig = e.detail;
      const oldConfig = { ...this.gameConfig };

      this.gameConfig = { ...this.gameConfig, ...newConfig };

      if (newConfig.gameType !== oldConfig.gameType) {
        // Instant Restart for UX Gap
        this.scene.restart();
      } else {
        if (newConfig.themeKey && newConfig.themeKey !== oldConfig.themeKey) {
          this.scene.restart();
          return;
        }
        this.gameModeManager.onConfigUpdate(newConfig, oldConfig);
      }
    };
    window.addEventListener('update-game-config', this.updateConfigListener);

    this.events.on('shutdown', () => {
      window.removeEventListener('update-game-config', this.updateConfigListener);
      window.removeEventListener('keydown', this.preventKeyScrollListener);
      if (this.bgLayers) {
        this.bgLayers.forEach((layer) => layer.destroy());
        this.bgLayers = [];
      }
      if (this.floorSegments) {
        this.floorSegments.forEach((segment) => segment.destroy());
        this.floorSegments = [];
      }
      this.gameModeManager.cleanup();
    });
  }

  drawBackground(width, height) {
    this.bgGraphics.clear();
    this.bgGraphics.fillStyle(0x0a0f16, 1);
    this.bgGraphics.fillRect(0, 0, width, height);
  }

  createBackgroundLayers() {
    if (this.bgLayers && this.bgLayers.length) {
      this.bgLayers.forEach((layer) => layer.destroy());
    }
    this.bgLayers = [];

    const theme = this.activeTheme || getTheme(this.gameConfig.themeKey);
    const width = this.scale.width;
    const height = this.scale.height;
    const layers = theme.backgroundLayers || [];

    layers.forEach((layer) => {
      const texture = this.textures.get(layer.key);
      const source = texture.getSourceImage();
      const textureWidth = source?.width || width;
      const textureHeight = source?.height || height;
      const baseScaleX = width / textureWidth;
      const baseScaleY = height / textureHeight;
      const baseScale = Math.max(baseScaleX, baseScaleY);

      const spriteWidth = textureWidth;
      const spriteHeight = textureHeight;
      const sprite = this.add.tileSprite(0, 0, spriteWidth, spriteHeight, layer.key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-5 + this.bgLayers.length);

      const scale = (layer.scale || 1) * baseScale;
      sprite.__layerScale = layer.scale || 1;
      sprite.setScale(scale);
      if (layer.alpha != null) {
        sprite.setAlpha(layer.alpha);
      }
      if (layer.tint) {
        sprite.setTint(layer.tint);
      }

      sprite.__scrollSpeed = layer.speed || 0.1;
      this.bgLayers.push(sprite);
    });
  }

  handleResize(gameSize) {
    // Delay slightly to allow the DOM/browser to settle after a mobile rotation
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (!this.cameras || !this.cameras.main) return;

      // Sanitize dimensions to prevent NaN/Matrix errors during mobile rotation
      const width = Math.max(1, this.scale.width);
      const height = Math.max(1, this.scale.height);

      // Force the viewport to update to the new valid dimensions
      this.cameras.main.setViewport(0, 0, width, height);

      this.drawBackground(width, height);
      if (this.bgLayers && this.bgLayers.length) {
        this.bgLayers.forEach((layer) => {
          const texture = this.textures.get(layer.texture.key);
          const source = texture.getSourceImage();
          const textureWidth = source?.width || width;
          const textureHeight = source?.height || height;
          const baseScaleX = width / textureWidth;
          const baseScaleY = height / textureHeight;
          const baseScale = Math.max(baseScaleX, baseScaleY);
          const desiredScale = (layer.__layerScale || 1) * baseScale;
          layer.setScale(desiredScale);
        });
      }

    if (this.floorSegments && this.floorSegments.length) {
      const floorWidth = this.gameConfig.gameType === 'platformer' ? 960 : Math.max(width * 4, 1600);
      const floorHeight = this.activeTheme?.floorHeight || this.gameConfig.floorHeight || 100;
      const floorTexture = this.activeTheme.floorTexture || 'ground';
      const textureSource = this.textures.get(floorTexture)?.getSourceImage();
      if (textureSource && textureSource.width && textureSource.height) {
        const tileWidth = textureSource.width;
        const tileHeight = textureSource.height;
        const scaleY = floorHeight / tileHeight;
        const scaledWidth = tileWidth * scaleY;
        const repeatCount = Math.ceil(floorWidth / scaledWidth);

        while (this.floorSegments.length < repeatCount) {
          const tile = this.add.sprite(0, this.LOGICAL_FLOOR_Y, floorTexture).setOrigin(0, 0);
          tile.setScale(scaleY);
          this.floorSegments.push(tile);
        }
        while (this.floorSegments.length > repeatCount) {
          const tile = this.floorSegments.pop();
          tile.destroy();
        }

        this.floorSegments.forEach((tile, index) => {
          tile.setScale(scaleY);
          tile.setPosition(index * scaledWidth, this.LOGICAL_FLOOR_Y);
        });
      }
    }

      if (this.gameModeManager && this.gameModeManager.handleResize) {
        this.gameModeManager.handleResize({ width, height });
      }

      // Center camera onto the absolute static floor if in Runner Mode.
      // In Platformer mode, the camera follows the player, so it naturally handles its own scroll Y.
      if (this.gameConfig.gameType === 'runner') {
        const floorHeight = this.gameConfig.floorHeight || 100;
        this.cameras.main.scrollY = (this.LOGICAL_FLOOR_Y + floorHeight) - height;
      }

      if (this.isGameOver) {
        if (this.overlay) {
          this.overlay.setSize(width, height);
        }
        if (this.gameOverText) this.gameOverText.setPosition(width / 2, height / 2 - 40);
        if (this.subText) this.subText.setPosition(width / 2, height / 2 + 20);
      }
    }, 150);
  }
  hitObstacle(player, obstacle) {
    if (this.isGameOver) return;
    this.isGameOver = true;

    this.physics.pause();
    this.player.anims.stop();
    this.player.setTint(0x888888); // Turn gray

    // Semi-transparent dark overlay for better contrast
    // Use setScrollFactor(0) to fix to screen in platformer mode
    const width = this.scale.width;
    const height = this.scale.height;

    // Use absolute positioning with scroll factor 0 so it ignores camera
    this.overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(10);

    const gameOverFontSize = Math.min(56, width / 6) + 'px';
    this.gameOverText = this.add.text(width / 2, height / 2 - 40, 'GAME OVER', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: gameOverFontSize,
      fill: '#FF4136',
      fontStyle: '900'
    })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setShadow(2, 2, 'rgba(0,0,0,0.5)', 4)
      .setDepth(11);

    const subTextFontSize = Math.min(24, width / 15) + 'px';
    this.subText = this.add.text(width / 2, height / 2 + 20, 'Tap or Press Space to Restart', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: subTextFontSize,
      fill: '#FFFFFF',
      fontStyle: 'bold'
    })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(11);
  }

  winGame() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.hasWon = true;

    this.physics.pause();
    this.player.anims.stop();
    this.player.setTint(0x00FF00); // Turn green for win

    const width = this.scale.width;
    const height = this.scale.height;

    this.overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(10);

    const winFontSize = Math.min(56, width / 6) + 'px';
    this.gameOverText = this.add.text(width / 2, height / 2 - 40, 'YOU WIN!', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: winFontSize,
      fill: '#00FF00',
      fontStyle: '900'
    })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setShadow(2, 2, 'rgba(0,0,0,0.5)', 4)
      .setDepth(11);

    const subTextFontSize = Math.min(24, width / 15) + 'px';
    this.subText = this.add.text(width / 2, height / 2 + 20, 'Tap or Press Space to Restart', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: subTextFontSize,
      fill: '#FFFFFF',
      fontStyle: 'bold'
    })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(11);
  }

  update(time, delta) {
    if (this.isGameOver) return;
    
    if (this.gameConfig.gameType === 'runner') {
       this.virtualScrollX = (this.virtualScrollX || 0) + (this.gameModeManager?.currentMode?.runSpeed || this.gameConfig.runSpeed) * (delta / 1000);
    }
    const scrollX = this.gameConfig.gameType === 'runner' ? this.virtualScrollX : (this.cameras?.main?.scrollX || 0);

    if (this.bgLayers && this.bgLayers.length) {
      this.bgLayers.forEach((layer) => {
        layer.tilePositionX = scrollX * (this.gameConfig.gameType === 'runner' ? (layer.__scrollSpeed || 0.1) : -(layer.__scrollSpeed || 0.1));
      });
    }
    this.gameModeManager.update(time, delta);
  }
}
