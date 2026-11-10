# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris on HTML5 Canvas. No dependencies, no `package.json`, no build step, no linter, no test suite. The README and UI text are in Spanish. Keep new user-facing strings in Spanish too.

## Running

Open `index.html` directly, or serve the directory statically:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

There are no automated tests. To verify a change, load the page in a browser and play.

## Architecture

There are three files: `index.html` (DOM and canvases), `style.css` (dark/retro theme) and `game.js` (all logic). `game.js` is one classic script with `'use strict'` and no modules. All game state lives in module-level `let` globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …). `init()` resets them all and is also the restart handler.

Key conventions:

- **Board model**: a `ROWS × COLS` matrix. `0` means empty, and `1–7` is a piece type that also indexes into `COLORS`. Piece shapes in `PIECES` store their type number as the cell value, so a merged cell carries its color. If you add a piece type, update `PIECES` and `COLORS` together, and update the `* 7` in `randomPiece()`.
- **Collision**: everything goes through `collide(shape, x, y)`. Cells with `y < 0` (above the board) are allowed.
- **Rotation**: `rotateCW` transposes the matrix and reverses it. `tryRotate` tries the horizontal kicks `[0, -1, 1, -2, 2]`. These are simple kicks, not SRS.
- **Piece lifecycle**: `lockPiece()` → `merge()` → `clearLines()` → `spawn()`. `spawn()` detects game over when the new piece already collides, and it redraws the next-piece preview.
- **Game loop**: `loop(ts)` uses `requestAnimationFrame` and adds frame time to `dropAccum` until it reaches `dropInterval`. Pause and game over stop it with `cancelAnimationFrame(animId)`. `resume()` restarts it by calling `loop()` directly.
- **Pause menu and input blocking**: `pause()` / `resume()` (P or Escape, and `pause()` on window blur). While the overlay is open, only P/Escape/T are handled; game keys are ignored. `hideOverlay()` copies `heldKeys` into `blockedKeys`, so a key still held when the menu closes does nothing until it is released.
- **Scoring and speed**: `LINE_SCORES[cleared] * level`. Hard drop gives +2 per cell and soft drop +1 per row. Level is `startLevel + floor(lines / 10)`, where `startLevel` (1–10) is chosen in the overlay menu and survives `init()`. The drop interval is `intervalFor(level)` = `max(100, 1000 - (level - 1) * 90)` ms.
- **Rendering**: `draw()` repaints the whole board canvas every frame: grid, locked cells, the ghost piece (alpha 0.2), then the current piece. `drawBlock` is shared with the `next-canvas` preview, which uses a fixed 4×4 / 30px layout.

## Gotchas

- `COLS`, `ROWS` and `BLOCK` in `game.js` must match the `<canvas id="board">` `width` and `height` in `index.html` (`COLS*BLOCK × ROWS*BLOCK`).
- `game.js` looks up DOM elements by id when it loads (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `resume-btn`, `controls-btn`, `menu-controls`, `level-down`, `level-up`, `start-level`). Renaming an id in the HTML breaks the script.
- The PAUSE and GAME OVER states share one overlay. Its text is set in `pause()` and `endGame()`, and `showOverlay(mode)` sets `data-mode="pause"|"gameover"`. Elements with class `pause-only` are hidden in game-over mode by CSS.
