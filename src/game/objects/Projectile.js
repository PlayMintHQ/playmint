import Phaser from 'phaser';

export default class Projectile extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    // Call the parent constructor with the 'projectile' texture
    super(scene, x, y, 'projectile');

    // Add to the scene
    scene.add.existing(this);

    // Enable physics for this object
    scene.physics.add.existing(this);

    // Default configuration for the body
    if (this.body) {
      this.body.setAllowGravity(false);
      // Optional: adjust the bounding box size if the asset has a lot of empty space
      // this.body.setSize(width, height);
    }

    // Keep track of how long the projectile has been alive
    this.lifespan = 0;
  }

  /**
   * Fires the projectile from a specific location and in a specific direction.
   * @param {number} x - The initial X coordinate.
   * @param {number} y - The initial Y coordinate.
   * @param {boolean} isFacingLeft - True if the projectile should travel left.
   */
  fire(x, y, isFacingLeft) {
    // Reactivate and position the object
    this.setActive(true);
    this.setVisible(true);

    if (this.body) {
      // Re-enable the physics body
      this.body.enable = true;
      this.setPosition(x, y);

      // Adjust the body size to match the current texture dimensions
      this.body.setSize(this.width, this.height);

      const velocityX = isFacingLeft ? -600 : 600;
      this.body.setVelocityX(velocityX);
      this.body.setVelocityY(0);

      // Flip the sprite if the asset is directional
      this.setFlipX(isFacingLeft);
    }

    // Reset lifespan (e.g., live for 2000 milliseconds)
    this.lifespan = 2000;
  }

  /**
   * Called automatically by Phaser's update loop if runChildUpdate is true on the group.
   * @param {number} time - The current time.
   * @param {number} delta - The delta time in ms since the last frame.
   */
  preUpdate(time, delta) {
    // Shuriken spinning effect
    if (this.texture && this.texture.key === 'shuriken') {
      this.rotation += 0.2;
    } else {
      this.rotation = 0;
    }

    if (this.lifespan > 0) {
      this.lifespan -= delta;

      if (this.lifespan <= 0) {
        this.deactivate();
      }
    }
  }

  /**
   * Deactivates the projectile and hides its physics body, returning it to the pool.
   */
  deactivate() {
    this.setActive(false);
    this.setVisible(false);

    if (this.body) {
      this.body.stop();
      this.body.enable = false;
    }
  }
}
