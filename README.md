# 2048 + AI coach

A modernized take on [Gabriele Cirulli's 2048](https://github.com/gabrielecirulli/2048), with an AI coach that suggests and explains the best move on every turn.

## What's new

- **AI hints every step.** An expectimax search (in a Web Worker, so the board never stutters) rates all four moves after each turn. The board leans toward the suggested edge, and the coach explains why ("Left merges two 32s and keeps your 512 anchored in its corner") and warns about traps.
- **Play this move / Auto-play.** Let the coach make one move, or watch it play (it regularly reaches 4096–8192).
- **Undo** (up to 100 moves).
- **New look.** Responsive layout with no fixed 500px board, automatic dark mode, and a "thermal" tile palette that heats up as tiles grow.
- **Modern code.** Native ES modules and classes, pointer events for swipes, no polyfills, no Sass and no build step.

## Run it

ES modules need to be served over HTTP (opening `index.html` directly won't work):

```sh
python3 -m http.server 8048   # then open http://localhost:8048
# or: npx serve .
```

It deploys to GitHub Pages as-is.

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD / HJKL, or swipe | Move |
| Space | Play the coach's move |
| U or Ctrl/⌘+Z | Undo |
| ? | Toggle hints |
| R | New game |

## Layout

```
js/
  main.js         wiring
  game.js         rules, undo history
  board-view.js   rendering + animation
  input.js        keyboard + swipe
  storage.js      localStorage (falls back to memory)
  coach.js        hint panel, talks to the worker
  ai/engine.js    bitboard expectimax + plain-English explanations
  ai/worker.js    runs the engine off the main thread
style/main.css
```

The search heuristic follows [nneonneo/2048-ai](https://github.com/nneonneo/2048-ai): it rewards empty cells and adjacent pairs and penalizes non-monotonic rows and columns.

## License

MIT. See [LICENSE.txt](LICENSE.txt). The original game is by Gabriele Cirulli, based on 1024 by Veewo Studio and inspired by Threes by Asher Vollmer.
