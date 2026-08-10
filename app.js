// ————————————————————————————————————————————
// Kiss Me Goodbye — 조각글 서랍
// 발췌문·조각글을 쓰고 꾸미고 보관하는 로컬 에디터.
// 모든 글은 이 브라우저(localStorage)에만 저장된다.
// ————————————————————————————————————————————

const PIECES_KEY = "kmg_pieces";
const DRAFT_KEY = "kmg_draft";

const fmtDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long",
});
const fmtStamp = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

// ——— 본문 꾸미기 (**굵게** *기울임* __밑줄__ ~~취소선~~ ==형광==) ———

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderRich(text) {
  let h = escapeHtml(text);
  h = h
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<u>$1</u>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  h = h.replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return h.replace(/\n/g, "<br>");
}

// 카드 미리보기용 — 꾸밈 표시 제거한 순수 텍스트
function stripMarks(s) {
  return s.replace(/(\*\*|__|~~|==|\*)/g, "");
}

// ——— 이미지 첨부: 리사이즈 + JPEG 압축 → data URL ———

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

function loadPieces() {
  try { return JSON.parse(localStorage.getItem(PIECES_KEY)) || []; }
  catch { return []; }
}
function savePieces(list) {
  localStorage.setItem(PIECES_KEY, JSON.stringify(list));
}

// ——— UI 상태 ———

const $ = id => document.getElementById(id);

let pieces = [];
let editingId = null;     // 수정 중인 글 id
let attachedImage = null; // 첨부 이미지 data URL

// ——— 목록 ———

function metaText(p) {
  return (p.source ? `〔${p.source}〕 · ` : "")
    + fmtStamp.format(new Date(p.createdAt))
    + (p.editedAt ? " (수정됨)" : "");
}

function renderList() {
  pieces = loadPieces().sort((a, b) => b.createdAt - a.createdAt);
  $("piece-count").textContent = pieces.length;
  $("empty-state").hidden = pieces.length > 0;

  const list = $("piece-list");
  list.innerHTML = "";
  pieces.forEach(p => {
    const li = document.createElement("li");
    li.className = "card";
    li.tabIndex = 0;
    li.setAttribute("role", "button");

    if (p.image) {
      const thumb = document.createElement("img");
      thumb.className = "card-thumb";
      thumb.src = p.image;
      thumb.alt = "";
      li.appendChild(thumb);
    }

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = p.title || "(무제)";

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = metaText(p);

    const body = document.createElement("p");
    body.className = "card-preview";
    body.textContent = stripMarks(p.body);

    li.append(title, meta, body);

    const open = () => viewPiece(p);
    li.onclick = open;
    li.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    list.appendChild(li);
  });
}

// ——— 상세 보기 ———

function viewPiece(p) {
  const dlg = $("view-dialog");
  $("v-title").textContent = p.title || "(무제)";
  $("v-meta").textContent = metaText(p);
  $("v-body").innerHTML = renderRich(p.body);

  const img = $("v-image");
  img.hidden = !p.image;
  if (p.image) img.src = p.image;

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
  const text = `${head}\n\n${p.body}\n`;
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
      const valid = incoming.filter(p => p && typeof p.body === "string" && p.id);
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

// ——— 임시 저장 (draft) ———

function saveDraft() {
  const draft = {
    title: $("f-title").value,
    source: $("f-source").value,
    body: $("f-body").value,
    image: attachedImage,
    imageName: $("image-name").textContent,
  };
  if (!draft.title && !draft.source && !draft.body && !draft.image) {
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
  $("f-body").value = draft.body || "";
  if (draft.image) {
    attachedImage = draft.image;
    setImageNote(draft.imageName || "첨부 이미지");
  }
  $("draft-note").hidden = false;
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  $("draft-note").hidden = true;
}

// ——— 에디터 ———

function setImageNote(name) {
  $("image-note").hidden = !name;
  $("image-name").textContent = name ? "🖼 " + name : "";
}

function updateCharCount() {
  $("char-count").textContent = $("f-body").value.length;
}

function resetForm() {
  $("editor-form").reset();
  editingId = null;
  attachedImage = null;
  setImageNote(null);
  closePreview();
  clearDraft();
  updateCharCount();
  $("editor-heading").textContent = "쓰기";
  $("submit-btn").textContent = "저장";
}

function handleSubmit(e) {
  e.preventDefault();
  const data = {
    title: $("f-title").value.trim(),
    source: $("f-source").value.trim(),
    body: $("f-body").value.trim(),
    image: attachedImage,
  };
  if (!data.body) return;

  try {
    const list = loadPieces();
    if (editingId) {
      savePieces(list.map(p => p.id === editingId
        ? { ...p, ...data, editedAt: Date.now() } : p));
    } else {
      list.push({ ...data, id: crypto.randomUUID(), createdAt: Date.now() });
      savePieces(list);
    }
    resetForm();
    renderList();
  } catch (err) {
    alert("저장에 실패했습니다. 브라우저 저장 공간이 가득 찼을 수 있어요. 오래된 글이나 이미지를 정리해주세요.");
    console.error(err);
  }
}

function beginEdit(p) {
  editingId = p.id;
  $("editor-heading").textContent = `「${p.title || "무제"}」 수정 중`;
  $("submit-btn").textContent = "수정 완료";
  $("f-title").value = p.title || "";
  $("f-source").value = p.source || "";
  $("f-body").value = p.body;
  attachedImage = p.image || null;
  setImageNote(attachedImage ? "기존 이미지 유지" : null);
  updateCharCount();
  updatePreview();
  $("editor-form").scrollIntoView({ behavior: "smooth", block: "center" });
  $("f-body").focus();
}

// ——— 미리보기 ———

function renderPreview() {
  $("preview-body").innerHTML =
    renderRich($("f-body").value) || '<span style="color:var(--faint)">본문이 비어 있습니다</span>';
}

function togglePreview() {
  const area = $("preview-area");
  if (!area.hidden) { closePreview(); return; }
  renderPreview();
  area.hidden = false;
}

function updatePreview() {
  if (!$("preview-area").hidden) renderPreview();
}

function closePreview() {
  $("preview-area").hidden = true;
  $("preview-body").innerHTML = "";
}

// ——— 파일 삽입 (이미지 또는 .txt/.md) ———

function insertAtCursor(ta, text) {
  const { selectionStart: s, selectionEnd: en, value: v } = ta;
  ta.value = v.slice(0, s) + text + v.slice(en);
  const pos = s + text.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
}

async function handleFile(file) {
  if (file.type.startsWith("image/")) {
    attachedImage = await pickImage(file);
    setImageNote(file.name);
    return;
  }
  // 텍스트 파일 — 커서 위치에 내용 삽입
  const text = await file.text();
  if (text.length > 8000) throw new Error("파일이 너무 깁니다. 8,000자 이하만 삽입할 수 있어요.");
  insertAtCursor($("f-body"), text);
  updateCharCount();
}

// ——— 시작 ———

function main() {
  $("date-str").textContent = fmtDate.format(new Date());

  renderList();
  restoreDraft();
  updateCharCount();

  $("editor-form").onsubmit = handleSubmit;
  $("clear-btn").onclick = () => {
    if ($("f-body").value.trim() &&
      !confirm("쓰던 내용을 비울까요? 저장하지 않은 내용은 사라집니다.")) return;
    resetForm();
  };

  // 텍스트 꾸미기 툴바
  $("toolbar").addEventListener("click", e => {
    const btn = e.target.closest("button[data-mark]");
    if (!btn) return;
    const mark = btn.dataset.mark;
    const ta = $("f-body");
    const { selectionStart: s, selectionEnd: en, value: v } = ta;
    const sel = v.slice(s, en) || "텍스트";
    ta.value = v.slice(0, s) + mark + sel + mark + v.slice(en);
    ta.focus();
    ta.setSelectionRange(s + mark.length, s + mark.length + sel.length);
    updatePreview();
    saveDraft();
    updateCharCount();
  });

  // 파일 삽입
  $("file-btn").onclick = () => $("f-file").click();
  $("f-file").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await handleFile(file);
      updatePreview();
      saveDraft();
    } catch (err) {
      alert(err.message);
    } finally {
      e.target.value = "";
    }
  };
  $("image-remove").onclick = () => {
    attachedImage = null;
    setImageNote(null);
    saveDraft();
  };

  $("preview-btn").onclick = togglePreview;
  $("editor-form").addEventListener("input", () => {
    updateCharCount();
    updatePreview();
    saveDraft();
  });

  $("v-close").onclick = () => $("view-dialog").close();

  // 전체 내보내기 / 가져오기
  $("export-btn").onclick = exportAll;
  $("import-btn").onclick = () => $("f-import").click();
  $("f-import").onchange = e => {
    const file = e.target.files[0];
    if (file) importAll(file);
    e.target.value = "";
  };
}

main();
