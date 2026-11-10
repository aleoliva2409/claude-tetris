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
let startLevel = 1;     // nivel elegido en el menú (aplica a la próxima partida)
let gameStartLevel = 1; // copia tomada en init() para la partida en curso

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
    level = Math.max(gameStartLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
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
  const color = skin.colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  skin.block(context, x * size, y * size, size, color, alpha ?? 1);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = skin.gridColor || gridColor;
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

// ---- Skins ----
// Cada skin define su paleta (índice 1–7 = tipo de pieza, igual que COLORS),
// el fondo del tablero (null = usa la variable CSS --board-bg del tema),
// el color de la rejilla (null = usa --grid del tema) y cómo pintar un bloque.
// block(context, px, py, size, color, alpha): px/py en píxeles; drawBlock ya
// fijó globalAlpha y lo restaura después.

const SKIN_STORAGE_KEY = 'tetris-skin';

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const NEON_GLOW_PAD = 12;
const neonSprites = new Map();

function paintNeonCore(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  // núcleo oscuro: efecto de tubo de neón
  context.fillStyle = 'rgba(0,0,0,0.45)';
  context.fillRect(px + 7, py + 7, size - 14, size - 14);
}

function neonSprite(color, size) {
  const key = color + '|' + size;
  let sprite = neonSprites.get(key);
  if (sprite) return sprite;
  const pad = NEON_GLOW_PAD;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = size + pad * 2;
  const sctx = sprite.getContext('2d');
  sctx.shadowColor = color;
  sctx.shadowBlur = size * 0.4;
  sctx.fillStyle = color;
  sctx.fillRect(pad + 3, pad + 3, size - 6, size - 6);
  sctx.shadowBlur = 0; // siempre resetear tras el glow
  paintNeonCore(sctx, pad, pad, size, color);
  neonSprites.set(key, sprite);
  return sprite;
}

const SKINS = {
  retro: {
    name: 'Retro',
    colors: COLORS,
    boardBg: null,
    gridColor: null,
    block(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    name: 'Neón',
    colors: [
      null,
      '#00f0ff', // I
      '#fff200', // O
      '#d000ff', // T
      '#39ff14', // S
      '#ff1744', // Z
      '#2979ff', // J
      '#ff9100', // L
    ],
    boardBg: '#000000',
    gridColor: '#0d0d1a',
    block(context, px, py, size, color, alpha) {
      if (alpha >= 1) {
        // El glow (shadowBlur) es caro: se pinta una vez por color y tamaño
        // en un sprite y luego solo se copia con drawImage.
        const pad = NEON_GLOW_PAD;
        context.drawImage(neonSprite(color, size), px - pad, py - pad);
        return;
      }
      // Pieza fantasma: sin glow, se ve más tenue.
      paintNeonCore(context, px, py, size, color);
    },
  },
  pastel: {
    name: 'Pastel',
    colors: [
      null,
      '#a8e6ef', // I
      '#fdf1a7', // O
      '#d7b9e8', // T
      '#bfe5c0', // S
      '#f5b7b1', // Z
      '#b3cdfb', // J
      '#fdd5a8', // L
    ],
    boardBg: null,
    gridColor: null,
    block(context, px, py, size, color) {
      const r = size * 0.22;
      roundedRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.55)';
      context.lineWidth = 1.5;
      context.stroke();
      // brillo suave
      roundedRectPath(context, px + 5, py + 5, size - 10, (size - 10) / 3, r / 2);
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fill();
    },
  },
  pixel: {
    name: 'Pixel art',
    colors: [
      null,
      '#29adff', // I
      '#ffec27', // O
      '#a05ad8', // T
      '#00c853', // S
      '#ff004d', // Z
      '#3e6fd8', // J
      '#ffa300', // L
    ],
    boardBg: null,
    gridColor: null,
    block(context, px, py, size, color) {
      // Rejilla de 5×5 sub-píxeles: bisel claro arriba-izquierda,
      // oscuro abajo-derecha y un pequeño damero en el centro.
      const n = 5;
      const p = size / n;
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fillRect(px, py, size - p, p);
      context.fillRect(px, py + p, p, size - 2 * p);
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.fillRect(px + p, py + size - p, size - p, p);
      context.fillRect(px + size - p, py, p, size - p);
      context.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 1; i < n - 1; i++)
        for (let j = 1; j < n - 1; j++)
          if ((i + j) % 2) context.fillRect(px + i * p, py + j * p, p, p);
    },
  },
};

const SKIN_ORDER = Object.keys(SKINS);
const skinSelect = document.getElementById('skin-select');
let skinKey = 'retro';
let skin = SKINS.retro;

function loadSkinPref() {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    if (saved && Object.prototype.hasOwnProperty.call(SKINS, saved)) return saved;
  } catch (_) { /* localStorage no disponible */ }
  return 'retro';
}

function setSkin(key, repaint) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, key)) key = 'retro';
  skinKey = key;
  skin = SKINS[key];
  // '' deja que el CSS aplique var(--board-bg), así el tema (T) sigue funcionando
  canvas.style.background = skin.boardBg || '';
  nextCanvas.style.background = skin.boardBg || '';
  if (skinSelect) skinSelect.value = key;
  if (!repaint) return; // carga inicial: solo aplicar lo guardado
  try { localStorage.setItem(SKIN_STORAGE_KEY, key); } catch (_) { /* ignorar */ }
  if (current) {
    draw();
    drawNext();
  }
}

function cycleSkin() {
  const i = SKIN_ORDER.indexOf(skinKey);
  setSkin(SKIN_ORDER[(i + 1) % SKIN_ORDER.length], true);
}

if (skinSelect) {
  // Las opciones salen de SKINS para que no se desincronicen con el HTML.
  skinSelect.textContent = '';
  for (const key of SKIN_ORDER) skinSelect.add(new Option(SKINS[key].name, key));
  skinSelect.addEventListener('change', () => {
    setSkin(skinSelect.value, true);
    skinSelect.blur(); // que las flechas vuelvan a mover piezas
  });
  // El select nunca se queda con las teclas: se suelta el foco y la tecla
  // sigue hasta el juego (para cambiar de skin con el teclado está K).
  skinSelect.addEventListener('keydown', e => {
    if (e.code === 'Tab') return;
    e.preventDefault();
    skinSelect.blur();
  });
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyK') cycleSkin();
});

setSkin(loadSkinPref(), false);
// ---- /Skins ----

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  hidePauseMenu();
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    hidePauseMenu();
    overlay.classList.add('hidden');
    dropAccum = 0;
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
    showPauseMenu();
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

// ---- Menú de pausa ----
const resumeBtn = document.getElementById('resume-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level-select');

for (let n = 1; n <= 10; n++) {
  const opt = document.createElement('option');
  opt.value = n;
  opt.textContent = n;
  startLevelSelect.appendChild(opt);
}
startLevelSelect.value = startLevel;

function showPauseMenu() {
  overlay.classList.add('is-paused');
  resumeBtn.focus();
}

function hidePauseMenu() {
  overlay.classList.remove('is-paused');
  pauseControls.classList.add('hidden');
  controlsBtn.textContent = 'Ver controles';
  // quita el foco para que Espacio/Enter no vuelvan a activar un botón del menú
  if (document.activeElement && overlay.contains(document.activeElement)) {
    document.activeElement.blur();
  }
}

function setStartLevel(n) {
  startLevel = Math.min(10, Math.max(1, n));
  startLevelSelect.value = startLevel;
}

// Con el menú abierto se bloquean los inputs del juego; las flechas navegan el menú.
function handlePauseMenuKey(e) {
  const items = [resumeBtn, restartBtn, controlsBtn, startLevelSelect];
  const idx = items.indexOf(document.activeElement);
  switch (e.code) {
    case 'ArrowUp':
    case 'ArrowDown': {
      e.preventDefault();
      const step = e.code === 'ArrowDown' ? 1 : -1;
      const nextIdx = idx === -1 ? 0 : (idx + step + items.length) % items.length;
      items[nextIdx].focus();
      break;
    }
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      if (document.activeElement === startLevelSelect) {
        setStartLevel(startLevel + (e.code === 'ArrowRight' ? 1 : -1));
      }
      break;
    case 'Space':
      e.preventDefault();
      break;
  }
}

resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
controlsBtn.addEventListener('click', () => {
  const hidden = pauseControls.classList.toggle('hidden');
  controlsBtn.textContent = hidden ? 'Ver controles' : 'Ocultar controles';
});
startLevelSelect.addEventListener('change', () => setStartLevel(Number(startLevelSelect.value)));
// ---- Fin menú de pausa ----

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
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  hidePauseMenu();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (paused) { handlePauseMenuKey(e); return; }
  if (gameOver) return;
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

init();
