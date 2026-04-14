import Phaser from 'phaser';

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
      runSpeed: 350,
      jumpForce: 750,
      gravity: 1800,
      obstacleDelay: 1200,
      speedIncrement: 0.05,
      ...data
    };
    this.runSpeed = this.gameConfig.runSpeed;
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
      delay: 100, // every 100ms
      callback: () => {
        if (!this.isGameOver) {
          this.score += 1;
          this.scoreText.setText('Score: ' + this.score);
        }
      },
      loop: true
    });

    // Floor
    this.floor = this.add.tileSprite(0, this.scale.height - 100, this.scale.width, 100, 'ground').setOrigin(0, 0);
    this.floor.tileScaleX = 0.15;
    this.floor.tileScaleY = 0.15;
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
    this.player.setScale(1.5);
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

    // Dynamic resize handler
    this.scale.on('resize', this.handleResize, this);
  }

  handleResize(gameSize) {
    const width = gameSize.width;
    const height = gameSize.height;

    this.bgGraphics.clear();
    this.bgGraphics.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xe0f7fa, 0xe0f7fa, 1);
    this.bgGraphics.fillRect(0, 0, width, height);

    // Update world bounds to match new screen size
    this.physics.world.setBounds(0, 0, width, height);

    this.floor.setPosition(0, height - 100);
    this.floor.setSize(width, 100);
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
    const scale = Phaser.Math.FloatBetween(0.8, 1.2);

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

    // Optional MVP expansion: slightly increase run speed over time
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

const startGame = (parent, gameOptions) => {
  const game = new Phaser.Game({ ...config, parent });
  game.scene.add('RunnerScene', RunnerScene, true, gameOptions);
  return game;
};

export default startGame;
