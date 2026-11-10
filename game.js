'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Colores del skin activo; applySkin() los reemplaza (índice = tipo de pieza)
let COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#6ea8fe', // J - azul pálido
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

const MAX_START_LEVEL = 15;
const skinSelect = document.getElementById('skin-select');

let gridColor = '#22222e';
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1; // nivel con el que empieza la próxima partida

// Teclas físicamente pulsadas, y las que se ignoran hasta soltarse
// (evita movimientos accidentales al cerrar el menú con una tecla mantenida).
const keysDown = new Set();
let suppressedKeys = new Set();

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = intervalForLevel(level);
    updateHUD();
  }
}

function intervalForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins ----

// Aclara (amt > 0) u oscurece (amt < 0) un color hex. amt en [-1, 1].
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const mix = v => Math.round(v + (t - v) * k);
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}

// Rectángulo con esquinas redondeadas trazado a mano con arcTo
function roundRectPath(context, x, y, w, h, rad) {
  context.beginPath();
  context.moveTo(x + rad, y);
  context.arcTo(x + w, y, x + w, y + h, rad);
  context.arcTo(x + w, y + h, x, y + h, rad);
  context.arcTo(x, y + h, x, y, rad);
  context.arcTo(x, y, x + w, y, rad);
  context.closePath();
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  context.save();
  context.shadowColor = color;
  context.shadowBlur = 14;
  context.fillStyle = color + '33'; // relleno translúcido
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowBlur = 6;
  context.fillStyle = '#ffffff';
  context.globalAlpha *= 0.5;
  context.fillRect(px + size / 2 - 2, py + size / 2 - 2, 4, 4);
  context.restore();
}

function drawPastelBlock(context, px, py, size, color) {
  const rad = size * 0.25;
  roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, rad);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = shade(color, -0.18);
  context.stroke();
  // brillo suave arriba a la izquierda
  roundRectPath(context, px + 5, py + 4, size * 0.4, size * 0.22, size * 0.11);
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fill();
}

// Textura de 6×6 "píxeles": 1 = luz, 2 = sombra, 3 = punto de tramado
const PIXEL_PATTERN = [
  [1,1,1,1,1,2],
  [1,0,0,0,3,2],
  [1,0,3,0,0,2],
  [1,0,0,0,0,2],
  [1,3,0,0,3,2],
  [2,2,2,2,2,2],
];

function drawPixelBlock(context, px, py, size, color) {
  const p = size / PIXEL_PATTERN.length;
  const tones = [color, shade(color, 0.35), shade(color, -0.35), shade(color, -0.15)];
  for (let r = 0; r < PIXEL_PATTERN.length; r++)
    for (let c = 0; c < PIXEL_PATTERN[r].length; c++) {
      context.fillStyle = tones[PIXEL_PATTERN[r][c]];
      // floor/ceil para que los píxeles queden pegados sin huecos
      const x0 = Math.floor(px + c * p), y0 = Math.floor(py + r * p);
      context.fillRect(x0, y0, Math.ceil(px + (c + 1) * p) - x0, Math.ceil(py + (r + 1) * p) - y0);
    }
}

// boardBg / grid: null usa los colores del tema (claro/oscuro)
const SKINS = {
  retro: {
    name: 'Retro',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#6ea8fe', '#ffb74d'],
    boardBg: null,
    grid: null,
    drawBlock: drawRetroBlock,
  },
  neon: {
    name: 'Neon',
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff8c00'],
    boardBg: '#000000',
    grid: '#0d0d16',
    drawBlock: drawNeonBlock,
  },
  pastel: {
    name: 'Pastel',
    colors: [null, '#a8e6ef', '#fdf1a6', '#d7b8f3', '#b9e8b0', '#f7b2bd', '#b5cdfa', '#fdd2a7'],
    boardBg: null,
    grid: null,
    drawBlock: drawPastelBlock,
  },
  pixel: {
    name: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8b800', '#9878f8', '#58d854', '#e40058', '#0058f8', '#f87858'],
    boardBg: null,
    grid: null,
    drawBlock: drawPixelBlock,
  },
};

const SKIN_KEY = 'tetris-skin';
let skin = SKINS.retro;
let skinId = 'retro';

function loadSkinPref() {
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    if (saved && SKINS[saved]) return saved;
  } catch (e) { /* localStorage no disponible */ }
  return 'retro';
}

function applySkin(id) {
  if (!SKINS[id]) id = 'retro';
  skinId = id;
  skin = SKINS[id];
  COLORS = skin.colors;
  document.documentElement.dataset.skin = id;
  skinSelect.value = id;
  try { localStorage.setItem(SKIN_KEY, id); } catch (e) { /* ignorar */ }
  // repinta aunque el loop esté detenido (pausa o game over)
  if (current) { draw(); drawNext(); }
}

function cycleSkin() {
  const ids = Object.keys(SKINS);
  applySkin(ids[(ids.indexOf(skinId) + 1) % ids.length]);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, COLORS[colorIndex]);
  context.globalAlpha = 1;
}

function clearCanvas(context, c) {
  context.clearRect(0, 0, c.width, c.height);
  if (skin.boardBg) {
    context.fillStyle = skin.boardBg;
    context.fillRect(0, 0, c.width, c.height);
  }
}

function drawGrid() {
  ctx.strokeStyle = skin.grid ?? gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  clearCanvas(ctx, canvas);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  clearCanvas(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function pauseGame() {
  if (paused || gameOver) return;
  paused = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'PAUSA';
  overlayScore.textContent = '';
  restartBtn.classList.add('hidden');
  setControlsVisible(false);
  pauseMenu.classList.remove('hidden');
  overlay.classList.remove('hidden');
  resumeBtn.focus();
}

function resumeGame() {
  if (!paused || gameOver) return;
  paused = false;
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  // Quita el foco de los botones del menú: si no, Space/Enter los volvería a activar.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  // Las teclas que siguen pulsadas al volver no deben mover la pieza hasta soltarse.
  suppressedKeys = new Set(keysDown);
  lastTime = performance.now();
  loop(lastTime);
}

function togglePause() {
  if (paused) resumeGame();
  else pauseGame();
}

function setControlsVisible(visible) {
  pauseControls.classList.toggle('hidden', !visible);
  controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
  controlsBtn.setAttribute('aria-expanded', String(visible));
}

function restartGame() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  suppressedKeys = new Set(keysDown);
  init();
}

function loop(ts) {
  if (paused || gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  // endGame() pudo ejecutarse en este frame: no reprogramar el bucle
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function toggleTheme() {
  const root = document.documentElement;
  if (root.dataset.theme === 'light') delete root.dataset.theme;
  else root.dataset.theme = 'light';
  gridColor = getComputedStyle(root).getPropertyValue('--grid').trim();
  draw(); // repinta aunque el loop esté detenido (pausa o game over)
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'KeyX', 'Space']);

document.addEventListener('keyup', e => {
  keysDown.delete(e.code);
  suppressedKeys.delete(e.code);
});

// Al perder el foco de la ventana no llegan los keyup: limpia el estado.
window.addEventListener('blur', () => {
  keysDown.clear();
  suppressedKeys.clear();
});

document.addEventListener('keydown', e => {
  keysDown.add(e.code);
  // con el selector enfocado, las flechas cambiarían de skin en vez de mover la pieza
  if (e.target === skinSelect) skinSelect.blur();
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (e.code === 'KeyK') { cycleSkin(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) togglePause();
    return;
  }
  // Menú abierto o partida terminada: los controles del juego no hacen nada.
  // Space/flechas sí pueden manejar el menú (botones y selector), así que no se bloquean aquí.
  if (paused || gameOver) return;
  if (!GAME_KEYS.has(e.code)) return;
  if (e.code === 'Space') e.preventDefault();
  if (suppressedKeys.has(e.code)) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      hardDrop();
      break;
  }
  updateHUD();
});

for (let lvl = 1; lvl <= MAX_START_LEVEL; lvl++) {
  const opt = document.createElement('option');
  opt.value = String(lvl);
  opt.textContent = `Nivel ${lvl}`;
  startLevelSelect.appendChild(opt);
}
startLevelSelect.value = String(startLevel);
startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
});

restartBtn.addEventListener('click', restartGame);
pauseRestartBtn.addEventListener('click', restartGame);
resumeBtn.addEventListener('click', resumeGame);
controlsBtn.addEventListener('click', () => {
  setControlsVisible(pauseControls.classList.contains('hidden'));
});

for (const [id, def] of Object.entries(SKINS)) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = def.name;
  skinSelect.appendChild(opt);
}
skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // devuelve el teclado al juego
});

applySkin(loadSkinPref());
init();
