export default class BaseMode {
  constructor(scene) {
    this.scene = scene;
  }

  init() {
    // Override to set up initial state
  }

  create() {
    // Override to set up sprites, physics groups, timers
  }

  update(time, delta) {
    // Override to update game logic
  }

  jump() {
    // Override to handle jump input
  }

  onConfigUpdate(newConfig, oldConfig) {
    // Override to dynamically handle live parameter changes
  }

  cleanup() {
    // Override to destroy listeners and timers when mode is switched
  }
}
