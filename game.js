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

let gridColor = '#22222e';
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
  updateCombo(clearLines());
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
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
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
  if (current) draw(); // repinta aunque el loop esté detenido (pausa o game over)
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  hideRecordsUI();
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (isTypingTarget(e.target)) return; // escribiendo el nombre del récord
  if (onStartScreen) { handleStartScreenKey(e); return; }
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

// ---- Records ----
// Top 5 en localStorage (clave RECORDS_KEY): [{name, score, lines, level, combo, date}]
// ordenado por score descendente. combo = piezas fijadas seguidas que limpian ≥1 línea.

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

const recordsEl = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const recordsTable = document.getElementById('records-table');
const recordsEmpty = document.getElementById('records-empty');
const recordsStats = document.getElementById('records-stats');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const saveRecordBtn = document.getElementById('save-record-btn');
const clearRecordsBtn = document.getElementById('clear-records-btn');
const playBtn = document.getElementById('play-btn');

let combo = 0;
let maxCombo = 0;
let onStartScreen = false;
let recordSaved = false;

function updateCombo(cleared) {
  combo = cleared > 0 ? combo + 1 : 0;
  if (combo > maxCombo) maxCombo = combo;
}

function sanitizeRecord(r) {
  if (!r || typeof r !== 'object' || !Number.isFinite(r.score)) return null;
  const num = v => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 12) : 'Anónimo',
    score: num(r.score),
    lines: num(r.lines),
    level: num(r.level),
    combo: num(r.combo),
    date: typeof r.date === 'string' ? r.date : '',
  };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map(sanitizeRecord).filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false; // localStorage no disponible (modo privado, cuota...)
  }
}

function clearRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    // ignorar
  }
}

function qualifies(records, value) {
  if (value <= 0) return false;
  return records.length < MAX_RECORDS || value > records[records.length - 1].score;
}

function renderRecords(records = loadRecords(), highlightIndex = -1) {
  recordsBody.replaceChildren();
  records.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('highlight');
    for (const val of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.combo]) {
      const td = document.createElement('td');
      td.textContent = String(val); // nunca innerHTML: el nombre lo escribe el usuario
      tr.appendChild(td);
    }
    recordsBody.appendChild(tr);
  });
  const hasRecords = records.length > 0;
  recordsTable.hidden = !hasRecords;
  recordsEmpty.hidden = hasRecords;
  recordsStats.hidden = !hasRecords;
  clearRecordsBtn.hidden = !hasRecords;
  if (hasRecords) {
    const bestCombo = Math.max(...records.map(r => r.combo));
    const bestLines = Math.max(...records.map(r => r.lines));
    recordsStats.textContent = `Mejor combo: ${bestCombo} · Líneas máximas: ${bestLines}`;
  }
  return records;
}

// ¿La partida terminada puede guardar su puntuación en el top?
function canEnterRecord(records) {
  return gameOver && !onStartScreen && !recordSaved && qualifies(records, score);
}

function showNameForm() {
  nameForm.hidden = false;
  nameInput.value = '';
  nameInput.focus();
}

function hideRecordsUI() {
  nameInput.blur(); // que el input oculto no se quede con el foco y bloquee las teclas
  recordsEl.hidden = true;
  nameForm.hidden = true;
}

function showGameOverRecords() {
  recordSaved = false;
  recordsEl.hidden = false;
  nameForm.hidden = true;
  if (canEnterRecord(renderRecords())) showNameForm();
}

function submitRecord() {
  const records = loadRecords();
  if (!canEnterRecord(records)) { nameForm.hidden = true; return; }
  const entry = {
    name: nameInput.value.trim().slice(0, 12) || 'Anónimo',
    score,
    lines,
    level,
    combo: maxCombo,
    date: new Date().toISOString(),
  };
  records.push(entry);
  records.sort((a, b) => b.score - a.score);
  const top = records.slice(0, MAX_RECORDS);
  const ok = saveRecords(top);
  recordSaved = true;
  nameForm.hidden = true;
  nameInput.blur();
  renderRecords(top, top.indexOf(entry));
  if (!ok) recordsStats.textContent = 'No se pudo guardar: almacenamiento no disponible';
}

function showStartScreen() {
  onStartScreen = true;
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = 'Pulsa Jugar o Enter para empezar';
  restartBtn.hidden = true;
  playBtn.hidden = false;
  recordsEl.hidden = false;
  nameForm.hidden = true;
  renderRecords();
  overlay.classList.remove('hidden');
}

function startGame() {
  if (!onStartScreen) return;
  onStartScreen = false;
  playBtn.hidden = true;
  restartBtn.hidden = false;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  init();
}

function handleStartScreenKey(e) {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); startGame(); }
  else if (e.code === 'KeyT') toggleTheme();
}

function isTypingTarget(el) {
  return el instanceof HTMLElement &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

nameInput.addEventListener('keydown', e => {
  // ignora autorrepetición: una tecla de juego mantenida al perder no debe escribir el nombre
  if (e.repeat) { e.preventDefault(); return; }
  if (e.key === 'Enter') { e.preventDefault(); submitRecord(); }
});
saveRecordBtn.addEventListener('click', submitRecord);
playBtn.addEventListener('click', startGame);
clearRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records?')) return;
  clearRecords();
  // si la partida terminada aún no se guardó, ahora entra seguro en el top
  if (canEnterRecord(renderRecords()) && nameForm.hidden) showNameForm();
});

showStartScreen();
