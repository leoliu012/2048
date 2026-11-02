// Keyboard and swipe input. Calls handlers.move(dir) etc.

const KEYS = {
  ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3,
  w: 0, d: 1, s: 2, a: 3,
  k: 0, l: 1, j: 2, h: 3,
};

export function bindInput(board, handlers) {
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select")) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

    if ((event.metaKey || event.ctrlKey) && key === "z") {
      event.preventDefault();
      handlers.undo();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    if (key in KEYS) {
      event.preventDefault();
      handlers.move(KEYS[key]);
    } else if (key === "r") {
      handlers.restart();
    } else if (key === "u") {
      handlers.undo();
    } else if (key === "?") {
      handlers.toggleHints();
    } else if (key === "Enter" || key === " ") {
      if (event.target === document.body) {
        event.preventDefault();
        handlers.playHint();
      }
    }
  });

  // Swipes (pointer events cover touch, pen and mouse drags)
  let start = null;
  board.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    start = { x: event.clientX, y: event.clientY };
  });
  board.addEventListener("pointerup", (event) => {
    if (!start || !event.isPrimary) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
    handlers.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });
  board.addEventListener("pointercancel", () => { start = null; });
}
