export class StateManager {
  constructor(game) {
    this.game = game;
    this.currentState = 'loading';
    this.previousState = null;
    this.states = new Map();
  }

  setState(state) {
    this.previousState = this.currentState;
    this.currentState = state;
    this.game.eventBus.emit('state:changed', { from: this.previousState, to: state });
  }

  togglePause() {
    if (this.currentState === 'playing') {
      this.setState('paused');
      this.game.eventBus.emit('game:paused');
    } else if (this.currentState === 'paused') {
      this.setState('playing');
      this.game.eventBus.emit('game:resumed');
    }
  }

  isPlaying() {
    return this.currentState === 'playing';
  }

  isPaused() {
    return this.currentState === 'paused';
  }
}
