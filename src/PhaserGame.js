import Phaser from 'phaser';

class RunnerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RunnerScene' });
  }

  preload() {
    this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });
    this.load.image('crate', 'assets/crate.png');
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
    let graphics = this.add.graphics();
    graphics.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xe0f7fa, 0xe0f7fa, 1);
    graphics.fillRect(0, 0, 800, 600);

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

    // Floor (anchored Top-Left implicitly at y=500 downward)
    this.floor = this.add.rectangle(0, 500, 800, 100, 0x228B22).setOrigin(0, 0); // Green
    this.physics.add.existing(this.floor, true); // Static

    // Animations
    this.anims.create({
      key: 'run',
      frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
      frameRate: 10,
      repeat: -1
    });

    // Player
    this.player = this.physics.add.sprite(150, 350, 'dude'); // Spawn high so gravity forces contact
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

    // Floor details to simulate running visually
    this.groundDetails = this.add.group();
    for (let i = 0; i < 6; i++) {
      const detail = this.add.rectangle(i * 150, 520, 20, 10, 0x006400);
      this.groundDetails.add(detail);
    }
  }

  spawnObstacle() {
    if (this.isGameOver) return;

    // Variety for sizes
    const scale = Phaser.Math.FloatBetween(0.8, 1.2);

    const obstacle = this.add.sprite(850, 400, 'crate'); // Spawn mid-air
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
    const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.6);
    overlay.setDepth(10); // ensure it's on top of everything except text

    const gameOverText = this.add.text(400, 260, 'GAME OVER', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '56px',
      fill: '#FF4136',
      fontStyle: '900'
    });
    gameOverText.setOrigin(0.5);
    gameOverText.setShadow(2, 2, 'rgba(0,0,0,0.5)', 4);
    gameOverText.setDepth(11);

    const subText = this.add.text(400, 320, 'Press Space or Click to Restart', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      fill: '#FFFFFF',
      fontStyle: 'bold'
    });
    subText.setOrigin(0.5);
    subText.setDepth(11);
  }

  update(time, delta) {
    if (this.isGameOver) return;

    // Resume running animation when touching down on floor or bounds
    if ((this.player.body.touching.down || this.player.body.blocked.down) && !this.player.anims.isPlaying) {
      this.player.play('run', true);
    }

    // Simulate running by moving ground details left
    const moveAmount = this.runSpeed * (delta / 1000);
    this.groundDetails.children.iterate((child) => {
      child.x -= moveAmount;
      if (child.x < -20) {
        child.x = 820;
      }
    });

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
