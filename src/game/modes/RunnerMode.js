import Phaser from 'phaser';
import BaseMode from './BaseMode';

export default class RunnerMode extends BaseMode {
  init() {
    this.baseSpeed = this.scene.gameConfig.runSpeed || 350;
    this.runSpeed = this.baseSpeed;
    this.obstacles = null;
    this.obstacleTimer = null;
  }

  create() {
    this.scene.player.setGravityY(this.scene.gameConfig.gravity || 1800);
    this.scene.player.play('run');

    this.obstacles = this.scene.physics.add.group();

    this.obstacleTimer = this.scene.time.addEvent({
      delay: this.scene.gameConfig.obstacleDelay || 1200,
      callback: this.spawnObstacle,
      callbackScope: this,
      loop: true
    });

    this.scene.physics.add.collider(this.obstacles, this.scene.floor);
    this.scene.physics.add.collider(this.scene.player, this.obstacles, this.scene.hitObstacle, null, this.scene);
  }

  spawnObstacle() {
    if (this.scene.isGameOver) return;

    const scale = Phaser.Math.FloatBetween(this.scene.gameConfig.obstacleScaleMin || 0.8, this.scene.gameConfig.obstacleScaleMax || 1.2);
    const spawnX = this.scene.cameras.main.scrollX + this.scene.scale.width + 50;
    const obstacle = this.scene.add.sprite(spawnX, this.scene.LOGICAL_FLOOR_Y - 50, 'crate');
    obstacle.setScale(scale);
    this.scene.physics.add.existing(obstacle);
    this.obstacles.add(obstacle);

    obstacle.body.setGravityY(this.scene.gameConfig.gravity || 1800);
    obstacle.body.setVelocityX(-this.runSpeed);
  }

  update(time, delta) {
    if (this.scene.isGameOver) return;

    if ((this.scene.player.body.touching.down || this.scene.player.body.blocked.down) && !this.scene.player.anims.isPlaying) {
      this.scene.player.play('run', true);
    }

    // Scroll floor
    this.scene.floor.tilePositionX += (this.runSpeed * (delta / 1000)) / this.scene.floor.tileScaleX;

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
    if (this.scene.isGameOver) return;
    
    if (this.scene.player.body.touching.down || this.scene.player.body.blocked.down) {
      this.scene.player.body.setVelocityY(-(this.scene.gameConfig.jumpForce || 750));
      this.scene.player.anims.stop();
      this.scene.player.setFrame(6);
    }
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
    if (this.obstacles && this.obstacles.scene) {
      try { this.obstacles.clear(true, true); } catch (e) {}
    }
  }
}
