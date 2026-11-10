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
const newRecordMsg = document.getElementById('new-record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('player-name');
const recordsEl = document.getElementById('records');
const recordsList = document.getElementById('records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

let gridColor = '#22222e';
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo;       // piezas seguidas que limpian líneas (actual y máximo de la partida)
let pendingEntry = null;   // puntuación del top 5 esperando el nombre del jugador
let records = loadRecords();

// ---- Récords (localStorage) ----

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || !Array.isArray(data.scores)) return emptyRecords();
    return {
      scores: data.scores
        .filter(e => e && Number.isFinite(e.score))
        .map(e => ({ name: String(e.name ?? '').slice(0, NAME_MAX), score: e.score, lines: e.lines | 0, level: e.level | 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS),
      bestCombo: data.bestCombo | 0,
      maxLines: data.maxLines | 0,
    };
  } catch {
    return emptyRecords();
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // almacenamiento no disponible (modo privado, cuota llena…): los récords duran solo esta sesión
  }
}

function qualifiesForTop(value) {
  if (value <= 0) return false;
  if (records.scores.length < MAX_RECORDS) return true;
  return value > records.scores[records.scores.length - 1].score;
}

// Inserta una entrada en el top y devuelve su posición (o -1 si no entra)
function addScore(entry) {
  const list = records.scores;
  let idx = list.findIndex(e => entry.score > e.score);
  if (idx === -1) idx = list.length;
  if (idx >= MAX_RECORDS) return -1;
  list.splice(idx, 0, entry);
  list.length = Math.min(list.length, MAX_RECORDS);
  saveRecords();
  return idx;
}

function commitPendingEntry() {
  if (!pendingEntry) return -1;
  const name = nameInput.value.trim().slice(0, NAME_MAX) || 'JUGADOR';
  const idx = addScore({ ...pendingEntry, name });
  pendingEntry = null;
  nameForm.classList.add('hidden');
  return idx;
}

function renderRecords(highlightIdx = -1, newCombo = false, newLines = false) {
  recordsList.replaceChildren();
  if (!records.scores.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin récords todavía';
    recordsList.append(li);
  }
  records.scores.forEach((e, i) => {
    const li = document.createElement('li');
    if (i === highlightIdx) li.classList.add('highlight');
    const name = document.createElement('span');
    name.className = 'rec-name';
    name.textContent = e.name;
    const pts = document.createElement('span');
    pts.className = 'rec-score';
    pts.textContent = e.score.toLocaleString();
    li.append(name, pts);
    recordsList.append(li);
  });
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
  bestComboEl.classList.toggle('highlight', newCombo);
  maxLinesEl.classList.toggle('highlight', newLines);
  recordsEl.classList.remove('hidden');
  resetRecordsBtn.classList.remove('hidden');
}

function resetRecords() {
  if (!confirm('¿Borrar todos los récords?')) return;
  records = emptyRecords();
  try { localStorage.removeItem(RECORDS_KEY); } catch { /* sin almacenamiento */ }
  pendingEntry = null;
  nameForm.classList.add('hidden');
  newRecordMsg.classList.add('hidden');
  renderRecords();
  updateHUD();
}

function hideRecordsUI() {
  recordsEl.classList.add('hidden');
  resetRecordsBtn.classList.add('hidden');
  nameForm.classList.add('hidden');
  newRecordMsg.classList.add('hidden');
}


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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
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
  if (clearLines()) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
  }
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
  scoreEl.classList.toggle('in-top', !gameOver && qualifiesForTop(score));
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

  if (!current) return; // pantalla de inicio: solo el tablero vacío

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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayTitle.classList.remove('neutral');
  overlayScore.textContent =
    `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo máx.: ${maxCombo}`;
  restartBtn.textContent = 'Reiniciar';

  const newCombo = maxCombo > records.bestCombo;
  const newLines = lines > records.maxLines;
  if (newCombo) records.bestCombo = maxCombo;
  if (newLines) records.maxLines = lines;
  if (newCombo || newLines) saveRecords();

  const inTop = qualifiesForTop(score);
  pendingEntry = inTop ? { score, lines, level } : null;
  newRecordMsg.classList.toggle('hidden', !(inTop || newCombo || newLines));
  nameForm.classList.toggle('hidden', !inTop);
  renderRecords(-1, newCombo, newLines);
  updateHUD();
  overlay.classList.remove('hidden');
  if (inTop) {
    nameInput.value = '';
    nameInput.focus();
  } else {
    restartBtn.focus();
  }
}

function saveName(e) {
  e.preventDefault();
  const idx = commitPendingEntry();
  renderRecords(idx, bestComboEl.classList.contains('highlight'), maxLinesEl.classList.contains('highlight'));
  restartBtn.focus();
}

function showStart() {
  board = createBoard();
  current = null;
  next = randomPiece();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = true; // bloquea controles y pausa hasta pulsar «Jugar»
  updateHUD();
  drawNext();
  draw();
  hideRecordsUI();
  overlayTitle.textContent = 'RÉCORDS';
  overlayTitle.classList.add('neutral');
  overlayScore.textContent = 'Pulsa Enter o «Jugar» para empezar';
  restartBtn.textContent = 'Jugar';
  renderRecords();
  overlay.classList.remove('hidden');
  restartBtn.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    hideRecordsUI();
    overlayTitle.textContent = 'PAUSA';
    overlayTitle.classList.remove('neutral');
    overlayScore.textContent = '';
    restartBtn.textContent = 'Reiniciar';
    overlay.classList.remove('hidden');
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
  commitPendingEntry(); // si reinicia sin pulsar «Guardar», la puntuación se guarda igual
  hideRecordsUI();
  restartBtn.blur(); // que Espacio no vuelva a «pulsar» el botón durante la partida
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
  if (e.target === nameInput) return; // escribiendo el nombre: no son controles del juego
  if (e.code === 'Enter' && gameOver) {
    if (document.activeElement?.tagName !== 'BUTTON') init(); // los botones ya gestionan su Enter
    return;
  }
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
nameForm.addEventListener('submit', saveName);
resetRecordsBtn.addEventListener('click', resetRecords);

showStart();
