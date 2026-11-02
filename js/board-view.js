// Renders the game onto the board. Tiles are absolutely positioned with
// CSS custom properties (--x, --y); CSS transitions do the sliding.

export class BoardView {
  constructor(root) {
    this.tiles = root.querySelector(".tiles");
    this.message = root.querySelector(".game-message");
    this.messageText = this.message.querySelector("p");
    this.keepGoing = this.message.querySelector("[data-action=keep-going]");
    this.score = document.querySelector("[data-score]");
    this.best = document.querySelector("[data-best]");
    this.lastScore = null;
  }

  render(game, best, { animate = true } = {}) {
    requestAnimationFrame(() => {
      this.tiles.replaceChildren();
      game.eachTile((tile) => this.addTile(tile, animate));
      this.updateScore(game.score, animate);
      this.best.textContent = best;
      this.showMessage(game);
    });
  }

  addTile(tile, animate) {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.value = tile.value > 2048 ? "super" : tile.value;
    if (tile.value >= 1024) el.dataset.digits = String(tile.value).length;
    el.textContent = tile.value;

    const start = animate && tile.previous ? tile.previous : tile;
    this.place(el, start);

    if (animate && tile.previous) {
      requestAnimationFrame(() => this.place(el, tile));
    } else if (animate && tile.mergedFrom) {
      el.classList.add("is-merged");
      tile.mergedFrom.forEach((t) => this.addTile(t, true));
    } else if (animate) {
      el.classList.add("is-new");
    }
    this.tiles.append(el);
  }

  place(el, { x, y }) {
    el.style.setProperty("--x", x);
    el.style.setProperty("--y", y);
  }

  updateScore(score, animate) {
    const diff = this.lastScore === null ? 0 : score - this.lastScore;
    this.lastScore = score;
    this.score.textContent = score;
    if (animate && diff > 0) {
      const bump = document.createElement("span");
      bump.className = "score-bump";
      bump.textContent = `+${diff}`;
      this.score.append(bump);
    }
  }

  showMessage(game) {
    const state = game.over ? "over" : game.won && !game.keepPlaying ? "won" : "";
    this.message.dataset.state = state;
    this.message.hidden = !state;
    this.messageText.textContent = game.over ? "No moves left" : "You made 2048";
    this.keepGoing.hidden = state !== "won";
  }
}
