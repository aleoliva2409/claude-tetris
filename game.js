'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// ---- Skins ----
// Cada skin define su paleta (índice = tipo de pieza), un color de cuadrícula
// opcional (si es null se usa el del tema claro/oscuro) y su función de dibujo.
const SKINS = {
  retro: {
    name: 'Retro',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#6ea8fe', '#ffb74d'],
    grid: null,
    draw: drawRetro,
  },
  neon: {
    name: 'Neon',
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff8c00'],
    grid: '#0c1a24',
    draw: drawNeon,
  },
  pastel: {
    name: 'Pastel',
    colors: [null, '#a0e7e5', '#fff1a8', '#d7b9f2', '#b4f8c8', '#ffaebc', '#a7c7f7', '#ffd3a5'],
    grid: null,
    draw: drawPastel,
  },
  pixel: {
    name: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8d838', '#b858f8', '#58d854', '#f83800', '#0058f8', '#fc7460'],
    grid: null,
    draw: drawPixel,
  },
};
const SKIN_KEY = 'tetris-skin';

let skin = SKINS.retro;
let COLORS = skin.colors;

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
const resumeBtn = document.getElementById('resume-btn');
const controlsBtn = document.getElementById('controls-btn');
const menuControls = document.getElementById('menu-controls');
const levelDownBtn = document.getElementById('level-down');
const levelUpBtn = document.getElementById('level-up');
const startLevelEl = document.getElementById('start-level');

const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 10;
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'KeyX', 'Space']);
const nameForm = document.getElementById('name-form');
const nameLabel = document.getElementById('name-label');
const nameInput = document.getElementById('name-input');
const recordsSection = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const skinSelect = document.getElementById('skin-select');

let gridColor = '#22222e';
let startLevel = MIN_START_LEVEL;
const heldKeys = new Set();    // teclas pulsadas ahora mismo
let blockedKeys = new Set();   // teclas ignoradas hasta que se suelten (tras salir del menú)
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// combo = piezas seguidas que completan al menos una línea
let combo, maxCombo;
// records: { top: [{ name, score, lines, level }], bestCombo, maxLines }
// pendingEntry: entrada recién añadida al top que aún espera nombre
// highlightEntry: entrada de la partida actual, resaltada en la tabla
let records, pendingEntry = null, highlightEntry = null;

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
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = intervalFor(level);
    updateHUD();
  } else {
    combo = 0;
  }
}

function intervalFor(lvl) {
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.draw(context, x * size, y * size, COLORS[colorIndex], size);
  context.restore();
}

// Aclara (amt > 0) u oscurece (amt < 0) un color hex #rrggbb.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

function drawRetro(context, px, py, color, size) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeon(context, px, py, color, size) {
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.fillStyle = color;
  context.globalAlpha *= 0.25;
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.globalAlpha /= 0.25;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.7)';
  context.fillRect(px + 6, py + 6, 3, 3);
}

function roundedRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawPastel(context, px, py, color, size) {
  const r = size * 0.25;
  roundedRect(context, px + 2, py + 2, size - 4, size - 4, r);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = shade(color, -0.15);
  context.stroke();
  // brillo suave arriba a la izquierda
  roundedRect(context, px + 5, py + 5, size * 0.4, size * 0.2, size * 0.1);
  context.fillStyle = 'rgba(255,255,255,0.55)';
  context.fill();
}

// Patrón de 8×8 "píxeles": 0 base, 1 luz, 2 sombra, 3 brillo.
const PIXEL_PATTERN = [
  '11111112',
  '13300002',
  '13000002',
  '10000202',
  '10002002',
  '10020002',
  '10000002',
  '22222222',
];

function drawPixel(context, px, py, color, size) {
  const tones = [color, shade(color, 0.35), shade(color, -0.4), '#ffffff'];
  const p = size / 8;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      context.fillStyle = tones[PIXEL_PATTERN[r][c]];
      // +0.5 evita costuras entre píxeles cuando p no es entero
      context.fillRect(px + c * p, py + r * p, p + 0.5, p + 0.5);
    }
  }
}

function applySkin(id) {
  if (!SKINS[id]) id = 'retro';
  skin = SKINS[id];
  COLORS = skin.colors;
  document.documentElement.dataset.skin = id;
  skinSelect.value = id;
  refreshGridColor();
  try { localStorage.setItem(SKIN_KEY, id); } catch (_) { /* almacenamiento no disponible */ }
  // repinta aunque el loop esté detenido (también en la pantalla de inicio)
  if (board) draw();
  if (next) drawNext();
}

function loadSkin() {
  let id = 'retro';
  try { id = localStorage.getItem(SKIN_KEY) || 'retro'; } catch (_) { /* almacenamiento no disponible */ }
  applySkin(id);
}

function refreshGridColor() {
  gridColor = skin.grid || getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!current) return; // pantalla de inicio: aún no hay pieza

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
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Récords (localStorage) ----

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.top)) {
      return {
        top: data.top.slice(0, MAX_RECORDS),
        bestCombo: Number(data.bestCombo) || 0,
        maxLines: Number(data.maxLines) || 0,
      };
    }
  } catch { /* datos corruptos o storage bloqueado */ }
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch { /* storage lleno o bloqueado: los récords duran solo esta sesión */ }
}

function qualifiesForTop(s) {
  if (s <= 0) return false;
  return records.top.length < MAX_RECORDS || s > records.top[records.top.length - 1].score;
}

// Inserta la entrada en su posición (tras las de igual puntuación) y devuelve el índice
function insertRecord(entry) {
  let idx = records.top.findIndex(e => entry.score > e.score);
  if (idx === -1) idx = records.top.length;
  records.top.splice(idx, 0, entry);
  records.top.length = Math.min(records.top.length, MAX_RECORDS);
  return idx;
}

function commitName() {
  if (!pendingEntry) return;
  pendingEntry.name = nameInput.value.trim().slice(0, 12) || 'Anónimo';
  pendingEntry = null;
  saveRecords();
  nameForm.classList.add('hidden');
  renderRecords();
}

function renderRecords() {
  recordsBody.replaceChildren();
  if (!records.top.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'empty';
    td.textContent = 'Sin récords todavía';
    tr.append(td);
    recordsBody.append(tr);
  }
  records.top.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (entry === highlightEntry) tr.classList.add('highlight');
    const name = entry === pendingEntry ? '???' : (entry.name || 'Anónimo');
    for (const value of [i + 1, name, entry.score.toLocaleString(), entry.lines]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    recordsBody.append(tr);
  });
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
}

function resetRecords() {
  if (!confirm('¿Borrar todos los récords?')) return;
  records = { top: [], bestCombo: 0, maxLines: 0 };
  pendingEntry = null;
  highlightEntry = null;
  nameForm.classList.add('hidden');
  saveRecords();
  renderRecords();
}

// ---- Overlay: 'start' | 'pause' | 'gameover' ----

function showOverlay(mode) {
  const titles = { start: '¡A JUGAR!', pause: 'PAUSA', gameover: 'GAME OVER' };
  overlay.dataset.mode = mode;
  overlayTitle.textContent = titles[mode];
  overlayScore.textContent = mode === 'gameover'
    ? `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo: ${maxCombo}`
    : '';
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  recordsSection.classList.toggle('hidden', mode === 'pause');
  nameForm.classList.toggle('hidden', !(mode === 'gameover' && pendingEntry));
  if (mode !== 'pause') renderRecords();
  setControlsVisible(false);
  renderStartLevel();
  overlay.classList.remove('hidden');
  if (mode === 'pause') {
    resumeBtn.focus();
  } else if (mode === 'gameover' && pendingEntry) {
    nameInput.value = '';
    nameInput.focus();
  } else {
    restartBtn.focus();
  }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  records.maxLines = Math.max(records.maxLines, lines);
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  if (qualifiesForTop(score)) {
    pendingEntry = { name: '', score, lines, level };
    highlightEntry = pendingEntry;
    const pos = insertRecord(pendingEntry);
    nameLabel.textContent = `¡Nuevo récord! Puesto #${pos + 1}`;
  }
  saveRecords();
  showOverlay('gameover');
}

function hideOverlay() {
  overlay.classList.add('hidden');
  setControlsVisible(false);
  // que ningún botón oculto conserve el foco (Space/Enter lo activarían)
  if (overlay.contains(document.activeElement)) document.activeElement.blur();
  // lo que se mantenga pulsado al cerrar el menú no debe mover la pieza
  blockedKeys = new Set(heldKeys);
}

function setControlsVisible(visible) {
  menuControls.hidden = !visible;
  controlsBtn.setAttribute('aria-expanded', String(visible));
  controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
}

function renderStartLevel() {
  startLevelEl.textContent = startLevel;
  levelDownBtn.disabled = startLevel <= MIN_START_LEVEL;
  levelUpBtn.disabled = startLevel >= MAX_START_LEVEL;
}

function changeStartLevel(delta) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, startLevel + delta));
  renderStartLevel();
}

function pause() {
  if (paused || gameOver) return;
  paused = true;
  cancelAnimationFrame(animId);
  showOverlay('pause');
}

function resume() {
  if (!paused || gameOver) return;
  paused = false;
  hideOverlay();
  lastTime = performance.now();
  loop(lastTime);
}

function togglePause() {
  if (paused) resume();
  else pause();
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
  refreshGridColor();
  draw(); // repinta aunque el loop esté detenido (pausa o game over)
}

function init() {
  commitName(); // si se reinicia sin guardar, el récord queda como 'Anónimo'
  highlightEntry = null;
  document.activeElement?.blur(); // evita que Space/Enter vuelvan a pulsar el botón
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = intervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  hideOverlay();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return; // escribiendo el nombre: no mover ni pausar
  heldKeys.add(e.code);
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (e.repeat) return;
    // Esc con la lista de controles abierta: primero la cierra
    if (e.code === 'Escape' && paused && !menuControls.hidden) {
      setControlsVisible(false);
      controlsBtn.focus();
      return;
    }
    togglePause();
    return;
  }
  // Menú abierto: las teclas de juego no hacen nada (Tab/Enter/Space siguen manejando los botones)
  if (paused || gameOver) return;
  if (blockedKeys.has(e.code)) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    return;
  }
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
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  blockedKeys.delete(e.code);
});

// si la ventana pierde el foco no llegan los keyup: olvidar lo pulsado y pausar
window.addEventListener('blur', () => {
  heldKeys.clear();
  blockedKeys.clear();
  pause();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', resume);
controlsBtn.addEventListener('click', () => setControlsVisible(menuControls.hidden));
levelDownBtn.addEventListener('click', () => changeStartLevel(-1));
levelUpBtn.addEventListener('click', () => changeStartLevel(1));
resetRecordsBtn.addEventListener('click', resetRecords);
nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitName();
  restartBtn.focus();
});

for (const [id, s] of Object.entries(SKINS)) skinSelect.add(new Option(s.name, id));
skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // devuelve el teclado al juego (las flechas no cambian la skin)
});

loadSkin();

// Pantalla de inicio: tablero vacío y récords hasta pulsar «Jugar»
records = loadRecords();
board = createBoard();
current = null;
score = lines = maxCombo = 0;
gameOver = true; // bloquea controles y pausa hasta empezar
draw();
showOverlay('start');
