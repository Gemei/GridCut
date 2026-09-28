const PAPERS = {
  a4: { name: "A4", w: 210, h: 297 },
  letter: { name: "Letter", w: 215.9, h: 279.4 },
  a3: { name: "A3", w: 297, h: 420 },
  legal: { name: "Legal", w: 215.9, h: 355.6 },
  tabloid: { name: "Tabloid", w: 279.4, h: 431.8 },
};

const $ = (id) => document.getElementById(id);

function phoneNow() {
  const shortScreen = Math.min(screen.width, screen.height);
  const uaPhone = /iPhone|iPod|Android.+Mobile|Mobile|Windows Phone/i.test(navigator.userAgent || "");
  return uaPhone || shortScreen <= 500 || window.innerWidth <= 760;
}
function applyPhone() {
  document.body.classList.toggle("is-phone", phoneNow());
}
applyPhone();
window.addEventListener("resize", () => {
  applyPhone();
  if (state.image && !state.tool) renderPages();
});
window.addEventListener("orientationchange", applyPhone);

function showPhoneView(pages) {
  document.body.classList.toggle("view-pages", pages);
  $("tab-setup").classList.toggle("on", !pages);
  $("tab-pages").classList.toggle("on", pages);
}
$("tab-setup").onclick = () => showPhoneView(false);
$("tab-pages").onclick = () => showPhoneView(true);

const state = {
  image: null,
  base: null,
  excluded: new Set(),
  measuring: false,
  points: [],
  aspect: 1,
  tool: null,
  crop: null,
  drag: null,
  undo: [],
  redo: [],
};

const drop = $("drop");
const fileInput = $("file");

$("browse").onclick = () => fileInput.click();
drop.onclick = (e) => {
  if (e.target === $("browse")) return;
  fileInput.click();
};
fileInput.onchange = () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
};

["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("hot");
  })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("hot");
  })
);
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});
window.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) loadFile(item.getAsFile());
});

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    state.image = img;
    state.base = null;
    state.excluded = new Set();
    state.points = [];
    state.crop = null;
    state.undo = [];
    state.redo = [];
    updateHistoryButtons();
    closeEditor();
    state.aspect = img.naturalWidth / img.naturalHeight;
    syncFromAspect("width");
    $("download").disabled = false;
    if (document.body.classList.contains("is-phone")) showPhoneView(true);
    render();
  };
  img.onerror = () => setStatus("Could not read that image.", true);
  img.src = url;
}

function unitToMm(v) {
  return $("units").value === "in" ? v * 25.4 : v * 10;
}
function mmToUnit(mm) {
  const u = $("units").value === "in" ? mm / 25.4 : mm / 10;
  return Math.round(u * 100) / 100;
}
function unitLabel() {
  return $("units").value === "in" ? "in" : "cm";
}

function paperMm() {
  const p = PAPERS[$("paper").value];
  const orient = $("orient").value;
  return { ...p, orient };
}

function layoutFor(pw, ph) {
  const margin = Number($("margin").value) || 10;
  const overlap = Math.min(Number($("overlap").value) || 0, Math.min(pw, ph) / 2 - margin - 1);
  const innerW = pw - margin * 2;
  const innerH = ph - margin * 2;
  const poster = posterMm(innerW, innerH, overlap);
  const stepX = Math.max(innerW - overlap, 1);
  const stepY = Math.max(innerH - overlap, 1);
  const cols = poster.w <= innerW + 0.01 ? 1 : Math.ceil((poster.w - innerW) / stepX) + 1;
  const rows = poster.h <= innerH + 0.01 ? 1 : Math.ceil((poster.h - innerH) / stepY) + 1;
  return { margin, overlap, innerW, innerH, poster, stepX, stepY, cols, rows, pw, ph };
}

function posterMm(innerW, innerH, overlap) {
  const mode = $("mode").value;
  if (mode === "pages") {
    const cols = Math.max(1, Number($("pages-wide").value) || 1);
    const w = cols === 1 ? innerW : innerW + (cols - 1) * Math.max(innerW - overlap, 1);
    const h = $("lock").checked || $("lock2").checked ? w / state.aspect : unitToMm(Number($("height").value));
    return { w, h: Math.max(h, 1) };
  }
  let w = unitToMm(Number($("width").value) || 1);
  let h = unitToMm(Number($("height").value) || 1);
  return { w: Math.max(w, 1), h: Math.max(h, 1) };
}

function chosenLayout() {
  const base = paperMm();
  const portrait = layoutFor(base.w, base.h);
  const landscape = layoutFor(base.h, base.w);
  if (base.orient === "portrait") return { ...portrait, label: "portrait" };
  if (base.orient === "landscape") return { ...landscape, label: "landscape" };
  const pc = portrait.cols * portrait.rows;
  const lc = landscape.cols * landscape.rows;
  return pc <= lc ? { ...portrait, label: "portrait" } : { ...landscape, label: "landscape" };
}

let lockGuard = false;
function syncFromAspect(source) {
  if (lockGuard) return;
  if (!$("lock2").checked && $("mode").value === "size") return;
  if (!$("lock").checked && $("mode").value === "pages") return;
  if (!state.image) return;
  lockGuard = true;
  if (source === "width") {
    const w = Number($("width").value) || 1;
    $("height").value = round2(w / state.aspect);
  } else {
    const h = Number($("height").value) || 1;
    $("width").value = round2(h * state.aspect);
  }
  lockGuard = false;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

["width", "height", "pages-wide", "margin", "overlap", "paper", "orient", "mode", "units", "lock", "lock2"].forEach((id) => {
  $(id).addEventListener("input", () => {
    if (id === "width") syncFromAspect("width");
    if (id === "height") syncFromAspect("height");
    if (id === "mode") toggleMode();
    if (id === "units") convertFields();
    render();
  });
});
["crops", "regs", "numbers", "guide"].forEach((id) => {
  $(id).addEventListener("change", () => render());
});

let lastUnit = "cm";
function convertFields() {
  const next = $("units").value;
  if (next === lastUnit) return;
  const w = Number($("width").value);
  const h = Number($("height").value);
  if (next === "in") {
    $("width").value = round2(w / 2.54);
    $("height").value = round2(h / 2.54);
  } else {
    $("width").value = round2(w * 2.54);
    $("height").value = round2(h * 2.54);
  }
  lastUnit = next;
  render();
}

function toggleMode() {
  const pages = $("mode").value === "pages";
  $("size-fields").classList.toggle("hidden", pages);
  $("lock-size").classList.toggle("hidden", pages);
  $("pages-fields").classList.toggle("hidden", !pages);
  render();
}

$("rot-l").onclick = () => rotate(-90);
$("rot-r").onclick = () => rotate(90);
$("flip-h").onclick = () => flip("h");
$("flip-v").onclick = () => flip("v");
function cloneCanvas(src) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

function rememberEdit() {
  if (!state.base) workingCanvas();
  state.undo.push(cloneCanvas(state.base));
  if (state.undo.length > 30) state.undo.shift();
  state.redo = [];
  updateHistoryButtons();
}

function restoreCanvas(canvas) {
  state.base = cloneCanvas(canvas);
  state.aspect = state.base.width / state.base.height;
  state.crop = null;
  state.excluded = new Set();
  syncFromAspect("width");
  if (state.tool) drawEditor();
  else render();
  updateHistoryButtons();
}

function undoEdit() {
  if (!state.undo.length || !state.base) return;
  state.redo.push(cloneCanvas(state.base));
  restoreCanvas(state.undo.pop());
}

function redoEdit() {
  if (!state.redo.length || !state.base) return;
  state.undo.push(cloneCanvas(state.base));
  restoreCanvas(state.redo.pop());
}

function updateHistoryButtons() {
  $("undo").disabled = state.undo.length === 0;
  $("redo").disabled = state.redo.length === 0;
}

$("undo").onclick = undoEdit;
$("redo").onclick = redoEdit;
window.addEventListener("keydown", (ev) => {
  const key = ev.key.toLowerCase();
  if (!(ev.ctrlKey || ev.metaKey) || (key !== "z" && key !== "y")) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  ev.preventDefault();
  if (key === "y" || ev.shiftKey) redoEdit();
  else undoEdit();
});

function rotate(delta) {
  if (!state.image) return;
  rememberEdit();
  const src = workingCanvas();
  const c = document.createElement("canvas");
  const rad = (delta * Math.PI) / 180;
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext("2d");
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  state.base = c;
  state.aspect = c.width / c.height;
  state.excluded = new Set();
  syncFromAspect("width");
  state.crop = null;
  if (state.tool) drawEditor();
  else render();
}

function flip(axis) {
  if (!state.image) return;
  rememberEdit();
  const src = workingCanvas();
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  if (axis === "h") {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, c.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(src, 0, 0);
  state.base = c;
  state.crop = null;
  if (state.tool) drawEditor();
  else render();
  setStatus(axis === "h" ? "Flipped horizontally." : "Flipped vertically.");
}

$("tool-crop").onclick = () => toggleTool("crop");
$("tool-erase").onclick = () => toggleTool("erase");
$("edit-done").onclick = () => closeEditor();
$("crop-apply").onclick = applyCrop;

function toggleTool(name) {
  if (!state.image) {
    setStatus("Load an image first.", true);
    return;
  }
  if (state.tool === name) {
    closeEditor();
    return;
  }
  state.measuring = false;
  state.points = [];
  $("real-help").classList.add("hidden");
  $("real-size").textContent = "Set real size — pick two points";
  state.tool = name;
  state.crop = null;
  $("tool-crop").classList.toggle("on", name === "crop");
  $("tool-erase").classList.toggle("on", name === "erase");
  $("tol-wrap").classList.toggle("hidden", name !== "erase");
  $("crop-apply").classList.toggle("hidden", name !== "crop");
  $("tool-help").textContent = name === "crop"
    ? "Drag the gold bars or corners to frame the picture, then apply. Drag inside the frame to move it."
    : "Click a color to erase it and everything touching it. Drag to erase a similar color under the cursor.";
  $("sheet").parentElement.classList.add("hidden");
  $("editor").classList.remove("hidden");
  $("empty").classList.add("hidden");
  drawEditor();
}

function closeEditor() {
  state.tool = null;
  state.crop = null;
  state.drag = null;
  $("tool-crop").classList.remove("on");
  $("tool-erase").classList.remove("on");
  $("tol-wrap").classList.add("hidden");
  $("crop-apply").classList.add("hidden");
  $("editor").classList.add("hidden");
  $("tool-help").textContent = "Crop trims the picture. Magic erase removes a clicked color, like a background.";
  render();
}

function editorScale() {
  const base = workingCanvas();
  const wrap = $("preview-wrap").clientWidth - 48;
  const maxH = Math.max(280, window.innerHeight - 180);
  return Math.min(1, wrap / base.width, maxH / base.height);
}

function drawEditor() {
  const base = workingCanvas();
  const scale = editorScale();
  const canvas = $("edit-canvas");
  canvas.width = Math.max(1, Math.round(base.width * scale));
  canvas.height = Math.max(1, Math.round(base.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
  const box = $("crop-box");
  if (state.tool === "crop") {
    if (!state.crop) {
      const m = 0.06;
      state.crop = {
        x: canvas.width * m,
        y: canvas.height * m,
        w: canvas.width * (1 - m * 2),
        h: canvas.height * (1 - m * 2),
      };
    }
    placeCrop(canvas);
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
  }
}

function placeCrop(canvas) {
  const box = $("crop-box");
  const { x, y, w, h } = state.crop;
  box.style.left = (x / canvas.width) * 100 + "%";
  box.style.top = (y / canvas.height) * 100 + "%";
  box.style.width = (w / canvas.width) * 100 + "%";
  box.style.height = (h / canvas.height) * 100 + "%";
}

function canvasPoint(ev) {
  const canvas = $("edit-canvas");
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((ev.clientY - rect.top) / rect.height) * canvas.height;
  return {
    x: Math.max(0, Math.min(canvas.width - 1, x)),
    y: Math.max(0, Math.min(canvas.height - 1, y)),
  };
}

$("edit-canvas").addEventListener("pointerdown", (ev) => {
  if (state.tool !== "erase") return;
  ev.preventDefault();
  const p = canvasPoint(ev);
  rememberEdit();
  const base = workingCanvas();
  const scale = editorScale();
  const bx = Math.round(p.x / scale);
  const by = Math.round(p.y / scale);
  state.drag = { x: p.x, y: p.y, moved: false, color: sampleColor(base, bx, by), bx, by };
});
$("crop-box").addEventListener("pointerdown", (ev) => {
  if (state.tool !== "crop" || !state.crop) return;
  ev.preventDefault();
  ev.stopPropagation();
  const p = canvasPoint(ev);
  state.drag = {
    edge: ev.target.dataset.edge || "move",
    x: p.x,
    y: p.y,
    crop: { ...state.crop },
  };
});
window.addEventListener("pointermove", (ev) => {
  if (!state.drag) return;
  const p = canvasPoint(ev);
  if (Math.hypot(p.x - state.drag.x, p.y - state.drag.y) > 3) state.drag.moved = true;
  if (state.tool === "crop" && state.drag.crop) {
    moveCrop(p);
    placeCrop($("edit-canvas"));
  } else if (state.tool === "erase" && state.drag.moved && state.drag.color) {
    const scale = editorScale();
    eraseBrush(workingCanvas(), p.x / scale, p.y / scale, 14 / scale, state.drag.color);
    drawEditor();
  }
});
window.addEventListener("pointerup", () => {
  if (!state.drag) return;
  if (state.tool === "erase" && !state.drag.moved && state.drag.color) {
    floodErase(workingCanvas(), state.drag.bx, state.drag.by, state.drag.color);
    drawEditor();
  }
  state.drag = null;
});

function moveCrop(p) {
  const canvas = $("edit-canvas");
  const start = state.drag.crop;
  const dx = p.x - state.drag.x;
  const dy = p.y - state.drag.y;
  const min = 16;
  let x = start.x;
  let y = start.y;
  let r = start.x + start.w;
  let b = start.y + start.h;
  const edge = state.drag.edge;
  if (edge === "move") {
    x += dx;
    r += dx;
    y += dy;
    b += dy;
    if (x < 0) { r -= x; x = 0; }
    if (y < 0) { b -= y; y = 0; }
    if (r > canvas.width) { x -= r - canvas.width; r = canvas.width; }
    if (b > canvas.height) { y -= b - canvas.height; b = canvas.height; }
  } else {
    if (edge.includes("w")) x = Math.min(start.x + dx, r - min);
    if (edge.includes("e")) r = Math.max(start.x + start.w + dx, x + min);
    if (edge.includes("n")) y = Math.min(start.y + dy, b - min);
    if (edge.includes("s")) b = Math.max(start.y + start.h + dy, y + min);
    x = Math.max(0, x);
    y = Math.max(0, y);
    r = Math.min(canvas.width, r);
    b = Math.min(canvas.height, b);
  }
  state.crop = { x, y, w: Math.max(min, r - x), h: Math.max(min, b - y) };
}

function sampleColor(canvas, x, y) {
  const d = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

function colorClose(data, i, color, tol) {
  return Math.max(
    Math.abs(data[i] - color[0]),
    Math.abs(data[i + 1] - color[1]),
    Math.abs(data[i + 2] - color[2])
  ) <= tol && data[i + 3] > 0;
}

function floodErase(canvas, sx, sy, color) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const tol = Number($("erase-tol").value);
  const seen = new Uint8Array(w * h);
  const stack = [[sx, sy]];
  seen[sy * w + sx] = 1;
  let guard = 0;
  while (stack.length && guard < w * h) {
    guard++;
    const [x, y] = stack.pop();
    const i = (y * w + x) * 4;
    if (!colorClose(data, i, color, tol)) continue;
    data[i + 3] = 0;
    if (x > 0 && !seen[y * w + x - 1]) { seen[y * w + x - 1] = 1; stack.push([x - 1, y]); }
    if (x + 1 < w && !seen[y * w + x + 1]) { seen[y * w + x + 1] = 1; stack.push([x + 1, y]); }
    if (y > 0 && !seen[(y - 1) * w + x]) { seen[(y - 1) * w + x] = 1; stack.push([x, y - 1]); }
    if (y + 1 < h && !seen[(y + 1) * w + x]) { seen[(y + 1) * w + x] = 1; stack.push([x, y + 1]); }
  }
  ctx.putImageData(img, 0, 0);
}

function eraseBrush(canvas, fx, fy, radius, color) {
  const ctx = canvas.getContext("2d");
  const r = Math.max(1, Math.ceil(radius));
  const x0 = Math.max(0, Math.floor(fx - r));
  const y0 = Math.max(0, Math.floor(fy - r));
  const x1 = Math.min(canvas.width, Math.ceil(fx + r));
  const y1 = Math.min(canvas.height, Math.ceil(fy + r));
  const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const data = img.data;
  const tol = Number($("erase-tol").value);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if ((x - fx) ** 2 + (y - fy) ** 2 > r * r) continue;
      const i = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
      if (colorClose(data, i, color, tol)) data[i + 3] = 0;
    }
  }
  ctx.putImageData(img, x0, y0);
}

function applyCrop() {
  if (!state.crop || state.crop.w < 4 || state.crop.h < 4) {
    setStatus("Drag a crop rectangle first.", true);
    return;
  }
  rememberEdit();
  const base = workingCanvas();
  const scale = editorScale();
  const x = Math.max(0, Math.round(state.crop.x / scale));
  const y = Math.max(0, Math.round(state.crop.y / scale));
  const w = Math.min(base.width - x, Math.round(state.crop.w / scale));
  const h = Math.min(base.height - y, Math.round(state.crop.h / scale));
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  c.getContext("2d").drawImage(base, x, y, c.width, c.height, 0, 0, c.width, c.height);
  state.base = c;
  state.aspect = c.width / c.height;
  state.excluded = new Set();
  syncFromAspect("width");
  state.crop = null;
  closeEditor();
  setStatus("Crop applied.");
}

$("real-size").onclick = () => {
  if (!state.image) {
    setStatus("Load an image first.", true);
    return;
  }
  state.measuring = !state.measuring;
  state.points = [];
  $("real-help").classList.toggle("hidden", !state.measuring);
  $("real-size").textContent = state.measuring
    ? "Cancel measuring"
    : "Set real size — pick two points";
  render();
};

function setStatus(text, warn) {
  const el = $("status");
  el.textContent = text || "";
  el.classList.toggle("warn", !!warn);
}

function workingCanvas() {
  if (state.base) return state.base;
  const img = state.image;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  state.base = c;
  return c;
}

function flatCanvas() {
  const src = workingCanvas();
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  return c;
}

function tileKey(c, r) {
  return c + "," + r;
}

function render() {
  if (!state.image) return;
  if (state.tool) {
    drawEditor();
    return;
  }
  renderPages();
}

function renderPages() {
  if (!state.image || state.tool) return;
  const layout = chosenLayout();
  const src = workingCanvas();
  const sheet = $("sheet");
  $("preview-col").classList.remove("hidden");
  $("empty").classList.add("hidden");
  const showCrops = $("crops").checked;
  const showRegs = $("regs").checked;
  const showNumbers = $("numbers").checked;
  const showGuide = $("guide").checked;
  sheet.style.gridTemplateColumns = `repeat(${layout.cols}, auto)`;
  const phone = document.body.classList.contains("is-phone");
  const gap = phone ? 6 : 10;
  const box = $("preview-wrap");
  const wrap = Math.max(160, box.clientWidth - (phone ? 16 : 48));
  const fitted = Math.floor((wrap - gap * (layout.cols - 1)) / layout.cols);
  let pagePx = Math.min(220, Math.max(90, fitted));
  if (phone) {
    const availW = Math.max(120, box.clientWidth - 12);
    const availH = Math.max(160, box.clientHeight - 12);
    const byW = (availW - gap * (layout.cols - 1)) / layout.cols;
    const byH = ((availH - gap * (layout.rows - 1)) / layout.rows) * (layout.pw / layout.ph);
    pagePx = Math.max(24, Math.floor(Math.min(byW, byH)));
  }
  const pageScale = pagePx / layout.pw;
  sheet.style.gap = gap + "px";
  sheet.innerHTML = "";

  let pageIndex = 0;
  const included = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (!state.excluded.has(tileKey(c, r))) {
        pageIndex += 1;
        included.push(pageIndex);
      } else included.push(0);
    }
  }
  pageIndex = 0;
  const total = included.filter(Boolean).length;

  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const tile = tileRect(layout, c, r);
      const off = state.excluded.has(tileKey(c, r));
      if (!off) pageIndex += 1;
      const page = document.createElement("div");
      page.className = "page" + (off ? " off" : "");
      page.style.width = layout.pw * pageScale + "px";
      page.style.height = layout.ph * pageScale + "px";
      const ox = tile.pageX;
      const oyTop = tile.pageY;
      const canvas = document.createElement("canvas");
      canvas.className = "art";
      const tw = Math.max(8, Math.round(tile.w * pageScale * 2));
      const th = Math.max(8, Math.round(tile.h * pageScale * 2));
      canvas.width = tw;
      canvas.height = th;
      canvas.style.left = ox * pageScale + "px";
      canvas.style.top = oyTop * pageScale + "px";
      canvas.style.width = tile.w * pageScale + "px";
      canvas.style.height = tile.h * pageScale + "px";
      paintTile(canvas.getContext("2d"), src, layout, tile, tw, th);
      page.appendChild(canvas);
      const marks = document.createElement("canvas");
      marks.width = Math.round(layout.pw * pageScale * 2);
      marks.height = Math.round(layout.ph * pageScale * 2);
      marks.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
      paintMarks(marks.getContext("2d"), layout, tile, ox, oyTop, marks.width, marks.height, {
        crops: showCrops && !phone,
        regs: showRegs && !phone,
        numbers: showNumbers,
        label: off ? "" : `${pageIndex}/${total}`,
      });
      page.appendChild(marks);
      page.onclick = (ev) => {
        if (state.measuring) {
          const art = page.querySelector("canvas.art");
          addMeasurePoint(ev, art, layout, tile);
          return;
        }
        const k = tileKey(c, r);
        if (state.excluded.has(k)) state.excluded.delete(k);
        else state.excluded.add(k);
        renderPages();
      };
      sheet.appendChild(page);
    }
  }
  drawMeasureDots(sheet, layout, pageScale, layout);
  paintGuideCard(layout, showGuide && !phone);

  const pages = layout.cols * layout.rows - state.excluded.size;
  const u = unitLabel();
  $("summary").textContent =
    `${mmToUnit(layout.poster.w)} × ${mmToUnit(layout.poster.h)} ${u} · ` +
    `${layout.cols} × ${layout.rows} · ${pages} page${pages === 1 ? "" : "s"} · ` +
    `${PAPERS[$("paper").value].name} ${layout.label}`;

  const inchesW = layout.poster.w / 25.4;
  const dpi = workingCanvas().width / inchesW;
  const dpiEl = $("dpi");
  if (dpi < 100) {
    dpiEl.textContent = `About ${Math.round(dpi)} DPI — soft at this size`;
    setStatus("Source is low resolution for this print size. A smaller size or a sharper file will look cleaner.", true);
  } else if (dpi < 150) {
    dpiEl.textContent = `About ${Math.round(dpi)} DPI — fine for a poster viewed from a step back`;
    setStatus("");
  } else {
    dpiEl.textContent = `About ${Math.round(dpi)} DPI`;
    setStatus("");
  }
}

function tileRect(layout, c, r) {
  const gridW = layout.cols <= 1 ? layout.innerW : layout.innerW + (layout.cols - 1) * layout.stepX;
  const gridH = layout.rows <= 1 ? layout.innerH : layout.innerH + (layout.rows - 1) * layout.stepY;
  const originX = Math.max(0, (gridW - layout.poster.w) / 2);
  const originY = Math.max(0, (gridH - layout.poster.h) / 2);
  const gx0 = c * layout.stepX;
  const gy0 = r * layout.stepY;
  const x0 = Math.max(gx0, originX);
  const y0 = Math.max(gy0, originY);
  const x1 = Math.min(gx0 + layout.innerW, originX + layout.poster.w);
  const y1 = Math.min(gy0 + layout.innerH, originY + layout.poster.h);
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  return {
    x: x0 - originX,
    y: y0 - originY,
    w,
    h,
    pageX: layout.margin + (x0 - gx0),
    pageY: layout.margin + (y0 - gy0),
    c,
    r,
  };
}

function contentBox(src, layout, tile) {
  if (tile.w < 0.5 || tile.h < 0.5) return null;
  const sw = 72;
  const sh = Math.max(8, Math.round(sw * (tile.h / tile.w)));
  const sample = document.createElement("canvas");
  sample.width = sw;
  sample.height = sh;
  paintTile(sample.getContext("2d"), src, layout, tile, sw, sh);
  const data = sample.getContext("2d").getImageData(0, 0, sw, sh).data;
  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      if (data[i + 3] < 20) continue;
      if (255 - Math.max(data[i], data[i + 1], data[i + 2]) <= 16) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const x0 = (minX / sw) * tile.w;
  const y0 = (minY / sh) * tile.h;
  const x1 = ((maxX + 1) / sw) * tile.w;
  const y1 = ((maxY + 1) / sh) * tile.h;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function paintTile(ctx, src, layout, tile, dw, dh) {
  const sx = (tile.x / layout.poster.w) * src.width;
  const sy = (tile.y / layout.poster.h) * src.height;
  const sw = (tile.w / layout.poster.w) * src.width;
  const sh = (tile.h / layout.poster.h) * src.height;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
}

function paintMarks(ctx, layout, tile, ox, oyTop, dw, dh, flags) {
  const sx = dw / layout.pw;
  const sy = dh / layout.ph;
  ctx.clearRect(0, 0, dw, dh);
  const box = flags.crops ? contentBox(workingCanvas(), layout, tile) : null;
  const x = (ox + (box ? box.x : 0)) * sx;
  const y = (oyTop + (box ? box.y : 0)) * sy;
  const w = (box ? box.w : tile.w) * sx;
  const h = (box ? box.h : tile.h) * sy;
  if (flags.crops && box) {
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    const len = 7 * sx;
    const gap = 2 * sx;
    const corners = [
      [x, y, -1, -1],
      [x + w, y, 1, -1],
      [x, y + h, -1, 1],
      [x + w, y + h, 1, 1],
    ];
    corners.forEach(([cx, cy, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * gap, cy);
      ctx.lineTo(cx + dx * (gap + len), cy);
      ctx.moveTo(cx, cy + dy * gap);
      ctx.lineTo(cx, cy + dy * (gap + len));
      ctx.stroke();
    });
    if (layout.overlap > 0 && (layout.cols > 1 || layout.rows > 1)) {
      ctx.strokeStyle = "rgba(190,40,40,0.85)";
      ctx.strokeRect(x, y, w, h);
    }
  }
  if (flags.regs) {
    [[layout.margin * 0.45, layout.margin * 0.45], [layout.pw - layout.margin * 0.45, layout.margin * 0.45]].forEach(([mx, my]) => {
      const cx = mx * sx;
      const cy = my * sy;
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 4 * sx, 0, Math.PI * 2);
      ctx.moveTo(cx - 6 * sx, cy);
      ctx.lineTo(cx + 6 * sx, cy);
      ctx.moveTo(cx, cy - 6 * sy);
      ctx.lineTo(cx, cy + 6 * sy);
      ctx.stroke();
    });
  }
  if (flags.numbers && flags.label) {
    ctx.fillStyle = "#222";
    ctx.font = `${Math.max(9, 8 * sx)}px sans-serif`;
    ctx.fillText(flags.label, layout.margin * sx, dh - 4 * sy);
  }
}

function paintGuideCard(layout, show) {
  const card = $("guide-card");
  card.classList.toggle("hidden", !show);
  card.innerHTML = "";
  if (!show) return;
  card.appendChild(guideCanvas(layout));
}

function tileIsBlank(src, layout, tile) {
  if (state.excluded.has(tileKey(tile.c, tile.r))) return true;
  if (tile.w < 1 || tile.h < 1) return true;
  const sample = document.createElement("canvas");
  sample.width = 20;
  sample.height = 20;
  paintTile(sample.getContext("2d"), src, layout, tile, 20, 20);
  const data = sample.getContext("2d").getImageData(0, 0, 20, 20).data;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 20 && (255 - Math.max(data[i], data[i + 1], data[i + 2])) > 18) ink++;
  }
  return ink < 6;
}

function guideCanvas(layout) {
  const ppm = 4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.pw * ppm);
  canvas.height = Math.round(layout.ph * ppm);
  const ctx = canvas.getContext("2d");
  const mm = (v) => v * ppm;
  const src = workingCanvas();
  const paper = PAPERS[$("paper").value];
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1a1a1a";
  ctx.textBaseline = "middle";

  const pad = 14;
  ctx.textAlign = "left";
  ctx.font = `600 ${mm(6)}px "Segoe UI", sans-serif`;
  ctx.fillText("Assembly guide", mm(pad), mm(12));
  ctx.font = `${mm(2.7)}px "Segoe UI", sans-serif`;
  ctx.fillStyle = "#444";
  ctx.fillText(
    `${layout.cols} × ${layout.rows} pages   ·   ${paper.name} ${Math.round(layout.pw)} × ${Math.round(layout.ph)} mm   ·   overlap ${(layout.overlap / 10).toFixed(1)} cm`,
    mm(pad),
    mm(18.5)
  );
  ctx.fillStyle = "#1a1a1a";
  ctx.fillText("Print this file at 100% (actual size). Trim on the crop marks, overlap each join, and tape from the back.", mm(pad), mm(24));

  const header = 30;
  const footer = 28;
  const gridMaxW = layout.pw - pad * 2;
  const gridMaxH = layout.ph - header - footer;
  const pageAspect = layout.innerW / layout.innerH;
  let cellW = gridMaxW / layout.cols;
  let cellH = cellW / pageAspect;
  if (cellH * layout.rows > gridMaxH) {
    cellH = gridMaxH / layout.rows;
    cellW = cellH * pageAspect;
  }
  const gridW = cellW * layout.cols;
  const gridH = cellH * layout.rows;
  const gx = (layout.pw - gridW) / 2;
  const gy = header + 2;

  const spanW = layout.cols <= 1 ? layout.innerW : layout.innerW + (layout.cols - 1) * layout.stepX;
  const spanH = layout.rows <= 1 ? layout.innerH : layout.innerH + (layout.rows - 1) * layout.stepY;
  const originX = Math.max(0, (spanW - layout.poster.w) / 2);
  const originY = Math.max(0, (spanH - layout.poster.h) / 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mm(gx), mm(gy), mm(gridW), mm(gridH));
  ctx.clip();
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(mm(gx), mm(gy), mm(gridW), mm(gridH));
  ctx.drawImage(
    src,
    mm(gx + (originX / spanW) * gridW),
    mm(gy + (originY / spanH) * gridH),
    mm((layout.poster.w / spanW) * gridW),
    mm((layout.poster.h / spanH) * gridH)
  );
  ctx.restore();

  ctx.lineWidth = 1;
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const tile = tileRect(layout, c, r);
      const blank = tileIsBlank(src, layout, tile);
      const x = mm(gx + c * cellW);
      const y = mm(gy + r * cellH);
      const cw = mm(cellW);
      const ch = mm(cellH);
      if (blank) {
        ctx.fillStyle = "#f3f3f3";
        ctx.fillRect(x, y, cw, ch);
        ctx.strokeStyle = "#e2e2e2";
        ctx.beginPath();
        ctx.moveTo(x + cw * 0.2, y + ch * 0.2);
        ctx.lineTo(x + cw * 0.8, y + ch * 0.8);
        ctx.moveTo(x + cw * 0.8, y + ch * 0.2);
        ctx.lineTo(x + cw * 0.2, y + ch * 0.8);
        ctx.stroke();
      } else {
        const n = String(r * layout.cols + c + 1);
        ctx.font = `600 ${Math.max(11, mm(Math.min(4.2, Math.min(cellW, cellH) * 0.22)))}px "Segoe UI", sans-serif`;
        const tw = ctx.measureText(n).width;
        const bw = tw + mm(2.2);
        const bh = mm(Math.min(5.5, Math.max(3.6, Math.min(cellW, cellH) * 0.22)));
        const bx = x + cw / 2 - bw / 2;
        const by = y + ch / 2 - bh / 2;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.strokeStyle = "#222";
        roundRect(ctx, bx, by, bw, bh, mm(0.8));
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#111";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n, x + cw / 2, y + ch / 2 + 0.5);
      }
    }
  }

  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 1;
  ctx.strokeRect(mm(gx) + 0.5, mm(gy) + 0.5, mm(gridW), mm(gridH));
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  for (let c = 1; c < layout.cols; c++) {
    const x = mm(gx + c * cellW);
    ctx.beginPath();
    ctx.moveTo(x, mm(gy));
    ctx.lineTo(x, mm(gy + gridH));
    ctx.stroke();
  }
  for (let r = 1; r < layout.rows; r++) {
    const y = mm(gy + r * cellH);
    ctx.beginPath();
    ctx.moveTo(mm(gx), y);
    ctx.lineTo(mm(gx + gridW), y);
    ctx.stroke();
  }

  const footY = layout.ph - 16;
  const ruler = Math.min(100, layout.pw * 0.46);
  const rx = pad;
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `${mm(2.5)}px "Segoe UI", sans-serif`;
  ctx.fillText("100 mm scale check", mm(rx), mm(footY - 5));
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(mm(rx), mm(footY));
  ctx.lineTo(mm(rx + ruler), mm(footY));
  ctx.stroke();
  const tickCount = ruler >= 100 ? 10 : 4;
  const tickStep = ruler / tickCount;
  for (let i = 0; i <= tickCount; i++) {
    const x = rx + i * tickStep;
    const major = i % (tickCount / 2) === 0;
    ctx.beginPath();
    ctx.moveTo(mm(x), mm(footY));
    ctx.lineTo(mm(x), mm(footY - (major ? 2.6 : 1.4)));
    ctx.stroke();
  }
  ctx.font = `${mm(2.2)}px "Segoe UI", sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillText("0", mm(rx), mm(footY + 1.2));
  ctx.fillText(String(Math.round(ruler / 2)), mm(rx + ruler / 2), mm(footY + 1.2));
  ctx.fillText(String(Math.round(ruler)), mm(rx + ruler), mm(footY + 1.2));

  const barW = Math.min(70, layout.pw - pad * 2 - ruler - 16);
  const barX = layout.pw - pad - barW;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `${mm(2.5)}px "Segoe UI", sans-serif`;
  ctx.fillText("Ink check", mm(barX), mm(footY - 5));
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const shade = Math.round(255 - (i / (steps - 1)) * 255);
    ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    ctx.fillRect(mm(barX + (barW * i) / steps), mm(footY - 1.5), mm(barW / steps) + 1, mm(4));
  }
  ctx.strokeStyle = "#111";
  ctx.strokeRect(mm(barX), mm(footY - 1.5), mm(barW), mm(4));
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `${mm(2.1)}px "Segoe UI", sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillText("0%", mm(barX), mm(footY + 3.2));
  ctx.fillText("100%", mm(barX + barW), mm(footY + 3.2));
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRegMark(ctx, x, y, r) {
  ctx.save();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r * 1.7, y);
  ctx.lineTo(x + r * 1.7, y);
  ctx.moveTo(x, y - r * 1.7);
  ctx.lineTo(x, y + r * 1.7);
  ctx.stroke();
  ctx.restore();
}

function addMeasurePoint(ev, el, layout, tile) {
  const rect = el.getBoundingClientRect();
  const lx = ((ev.clientX - rect.left) / rect.width) * tile.w + tile.x;
  const ly = ((ev.clientY - rect.top) / rect.height) * tile.h + tile.y;
  state.points.push({ x: lx, y: ly });
  if (state.points.length === 2) {
    const [a, b] = state.points;
    const distMm = Math.hypot(b.x - a.x, b.y - a.y);
    $("measure-copy").textContent =
      `Those points are ${mmToUnit(distMm)} ${unitLabel()} apart at the current size. Enter the distance they should be on paper.`;
    $("measure-value").value = mmToUnit(distMm) || 10;
    $("measure").showModal();
    $("measure").onclose = () => {
      if ($("measure").returnValue === "ok") {
        const want = unitToMm(Number($("measure-value").value));
        if (want > 0 && distMm > 0) {
          const factor = want / distMm;
          const layoutNow = chosenLayout();
          const nw = mmToUnit(layoutNow.poster.w * factor);
          const nh = mmToUnit(layoutNow.poster.h * factor);
          if ($("mode").value === "pages") $("mode").value = "size";
          toggleMode();
          lockGuard = true;
          $("width").value = round2(nw);
          $("height").value = round2(nh);
          lockGuard = false;
          state.aspect = (layoutNow.poster.w * factor) / (layoutNow.poster.h * factor);
        }
      }
      state.measuring = false;
      state.points = [];
      $("real-help").classList.add("hidden");
      $("real-size").textContent = "Set real size — pick two points";
      render();
    };
  } else {
    render();
  }
}

function drawMeasureDots(sheet, layout, pageScale) {
  state.points.forEach((p) => {
    let col = 0;
    let row = 0;
    for (let c = 0; c < layout.cols; c++) {
      const tile = tileRect(layout, c, 0);
      if (p.x >= tile.x && p.x <= tile.x + tile.w) col = c;
    }
    for (let r = 0; r < layout.rows; r++) {
      const tile = tileRect(layout, 0, r);
      if (p.y >= tile.y && p.y <= tile.y + tile.h) row = r;
    }
    const tile = tileRect(layout, col, row);
    const ox = tile.pageX;
    const oy = tile.pageY;
    const dot = document.createElement("div");
    dot.className = "measure-dot";
    const gap = 10;
    dot.style.left = col * (layout.pw * pageScale + gap) + (ox + (p.x - tile.x)) * pageScale + "px";
    dot.style.top = row * (layout.ph * pageScale + gap) + (oy + (p.y - tile.y)) * pageScale + "px";
    sheet.appendChild(dot);
  });
}

function mmToPt(mm) {
  return (mm * 72) / 25.4;
}

$("download").onclick = async () => {
  if (!state.image || !window.PDFLib) {
    setStatus("PDF library did not load. Check your connection and reload.", true);
    return;
  }
  $("download").disabled = true;
  setStatus("Building PDF…");
  try {
    await buildPdf();
    setStatus("PDF downloaded. Print at 100% scale (actual size).");
  } catch (err) {
    console.error(err);
    setStatus("PDF failed: " + err.message, true);
  }
  $("download").disabled = false;
};

async function buildPdf() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const layout = chosenLayout();
  const src = flatCanvas();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dpi = 140;
  const tiles = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (state.excluded.has(tileKey(c, r))) continue;
      tiles.push(tileRect(layout, c, r));
    }
  }

  if ($("guide").checked) {
    await addGuide(pdf, layout);
  }

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const page = pdf.addPage([mmToPt(layout.pw), mmToPt(layout.ph)]);
    const pxW = Math.max(40, Math.round((tile.w / 25.4) * dpi));
    const pxH = Math.max(40, Math.round((tile.h / 25.4) * dpi));
    const canvas = document.createElement("canvas");
    canvas.width = pxW;
    canvas.height = pxH;
    paintTile(canvas.getContext("2d"), src, layout, tile, pxW, pxH);
    const jpg = await pdf.embedJpg(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
    const ox = tile.pageX;
    const oy = layout.ph - tile.pageY - tile.h;
    page.drawImage(jpg, {
      x: mmToPt(ox),
      y: mmToPt(oy),
      width: mmToPt(tile.w),
      height: mmToPt(tile.h),
    });

    const black = rgb(0.1, 0.1, 0.1);
    const guide = rgb(0.75, 0.2, 0.2);
    const box = contentBox(src, layout, tile);
    if ($("crops").checked && box) {
      const mx = ox + box.x;
      const my = oy + (tile.h - box.y - box.h);
      drawCropMarks(page, mx, my, box.w, box.h, black);
      if (layout.overlap > 0 && (layout.cols > 1 || layout.rows > 1)) {
        strokeRect(page, mx, my, box.w, box.h, guide, 0.4);
      }
    }
    if ($("regs").checked) {
      drawReg(page, mmToPt(layout.margin * 0.45), mmToPt(layout.ph - layout.margin * 0.45));
      drawReg(page, mmToPt(layout.pw - layout.margin * 0.45), mmToPt(layout.ph - layout.margin * 0.45));
    }
    if ($("numbers").checked) {
      const label = `Page ${i + 1} / ${tiles.length}   ·   row ${tile.r + 1}, col ${tile.c + 1}`;
      page.drawText(label, {
        x: mmToPt(layout.margin),
        y: mmToPt(4),
        size: 8,
        font,
        color: black,
      });
    }
  }

  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gridcut.pdf";
  a.click();
  URL.revokeObjectURL(a.href);
}

function drawCropMarks(page, x, y, w, h, color) {
  const len = 4;
  const gap = 1;
  // x,y is the image's bottom-left corner in millimetres, origin at the page bottom-left.
  const corners = [
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
    [x, y, -1, -1],
    [x + w, y, 1, -1],
  ];
  corners.forEach(([cx, cy, sx, sy]) => {
    page.drawLine({
      start: { x: mmToPt(cx + sx * gap), y: mmToPt(cy) },
      end: { x: mmToPt(cx + sx * (gap + len)), y: mmToPt(cy) },
      thickness: 0.6,
      color,
    });
    page.drawLine({
      start: { x: mmToPt(cx), y: mmToPt(cy + sy * gap) },
      end: { x: mmToPt(cx), y: mmToPt(cy + sy * (gap + len)) },
      thickness: 0.6,
      color,
    });
  });
}

function strokeRect(page, x, y, w, h, color, thickness) {
  page.drawRectangle({
    x: mmToPt(x),
    y: mmToPt(y),
    width: mmToPt(w),
    height: mmToPt(h),
    borderColor: color,
    borderWidth: thickness,
  });
}

function drawReg(page, x, y) {
  const { rgb } = PDFLib;
  page.drawCircle({ x, y, size: 5, borderColor: rgb(0, 0, 0), borderWidth: 0.6 });
  page.drawLine({ start: { x: x - 7, y }, end: { x: x + 7, y }, thickness: 0.5, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x, y: y - 7 }, end: { x, y: y + 7 }, thickness: 0.5, color: rgb(0, 0, 0) });
}

async function addGuide(pdf, layout) {
  const canvas = guideCanvas(layout);
  const png = await pdf.embedPng(canvas.toDataURL("image/png").split(",")[1]);
  const page = pdf.addPage([mmToPt(layout.pw), mmToPt(layout.ph)]);
  page.drawImage(png, {
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight(),
  });
}

toggleMode();
