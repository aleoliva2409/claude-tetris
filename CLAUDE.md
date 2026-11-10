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
- **Game loop**: `loop(ts)` uses `requestAnimationFrame` and adds frame time to `dropAccum` until it reaches `dropInterval`. Pause and game over stop it with `cancelAnimationFrame(animId)`. Unpausing restarts it by calling `loop()` directly.
- **Scoring and speed**: `LINE_SCORES[cleared] * level`. Hard drop gives +2 per cell and soft drop +1 per row. Level is `floor(lines / 10) + 1`. The drop interval is `max(100, 1000 - (level - 1) * 90)` ms.
- **Rendering**: `draw()` repaints the whole board canvas every frame: grid, locked cells, the ghost piece (alpha 0.2), then the current piece. `drawBlock` is shared with the `next-canvas` preview, which uses a fixed 4×4 / 30px layout.

## Gotchas

- `COLS`, `ROWS` and `BLOCK` in `game.js` must match the `<canvas id="board">` `width` and `height` in `index.html` (`COLS*BLOCK × ROWS*BLOCK`).
- `game.js` looks up DOM elements by id when it loads (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, plus the records ids `records`, `records-body`, `records-table`, `records-empty`, `records-stats`, `name-form`, `name-input`, `save-record-btn`, `clear-records-btn`, `play-btn`). Renaming an id in the HTML breaks the script.
- The START, PAUSE and GAME OVER states share one overlay. Its text is set in `showStartScreen()`, `togglePause()` and `endGame()`. The records block (`#records`) is shown only on start and game over; `init()` hides it via `hideRecordsUI()`, so the pause overlay never shows it.
- The page boots into `showStartScreen()`, not `init()`. Until "Jugar"/Enter, `onStartScreen` is true and `board`/`current` are undefined, so the keydown handler routes to `handleStartScreenKey()` and `toggleTheme()` only calls `draw()` when `current` exists.
- The keydown handler ignores events whose target is an input/textarea (`isTypingTarget`) so typing a record name never triggers game keys.

## Records and combo

All of this code lives in the `// ---- Records ----` section at the end of `game.js`.

- **Storage**: `localStorage['tetris-records']` holds a JSON array of at most 5 `{name, score, lines, level, combo, date}` entries, sorted by score descending. Every access is wrapped in try/catch. `loadRecords()` validates and sanitizes the data and falls back to `[]`.
- **Combo**: `clearLines()` returns the number of cleared lines, and `lockPiece()` passes it to `updateCombo()`. `combo` counts consecutive locks that clear at least one line, and `maxCombo` (reset in `init()`) is stored with the record.
- **Game over**: `endGame()` calls `showGameOverRecords()`. If `score > 0` and it beats the 5th entry (or there are fewer than 5), a name input appears. An empty name is stored as "Anónimo". Names are rendered with `textContent`, never `innerHTML`.
