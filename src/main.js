import { Game } from './core/Game.js';

const game = new Game();
game.init().then(() => {
  game.start();
});

window.game = game;
