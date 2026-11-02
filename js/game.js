// Core 2048 rules. Cells are indexed cells[x][y]; directions are
// 0 = up, 1 = right, 2 = down, 3 = left.

const VECTORS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

let nextId = 1;

export class Tile {
  constructor({ x, y }, value) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.value = value;
    this.previous = null;   // { x, y } before the last move
    this.mergedFrom = null; // [tileA, tileB] when created by a merge
  }
}

export class Game extends EventTarget {
  constructor(storage, size = 4) {
    super();
    this.size = size;
    this.storage = storage;
    this.history = [];
    const saved = storage.loadGame();
    saved ? this.restore(saved) : this.reset();
  }

  // --- lifecycle -----------------------------------------------------------

  reset() {
    this.cells = this.emptyCells();
    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;
    this.history = [];
    this.addRandomTile();
    this.addRandomTile();
    this.changed({ fresh: true });
  }

  continueAfterWin() {
    this.keepPlaying = true;
    this.changed({});
  }

  get terminated() {
    return this.over || (this.won && !this.keepPlaying);
  }

  undo() {
    const last = this.history.pop();
    if (!last) return;
    this.restore(last, { keepHistory: true });
    this.changed({ undone: true });
  }

  // --- moves ---------------------------------------------------------------

  move(direction) {
    if (this.terminated) return false;
    const vector = VECTORS[direction];
    const snapshot = this.serialize();
    let moved = false;
    let gained = 0;

    this.eachTile((tile) => {
      tile.mergedFrom = null;
      tile.previous = { x: tile.x, y: tile.y };
    });

    for (const x of this.traversal(vector.x)) {
      for (const y of this.traversal(vector.y)) {
        const tile = this.cells[x][y];
        if (!tile) continue;

        const { farthest, next } = this.farthestPosition({ x, y }, vector);
        const target = this.cellAt(next);

        if (target && target.value === tile.value && !target.mergedFrom) {
          const merged = new Tile(next, tile.value * 2);
          merged.mergedFrom = [tile, target];
          this.cells[next.x][next.y] = merged;
          this.cells[x][y] = null;
          tile.x = next.x;
          tile.y = next.y;
          gained += merged.value;
          if (merged.value === 2048) this.won = true;
        } else {
          this.cells[x][y] = null;
          this.cells[farthest.x][farthest.y] = tile;
          tile.x = farthest.x;
          tile.y = farthest.y;
        }
        if (tile.x !== x || tile.y !== y) moved = true;
      }
    }

    if (!moved) return false;

    this.history.push(snapshot);
    if (this.history.length > 100) this.history.shift();
    this.score += gained;
    this.addRandomTile();
    if (!this.movesAvailable()) this.over = true;
    this.changed({ gained });
    return true;
  }

  // --- helpers -------------------------------------------------------------

  changed(detail) {
    if (this.score > this.storage.best) this.storage.best = this.score;
    this.over ? this.storage.clearGame() : this.storage.saveGame(this.serialize());
    this.dispatchEvent(new CustomEvent("change", { detail }));
  }

  emptyCells() {
    return Array.from({ length: this.size }, () => Array(this.size).fill(null));
  }

  eachTile(fn) {
    for (const column of this.cells) for (const tile of column) if (tile) fn(tile);
  }

  traversal(direction) {
    const order = [...Array(this.size).keys()];
    return direction === 1 ? order.reverse() : order;
  }

  withinBounds({ x, y }) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size;
  }

  cellAt(pos) {
    return this.withinBounds(pos) ? this.cells[pos.x][pos.y] : null;
  }

  farthestPosition(cell, vector) {
    let previous;
    do {
      previous = cell;
      cell = { x: previous.x + vector.x, y: previous.y + vector.y };
    } while (this.withinBounds(cell) && !this.cellAt(cell));
    return { farthest: previous, next: cell };
  }

  availableCells() {
    const out = [];
    this.cells.forEach((column, x) => column.forEach((tile, y) => !tile && out.push({ x, y })));
    return out;
  }

  addRandomTile() {
    const free = this.availableCells();
    if (!free.length) return;
    const cell = free[Math.floor(Math.random() * free.length)];
    this.cells[cell.x][cell.y] = new Tile(cell, Math.random() < 0.9 ? 2 : 4);
  }

  movesAvailable() {
    if (this.availableCells().length) return true;
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const value = this.cells[x][y].value;
        if (this.cellAt({ x: x + 1, y })?.value === value) return true;
        if (this.cellAt({ x, y: y + 1 })?.value === value) return true;
      }
    }
    return false;
  }

  /** Plain values grid, cells[x][y] = number | null (what the AI reads). */
  values() {
    return this.cells.map((column) => column.map((tile) => tile?.value ?? null));
  }

  serialize() {
    return {
      cells: this.values(),
      score: this.score,
      over: this.over,
      won: this.won,
      keepPlaying: this.keepPlaying,
    };
  }

  restore(state, { keepHistory = false } = {}) {
    this.cells = state.cells.map((column, x) =>
      column.map((value, y) => (value ? new Tile({ x, y }, value) : null))
    );
    this.score = state.score;
    this.over = state.over;
    this.won = state.won;
    this.keepPlaying = state.keepPlaying;
    if (!keepHistory) this.history = [];
  }
}
