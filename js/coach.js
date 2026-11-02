// The AI coach: asks the engine for advice after every move and shows it.

import { DIRECTIONS } from "./ai/engine.js";

const ARROWS = ["↑", "→", "↓", "←"];
const VERDICT_LABEL = {
  best: "Best", good: "Good", okay: "Okay", risky: "Risky", avoid: "Avoid", blocked: "Can't move",
};

export class Coach {
  constructor({ panel, board, depth = 4 }) {
    this.panel = panel;
    this.boardArrow = board.querySelector(".hint-arrow");
    this.depth = depth;
    this.requestId = 0;
    this.current = null;
    this.pending = new Map();

    this.el = {
      arrow: panel.querySelector("[data-hint-arrow]"),
      title: panel.querySelector("[data-hint-title]"),
      reason: panel.querySelector("[data-hint-reason]"),
      warning: panel.querySelector("[data-hint-warning]"),
      moves: panel.querySelector("[data-hint-moves]"),
      meta: panel.querySelector("[data-hint-meta]"),
    };
    this.buildMoveRows();
    this.startWorker();
  }

  startWorker() {
    try {
      this.worker = new Worker(new URL("./ai/worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => this.resolve(data);
      this.worker.onerror = () => { this.worker = null; };
    } catch {
      this.worker = null;
    }
  }

  async run(rows) {
    const id = ++this.requestId;
    const result = new Promise((resolve) => this.pending.set(id, resolve));
    if (this.worker) {
      this.worker.postMessage({ id, rows, maxDepth: this.depth });
    } else {
      // Fallback: run on the main thread (e.g. module workers unavailable)
      const { analyse } = await import("./ai/engine.js");
      setTimeout(() => this.resolve({ id, ...analyse(rows, { maxDepth: this.depth }) }), 0);
    }
    return result;
  }

  resolve(data) {
    const done = this.pending.get(data.id);
    this.pending.delete(data.id);
    // Only the newest request matters; older ones resolve to null.
    done?.(data.id === this.requestId ? data : null);
  }

  /** Analyse a board and update the panel. Returns the analysis (or null if superseded). */
  async advise(rows, { show = true } = {}) {
    if (show) this.panel.dataset.state = "thinking";
    const analysis = await this.run(rows);
    if (!analysis) return null;
    this.current = analysis;
    if (show) this.show(analysis);
    return analysis;
  }

  buildMoveRows() {
    this.rows = DIRECTIONS.map((name, dir) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="move-dir"><span aria-hidden="true">${ARROWS[dir]}</span> ${name[0].toUpperCase() + name.slice(1)}</span>
        <span class="move-bar"><span></span></span>
        <span class="move-verdict"></span>`;
      this.el.moves.append(li);
      return li;
    });
  }

  show(a) {
    this.panel.dataset.state = a.best === null ? "stuck" : "ready";
    if (a.best === null) {
      this.el.arrow.textContent = "·";
      this.el.title.textContent = "No moves left";
      this.el.reason.textContent = "Start a new game or undo a few moves to try a different line.";
      this.el.warning.hidden = true;
      this.hideBoardArrow();
      return;
    }
    this.el.arrow.textContent = ARROWS[a.best];
    this.el.title.textContent = `Slide ${DIRECTIONS[a.best]}`;
    this.el.reason.textContent = a.reason;
    this.el.warning.textContent = a.warning ?? "";
    this.el.warning.hidden = !a.warning;
    this.el.meta.textContent = `Looked ${a.depth} moves ahead`;

    a.moves.forEach((m, dir) => {
      const li = this.rows[dir];
      li.dataset.verdict = m.verdict;
      li.querySelector(".move-bar span").style.setProperty("--strength", m.strength);
      li.querySelector(".move-verdict").textContent = VERDICT_LABEL[m.verdict];
    });

    this.boardArrow.dataset.dir = DIRECTIONS[a.best];
    this.boardArrow.hidden = false;
  }

  hideBoardArrow() {
    this.boardArrow.hidden = true;
  }

  clear() {
    this.current = null;
    this.requestId++;
    this.panel.dataset.state = "off";
    this.hideBoardArrow();
  }
}
