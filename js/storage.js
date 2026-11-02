// localStorage wrapper that degrades to memory (private mode, blocked storage).

const memory = new Map();

function read(key) {
  try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { memory.set(key, value); }
}
function remove(key) {
  try { localStorage.removeItem(key); } catch { memory.delete(key); }
}

export const storage = {
  get best() { return Number(read("bestScore")) || 0; },
  set best(value) { write("bestScore", value); },

  loadGame() {
    try {
      const state = JSON.parse(read("gameState2"));
      return state?.cells ? state : null;
    } catch { return null; }
  },
  saveGame(state) { write("gameState2", JSON.stringify(state)); },
  clearGame() { remove("gameState2"); },

  getSetting(key, fallback) {
    const v = read(`setting:${key}`);
    return v === null ? fallback : v === "true";
  },
  setSetting(key, value) { write(`setting:${key}`, String(value)); },
};
