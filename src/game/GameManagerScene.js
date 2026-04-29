import Phaser from 'phaser';
import { DEFAULT_CONFIG } from '../gameConfig';
import GameModeManager from './GameModeManager';

export default class GameManagerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameManagerScene' });
  }

  preload() {
    this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });
    this.load.image('crate', 'assets/crate.png');
    this.load.image('ground', 'assets/ground.png');
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

    const width = this.scale.width;
    const height = this.scale.height;

    this.LOGICAL_FLOOR_Y = 1000;
    const floorHeight = this.gameConfig.floorHeight || 100;

    // Create a smooth background gradient
    this.bgGraphics = this.add.graphics();
    this.bgGraphics.setScrollFactor(0); // Pinned to camera

    // Score state is managed in React. Update via DOM event.
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

    // Floor - Make it wide enough to cover the world width if we are in platformer mode.
    const floorWidth = this.gameConfig.gameType === 'platformer' ? 4000 : Math.max(width * 2, 4000);
    this.floor = this.add.tileSprite(0, this.LOGICAL_FLOOR_Y, floorWidth, floorHeight, 'ground').setOrigin(0, 0);
    this.floor.tileScaleX = this.gameConfig.floorTileScale || 0.15;
    this.floor.tileScaleY = this.gameConfig.floorTileScale || 0.15;
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

    // Player Base Logic
    this.player = this.physics.add.sprite(150, this.LOGICAL_FLOOR_Y - 150, 'dude');
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
        this.gameModeManager.onConfigUpdate(newConfig, oldConfig);
      }
    };
    window.addEventListener('update-game-config', this.updateConfigListener);

    this.events.on('shutdown', () => {
      window.removeEventListener('update-game-config', this.updateConfigListener);
      window.removeEventListener('keydown', this.preventKeyScrollListener);
      this.gameModeManager.cleanup();
    });
  }

  drawBackground(width, height) {
    this.bgGraphics.clear();
    this.bgGraphics.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xe0f7fa, 0xe0f7fa, 1);
    this.bgGraphics.fillRect(0, 0, width, height);
  }

  handleResize(gameSize) {
    const width = gameSize.width;
    const height = gameSize.height;

    this.drawBackground(width, height);
    
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
      .setOrigin(0,0)
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

  update(time, delta) {
    if (this.isGameOver) return;
    this.gameModeManager.update(time, delta);
  }
}
