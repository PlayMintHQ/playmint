import Phaser from 'phaser';
import { DEFAULT_CONFIG } from './gameConfig';

class RunnerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RunnerScene' });
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
    // baseSpeed is the slider-controlled foundation.
    // runSpeed is the live value the game actively scales up over time.
    this.baseSpeed = this.gameConfig.runSpeed;
    this.runSpeed = this.baseSpeed;
  }

  create() {
    this.isGameOver = false;
    this.score = 0;

    // Create a smooth background gradient
    this.bgGraphics = this.add.graphics();
    this.bgGraphics.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xe0f7fa, 0xe0f7fa, 1);
    this.bgGraphics.fillRect(0, 0, this.scale.width, this.scale.height);

    // Score UI
    this.scoreText = this.add.text(16, 16, 'Score: 0', { 
      fontFamily: 'system-ui, sans-serif', 
      fontSize: '32px', 
      fill: '#333',
      fontStyle: 'bold'
    });
    this.scoreText.setShadow(2, 2, 'rgba(0,0,0,0.3)', 2);
    // Increase score based on survival time
    this.scoreTimer = this.time.addEvent({
      delay: this.gameConfig.scoreTimerDelay, // every 100ms
      callback: () => {
        if (!this.isGameOver) {
          this.score += 1;
          this.scoreText.setText('Score: ' + this.score);
        }
      },
      loop: true
    });

    // Floor
    this.floor = this.add.tileSprite(0, this.scale.height - this.gameConfig.floorHeight, this.scale.width, this.gameConfig.floorHeight, 'ground').setOrigin(0, 0);
    this.floor.tileScaleX = this.gameConfig.floorTileScale;
    this.floor.tileScaleY = this.gameConfig.floorTileScale;
    this.physics.add.existing(this.floor, true); // Static

    // Animations
    this.anims.create({
      key: 'run',
      frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
      frameRate: 10,
      repeat: -1
    });

    // Player
    this.player = this.physics.add.sprite(150, this.scale.height - 250, 'dude'); // Spawn high so gravity forces contact
    this.player.setScale(this.gameConfig.playerScale);
    this.player.body.setGravityY(this.gameConfig.gravity);
    this.player.setCollideWorldBounds(true);
    this.player.play('run');

    // Obstacles
    this.obstacles = this.physics.add.group();

    // Spawn Obstacles Timer
    this.obstacleTimer = this.time.addEvent({
      delay: this.gameConfig.obstacleDelay,
      callback: this.spawnObstacle,
      callbackScope: this,
      loop: true
    });

    // Collisions
    this.physics.add.collider(this.player, this.floor);
    this.physics.add.collider(this.obstacles, this.floor);
    this.physics.add.collider(this.player, this.obstacles, this.hitObstacle, null, this);

    // Input to jump or restart
    this.input.keyboard.on('keydown-SPACE', this.jump, this);
    this.input.on('pointerdown', this.jump, this);

    // Prevent Space from triggering the browser's default page-scroll behaviour
    this.input.keyboard.addCapture('SPACE');

    // Dynamic resize handler
    this.scale.on('resize', this.handleResize, this);

    // Live tuning integration
    this.updateConfigListener = (e) => {
      const newConfig = e.detail;
      this.gameConfig = { ...this.gameConfig, ...newConfig };

      // Reset both baseSpeed and runSpeed so the slider is always authoritative.
      // This discards any progressive speed built up during the run, giving
      // a clean, predictable baseline exactly matching the slider value.
      this.baseSpeed = this.gameConfig.runSpeed;
      this.runSpeed = this.baseSpeed;

      if (this.player && this.player.body) {
        this.player.body.setGravityY(this.gameConfig.gravity);
      }

      if (this.obstacles && this.obstacles.children) {
        this.obstacles.children.iterate((obstacle) => {
          if (obstacle && obstacle.body) {
            obstacle.body.setGravityY(this.gameConfig.gravity);
            obstacle.body.setVelocityX(-this.runSpeed);
          }
        });
      }
    };
    window.addEventListener('update-game-config', this.updateConfigListener);

    this.events.on('shutdown', () => {
      window.removeEventListener('update-game-config', this.updateConfigListener);
    });
  }

  handleResize(gameSize) {
    const width = gameSize.width;
    const height = gameSize.height;

    this.bgGraphics.clear();
    this.bgGraphics.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xe0f7fa, 0xe0f7fa, 1);
    this.bgGraphics.fillRect(0, 0, width, height);

    // Update world bounds to match new screen size
    this.physics.world.setBounds(0, 0, width, height);

    this.floor.setPosition(0, height - this.gameConfig.floorHeight);
    this.floor.setSize(width, this.gameConfig.floorHeight);
    if (this.floor.body) {
      this.floor.body.updateFromGameObject();
    }

    // Ensure player drops freely into expanded bounds or doesn't get buried when shrinking
    if (this.player && this.player.y > this.floor.y - 30) {
      this.player.y = this.floor.y - 50;
      this.player.body.setVelocityY(0); // Reset velocity to avoid popping up wildly
    }

    if (this.isGameOver) {
      if (this.overlay) {
        this.overlay.setSize(width, height);
        this.overlay.setPosition(width / 2, height / 2);
      }
      if (this.gameOverText) this.gameOverText.setPosition(width / 2, height / 2 - 40);
      if (this.subText) this.subText.setPosition(width / 2, height / 2 + 20);
    }
  }

  spawnObstacle() {
    if (this.isGameOver) return;

    // Variety for sizes
    const scale = Phaser.Math.FloatBetween(this.gameConfig.obstacleScaleMin, this.gameConfig.obstacleScaleMax);

    const obstacle = this.add.sprite(this.scale.width + 50, this.scale.height - 200, 'crate'); // Spawn mid-air right off screen
    obstacle.setScale(scale);
    this.physics.add.existing(obstacle);
    this.obstacles.add(obstacle);
    
    // Enable gravity so the obstacle naturally falls to exactly align with the floor
    obstacle.body.setGravityY(this.gameConfig.gravity);
    obstacle.body.setVelocityX(-this.runSpeed);
  }

  jump() {
    if (this.isGameOver) {
      // Restart on space/click if game over
      this.scene.restart();
      return;
    }

    // Only jump if touching the floor or resting on world bounds
    if (this.player.body.touching.down || this.player.body.blocked.down) {
      this.player.body.setVelocityY(-this.gameConfig.jumpForce);
      this.player.anims.stop();
      this.player.setFrame(6); // A mid-air looking frame
    }
  }

  hitObstacle(player, obstacle) {
    if (this.isGameOver) return;
    this.isGameOver = true;

    this.physics.pause();
    this.player.anims.stop();
    this.player.setTint(0x888888); // Turn gray

    // Semi-transparent dark overlay for better contrast
    this.overlay = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.6);
    this.overlay.setDepth(10); // ensure it's on top of everything except text

    this.gameOverText = this.add.text(this.scale.width / 2, this.scale.height / 2 - 40, 'GAME OVER', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '56px',
      fill: '#FF4136',
      fontStyle: '900'
    });
    this.gameOverText.setOrigin(0.5);
    this.gameOverText.setShadow(2, 2, 'rgba(0,0,0,0.5)', 4);
    this.gameOverText.setDepth(11);

    this.subText = this.add.text(this.scale.width / 2, this.scale.height / 2 + 20, 'Press Space or Click to Restart', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      fill: '#FFFFFF',
      fontStyle: 'bold'
    });
    this.subText.setOrigin(0.5);
    this.subText.setDepth(11);
  }

  update(time, delta) {
    if (this.isGameOver) return;

    // Resume running animation when touching down on floor or bounds
    if ((this.player.body.touching.down || this.player.body.blocked.down) && !this.player.anims.isPlaying) {
      this.player.play('run', true);
    }

    // Simulate running by scrolling the ground tile
    this.floor.tilePositionX += (this.runSpeed * (delta / 1000)) / this.floor.tileScaleX;

    // Cleanup off-screen obstacles to free memory
    this.obstacles.children.iterate((obstacle) => {
      if (obstacle && obstacle.x < -50) {
        obstacle.destroy();
      }
    });

    // Progressive speed: scales up from the current baseSpeed over time.
    // baseSpeed is the slider-controlled value; runSpeed floats above it.
    this.runSpeed += this.gameConfig.speedIncrement;
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'phaser-game-container',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  }
};

const startGame = (parent) => {
  const game = new Phaser.Game({ ...config, parent });
  game.scene.add('RunnerScene', RunnerScene, true);
  return game;
};

export default startGame;
