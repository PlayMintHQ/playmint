import Phaser from 'phaser';

class RunnerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RunnerScene' });
    this.runSpeed = 350; // Increased slightly for more challenge
  }

  create() {
    this.isGameOver = false;
    this.score = 0;

    this.cameras.main.setBackgroundColor('#87CEEB'); // Sky blue

    // Score UI
    this.scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '32px', fill: '#000' });
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
    this.floor = this.add.rectangle(400, 550, 800, 100, 0x228B22); // Green
    this.physics.add.existing(this.floor, true); // Static

    // Player
    this.player = this.add.rectangle(150, 480, 40, 40, 0x0000FF); // Blue
    this.physics.add.existing(this.player);
    this.player.body.setGravityY(1800); // Slightly more gravity

    // Obstacles
    this.obstacles = this.physics.add.group();

    // Spawn Obstacles Timer
    this.obstacleTimer = this.time.addEvent({
      delay: 1200, // spawn every 1.2 seconds initially
      callback: this.spawnObstacle,
      callbackScope: this,
      loop: true
    });

    // Collisions
    this.physics.add.collider(this.player, this.floor);
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

    // Randomize height slightly for variety (or stay same for simple hurdles)
    const isHighObstacle = Phaser.Math.Between(0, 1) === 1;
    const height = isHighObstacle ? 60 : 40;
    const width = isHighObstacle ? 30 : 50;

    const obstacle = this.add.rectangle(850, 500 - (height / 2), width, height, 0xFF0000); // Red
    this.physics.add.existing(obstacle);
    this.obstacles.add(obstacle);

    obstacle.body.setVelocityX(-this.runSpeed);
  }

  jump() {
    if (this.isGameOver) {
      // Restart on space/click if game over
      this.scene.restart();
      return;
    }

    // Only jump if touching the ground
    if (this.player.body.touching.down) {
      this.player.body.setVelocityY(-750); // Jump force matched to gravity
    }
  }

  hitObstacle(player, obstacle) {
    if (this.isGameOver) return;
    this.isGameOver = true;

    this.physics.pause();
    this.player.fillColor = 0x888888; // Turn gray

    const gameOverText = this.add.text(400, 250, 'GAME OVER\nPress Space or Click to Restart', {
      fontFamily: 'sans-serif',
      fontSize: '40px',
      fill: '#FF0000',
      align: 'center',
      fontStyle: 'bold'
    });
    gameOverText.setOrigin(0.5);
  }

  update(time, delta) {
    if (this.isGameOver) return;

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
    this.runSpeed += 0.05;
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
  },
  scene: [RunnerScene]
};

const startGame = (parent) => {
  return new Phaser.Game({ ...config, parent });
};

export default startGame;
