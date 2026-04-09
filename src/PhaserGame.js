import Phaser from 'phaser';

class RunnerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RunnerScene' });
    this.runSpeed = 300;
  }

  create() {
    this.cameras.main.setBackgroundColor('#87CEEB'); // Sky blue background

    // Floor
    this.floor = this.add.rectangle(400, 550, 800, 100, 0x228B22); // Green
    this.physics.add.existing(this.floor, true); // Static

    // Player
    this.player = this.add.rectangle(150, 480, 40, 40, 0x0000FF); // Blue
    this.physics.add.existing(this.player);
    this.player.body.setGravityY(1600); // Gravity

    // Collision
    this.physics.add.collider(this.player, this.floor);

    // Input to jump
    this.input.keyboard.on('keydown-SPACE', this.jump, this);
    this.input.on('pointerdown', this.jump, this); // Click to jump

    // Floor details to simulate running visually
    this.groundDetails = this.add.group();
    for (let i = 0; i < 5; i++) {
       const detail = this.add.rectangle(i * 200, 520, 20, 10, 0x006400); // Dark green spots
       this.groundDetails.add(detail);
    }
  }

  jump() {
    // Only jump if touching the ground
    if (this.player.body.touching.down) {
      this.player.body.setVelocityY(-700);
    }
  }

  update(time, delta) {
    // Simulate running by moving ground details left
    const moveAmount = this.runSpeed * (delta / 1000);
    this.groundDetails.children.iterate((child) => {
        child.x -= moveAmount;
        if (child.x < -20) {
            child.x = 820;
        }
    });

    // We can also let the player bounce slightly or something, but keeping it simple for MVP
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
