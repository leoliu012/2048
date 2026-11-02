import { Game } from "./game.js";
import { BoardView } from "./board-view.js";
import { Coach } from "./coach.js";
import { bindInput } from "./input.js";
import { storage } from "./storage.js";
import { fromCells } from "./ai/engine.js";

const boardEl = document.querySelector(".board");
const panel = document.querySelector(".coach");
const hintToggle = document.querySelector("[data-action=toggle-hints]");
const autoButton = document.querySelector("[data-action=autoplay]");
const playButton = document.querySelector("[data-action=play-hint]");
const undoButton = document.querySelector("[data-action=undo]");

const game = new Game(storage);
const view = new BoardView(boardEl);
const coach = new Coach({ panel, board: boardEl });

let hintsOn = storage.getSetting("hints", true);
let autoplay = false;

function refreshHint() {
  undoButton.disabled = game.history.length === 0;
  if (game.terminated) {
    coach.clear();
    if (autoplay) setAutoplay(false);
    return;
  }
  if (!hintsOn && !autoplay) { coach.clear(); return; }
  coach.hideBoardArrow();
  coach.advise(fromCells(game.values()), { show: hintsOn }).then((a) => {
    if (a && autoplay && a.best !== null) {
      setTimeout(() => autoplay && game.move(a.best), matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 140);
    }
  });
}

game.addEventListener("change", ({ detail }) => {
  view.render(game, storage.best, { animate: !detail.undone });
  refreshHint();
});

function setHints(on) {
  hintsOn = on;
  storage.setSetting("hints", on);
  hintToggle.setAttribute("aria-checked", String(on));
  panel.classList.toggle("is-off", !on);
  refreshHint();
}

function setAutoplay(on) {
  autoplay = on;
  autoButton.setAttribute("aria-pressed", String(on));
  autoButton.textContent = on ? "Stop auto-play" : "Auto-play";
  if (on) refreshHint();
}

async function playHint() {
  if (game.terminated) return;
  const a = coach.current ?? (await coach.advise(fromCells(game.values()), { show: hintsOn }));
  if (a?.best != null) game.move(a.best);
}

const actions = {
  move: (dir) => { if (autoplay) setAutoplay(false); game.move(dir); },
  restart: () => { setAutoplay(false); game.reset(); },
  undo: () => { setAutoplay(false); game.undo(); },
  toggleHints: () => setHints(!hintsOn),
  playHint,
};

bindInput(boardEl, actions);

document.querySelector("[data-action=new-game]").addEventListener("click", actions.restart);
document.querySelector("[data-action=retry]").addEventListener("click", actions.restart);
document.querySelector("[data-action=keep-going]").addEventListener("click", () => game.continueAfterWin());
undoButton.addEventListener("click", actions.undo);
hintToggle.addEventListener("click", actions.toggleHints);
playButton.addEventListener("click", playHint);
autoButton.addEventListener("click", () => setAutoplay(!autoplay));

view.render(game, storage.best, { animate: false });
setHints(hintsOn);
