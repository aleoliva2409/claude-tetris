'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
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

let gridColor = '#22222e';
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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

// ---- Overlay: 'start' | 'pause' | 'over' ----

function showOverlay(mode) {
  const titles = { start: '¡A JUGAR!', pause: 'PAUSA', over: 'GAME OVER' };
  overlayTitle.textContent = titles[mode];
  overlayScore.textContent = mode === 'over'
    ? `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo: ${maxCombo}`
    : '';
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  recordsSection.classList.toggle('hidden', mode === 'pause');
  nameForm.classList.toggle('hidden', !(mode === 'over' && pendingEntry));
  if (mode !== 'pause') renderRecords();
  overlay.classList.remove('hidden');
  if (mode === 'over' && pendingEntry) {
    nameInput.value = '';
    nameInput.focus();
  } else if (mode !== 'pause') {
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
  showOverlay('over');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay('pause');
  }
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
  commitName(); // si se reinicia sin guardar, el récord queda como 'Anónimo'
  highlightEntry = null;
  document.activeElement?.blur(); // evita que Space/Enter vuelvan a pulsar el botón
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return; // escribiendo el nombre: no mover ni pausar
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

restartBtn.addEventListener('click', init);
resetRecordsBtn.addEventListener('click', resetRecords);
nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitName();
  restartBtn.focus();
});

// Pantalla de inicio: tablero vacío y récords hasta pulsar «Jugar»
records = loadRecords();
board = createBoard();
current = null;
score = lines = maxCombo = 0;
gameOver = true; // bloquea controles y pausa hasta empezar
draw();
showOverlay('start');
