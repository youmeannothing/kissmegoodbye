// ————————————————————————————————————————————
// Kiss Me Goodbye — 조각글
// 발췌문·조각글을 위한 작은 워드 프로세서.
// 백지 한 장 — 처음부터 끝까지 유저가 쓴다.
// 모든 글은 이 브라우저(localStorage)에만 저장된다.
// ————————————————————————————————————————————

const PIECES_KEY = "kmg_pieces";
const DRAFT_KEY = "kmg_draft";
// 형광펜 팔레트 (index.html의 data-hl과 동일)
const HL_COLORS = [
  "rgb(251, 244, 206)", "rgb(244, 231, 233)", "rgb(227, 240, 228)",
  "rgb(226, 236, 246)", "rgb(236, 230, 244)",
];

const fmtStamp = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

const $ = id => document.getElementById(id);
const body = () => $("f-body");

// ——— HTML 정리 — 허용한 꾸밈만 남긴다 ———

const ALLOWED_TAGS = new Set([
  "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL",
  "MARK", "BR", "DIV", "P", "SPAN", "IMG", "FONT",
]);

function cleanNode(parent) {
  [...parent.childNodes].forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) return;
    if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); return; }
    cleanNode(child);
    const tag = child.tagName;
    if (tag === "IMG") {
      const src = child.getAttribute("src") || "";
      if (!src.startsWith("data:image/")) { child.remove(); return; }
      [...child.attributes].forEach(a => { if (a.name !== "src") child.removeAttribute(a.name); });
    } else if (tag === "FONT") {
      // 글꼴·크기·색 지정 (execCommand 산출물)
      const face = child.getAttribute("face") || "";
      const size = child.getAttribute("size") || "";
      const color = child.getAttribute("color") || child.style.color || "";
      const fsz = child.style.fontSize || "";
      [...child.attributes].forEach(a => child.removeAttribute(a.name));
      if (face) child.setAttribute("face", face);
      if (/^[1-7]$/.test(size)) child.setAttribute("size", size);
      if (/^(#[0-9a-f]{3,8}|rgba?\([\d.,\s]+\))$/i.test(color)) child.style.color = color;
      if (/^\d+(\.\d+)?px$/.test(fsz)) child.style.fontSize = fsz;
    } else if (ALLOWED_TAGS.has(tag)) {
      const isSpan = tag === "SPAN";
      const isBlock = tag === "DIV" || tag === "P";
      const cls = child.classList;
      const isTbox = isBlock && cls.contains("tbox");
      const isTboxBody = isBlock && cls.contains("tbox-body");
      const isPgbr = isBlock && cls.contains("pgbr");
      const isHandle = isSpan && (cls.contains("tbox-handle") || cls.contains("tbox-x"));
      const handleCls = isHandle ? (cls.contains("tbox-handle") ? "tbox-handle" : "tbox-x") : "";
      const bg = isSpan ? child.style.backgroundColor : "";
      const ff = isSpan ? child.style.fontFamily : "";
      const fsz = isSpan ? child.style.fontSize : "";
      const color = isSpan ? child.style.color : "";
      const lsp = isSpan ? child.style.letterSpacing : "";
      const align = isBlock
        ? (child.style.textAlign || child.getAttribute("align") || "") : "";
      const left = isTbox ? child.style.left : "";
      const top = isTbox ? child.style.top : "";
      const w = isTbox ? child.style.width : "";
      const dtop = isTbox ? (child.getAttribute("data-top") || "") : "";
      [...child.attributes].forEach(a => child.removeAttribute(a.name));
      if (bg && bg !== "transparent") child.style.backgroundColor = bg;
      if (ff) child.style.fontFamily = ff;
      if (/^\d+(\.\d+)?px$/.test(fsz)) child.style.fontSize = fsz;
      if (/^(#[0-9a-f]{3,8}|rgba?\([\d.,\s]+\))$/i.test(color)) child.style.color = color;
      if (/^-?\d+(\.\d+)?(em|px)$/.test(lsp)) child.style.letterSpacing = lsp;
      if (/^(left|center|right|justify)$/.test(align)) child.style.textAlign = align;
      if (isTbox) {
        child.className = "tbox";
        if (/^-?\d+(\.\d+)?px$/.test(left)) child.style.left = left;
        if (/^-?\d+(\.\d+)?px$/.test(top)) child.style.top = top;
        if (/^\d+(\.\d+)?(px|%)$/.test(w)) child.style.width = w;
        if (/^-?\d+(\.\d+)?$/.test(dtop)) child.setAttribute("data-top", dtop);
      } else if (isTboxBody) {
        child.className = "tbox-body";
      } else if (isPgbr) {
        child.className = "pgbr";
        child.setAttribute("contenteditable", "false");
      } else if (isHandle) {
        child.className = handleCls;
        child.setAttribute("contenteditable", "false");
      }
    } else {
      while (child.firstChild) parent.insertBefore(child.firstChild, child);
      child.remove();
    }
  });
}

function sanitizeHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  cleanNode(tpl.content);
  return tpl.innerHTML;
}

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = sanitizeHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(div|p)(\s[^>]*)?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "\n");
  div.querySelectorAll(".tbox-handle, .tbox-x").forEach(el => el.remove());
  return div.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

// 문서 첫 줄 = 목록에서 보이는 제목 (워드 프로세서처럼 문서에서 따온다)
function pieceTitle(p) {
  const first = htmlToText(p.html).split("\n").find(l => l.trim());
  return first ? first.trim().slice(0, 60) : "무제";
}

function pieceRest(p) {
  const lines = htmlToText(p.html).split("\n");
  const i = lines.findIndex(l => l.trim());
  return lines.slice(i + 1).join(" ").trim();
}

// ——— 이미지: 리사이즈 + JPEG 압축 → data URL ———

function compressImage(file, maxDim = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽을 수 없습니다")); };
    img.src = url;
  });
}

async function pickImage(file) {
  let data = await compressImage(file);
  if (data.length > 700_000) data = await compressImage(file, 800, 0.6);
  if (data.length > 700_000) throw new Error("이미지가 너무 큽니다. 더 작은 이미지를 선택해주세요.");
  return data;
}

// ——— 저장소 ———

function normalizePiece(p) {
  // 구버전 호환 — 제목·출처 칸이 있던 시절의 데이터는 문서 첫 줄로 접어 넣는다
  if (!p.html && typeof p.body === "string") {
    const div = document.createElement("div");
    div.textContent = p.body;
    p.html = div.innerHTML.replace(/\n/g, "<br>");
  }
  if (p.title || p.source) {
    const div = document.createElement("div");
    div.textContent = p.title || "";
    const head = (p.title ? `<b>${div.innerHTML}</b><br>` : "");
    div.textContent = p.source || "";
    const src = (p.source ? `${div.innerHTML}<br>` : "");
    p.html = head + src + (head || src ? "<br>" : "") + (p.html || "");
    delete p.title; delete p.source;
  }
  return p;
}

function loadPieces() {
  try { return (JSON.parse(localStorage.getItem(PIECES_KEY)) || []).map(normalizePiece); }
  catch { return []; }
}
function savePieces(list) {
  localStorage.setItem(PIECES_KEY, JSON.stringify(list));
}

let editingId = null;

// ——— 편집기 ———

function docText() {
  const clone = body().cloneNode(true);
  clone.querySelectorAll(".tbox-handle, .tbox-x").forEach(el => el.remove());
  return clone.innerText;
}

function isDocEmpty() {
  return !docText().trim() && !body().querySelector("img");
}

function updateCharCount() {
  $("char-count").textContent = docText().replace(/\n+/g, "").length;
}

function exec(cmd, value = null) {
  body().focus();
  document.execCommand("styleWithCSS", false, false); // <b><i><u> 태그로
  document.execCommand(cmd, false, value);
  afterEdit();
}

// "rgb(251, 244, 206)" → "251,244,206" — 브라우저마다 다른 표기를 통일해 비교
function normColor(c) {
  const nums = (c || "").match(/\d+(\.\d+)?/g);
  return nums ? nums.slice(0, 3).join(",") : "";
}

function applyHighlight(color) {
  body().focus();
  // 쓰기는 hiliteColor, 읽기는 backColor (크롬은 hiliteColor 값을 못 읽는다)
  const current = normColor(document.queryCommandValue("backColor"));
  // 같은 색을 다시 고르면 끈다
  const target = color === "transparent" || normColor(color) === current
    ? "transparent" : color;
  document.execCommand("styleWithCSS", false, true); // 형광펜만 span 배경색으로
  document.execCommand("hiliteColor", false, target);
  document.execCommand("styleWithCSS", false, false);
  afterEdit();
}

function applyForeColor(color) {
  body().focus();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand("foreColor", false, color);
  document.execCommand("styleWithCSS", false, false);
  afterEdit();
}

// 자유 px 크기 — fontSize 7을 찍은 뒤 그 자리를 원하는 px로 치환하는 표준 트릭
function applyFontSizePx(px) {
  restoreRangeOrEnd();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand("fontSize", false, "7");
  document.execCommand("styleWithCSS", false, false);
  body().querySelectorAll("span, font").forEach(el => {
    if (el.style.fontSize === "xxx-large") el.style.fontSize = px + "px";
    if (el.tagName === "FONT" && el.getAttribute("size") === "7") {
      el.removeAttribute("size");
      el.style.fontSize = px + "px";
    }
  });
  afterEdit();
}

// ——— 문서 설정 (종이 폭 · 줄간 · 자간) ———

const docStyle = { width: 0, lh: "1.85", ls: "0" };

function applyDocStyle() {
  const ws = document.querySelector(".workspace");
  const wide = docStyle.width >= 620;
  ws.classList.toggle("w-wide", wide);
  document.querySelectorAll(".workspace .paper").forEach(p => {
    p.style.width = docStyle.width ? docStyle.width + "px" : "";
  });
  [body(), $("p-body")].forEach(el => {
    el.style.lineHeight = docStyle.lh;
    el.style.letterSpacing = docStyle.ls + "em";
  });
}

function syncDocInputs() {
  $("width-input").value = docStyle.width || "";
  $("lh-input").value = docStyle.lh;
  $("ls-input").value = docStyle.ls;
}

// 상자가 속한 페이지의 시작 y — 상자 앞의 마지막 페이지 나눔 아래쪽
function pageStartFor(box, container) {
  let prevBr = null;
  container.querySelectorAll(".pgbr").forEach(br => {
    if (br.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) prevBr = br;
  });
  return prevBr ? prevBr.offsetTop + prevBr.offsetHeight : 0;
}

// 텍스트 상자의 저장 좌표(data-top)는 페이지 기준 — 렌더 시 페이지 시작점을 더해 배치한다
function layoutBoxes(container) {
  container.querySelectorAll(".tbox").forEach(box => {
    let rel = parseFloat(box.dataset.top);
    if (isNaN(rel)) { // 구버전 상자: 절대 좌표를 페이지 기준으로 승격
      rel = parseFloat(box.style.top) || 0;
      box.dataset.top = String(rel);
    }
    box.style.top = (pageStartFor(box, container) + rel) + "px";
  });
}

// 절대 위치 텍스트 상자가 컨테이너 높이 밖으로 나가지 않게 늘려준다
function fitBoxHeight(container, base = 0) {
  let max = 0;
  container.querySelectorAll(".tbox").forEach(b => {
    max = Math.max(max, b.offsetTop + b.offsetHeight);
  });
  container.style.minHeight = max ? Math.max(base, max + 20) + "px" : (base ? base + "px" : "");
}

// ——— 텍스트 상자 — 드래그로 자유 배치 ———

function insertTextBox() {
  const sel = document.getSelection();
  const inBody = sel.rangeCount && body().contains(sel.anchorNode);
  const hasSel = inBody && !sel.isCollapsed;
  const selRange = inBody ? sel.getRangeAt(0).cloneRange() : null;

  const n = body().querySelectorAll(".tbox").length;
  const box = document.createElement("div");
  box.className = "tbox";
  box.dataset.top = String(24 + n * 18); // 페이지 기준 좌표
  box.style.left = (24 + n * 18) + "px";
  box.style.width = "180px";
  box.innerHTML =
    '<span class="tbox-handle" contenteditable="false" title="드래그해서 옮기기">⠿</span>' +
    '<span class="tbox-x" contenteditable="false" title="상자 삭제">✕</span>';
  const boxBody = document.createElement("div");
  boxBody.className = "tbox-body";
  box.appendChild(boxBody);

  // 드래그로 선택한 텍스트가 있으면 그대로 상자 안으로 옮긴다
  if (hasSel) boxBody.appendChild(selRange.extractContents());
  if (!boxBody.textContent.trim() && !boxBody.querySelector("img")) {
    boxBody.textContent = "텍스트 상자";
  }

  // 커서(선택)가 있던 페이지의 블록 뒤에 삽입 — 상자는 그 페이지 소속이 된다
  let node = selRange ? selRange.endContainer : null;
  while (node && node.parentNode && node.parentNode !== body()) node = node.parentNode;
  if (node && node.parentNode === body()) body().insertBefore(box, node.nextSibling);
  else body().appendChild(box);

  layoutBoxes(body());
  const r = document.createRange();
  r.selectNodeContents(boxBody);
  sel.removeAllRanges();
  sel.addRange(r);
  body().focus();
  afterEdit();
}

// ——— 페이지 나누기 ———

function insertPageBreak() {
  body().focus();
  document.execCommand("insertHTML", false,
    '<div class="pgbr" contenteditable="false"></div><div><br></div>');
  afterEdit();
}

function startBoxDrag(e) {
  const handle = e.target.closest(".tbox-handle");
  if (!handle) return false;
  const box = handle.closest(".tbox");
  e.preventDefault();
  const pageRect = body().getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const ox = e.clientX - boxRect.left;
  const oy = e.clientY - boxRect.top;
  const move = ev => {
    box.style.left = Math.max(0, ev.clientX - pageRect.left - ox) + "px";
    box.style.top = Math.max(0, ev.clientY - pageRect.top - oy) + "px";
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    // 놓은 위치를 페이지 기준 좌표로 환산해 저장
    const start = pageStartFor(box, body());
    box.dataset.top = String(Math.max(0, (parseFloat(box.style.top) || 0) - start));
    afterEdit();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  return true;
}

// 선택 영역의 꾸밈 상태를 툴바에 반영
function refreshToolbarState() {
  const sel = document.getSelection();
  const inside = sel.rangeCount && body().contains(sel.anchorNode);
  document.querySelectorAll("#toolbar button[data-cmd]").forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (cmd === "undo" || cmd === "redo") return;
    btn.classList.toggle("on", inside && document.queryCommandState(cmd));
  });
  const hlNow = inside ? normColor(document.queryCommandValue("backColor")) : "";
  $("hl-btn").classList.toggle("on", HL_COLORS.some(c => normColor(c) === hlNow));

  // 커서 위치의 글꼴·크기를 셀렉트에 반영
  if (inside) {
    const fontSel = $("font-select");
    const fn = (document.queryCommandValue("fontName") || "")
      .replace(/['"]/g, "").split(",")[0].trim().toLowerCase();
    const match = [...fontSel.options].find(o => o.value.toLowerCase() === fn);
    fontSel.value = match ? match.value : "Pretendard Variable";
    // 커서 위치의 실제 px를 크기 입력칸에 표시 (입력 중일 때는 건드리지 않는다)
    const sizeInput = $("size-input");
    let el = sel.anchorNode;
    if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
    if (el && body().contains(el) && document.activeElement !== sizeInput) {
      const px = parseFloat(getComputedStyle(el).fontSize);
      sizeInput.value = Math.round(px * 10) / 10;
    }
  }
}

// ——— 임시 저장 (draft) ———

function saveDraft() {
  if (isDocEmpty()) {
    localStorage.removeItem(DRAFT_KEY);
    $("draft-note").hidden = true;
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ html: body().innerHTML, ...docStyle }));
    $("draft-note").hidden = false;
  } catch { /* 저장 공간 부족 — 조용히 무시 */ }
}

function restoreDraft() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); }
  catch { return; }
  if (!draft) return;
  body().innerHTML = sanitizeHtml(draft.html || "");
  layoutBoxes(body());
  docStyle.width = draft.width || 0;
  docStyle.lh = draft.lh || "1.85";
  docStyle.ls = draft.ls || "0";
  $("draft-note").hidden = isDocEmpty();
}

// ——— 실시간 미리보기 ———

let pvPageIdx = 0;

function renderPreviewPane() {
  const pb = $("p-body");
  const empty = isDocEmpty();
  const html = empty ? "" : sanitizeHtml(body().innerHTML);
  const pages = empty ? [""] : splitPages(html);
  const nav = $("pv-pagenav");
  const flip = !!nav && viewMode === "flip" && !empty;
  if (pvPageIdx > pages.length - 1) pvPageIdx = pages.length - 1;
  if (pvPageIdx < 0) pvPageIdx = 0;
  pb.innerHTML = flip ? pages[pvPageIdx] : html;
  layoutBoxes(pb);
  if (nav) nav.hidden = !flip;
  if (flip) {
    $("pv-ind").textContent = `${pvPageIdx + 1} / ${pages.length}`;
    $("pv-prev").disabled = pvPageIdx === 0;
    $("pv-next").disabled = pvPageIdx === pages.length - 1;
  }
  $("pv-scroll")?.classList.toggle("on", viewMode !== "flip");
  $("pv-flip")?.classList.toggle("on", viewMode === "flip");
  fitBoxHeight(pb);
}

function afterEdit() {
  updateCharCount();
  refreshToolbarState();
  layoutBoxes(body());
  renderPreviewPane();
  fitBoxHeight(body(), 380);
  saveDraft();
}

// ——— 저장 · 새로 쓰기 · 수정 ———

function resetEditor() {
  body().innerHTML = "";
  editingId = null;
  localStorage.removeItem(DRAFT_KEY);
  $("draft-note").hidden = true;
  updateCharCount();
  renderPreviewPane();
  $("save-btn").textContent = "저장";
}

function savePiece() {
  if (isDocEmpty()) { body().focus(); return; }
  const html = sanitizeHtml(body().innerHTML);
  const data = { html, ...docStyle };
  try {
    const list = loadPieces();
    if (editingId) {
      savePieces(list.map(p => p.id === editingId
        ? { ...p, ...data, editedAt: Date.now() } : p));
    } else {
      list.push({ ...data, id: crypto.randomUUID(), createdAt: Date.now() });
      savePieces(list);
    }
    resetEditor();
    renderList();
  } catch (err) {
    alert("저장에 실패했습니다. 브라우저 저장 공간이 가득 찼을 수 있어요. 오래된 글이나 이미지를 정리해주세요.");
    console.error(err);
  }
}

function beginEdit(p) {
  editingId = p.id;
  $("save-btn").textContent = "수정 완료";
  body().innerHTML = sanitizeHtml(p.html);
  layoutBoxes(body());
  docStyle.width = p.width || 0;
  docStyle.lh = p.lh || "1.85";
  docStyle.ls = p.ls || "0";
  syncDocInputs();
  applyDocStyle();
  updateCharCount();
  renderPreviewPane();
  fitBoxHeight(body(), 380);
  document.querySelector(".paper").scrollIntoView({ behavior: "smooth", block: "center" });
  body().focus();
}

// ——— 보관함 ———

function metaText(p) {
  return fmtStamp.format(new Date(p.createdAt)) + (p.editedAt ? " (수정됨)" : "");
}

function renderList() {
  const pieces = loadPieces().sort((a, b) => b.createdAt - a.createdAt);
  $("piece-count").textContent = pieces.length;
  $("empty-state").hidden = pieces.length > 0;

  const list = $("piece-list");
  list.innerHTML = "";
  pieces.forEach(p => {
    const li = document.createElement("li");
    li.className = "card";
    li.tabIndex = 0;
    li.setAttribute("role", "button");

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = pieceTitle(p);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = metaText(p);

    li.append(title, meta);

    const rest = pieceRest(p);
    if (rest) {
      const preview = document.createElement("p");
      preview.className = "card-preview";
      preview.textContent = rest;
      li.appendChild(preview);
    }

    const open = () => viewPiece(p);
    li.onclick = open;
    li.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    list.appendChild(li);
  });
}

// 페이지 나눔(.pgbr) 기준으로 문서를 장별 html 배열로 쪼갠다
function splitPages(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const pages = [document.createElement("div")];
  [...tmp.childNodes].forEach(n => {
    if (n.nodeType === Node.ELEMENT_NODE && n.classList.contains("pgbr")) {
      pages.push(document.createElement("div"));
      return;
    }
    pages[pages.length - 1].appendChild(n);
    // 나눔이 블록 안에 중첩된 경우 그 블록 뒤에서 장을 끊는다
    if (n.nodeType === Node.ELEMENT_NODE && n.querySelector?.(".pgbr")) {
      pages.push(document.createElement("div"));
    }
  });
  const nonEmpty = pages.filter(p => p.textContent.trim() || p.querySelector("img"));
  return (nonEmpty.length ? nonEmpty : [pages[0]]).map(p => p.innerHTML);
}

// 보기 방식: scroll(이어서) | flip(넘겨서) — 선택을 기억한다
let viewMode = localStorage.getItem("kmg_viewmode") || "scroll";
let viewPages = [];
let viewPageIdx = 0;

function renderViewBody() {
  const vb = $("v-body");
  // 배포 직후 캐시가 어긋나 옛 HTML이 남아 있어도 상세보기 자체는 열리게 방어
  const nav = $("v-pagenav");
  const flip = !!nav && viewMode === "flip";
  vb.innerHTML = flip ? viewPages[viewPageIdx] : viewPages.join('<div class="pgbr"></div>');
  layoutBoxes(vb);
  if (nav) nav.hidden = !flip;
  if (flip) {
    $("pg-ind").textContent = `${viewPageIdx + 1} / ${viewPages.length}`;
    $("pg-prev").disabled = viewPageIdx === 0;
    $("pg-next").disabled = viewPageIdx === viewPages.length - 1;
  }
  $("vm-scroll")?.classList.toggle("on", viewMode !== "flip");
  $("vm-flip")?.classList.toggle("on", viewMode === "flip");
  fitBoxHeight(vb);
}

function viewPiece(p) {
  const dlg = $("view-dialog");
  $("v-meta").textContent = metaText(p);
  const vb = $("v-body");
  viewPages = splitPages(sanitizeHtml(p.html));
  viewPageIdx = 0;
  const vmode = $("v-mode");
  if (vmode) vmode.hidden = false; // 토글은 항상 표시 — 나눔 없는 글은 1/1
  vb.style.lineHeight = p.lh || "1.85";
  vb.style.letterSpacing = (p.ls || "0") + "em";
  dlg.style.width = p.width
    ? Math.min(p.width + 54, Math.floor(window.innerWidth * 0.9)) + "px" : "";

  $("v-edit").onclick = () => { dlg.close(); beginEdit(p); };
  $("v-download").onclick = () => downloadTxt(p);
  $("v-del").onclick = () => {
    if (!confirm(`「${pieceTitle(p)}」을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    dlg.close();
    savePieces(loadPieces().filter(x => x.id !== p.id));
    renderList();
  };
  dlg.showModal();
  renderViewBody(); // 다이얼로그가 열린 뒤에야 상자 높이를 잴 수 있다
}

// ——— 파일로 저장 ———

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadTxt(p) {
  const text = htmlToText(p.html) + "\n";
  const name = pieceTitle(p).replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "조각글";
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${name}.txt`);
}

function exportAll() {
  const list = loadPieces();
  if (!list.length) { alert("내보낼 글이 없습니다."); return; }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(
    new Blob([JSON.stringify(list, null, 2)], { type: "application/json" }),
    `kissmegoodbye-${stamp}.json`,
  );
}

function importAll(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming)) throw new Error();
      const valid = incoming.map(normalizePiece)
        .filter(p => p && p.id && typeof p.html === "string")
        .map(p => ({ ...p, html: sanitizeHtml(p.html) }));
      if (!valid.length) throw new Error();
      const current = loadPieces();
      const known = new Set(current.map(p => p.id));
      const added = valid.filter(p => !known.has(p.id));
      savePieces([...current, ...added]);
      renderList();
      alert(`${added.length}편을 가져왔습니다.` +
        (valid.length - added.length ? ` (이미 있는 ${valid.length - added.length}편은 건너뜀)` : ""));
    } catch {
      alert("가져올 수 없는 파일입니다. 이 사이트에서 내보낸 .json 파일을 선택해주세요.");
    }
  };
  reader.readAsText(file);
}

// ——— 파일 삽입 (이미지 → 문서 안에, txt·md → 커서 위치에) ———

let savedRange = null;

function rememberRange() {
  const sel = document.getSelection();
  if (sel.rangeCount && body().contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}

function restoreRangeOrEnd() {
  body().focus();
  const sel = document.getSelection();
  sel.removeAllRanges();
  if (savedRange) {
    sel.addRange(savedRange);
  } else {
    const range = document.createRange();
    range.selectNodeContents(body());
    range.collapse(false); // 커서 기억이 없으면 문서 끝에
    sel.addRange(range);
  }
}

async function insertFile(file) {
  restoreRangeOrEnd();
  if (file.type.startsWith("image/")) {
    const data = await pickImage(file);
    document.execCommand("insertImage", false, data);
  } else {
    const text = await file.text();
    if (text.length > 20000) throw new Error("파일이 너무 깁니다. 20,000자 이하만 삽입할 수 있어요.");
    document.execCommand("insertText", false, text);
  }
  afterEdit();
}

// ——— 시작 ———

function main() {
  renderList();
  restoreDraft();
  syncDocInputs();
  applyDocStyle();
  updateCharCount();
  renderPreviewPane();

  // 툴바 — mousedown을 막아 본문 선택이 풀리지 않게 한다 (셀렉트·입력칸은 예외)
  const toolbar = $("toolbar");
  toolbar.addEventListener("mousedown", e => {
    if (!e.target.closest("select, input, label")) e.preventDefault();
  });
  toolbar.addEventListener("click", e => {
    const btn = e.target.closest("button[data-cmd]");
    if (btn) exec(btn.dataset.cmd);
  });

  // 형광펜·글자색 팔레트
  $("hl-btn").onclick = () => {
    $("fc-palette").hidden = true;
    $("hl-palette").hidden = !$("hl-palette").hidden;
  };
  $("hl-palette").addEventListener("click", e => {
    const sw = e.target.closest("button[data-hl]");
    if (!sw) return;
    applyHighlight(sw.dataset.hl);
    $("hl-palette").hidden = true;
  });
  $("fc-btn").onclick = () => {
    $("hl-palette").hidden = true;
    $("fc-palette").hidden = !$("fc-palette").hidden;
  };
  $("fc-palette").addEventListener("click", e => {
    const sw = e.target.closest("button[data-fc]");
    if (!sw) return;
    applyForeColor(sw.dataset.fc);
    $("fc-palette").hidden = true;
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".hl-wrap")) {
      $("hl-palette").hidden = true;
      $("fc-palette").hidden = true;
    }
  });

  // 직접 고르기 (컬러 휠) — OS 피커가 포커스를 가져가도 동작하도록
  // 기억해 둔 선택 영역을 span으로 직접 감싸고, 고르는 동안은 그 span의 색만 바꾼다
  const wireCustomColor = (inputId, paletteId, prop) => {
    const inp = $(inputId);
    let session = null; // 이번 피커 세션에서 만든 span
    inp.addEventListener("mousedown", () => { rememberRange(); session = null; });
    const paint = () => {
      if (session && session.isConnected) {
        session.style[prop] = inp.value;
      } else if (savedRange && !savedRange.collapsed) {
        const span = document.createElement("span");
        span.style[prop] = inp.value;
        const range = savedRange.cloneRange();
        try { range.surroundContents(span); }
        catch { span.appendChild(range.extractContents()); range.insertNode(span); }
        session = span;
        savedRange = null;
      } else {
        return; // 선택해 둔 글자가 없으면 할 일 없음
      }
      afterEdit();
    };
    inp.addEventListener("input", paint);
    inp.addEventListener("change", () => { paint(); $(paletteId).hidden = true; });
  };
  wireCustomColor("hl-color", "hl-palette", "backgroundColor");
  wireCustomColor("fc-color", "fc-palette", "color");

  // 글꼴 셀렉트 — 열기 전에 선택 영역을 기억했다가 적용 직전에 복원
  const fontSel = $("font-select");
  fontSel.addEventListener("mousedown", rememberRange);
  fontSel.onchange = () => {
    restoreRangeOrEnd();
    document.execCommand("styleWithCSS", false, false);
    document.execCommand("fontName", false, fontSel.value);
    afterEdit();
  };

  // 글자 크기 — 원하는 px를 직접 입력
  const sizeInput = $("size-input");
  sizeInput.addEventListener("mousedown", rememberRange);
  sizeInput.addEventListener("focus", () => { if (!savedRange) rememberRange(); });
  sizeInput.onchange = () => {
    const px = Math.min(200, Math.max(6, parseFloat(sizeInput.value) || 11.5));
    sizeInput.value = px;
    applyFontSizePx(px);
  };
  sizeInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); sizeInput.blur(); }
  });

  // 텍스트 상자 · 페이지 나누기
  $("tbox-btn").onclick = insertTextBox;
  $("pgbr-btn").onclick = insertPageBreak;
  body().addEventListener("pointerdown", startBoxDrag);
  body().addEventListener("click", e => {
    const x = e.target.closest(".tbox-x");
    if (x) { x.closest(".tbox").remove(); afterEdit(); }
  });

  // 문서 설정 — 종이 폭 · 줄간 · 자간
  $("width-input").onchange = e => {
    const v = parseInt(e.target.value, 10);
    docStyle.width = v ? Math.min(3000, Math.max(200, v)) : 0;
    e.target.value = docStyle.width || "";
    applyDocStyle();
    saveDraft();
  };
  $("lh-input").onchange = e => {
    const v = Math.min(5, Math.max(0.5, parseFloat(e.target.value) || 1.85));
    docStyle.lh = String(v);
    e.target.value = v;
    applyDocStyle();
    saveDraft();
  };
  // 자간 — 드래그로 선택해 둔 부분이 있으면 그 부분에만, 없으면 문서 전체에
  const lsInput = $("ls-input");
  let lsRange = null;
  const captureLsRange = () => {
    const sel = document.getSelection();
    lsRange = (sel.rangeCount && !sel.isCollapsed && body().contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange() : null;
  };
  lsInput.addEventListener("mousedown", captureLsRange);
  lsInput.addEventListener("focus", () => { if (!lsRange) captureLsRange(); });
  lsInput.onchange = e => {
    const raw = parseFloat(e.target.value);
    const v = Math.min(1, Math.max(-0.5, isNaN(raw) ? 0 : raw));
    e.target.value = v;
    if (lsRange) {
      const span = document.createElement("span");
      span.style.letterSpacing = v + "em";
      const range = lsRange.cloneRange();
      try { range.surroundContents(span); }
      catch { span.appendChild(range.extractContents()); range.insertNode(span); }
      lsRange = null;
      e.target.value = docStyle.ls; // 입력칸은 문서 기본값 표시로 복귀
      afterEdit();
    } else {
      docStyle.ls = String(v);
      applyDocStyle();
      saveDraft();
    }
  };

  document.addEventListener("selectionchange", refreshToolbarState);

  // 본문 — 붙여넣기는 평문으로
  body().addEventListener("paste", e => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  body().addEventListener("input", afterEdit);

  // 파일 삽입
  $("file-btn").addEventListener("mousedown", rememberRange);
  $("file-btn").onclick = () => $("f-file").click();
  $("f-file").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try { await insertFile(file); }
    catch (err) { alert(err.message); }
    finally { e.target.value = ""; }
  };

  $("save-btn").onclick = savePiece;
  $("clear-btn").onclick = () => {
    if (!isDocEmpty() &&
      !confirm("쓰던 내용을 비울까요? 저장하지 않은 내용은 사라집니다.")) return;
    resetEditor();
  };

  // ⌘S 저장 · ⌘⏎ 페이지 나누기 — 워드 프로세서답게
  window.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      savePiece();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      insertPageBreak();
    }
  });

  $("v-close").onclick = () => $("view-dialog").close();

  // 상세보기 — 이어서 / 넘겨서 (옛 HTML 캐시가 남아 있으면 요소가 없을 수 있다)
  if ($("vm-scroll")) {
    $("vm-scroll").onclick = () => {
      viewMode = "scroll";
      localStorage.setItem("kmg_viewmode", viewMode);
      renderViewBody();
    };
    $("vm-flip").onclick = () => {
      viewMode = "flip";
      localStorage.setItem("kmg_viewmode", viewMode);
      renderViewBody();
    };
    $("pg-prev").onclick = () => { if (viewPageIdx > 0) { viewPageIdx--; renderViewBody(); } };
    $("pg-next").onclick = () => {
      if (viewPageIdx < viewPages.length - 1) { viewPageIdx++; renderViewBody(); }
    };
    $("view-dialog").addEventListener("keydown", e => {
      if (viewMode !== "flip" || viewPages.length < 2) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); $("pg-prev").onclick(); }
      if (e.key === "ArrowRight") { e.preventDefault(); $("pg-next").onclick(); }
    });
  }

  // 미리보기 — 이어서 / 넘겨서
  if ($("pv-scroll")) {
    const setMode = m => {
      viewMode = m;
      localStorage.setItem("kmg_viewmode", m);
      renderPreviewPane();
    };
    $("pv-scroll").onclick = () => setMode("scroll");
    $("pv-flip").onclick = () => setMode("flip");
    $("pv-prev").onclick = () => { pvPageIdx--; renderPreviewPane(); };
    $("pv-next").onclick = () => { pvPageIdx++; renderPreviewPane(); };
  }

  $("export-btn").onclick = exportAll;
  $("import-btn").onclick = () => $("f-import").click();
  $("f-import").onchange = e => {
    const file = e.target.files[0];
    if (file) importAll(file);
    e.target.value = "";
  };
}

main();
