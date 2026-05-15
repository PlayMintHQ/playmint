import Phaser from 'phaser';

/**
 * MeleeAttack — animated energy-slash hitbox, pooled identically to Projectile.
 *
 * Animation key: 'slash_anim'  (registered once in GameManagerScene.create)
 * The animation cycles through 6 SVG frames:
 *   slash_f0 → slash_f1 → slash_f2 → slash_f3 → slash_f4 → slash_f5
 *
 * Usage:
 *   const atk = meleeGroup.get();
 *   if (atk) atk.swing(playerX, playerY, isFacingLeft);
 */
export default class MeleeAttack extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    // Start with frame 0 texture until the animation takes over
    super(scene, x, y, 'slash_f0');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    if (this.body) {
      this.body.setAllowGravity(false);
      // Hit-box is smaller than the full 128×128 visual to feel fair
      this.body.setSize(80, 80);
      this.body.enable = false;
    }

    // Flag so PlatformerMode can tell whether we've already hit something this swing
    this.hasHit = false;
  }

  /**
   * Activates and plays the slash animation at the given world position.
   * @param {number} x        - World X (offset to appear in front of the player)
   * @param {number} y        - World Y (player center)
   * @param {boolean} facingLeft - Mirror the slash if the player faces left
   */
  swing(x, y, facingLeft) {
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);
    this.setFlipX(facingLeft);
    this.hasHit = false;
    this.setAlpha(1);
    // Scale up so it looks substantial in the world
    this.setScale(1.4);

    if (this.body) {
      this.body.enable = true;
      this.body.reset(x, y);
      this.body.setVelocity(0, 0);
      // Re-centre the hit-box
      this.body.setOffset(
        (this.width - 80) / 2,
        (this.height - 80) / 2
      );
    }

    // Play the animation; auto-deactivate on completion
    this.play('slash_anim', true);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.deactivate();
    });
  }

  /**
   * Returns the sprite to the pool.
   */
  deactivate() {
    this.setActive(false);
    this.setVisible(false);
    this.stop();           // Stop the animation
    if (this.body) {
      this.body.enable = false;
      this.body.stop();
    }
  }
}
