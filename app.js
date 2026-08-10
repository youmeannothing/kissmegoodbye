// ————————————————————————————————————————————
// Kiss Me Goodbye — 조각글
// 발췌문·조각글을 위한 작은 워드 프로세서.
// 종이에 바로 타이핑하고, 꾸민 모습 그대로 보관한다.
// 모든 글은 이 브라우저(localStorage)에만 저장된다.
// ————————————————————————————————————————————

const PIECES_KEY = "kmg_pieces";
const DRAFT_KEY = "kmg_draft";
const HL_COLOR = "rgb(244, 231, 233)"; // --accent-fill

const fmtStamp = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

const $ = id => document.getElementById(id);
const body = () => $("f-body");

// ——— HTML 정리 — 허용한 꾸밈만 남긴다 ———

const ALLOWED_TAGS = new Set([
  "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL",
  "MARK", "BR", "DIV", "P", "SPAN", "IMG",
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
    } else if (ALLOWED_TAGS.has(tag)) {
      const bg = tag === "SPAN" ? child.style.backgroundColor : "";
      [...child.attributes].forEach(a => child.removeAttribute(a.name));
      if (bg && bg !== "transparent") child.style.backgroundColor = bg;
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
  return div.textContent.replace(/\n{3,}/g, "\n\n").trim();
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
  // 구버전(마크 문법 body) 호환 — 평문을 그대로 살린다
  if (!p.html && typeof p.body === "string") {
    const div = document.createElement("div");
    div.textContent = p.body;
    p.html = div.innerHTML.replace(/\n/g, "<br>");
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

function isDocEmpty() {
  return !body().innerText.trim() && !body().querySelector("img");
}

function updateCharCount() {
  $("char-count").textContent = body().innerText.replace(/\n$/, "").length;
}

function exec(cmd, value = null) {
  body().focus();
  document.execCommand("styleWithCSS", false, false); // <b><i><u> 태그로
  document.execCommand(cmd, false, value);
  afterEdit();
}

function toggleHighlight() {
  const current = document.queryCommandValue("hiliteColor");
  body().focus();
  document.execCommand("styleWithCSS", false, true); // 형광펜만 span 배경색으로
  document.execCommand("hiliteColor", false, current === HL_COLOR ? "transparent" : HL_COLOR);
  document.execCommand("styleWithCSS", false, false);
  afterEdit();
}

// 선택 영역의 꾸밈 상태를 툴바 버튼에 반영
function refreshToolbarState() {
  const sel = document.getSelection();
  const inside = sel.rangeCount && body().contains(sel.anchorNode);
  document.querySelectorAll("#toolbar button[data-cmd]").forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (cmd === "undo" || cmd === "redo") return;
    let on = false;
    if (inside) {
      on = cmd === "highlight"
        ? document.queryCommandValue("hiliteColor") === HL_COLOR
        : document.queryCommandState(cmd);
    }
    btn.classList.toggle("on", on);
  });
}

// ——— 임시 저장 (draft) ———

function saveDraft() {
  const draft = {
    title: $("f-title").value,
    source: $("f-source").value,
    html: body().innerHTML,
  };
  if (!draft.title && !draft.source && isDocEmpty()) {
    localStorage.removeItem(DRAFT_KEY);
    $("draft-note").hidden = true;
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    $("draft-note").hidden = false;
  } catch { /* 저장 공간 부족 — 조용히 무시 */ }
}

function restoreDraft() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); }
  catch { return; }
  if (!draft) return;
  $("f-title").value = draft.title || "";
  $("f-source").value = draft.source || "";
  body().innerHTML = sanitizeHtml(draft.html || "");
  $("draft-note").hidden = false;
}

// ——— 실시간 미리보기 ———

function renderPreviewPane() {
  const title = $("f-title").value.trim();
  const source = $("f-source").value.trim();
  const t = $("p-title");
  t.textContent = title || "무제";
  t.classList.toggle("ph", !title);
  $("p-meta").textContent =
    (source ? `〔${source}〕 · ` : "") + fmtStamp.format(new Date());
  $("p-body").innerHTML = isDocEmpty()
    ? '<span class="ph">본문이 아직 비어 있습니다.</span>'
    : sanitizeHtml(body().innerHTML);
}

function afterEdit() {
  updateCharCount();
  refreshToolbarState();
  renderPreviewPane();
  saveDraft();
}

// ——— 저장 · 새로 쓰기 · 수정 ———

function resetEditor() {
  $("f-title").value = "";
  $("f-source").value = "";
  body().innerHTML = "";
  editingId = null;
  localStorage.removeItem(DRAFT_KEY);
  $("draft-note").hidden = true;
  updateCharCount();
  renderPreviewPane();
  $("editor-heading").textContent = "새 조각";
  $("save-btn").textContent = "저장";
}

function savePiece() {
  if (isDocEmpty()) { body().focus(); return; }
  const data = {
    title: $("f-title").value.trim(),
    source: $("f-source").value.trim(),
    html: sanitizeHtml(body().innerHTML),
  };
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
  $("editor-heading").textContent = `「${p.title || "무제"}」 수정 중`;
  $("save-btn").textContent = "수정 완료";
  $("f-title").value = p.title || "";
  $("f-source").value = p.source || "";
  body().innerHTML = sanitizeHtml(p.html);
  updateCharCount();
  renderPreviewPane();
  document.querySelector(".paper").scrollIntoView({ behavior: "smooth", block: "center" });
  body().focus();
}

// ——— 보관함 ———

function metaText(p) {
  return (p.source ? `〔${p.source}〕 · ` : "")
    + fmtStamp.format(new Date(p.createdAt))
    + (p.editedAt ? " (수정됨)" : "");
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
    title.textContent = p.title || "(무제)";

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = metaText(p);

    const preview = document.createElement("p");
    preview.className = "card-preview";
    const text = htmlToText(p.html).replace(/\n+/g, " ");
    preview.textContent = text || "(이미지)";

    li.append(title, meta, preview);

    const open = () => viewPiece(p);
    li.onclick = open;
    li.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    list.appendChild(li);
  });
}

function viewPiece(p) {
  const dlg = $("view-dialog");
  $("v-title").textContent = p.title || "(무제)";
  $("v-meta").textContent = metaText(p);
  $("v-body").innerHTML = sanitizeHtml(p.html);

  $("v-edit").onclick = () => { dlg.close(); beginEdit(p); };
  $("v-download").onclick = () => downloadTxt(p);
  $("v-del").onclick = () => {
    if (!confirm(`「${p.title || "무제"}」을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    dlg.close();
    savePieces(loadPieces().filter(x => x.id !== p.id));
    renderList();
  };
  dlg.showModal();
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
  const head = [p.title || "무제", p.source ? `— ${p.source}` : ""].filter(Boolean).join("\n");
  const text = `${head}\n\n${htmlToText(p.html)}\n`;
  const name = (p.title || "조각글").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
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
  updateCharCount();
  renderPreviewPane();

  // 툴바 — mousedown을 막아 본문 선택이 풀리지 않게 한다
  const toolbar = $("toolbar");
  toolbar.addEventListener("mousedown", e => e.preventDefault());
  toolbar.addEventListener("click", e => {
    const btn = e.target.closest("button[data-cmd]");
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    if (cmd === "highlight") toggleHighlight();
    else exec(cmd);
  });

  document.addEventListener("selectionchange", refreshToolbarState);

  // 본문 — 붙여넣기는 평문으로
  body().addEventListener("paste", e => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  body().addEventListener("input", afterEdit);
  $("f-title").addEventListener("input", () => { renderPreviewPane(); saveDraft(); });
  $("f-source").addEventListener("input", () => { renderPreviewPane(); saveDraft(); });

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

  // ⌘S / Ctrl+S — 워드 프로세서답게
  window.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      savePiece();
    }
  });

  $("v-close").onclick = () => $("view-dialog").close();

  $("export-btn").onclick = exportAll;
  $("import-btn").onclick = () => $("f-import").click();
  $("f-import").onchange = e => {
    const file = e.target.files[0];
    if (file) importAll(file);
    e.target.value = "";
  };
}

main();
