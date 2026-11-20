'use strict';
/* 청사 불편민원 관리: 외부 통신 없이 브라우저 IndexedDB에만 저장한다. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n, w = 2) => String(n).padStart(w, '0');
const FIELDS = Object.keys(CLASS.fields);
const CH_STAT = ['전화', 'IBS', '하모니', '홈페이지'];
const ZONE = { 청사동: '본관동', 본관동: '본관동', 실험동: '별동', 별동: '별동' };

let records = [];
let meta = {};
let db = null;
const listFilter = { kind: '', field: '', status: '', from: '', to: '', q: '', check: false };

/* ---------- 저장소 ---------- */
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('festa-complaint-demo-v1', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
      r.result.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function txDone(tx) {
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}
function getAll(store) {
  return new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function saveRecord(rec) {
  const tx = db.transaction('records', 'readwrite');
  const r = tx.objectStore('records').put(rec);
  r.onsuccess = () => { rec.id = r.result; };
  await txDone(tx);
  const i = records.findIndex(x => x.id === rec.id);
  if (i >= 0) records[i] = rec; else records.push(rec);
}
async function addMany(list) {
  const tx = db.transaction('records', 'readwrite');
  const st = tx.objectStore('records');
  for (const rec of list) { const r = st.add(rec); r.onsuccess = () => { rec.id = r.result; }; }
  await txDone(tx);
  records.push(...list);
}
async function deleteRecord(id) {
  const tx = db.transaction('records', 'readwrite');
  tx.objectStore('records').delete(id);
  await txDone(tx);
  records = records.filter(x => x.id !== id);
}
async function replaceAll(list) {
  const tx = db.transaction('records', 'readwrite');
  const st = tx.objectStore('records');
  st.clear();
  for (const rec of list) st.put(rec);
  await txDone(tx);
  records = await getAll('records');
}
async function setMeta(k, v) {
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ k, v });
  await txDone(tx);
  meta[k] = v;
}

/* ---------- 공통 계산 ---------- */
function nowLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function validDate(y, m, d) {
  if (!(y >= 2000 && y <= 2100)) return false;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}
const holidayList = () => meta.holidays || DEFAULT_HOLIDAYS;
function isWorkday(d) { // d는 Date
  if (d.getDay() === 0 || d.getDay() === 6) return false;
  return !holidayList().includes(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}
function workdaysAfter(from, to) { // 접수 다음 날부터 처리일까지의 업무일 수
  const [y, m, d] = from.split('-').map(Number);
  const cur = new Date(y, m - 1, d);
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    cur.setDate(cur.getDate() + 1);
    const key = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
    if (key > to) break;
    if (isWorkday(cur)) n++;
  }
  return n;
}
function duration(dt, doneAt) {
  if (!dt || !doneAt) return '';
  const a = dt.slice(0, 10), b = doneAt.slice(0, 10);
  if (b <= a) return '당일';
  return workdaysAfter(a, b) <= 3 ? '3일이내' : '3일초과';
}
const yearOf = r => (r.dt ? Number(r.dt.slice(0, 4)) : null);
const fmtDt = dt => (dt ? dt.slice(0, 16).replace('T', ' ') : '');
function nextFacilityNo() {
  let max = 0;
  for (const r of records) {
    const m = r.kind === 'facility' && /^민A(\d+)$/.exec(r.no || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return '민A' + pad(max + 1, 6);
}
function nextOtherNo(year) {
  let max = 0;
  for (const r of records) if (r.kind === 'other' && yearOf(r) === year) max = Math.max(max, Number(r.no) || 0);
  return String(max + 1);
}
function isDupNo(kind, no, year, exceptId) {
  return records.some(r => r.id !== exceptId && r.kind === kind && String(r.no) === String(no) && (kind === 'facility' || yearOf(r) === year));
}
function suggest(text) {
  const up = String(text || '').toUpperCase();
  let best = null;
  for (const k of CLASS.keywords) if (up.includes(k[0].toUpperCase()) && (!best || k[0].length > best[0].length)) best = k;
  return best;
}
function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };

/* ---------- 입력 폼 (접수·수정 공용) ---------- */
const opt = (list, sel, blank = true) => {
  const vals = [...list];
  if (sel && !vals.includes(sel)) vals.push(sel); // 가져온 기존 값은 그대로 보존
  return (blank ? '<option value=""></option>' : '') + vals.map(v => `<option${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');
};
function formHtml(r, isNew) {
  const name = isNew ? 'kind-new' : 'kind-edit';
  const fieldOpts = CLASS.fields[r.fieldL] || {};
  return `
  <div class="actions" style="margin-top:0">
    <div class="seg" role="radiogroup" aria-label="민원 구분">
      <label><input type="radio" name="${name}" value="facility"${r.kind === 'facility' ? ' checked' : ''}>시설불편</label>
      <label><input type="radio" name="${name}" value="other"${r.kind === 'other' ? ' checked' : ''}>시설 외</label>
    </div>
    ${isNew ? '' : `<span class="hint">${r.source === 'import' ? '엑셀에서 가져온 건' : '직접 접수한 건'}</span>`}
  </div>
  ${r.issues && r.issues.length ? `<p class="err">확인 필요: ${esc(r.issues.join(', '))} (저장하면 표시가 사라집니다)</p>` : ''}
  <h3>접수</h3>
  <div class="grid">
    <label class="f">접수번호<input data-f="no" value="${esc(r.no)}"></label>
    <label class="f">접수 일시 *<input data-f="dt" type="datetime-local" value="${esc(r.dt)}"></label>
    <label class="f">신고 기관<input data-f="org" value="${esc(r.org)}" autocomplete="off"></label>
    <label class="f">신고자 성명<input data-f="name" value="${esc(r.name)}" autocomplete="off"></label>
    <label class="f">연락처<input data-f="phone" value="${esc(r.phone)}" autocomplete="off"></label>
    <label class="f fac">접수방법<select data-f="channel">${opt(CLASS.channels, r.channel)}</select></label>
    <label class="f fac">접수자<input data-f="receiver" value="${esc(r.receiver)}" autocomplete="off"></label>
    <label class="f oth">업무담당자<input data-f="staff" value="${esc(r.staff)}" autocomplete="off"></label>
    <label class="f span-all">민원 내용 *<textarea data-f="content">${esc(r.content)}</textarea></label>
  </div>
  <div class="fac">
    <h3>분류</h3>
    <p class="suggest" data-suggest></p>
    <div class="grid">
      <label class="f">청사 건물<select data-f="building">${opt(CLASS.buildings, r.building)}</select></label>
      <label class="f">분야 대분류 *<select data-f="fieldL">${opt(FIELDS, r.fieldL)}</select></label>
      <label class="f">분야 중분류<select data-f="fieldM">${opt(Object.keys(fieldOpts), r.fieldM)}</select></label>
      <label class="f">분야 소분류<select data-f="fieldS">${opt(fieldOpts[r.fieldM] || [], r.fieldS)}</select></label>
      <label class="f">원인 대분류<select data-f="causeL">${opt(Object.keys(CLASS.causes), r.causeL)}</select></label>
      <label class="f">원인 상세<select data-f="causeS">${opt(CLASS.causes[r.causeL] || [], r.causeS)}</select></label>
    </div>
  </div>
  <h3>처리</h3>
  <div class="grid">
    <label class="f">처리 상태<select data-f="status">${opt(['처리중', '완료'], r.status, false)}</select></label>
    <label class="f">처리 일시<input data-f="doneAt" type="datetime-local" value="${esc(r.doneAt)}"></label>
    <label class="f">소요 기간 (업무일)<input data-duration readonly tabindex="-1" value="${esc(duration(r.dt, r.doneAt))}"></label>
    <label class="f fac">처리자1<input data-f="handler1" value="${esc(r.handler1)}" autocomplete="off"></label>
    <label class="f fac">처리자2<input data-f="handler2" value="${esc(r.handler2)}" autocomplete="off"></label>
    <label class="f fac">해피콜<select data-f="happy">${opt(['5', '4', '3', '2', '1'], r.happy ? String(r.happy) : '')}</select></label>
    <label class="f span-all">조치 내용<textarea data-f="action">${esc(r.action)}</textarea></label>
    <label class="f span-all oth">비고<input data-f="note" value="${esc(r.note)}"></label>
  </div>
  <p class="err" data-err></p>`;
}
function fillSelect(sel, list, val) { sel.innerHTML = opt(list, val); }
function bindForm(root, r, isNew) {
  const get = f => $(`[data-f="${f}"]`, root);
  const kindRadio = () => $('input[type=radio]:checked', root).value;
  let noEdited = !isNew;
  const showKind = () => {
    const fac = kindRadio() === 'facility';
    $$('.fac', root).forEach(e => { e.hidden = !fac; });
    $$('.oth', root).forEach(e => { e.hidden = fac; });
    if (!noEdited) refreshNo();
  };
  const refreshNo = () => {
    const y = get('dt').value ? Number(get('dt').value.slice(0, 4)) : new Date().getFullYear();
    get('no').value = kindRadio() === 'facility' ? nextFacilityNo() : nextOtherNo(y);
  };
  const refreshDuration = () => { $('[data-duration]', root).value = duration(get('dt').value, get('doneAt').value); };
  const refreshSuggest = () => {
    const box = $('[data-suggest]', root);
    const k = suggest(get('content').value);
    box.innerHTML = '';
    if (!k || kindRadio() !== 'facility') return;
    box.textContent = `내용에 '${k[0]}'이(가) 있어 ${k[1]} > ${k[2]} > ${k[3]}로 추천합니다. `;
    if (get('fieldL').value === k[1] && get('fieldM').value === k[2] && get('fieldS').value === k[3]) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = '적용';
    b.onclick = () => { applyField(k[1], k[2], k[3]); refreshSuggest(); };
    box.append(b);
  };
  const applyField = (l, m, s) => {
    get('fieldL').value = l;
    fillSelect(get('fieldM'), Object.keys(CLASS.fields[l] || {}), m);
    fillSelect(get('fieldS'), (CLASS.fields[l] || {})[m] || [], s);
  };
  $$('input[type=radio]', root).forEach(x => x.addEventListener('change', () => { showKind(); refreshSuggest(); }));
  get('fieldL').addEventListener('change', () => { applyField(get('fieldL').value, '', ''); refreshSuggest(); });
  get('fieldM').addEventListener('change', () => { fillSelect(get('fieldS'), (CLASS.fields[get('fieldL').value] || {})[get('fieldM').value] || [], ''); refreshSuggest(); });
  get('fieldS').addEventListener('change', refreshSuggest);
  get('causeL').addEventListener('change', () => fillSelect(get('causeS'), CLASS.causes[get('causeL').value] || [], ''));
  get('content').addEventListener('input', refreshSuggest);
  get('no').addEventListener('input', () => { noEdited = true; });
  get('dt').addEventListener('change', () => { refreshDuration(); if (!noEdited) refreshNo(); });
  get('doneAt').addEventListener('change', () => {
    refreshDuration();
    if (get('doneAt').value) get('status').value = '완료';
  });
  get('status').addEventListener('change', () => {
    if (get('status').value === '완료' && !get('doneAt').value) { get('doneAt').value = nowLocal(); refreshDuration(); }
    if (get('status').value === '처리중') { get('doneAt').value = ''; refreshDuration(); }
  });
  // Enter를 누르면 다음 칸으로 간다. 내용 칸은 줄바꿈을 유지한다.
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    const items = $$('input:not([type=radio]):not([readonly]),select,textarea', root).filter(x => x.offsetParent);
    const i = items.indexOf(e.target);
    if (items[i + 1]) items[i + 1].focus();
  });
  showKind(); refreshSuggest();
  return { kindRadio, get };
}
function collect(root, base, form) {
  const r = { ...base, kind: form.kindRadio() };
  $$('[data-f]', root).forEach(el => { r[el.dataset.f] = el.value.trim(); });
  r.happy = r.happy || '';
  if (r.kind === 'facility') { r.campus = r.campus || CLASS.campus; }
  return r;
}
function validate(r, exceptId) {
  if (!r.dt) return '접수 일시를 입력하세요.';
  if (!r.content) return '민원 내용을 입력하세요.';
  if (!r.no) return '접수번호를 입력하세요.';
  if (r.kind === 'facility' && !r.fieldL) return '시설불편은 분야 대분류를 골라야 대장 시트에 들어갑니다.';
  if (r.doneAt && r.doneAt < r.dt) return '처리 일시가 접수 일시보다 빠릅니다.';
  if (r.status === '완료' && !r.doneAt) return '완료 건은 처리 일시를 입력하세요.';
  if (isDupNo(r.kind, r.no, yearOf(r), exceptId)) return `접수번호 ${r.no}이(가) 이미 있습니다.`;
  return '';
}
function blankRecord() {
  return { kind: 'facility', no: nextFacilityNo(), dt: nowLocal(), org: '', name: '', phone: '', channel: '전화', receiver: '', staff: '',
    content: '', building: '청사동', campus: CLASS.campus, fieldL: '', fieldM: '', fieldS: '', causeL: '', causeS: '', status: '처리중', doneAt: '',
    handler1: '', handler2: '', happy: '', action: '', note: '', issues: [], source: 'entry' };
}
/* ---------- 접수 ---------- */
function renderEntry() {
  const el = $('#tab-entry');
  const rec = blankRecord();
  el.innerHTML = `<div class="card"><h2>민원 접수</h2><div id="entryForm">${formHtml(rec, true)}</div>
    <div class="actions"><button class="btn primary" id="entrySave">접수 저장</button><button class="btn" id="entryReset">새로 쓰기</button>
    <span class="hint">Ctrl+Enter로 저장, Enter로 다음 칸 이동</span></div></div>`;
  const root = $('#entryForm');
  const form = bindForm(root, rec, true);
  const save = async () => {
    const r = collect(root, rec, form);
    const msg = validate(r);
    $('[data-err]', root).textContent = msg;
    if (msg) return;
    delete r.id;
    await saveRecord(r);
    afterChange();
    renderEntry();
    toast(`${r.no} 접수 저장 완료`);
    $('[data-f="org"]').focus();
  };
  $('#entrySave').onclick = save;
  $('#entryReset').onclick = renderEntry;
  root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); e.stopPropagation(); save(); } }, true);
}

/* ---------- 대장 ---------- */
function filtered() {
  const f = listFilter, q = f.q.trim().toLowerCase();
  return records.filter(r => {
    if (f.check) return r.issues && r.issues.length;
    if (f.kind && r.kind !== f.kind) return false;
    if (f.field && r.fieldL !== f.field) return false;
    if (f.status && r.status !== f.status) return false;
    if (r.dt && f.from && r.dt.slice(0, 10) < f.from) return false;
    if (r.dt && f.to && r.dt.slice(0, 10) > f.to) return false;
    if (q && ![r.no, r.org, r.name, r.phone, r.content, r.action, r.handler1, r.handler2, r.staff, r.note].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => (b.dt || '9999').localeCompare(a.dt || '9999') || (b.id - a.id));
}
function renderList() {
  const el = $('#tab-list');
  const f = listFilter;
  const pending = records.filter(r => r.status === '처리중').length;
  const checks = records.filter(r => r.issues && r.issues.length).length;
  el.innerHTML = `<h2>민원 대장</h2>
  <div class="filters">
    <label class="f">구분<select id="fKind"><option value="">전체</option><option value="facility"${f.kind === 'facility' ? ' selected' : ''}>시설불편</option><option value="other"${f.kind === 'other' ? ' selected' : ''}>시설 외</option></select></label>
    <label class="f">분야<select id="fField">${'<option value="">전체</option>' + FIELDS.map(x => `<option${x === f.field ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="f">상태<select id="fStatus"><option value="">전체</option><option${f.status === '처리중' ? ' selected' : ''}>처리중</option><option${f.status === '완료' ? ' selected' : ''}>완료</option></select></label>
    <label class="f">시작일<input id="fFrom" type="date" value="${f.from}"></label>
    <label class="f">종료일<input id="fTo" type="date" value="${f.to}"></label>
    <label class="f q">검색<input id="fQ" value="${esc(f.q)}" placeholder="번호, 기관, 성명, 내용 등"></label>
  </div>
  <div class="actions" style="margin:0 0 12px">
    <button class="btn" id="fPending">미처리 ${pending}건 보기</button>
    ${checks ? `<button class="btn danger" id="fCheck">확인 필요 ${checks}건 보기</button>` : ''}
    <button class="btn" id="fClear">조건 지우기</button>
    <span class="hint" id="listCount"></span>
  </div>
  <div class="table-wrap"><table><thead><tr><th>번호</th><th>접수 일시</th><th>구분</th><th>분류</th><th>건물</th><th>신고자</th><th>연락처</th><th>내용</th><th>조치</th><th>상태</th></tr></thead><tbody id="listBody"></tbody></table></div>`;
  const bind = (id, key, ev = 'change') => { $(id).addEventListener(ev, e => { f[key] = e.target.value; f.check = false; drawRows(); }); };
  bind('#fKind', 'kind'); bind('#fField', 'field'); bind('#fStatus', 'status'); bind('#fFrom', 'from'); bind('#fTo', 'to'); bind('#fQ', 'q', 'input');
  $('#fPending').onclick = () => { Object.assign(f, { kind: '', field: '', status: '처리중', from: '', to: '', q: '', check: false }); renderList(); };
  if ($('#fCheck')) $('#fCheck').onclick = () => { f.check = true; drawRows(); };
  $('#fClear').onclick = () => { Object.assign(f, { kind: '', field: '', status: '', from: '', to: '', q: '', check: false }); renderList(); };
  drawRows();
}
function drawRows() {
  const rows = filtered();
  $('#listCount').textContent = `${rows.length}건`;
  $('#listBody').innerHTML = rows.map(r => `<tr class="row" tabindex="0" data-id="${r.id}">
    <td class="nowrap">${esc(r.no)}</td><td class="nowrap">${esc(fmtDt(r.dt))}</td><td class="nowrap">${r.kind === 'facility' ? '시설불편' : '시설 외'}</td>
    <td>${esc([r.fieldL, r.fieldM, r.fieldS].filter(Boolean).join(' > '))}</td><td class="nowrap">${esc(r.building)}</td>
    <td>${esc(r.name)}${r.org ? `<br><span class="hint">${esc(r.org)}</span>` : ''}</td><td class="nowrap">${esc(r.phone)}</td>
    <td class="clip">${esc(r.content)}</td><td class="clip">${esc(r.action)}</td>
    <td><span class="st ${r.status === '완료' ? 'done' : 'wip'}">${esc(r.status)}</span>${r.issues && r.issues.length ? '<br><span class="st chk">확인 필요</span>' : ''}</td></tr>`).join('')
    || '<tr><td colspan="10">조건에 맞는 민원이 없습니다.</td></tr>';
  $$('#listBody tr.row').forEach(tr => {
    tr.onclick = () => openEdit(Number(tr.dataset.id));
    tr.onkeydown = e => { if (e.key === 'Enter') openEdit(Number(tr.dataset.id)); };
  });
}
function openEdit(id) {
  const rec = records.find(r => r.id === id);
  const dlg = $('#editDialog');
  dlg.innerHTML = `<h2>민원 수정</h2><div id="editForm">${formHtml(rec, false)}</div>
    <div class="actions"><button class="btn primary" id="editSave">저장</button><button class="btn" id="editClose">닫기</button><button class="btn danger" id="editDel" style="margin-left:auto">삭제</button></div>`;
  const root = $('#editForm');
  const form = bindForm(root, rec, false);
  $('#editClose').onclick = () => dlg.close();
  $('#editSave').onclick = async () => {
    const r = collect(root, rec, form);
    const msg = validate(r, rec.id);
    $('[data-err]', root).textContent = msg;
    if (msg) return;
    r.issues = [];
    r.dtMinBlank = false; r.doneMinBlank = false; r.rawDate = ''; r.rawTime = '';
    await saveRecord(r);
    dlg.close(); afterChange(); toast(`${r.no} 저장 완료`);
  };
  $('#editDel').onclick = async () => {
    if (!confirm(`${rec.no} 민원을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await deleteRecord(rec.id);
    dlg.close(); afterChange(); toast('삭제했습니다.');
  };
  dlg.showModal();
}

/* ---------- 통계 ---------- */
function statYears() {
  const ys = uniq(records.map(r => (r.dt ? r.dt.slice(0, 4) : ''))).map(Number);
  const cy = new Date().getFullYear();
  if (!ys.includes(cy)) ys.push(cy);
  return ys.sort((a, b) => b - a);
}
function calcStats(year, month) {
  const inRange = r => yearOf(r) === year && (!month || Number(r.dt.slice(5, 7)) === month);
  const fac = records.filter(r => r.kind === 'facility' && inRange(r));
  const byField = FIELDS.map(field => {
    const rs = fac.filter(r => r.fieldL === field);
    const zone = z => rs.filter(r => (ZONE[r.building] || '기타') === z).length;
    return { field, 본관동: zone('본관동'), 별동: zone('별동'), 기타: zone('기타'), total: rs.length,
      done: rs.filter(r => r.status === '완료').length, wip: rs.filter(r => r.status !== '완료').length };
  });
  const byChannel = FIELDS.map(field => {
    const rs = fac.filter(r => r.fieldL === field);
    const row = { field, total: rs.length };
    CH_STAT.forEach(c => { row[c] = rs.filter(r => r.channel === c).length; });
    row.기타 = rs.filter(r => !CH_STAT.includes(r.channel)).length; // 카카오톡 포함
    return row;
  });
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    m: i + 1,
    fac: records.filter(r => r.kind === 'facility' && yearOf(r) === year && Number(r.dt.slice(5, 7)) === i + 1).length,
    oth: records.filter(r => r.kind === 'other' && yearOf(r) === year && Number(r.dt.slice(5, 7)) === i + 1).length,
  }));
  const oth = records.filter(r => r.kind === 'other' && inRange(r));
  return { byField, byChannel, monthly, other: { total: oth.length, done: oth.filter(r => r.status === '완료').length, wip: oth.filter(r => r.status !== '완료').length },
    noDate: records.filter(r => !r.dt).length };
}
function bindVizTips(root) {
  const tip = $('#vizTip');
  const show = (g, px, py) => {
    const data = VIZ.tips[Number(g.dataset.t)];
    if (!data) return;
    tip.textContent = '';
    const h = document.createElement('div'); h.className = 'tip-title'; h.textContent = data.title; tip.append(h);
    data.rows.forEach(row => {
      const line = document.createElement('div'); line.className = 'tip-row';
      const key = document.createElement('i'); key.className = 'key line'; key.style.background = row.color;
      const val = document.createElement('strong'); val.textContent = row.value;
      const name = document.createElement('span'); name.textContent = row.name;
      line.append(key, val, name); tip.append(line);
    });
    tip.hidden = false;
    const w = tip.offsetWidth, ht = tip.offsetHeight;
    tip.style.left = `${Math.min(px + 14, innerWidth - w - 8)}px`;
    tip.style.top = `${Math.max(8, Math.min(py + 14, innerHeight - ht - 8))}px`;
  };
  const hide = () => { tip.hidden = true; };
  root.addEventListener('pointermove', e => { const g = e.target.closest('[data-t]'); if (g) show(g, e.clientX, e.clientY); else hide(); });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('focusin', e => { const g = e.target.closest('[data-t]'); if (g) { const b = g.getBoundingClientRect(); show(g, b.left + b.width / 2, b.top); } });
  root.addEventListener('focusout', hide);
}

const sumKey = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
const pct = (v, t) => (t ? `${Math.round(v / t * 100)}%` : '0%');
const weekday = d => '일월화수목금토'[d.getDay()];
const statsState = { year: new Date().getFullYear(), month: 0, field: '' };
function renderStats() {
  const s = statsState;
  const st = calcStats(s.year, s.month);
  const d = new Date();
  const rowsF = st.byField, rowsC = st.byChannel;
  const T = sumKey(rowsF, 'total');
  const zKeys = ['본관동', '별동', '기타', 'total', 'done', 'wip'];
  const cKeys = ['total', '전화', 'IBS', '하모니', '홈페이지', '기타'];
  $('#tab-stats').innerHTML = `
  <div class="actions no-print" style="margin:0 0 14px">
    <label class="f">연도<select id="stYear">${statYears().map(y => `<option${y === s.year ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
    <label class="f">월<select id="stMonth"><option value="0">전체</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}"${i + 1 === s.month ? ' selected' : ''}>${i + 1}월</option>`).join('')}</select></label>
    <label class="f">그래프 분야<select id="stField"><option value="">전체</option>${FIELDS.map(f => `<option${f === s.field ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
    <button class="btn primary" id="stPrint" style="align-self:flex-end">표 인쇄 (A4 1쪽)</button>
    <button class="btn" id="stPrintAll" style="align-self:flex-end">그래프 포함 인쇄</button>
  </div>
  ${st.noDate ? `<p class="err no-print">일시를 확인해야 하는 ${st.noDate}건은 통계에서 빠졌습니다. 대장의 '확인 필요'에서 고쳐 주세요.</p>` : ''}
  <div class="stats-flow">
  <div class="card stats-sheet">
    <h2 style="text-align:center">○○청사 시설불편민원 처리현황 (${s.year}년${s.month ? ` ${s.month}월` : ''})</h2>
    <p style="text-align:right;margin:0">${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.(${weekday(d)})</p>
    <div class="report-head"><h3>□ 분야별 처리현황</h3><span>(단위 : 건)</span></div>
    <table class="report" id="tblField"><thead><tr><th rowspan="2">분야</th><th colspan="3">관리구역</th><th rowspan="2">계</th><th rowspan="2">처리완료</th><th rowspan="2">처리중</th></tr><tr><th>본관동</th><th>별동</th><th>기타</th></tr></thead>
    <tbody><tr class="sum"><td rowspan="2">합계(백분율)</td>${zKeys.map(k => `<td class="num">${sumKey(rowsF, k)}</td>`).join('')}</tr>
    <tr class="sum">${zKeys.map(k => `<td class="num">${pct(sumKey(rowsF, k), T)}</td>`).join('')}</tr>
    ${rowsF.map(r => `<tr><td>${r.field}</td>${zKeys.map(k => `<td class="num">${r[k]}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="hint">* 별동: 측정분석과, 실험동</p>
    <div class="report-head"><h3>□ 채널별 접수현황</h3><span>(단위 : 건)</span></div>
    <table class="report" id="tblChannel"><thead><tr><th>분야</th><th>계</th><th>전화</th><th>IBS</th><th>하모니(소곤소곤)</th><th>홈페이지(국민신문고)</th><th>기타</th></tr></thead>
    <tbody><tr class="sum"><td rowspan="2">합계(백분율)</td>${cKeys.map(k => `<td class="num">${sumKey(rowsC, k)}</td>`).join('')}</tr>
    <tr class="sum">${cKeys.map(k => `<td class="num">${pct(sumKey(rowsC, k), T)}</td>`).join('')}</tr>
    ${rowsC.map(r => `<tr><td>${r.field}</td>${cKeys.map(k => `<td class="num">${r[k]}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="hint">* 기타에는 카카오톡 접수가 포함됩니다.</p>
    <h3>□ 시설 외 민원</h3>
    <table class="report" id="tblOther"><thead><tr><th>계</th><th>처리완료</th><th>처리중</th></tr></thead><tbody><tr><td class="num">${st.other.total}</td><td class="num">${st.other.done}</td><td class="num">${st.other.wip}</td></tr></tbody></table>
    <h3>□ ${s.year}년 월별 접수 건수</h3>
    <table class="report" id="tblMonth"><thead><tr><th>구분</th>${st.monthly.map(x => `<th>${x.m}월</th>`).join('')}<th>계</th></tr></thead>
    <tbody><tr><td>시설불편</td>${st.monthly.map(x => `<td class="num">${x.fac}</td>`).join('')}<td class="num">${sumKey(st.monthly, 'fac')}</td></tr>
    <tr><td>시설 외</td>${st.monthly.map(x => `<td class="num">${x.oth}</td>`).join('')}<td class="num">${sumKey(st.monthly, 'oth')}</td></tr></tbody></table>
  </div>
  ${vizHtml(s.year, s.month, s.field)}
  </div>`;
  bindVizTips($('.viz-wrap'));
  $('#stYear').onchange = e => { s.year = Number(e.target.value); renderStats(); };
  $('#stMonth').onchange = e => { s.month = Number(e.target.value); renderStats(); };
  $('#stField').onchange = e => { s.field = e.target.value; renderStats(); };
  $('#stPrint').onclick = () => {
    document.body.classList.add('print-tables-only');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-tables-only'), { once: true });
    window.print();
  };
  $('#stPrintAll').onclick = () => window.print();
}

/* ---------- 엑셀 읽기 ---------- */
function cv(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if (v.richText) v = v.richText.map(t => t.text).join('');
    else if ('result' in v) v = v.result;
    else if ('formula' in v || 'sharedFormula' in v) v = null;
    else if ('text' in v) v = v.text;
  }
  return v === undefined ? null : v;
}
const txt = (ws, a) => { const v = cv(ws.getCell(a)); return v === null ? '' : String(v).trim(); };
const num = (ws, a) => { const n = parseInt(txt(ws, a), 10); return Number.isNaN(n) ? null : n; };
function buildDt(y, m, d, h, mi) {
  if (!validDate(y, m, d)) return '';
  return `${y}-${pad(m)}-${pad(d)}T${pad(h || 0)}:${pad(mi || 0)}`;
}
function parseFacilitySheet(ws) {
  const out = [];
  for (let r = 6; r <= ws.rowCount; r++) {
    const content = txt(ws, `H${r}`);
    if (!content) continue;
    const y = num(ws, `C${r}`), mo = num(ws, `D${r}`), d = num(ws, `E${r}`), h = num(ws, `F${r}`), mi = num(ws, `G${r}`);
    const issues = [];
    const dt = buildDt(y, mo, d, h, mi);
    if (!dt) issues.push(`접수 일시 형식(${[y, mo, d].join('-')})`);
    const dy = num(ws, `Y${r}`), dm = num(ws, `Z${r}`), dd = num(ws, `AA${r}`), dh = num(ws, `AB${r}`), dmi = num(ws, `AC${r}`);
    const doneAt = (dy || dm || dd) ? buildDt(dy, dm, dd, dh, dmi) : '';
    if ((dy || dm || dd) && !doneAt) issues.push('처리 일시 형식');
    let status = txt(ws, `N${r}`);
    status = status === '완료' ? '완료' : '처리중';
    const srcDur = txt(ws, `AD${r}`);
    const calc = duration(dt, doneAt);
    if (srcDur && calc && srcDur !== calc) issues.push(`소요기간 불일치(대장 ${srcDur}, 계산 ${calc})`);
    if (status === '완료' && !doneAt) issues.push('완료인데 처리 일시 없음');
    out.push({ kind: 'facility', no: txt(ws, `B${r}`), dt, org: txt(ws, `J${r}`), name: txt(ws, `K${r}`), phone: txt(ws, `L${r}`), channel: txt(ws, `M${r}`),
      content, action: txt(ws, `I${r}`), status, campus: txt(ws, `O${r}`) || CLASS.campus, building: txt(ws, `P${r}`), fieldL: txt(ws, `Q${r}`), fieldM: txt(ws, `R${r}`), fieldS: txt(ws, `S${r}`),
      causeL: txt(ws, `T${r}`), causeS: txt(ws, `U${r}`), receiver: txt(ws, `V${r}`), handler1: txt(ws, `W${r}`), handler2: txt(ws, `X${r}`),
      doneAt, happy: txt(ws, `AE${r}`), staff: '', note: '', issues, source: 'import', dtMinBlank: mi === null, doneMinBlank: !!doneAt && dmi === null, srcRow: r });
  }
  return out;
}
function parseOtherDate(v) {
  if (v instanceof Date) return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() };
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?$/.exec(String(v ?? '').trim());
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
function parseOtherSheet(ws) {
  const out = []; let blanks = 0;
  for (let r = 9; r <= ws.rowCount; r++) {
    const content = txt(ws, `E${r}`);
    if (!content) { if (txt(ws, `A${r}`)) blanks++; continue; }
    const issues = [];
    const rawDate = cv(ws.getCell(`B${r}`));
    const date = parseOtherDate(rawDate);
    if (!date || !validDate(date.y, date.m, date.d)) issues.push(`일자 형식(${rawDate instanceof Date ? '' : String(rawDate ?? '')})`);
    const c = txt(ws, `C${r}`);
    const tm = /(\d{1,2}):(\d{1,2})/.exec(c);
    if (!tm) issues.push('접수시간 없음');
    else if (tm[2].length !== 2 || +tm[1] > 23 || +tm[2] > 59) issues.push(`접수시간 형식(${tm[0]})`);
    const pm = /\(([^()]*)\)+/.exec(c);
    const phone = pm ? pm[1].trim() : '';
    if (!/^(\d{2,3}-\d{3,4}-\d{4}|\d{3,4}-\d{4})$/.test(phone)) issues.push('연락처 형식');
    const dm = /^([^(]*)(?:\(([^()]*)\)*)?/.exec(txt(ws, `D${r}`).replace(/\s*\n\s*/g, ''));
    const dt = date && validDate(date.y, date.m, date.d) ? buildDt(date.y, date.m, date.d, tm ? Math.min(+tm[1], 23) : 0, tm ? Math.min(+tm[2], 59) : 0) : '';
    const action = txt(ws, `G${r}`);
    out.push({ kind: 'other', no: txt(ws, `A${r}`), dt, rawDate: dt || rawDate instanceof Date ? '' : String(rawDate ?? ''), rawTime: tm ? tm[0] : '', name: dm ? dm[1].trim() : '', org: dm && dm[2] ? dm[2].trim() : '', phone, channel: '', content, staff: txt(ws, `F${r}`), action, note: txt(ws, `H${r}`),
      status: action ? '완료' : '처리중', doneAt: '', building: '', campus: '', fieldL: '', fieldM: '', fieldS: '', causeL: '', causeS: '', receiver: '', handler1: '', handler2: '', happy: '', issues, source: 'import', srcRow: r });
  }
  return { rows: out, blanks };
}
const dedupeKey = r => (r.kind === 'facility' && r.no ? `F|${r.no}` : `${r.kind}|${r.dt}|${r.phone}|${r.content}`);
async function importFile(file) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('xlsx 파일만 읽을 수 있습니다. zip은 먼저 압축을 풀어 주세요.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const seen = new Set(records.map(dedupeKey));
  const report = { file: file.name, sheets: [], added: 0, dup: 0, blanks: 0, issues: 0, kind: '' };
  const toAdd = [];
  for (const ws of wb.worksheets) {
    let parsed = null, blanks = 0;
    if (ws.name.startsWith('관리대장') && txt(ws, 'H3').includes('불편민원')) { parsed = parseFacilitySheet(ws); report.kind = '시설불편민원 관리대장'; }
    else if (txt(ws, 'A7').includes('일련') && txt(ws, 'E7').replace(/\s/g, '').includes('접수내용')) {
      const o = parseOtherSheet(ws); parsed = o.rows; blanks = o.blanks; report.kind = '시설 외 민원처리 대장';
    }
    if (!parsed) continue;
    let added = 0, dup = 0;
    for (const rec of parsed) {
      const key = dedupeKey(rec);
      if (seen.has(key)) { dup++; continue; }
      seen.add(key); toAdd.push(rec); added++;
      if (rec.issues.length) report.issues++;
    }
    report.sheets.push({ name: ws.name, read: parsed.length, added, dup });
    report.added += added; report.dup += dup; report.blanks += blanks;
  }
  if (!report.kind) throw new Error('민원 대장 양식을 찾지 못했습니다.');
  await addMany(toAdd);
  return report;
}

/* ---------- 엑셀 쓰기 ---------- */
const THIN = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const FONT = { name: '굴림체', size: 11 };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
function styleCell(c, opts = {}) {
  c.font = { ...FONT, bold: !!opts.bold };
  c.alignment = { vertical: 'middle', horizontal: opts.align || 'center', wrapText: true };
  if (opts.border !== false) c.border = BORDER;
  if (opts.head) c.fill = HEAD_FILL;
}
function setWidths(ws, map) { Object.entries(map).forEach(([k, w]) => { ws.getColumn(k).width = w; }); }
const LEDGER_W = { A: 3.5, B: 10.9, C: 5.6, D: 4.1, E: 4.1, F: 4.1, G: 4.1, H: 35.6, I: 25.1, J: 12, K: 10.6, L: 12.8, M: 9.2, N: 9.6, O: 9.6, P: 9.6, Q: 8.9, R: 10.2, S: 9.2, T: 9.9, U: 11.1, V: 9, W: 9, X: 9, Y: 5.6, Z: 5.6, AA: 5.6, AB: 5.6, AC: 5.6, AD: 6.6, AE: 10.8 };
function addLedgerSheet(wb, title, sheetName, rows) {
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 5 }] });
  setWidths(ws, LEDGER_W);
  ws.mergeCells('B1:AE2');
  ws.getCell('B1').value = title; ws.getCell('B1').font = { ...FONT, size: 18, bold: true };
  ws.getCell('B1').alignment = { horizontal: 'center', vertical: 'middle' };
  const single = { B: '접수 번호', H: '불편민원내용', I: '조치사항', N: '처리여부', O: '청사 대분류', P: '청사 중분류', Q: '분야별 대분류', R: '분야별 중분류', S: '분야별 소분류', T: '원  인 대분류', U: '원  인 상세분류', V: '접수자', W: '처리자1', X: '처리자2', AE: '해피콜' };
  Object.entries(single).forEach(([c, t]) => { ws.mergeCells(`${c}3:${c}4`); ws.getCell(`${c}3`).value = t; });
  ws.mergeCells('C3:G3'); ws.getCell('C3').value = '접수';
  ws.mergeCells('J3:M3'); ws.getCell('J3').value = '신      고';
  ws.mergeCells('Y3:AD3'); ws.getCell('Y3').value = '처     리';
  const sub = { C: '년', D: '월', E: '일', F: '시', G: '분', J: '소속', K: '성명', L: '연락처', M: '접수방법', Y: '년', Z: '월', AA: '일', AB: '시', AC: '분', AD: '소요 기간' };
  Object.entries(sub).forEach(([c, t]) => { ws.getCell(`${c}4`).value = t; });
  for (let r = 3; r <= 4; r++) for (let c = 2; c <= 31; c++) styleCell(ws.getCell(r, c), { bold: true, head: true });
  ws.mergeCells('B5:C5'); ws.getCell('B5').value = '□ 처리중';
  ws.mergeCells('D5:E5'); ws.getCell('D5').value = rows.filter(r => r.status !== '완료').length;
  ws.getCell('G5').value = '건';
  ['B5', 'D5', 'G5'].forEach(a => styleCell(ws.getCell(a), { border: false }));
  rows.forEach((r, i) => {
    const n = 6 + i;
    const d = r.dt ? r.dt.match(/\d+/g).map(Number) : [];
    const e = r.doneAt ? r.doneAt.match(/\d+/g).map(Number) : [];
    const vals = { B: r.no, C: d[0], D: d[1], E: d[2], F: d[3], G: r.dtMinBlank ? null : d[4], H: r.content, I: r.action, J: r.org, K: r.name, L: r.phone, M: r.channel, N: r.status,
      O: r.campus || CLASS.campus, P: r.building, Q: r.fieldL, R: r.fieldM, S: r.fieldS, T: r.causeL, U: r.causeS, V: r.receiver, W: r.handler1, X: r.handler2,
      Y: e[0], Z: e[1], AA: e[2], AB: e[3], AC: r.doneMinBlank ? null : e[4], AD: duration(r.dt, r.doneAt), AE: r.happy ? Number(r.happy) : null };
    Object.entries(vals).forEach(([c, v]) => {
      const cell = ws.getCell(`${c}${n}`);
      cell.value = (v === '' || v === undefined) ? null : v;
      styleCell(cell, { align: c === 'H' || c === 'I' ? 'left' : 'center' });
    });
  });
  ws.pageSetup = { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:4' };
}
function addStatSheet(wb, year) {
  const st = calcStats(year, 0);
  const ws = wb.addWorksheet('통계');
  setWidths(ws, { A: 3.5, B: 18, C: 11, D: 11, E: 11, F: 13, G: 15, H: 11 });
  ws.mergeCells('B2:H2');
  ws.getCell('B2').value = `○○청사 시설불편민원 처리현황 (${year}년)`; ws.getCell('B2').font = { ...FONT, size: 18, bold: true }; ws.getCell('B2').alignment = { horizontal: 'center' };
  const d = new Date();
  ws.mergeCells('G3:H3'); ws.getCell('G3').value = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.(${weekday(d)})`; ws.getCell('G3').font = FONT; ws.getCell('G3').alignment = { horizontal: 'right' };
  const cell = (a, v, o) => { ws.getCell(a).value = v; styleCell(ws.getCell(a), o); };
  ws.getCell('B4').value = '□ 분야별 처리현황'; ws.getCell('B4').font = { ...FONT, bold: true };
  ws.getCell('H5').value = '(단위 : 건)'; ws.getCell('H5').font = FONT;
  ws.mergeCells('B6:B7'); ws.mergeCells('C6:E6'); ws.mergeCells('F6:F7'); ws.mergeCells('G6:G7'); ws.mergeCells('H6:H7');
  [['B6', '분    야'], ['C6', '관리구역'], ['F6', '계'], ['G6', '처리완료'], ['H6', '처리중'], ['C7', '본관동'], ['D7', '별동'], ['E7', '기타']].forEach(([a, v]) => cell(a, v, { bold: true, head: true }));
  ['D6', 'E6', 'B7', 'F7', 'G7', 'H7'].forEach(a => styleCell(ws.getCell(a), { bold: true, head: true }));
  ws.mergeCells('B8:B9'); cell('B8', '합    계 (백분율)', { bold: true });
  const zk = ['본관동', '별동', '기타', 'total', 'done', 'wip'], zc = ['C', 'D', 'E', 'F', 'G', 'H'];
  const T = sumKey(st.byField, 'total');
  zk.forEach((k, i) => {
    cell(`${zc[i]}8`, sumKey(st.byField, k), { bold: true });
    cell(`${zc[i]}9`, T ? sumKey(st.byField, k) / T : 0, { bold: true }); ws.getCell(`${zc[i]}9`).numFmt = '0%';
  });
  st.byField.forEach((r, n) => { cell(`B${10 + n}`, r.field); zk.forEach((k, i) => cell(`${zc[i]}${10 + n}`, r[k])); });
  ws.getCell('B15').value = '* 별동 : 측정분석과,실험동'; ws.getCell('B15').font = FONT;
  ws.getCell('B16').value = '□ 채널별 접수현황'; ws.getCell('B16').font = { ...FONT, bold: true };
  ws.getCell('H17').value = '(단위 : 건)'; ws.getCell('H17').font = FONT;
  [['B18', '분    야'], ['C18', '계'], ['D18', '전  화'], ['E18', 'IBS'], ['F18', '하모니 (소곤소곤)'], ['G18', '홈페이지 (국민신문고)'], ['H18', '기타']].forEach(([a, v]) => cell(a, v, { bold: true, head: true }));
  ws.mergeCells('B19:B20'); cell('B19', '합    계 (백분율)', { bold: true });
  const ck = ['total', '전화', 'IBS', '하모니', '홈페이지', '기타'];
  ck.forEach((k, i) => {
    cell(`${zc[i]}19`, sumKey(st.byChannel, k), { bold: true });
    cell(`${zc[i]}20`, T ? sumKey(st.byChannel, k) / T : 0, { bold: true }); ws.getCell(`${zc[i]}20`).numFmt = '0%';
  });
  st.byChannel.forEach((r, n) => { cell(`B${21 + n}`, r.field); ck.forEach((k, i) => cell(`${zc[i]}${21 + n}`, r[k])); });
  ws.getCell('B26').value = '* 기타에는 카카오톡 접수가 포함됩니다.'; ws.getCell('B26').font = FONT;
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
}
const byDtAsc = (a, b) => (a.dt || '9999').localeCompare(b.dt || '9999') || String(a.no).localeCompare(String(b.no), 'ko', { numeric: true });
async function exportFacility(year) {
  const wb = new ExcelJS.Workbook();
  const rows = records.filter(r => r.kind === 'facility' && (yearOf(r) === year || !r.dt)).sort(byDtAsc);
  addStatSheet(wb, year);
  addLedgerSheet(wb, '시설불편민원 관리대장(미처리현황)', '관리대장(미처리현황)', rows.filter(r => r.status !== '완료'));
  for (const f of FIELDS) addLedgerSheet(wb, `시설불편민원 관리대장(${f})`, `관리대장(${f})`, rows.filter(r => r.fieldL === f));
  const buf = await wb.xlsx.writeBuffer();
  download(`시설불편민원_관리대장_${year}_${stamp()}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return rows.length;
}
async function exportOther(year) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('청사민원', { views: [{ state: 'frozen', ySplit: 8 }] });
  setWidths(ws, { A: 6.6, B: 11.1, C: 14, D: 11.4, E: 43, F: 11.4, G: 20.2, H: 17.8 });
  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = `시설 외 민원처리 대장(${year}년)`; ws.getCell('A2').font = { ...FONT, size: 18, bold: true }; ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.mergeCells('B7:B8'); ws.mergeCells('E7:E8'); ws.mergeCells('F7:H7');
  const heads = { A7: '일련', A8: '번호', B7: '일자', C7: '접수시간', C8: '(전화번호)', D7: '신고자', D8: '(신고기관)', E7: '접  수  내  용', F7: '처   리   내   용', F8: '업무담당자', G8: '조 치 내 용', H8: '비고' };
  Object.entries(heads).forEach(([a, v]) => { ws.getCell(a).value = v; });
  for (let r = 7; r <= 8; r++) for (let c = 1; c <= 8; c++) styleCell(ws.getCell(r, c), { bold: true, head: true });
  const rows = records.filter(r => r.kind === 'other' && (yearOf(r) === year || !r.dt)).sort(byDtAsc);
  rows.forEach((r, i) => {
    const n = 9 + i;
    const noNum = Number(r.no);
    const dp = r.dt ? r.dt.match(/\d+/g).map(Number) : null;
    const dateVal = dp ? new Date(Date.UTC(dp[0], dp[1] - 1, dp[2])) : (r.rawDate || null); // 일자 오류는 원문 유지
    const timeVal = r.dt ? r.dt.slice(11, 16) : (r.rawTime || '');
    const vals = [Number.isNaN(noNum) ? r.no : noNum, dateVal, `${timeVal}\n(${r.phone || ''})`, `${r.name || ''}\n(${r.org || ''})`, r.content, r.staff, r.action, r.note];
    vals.forEach((v, c) => {
      const cell = ws.getCell(n, c + 1);
      cell.value = v === '' ? null : v;
      styleCell(cell, { align: c === 4 || c === 6 || c === 7 ? 'left' : 'center' });
    });
    ws.getCell(n, 2).numFmt = 'yyyy-mm-dd';
  });
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '7:8' };
  const buf = await wb.xlsx.writeBuffer();
  download(`시설외민원_처리대장_${year}_${stamp()}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return rows.length;
}

/* ---------- 가져오기·내보내기 화면 ---------- */
let lastReports = [];
function renderData() {
  const years = statYears();
  const last = meta.lastBackup ? fmtDt(meta.lastBackup) : '없음';
  const checks = records.filter(r => r.issues && r.issues.length);
  $('#tab-data').innerHTML = `
  <div class="card"><h2>체험용 예시 자료</h2>
    <p class="hint">처음 열면 지어낸 예시 민원이 들어 있습니다. 직접 입력해 보다가 처음 상태로 되돌리고 싶으면 누르세요.</p>
    <div class="actions" style="margin-top:0"><button class="btn" id="demoReset">예시 자료로 되돌리기</button></div>
  </div>
  <div class="card"><h2>기존 엑셀 가져오기</h2>
    <p class="hint">이 브라우저 안에서만 읽고, 외부로 보내지 않습니다. 같은 파일을 다시 가져와도 같은 건은 건너뜁니다.</p>
    <label class="drop"><span class="f">민원 대장 xlsx 파일 선택 (2개까지 함께 선택 가능)</span><br><input id="impFile" type="file" accept=".xlsx" multiple></label>
    <div id="impResult">${reportHtml()}</div>
    ${checks.length ? `<h3>확인 필요 ${checks.length}건</h3><ul class="issues">${checks.map(r => `<li>${esc(r.no)}${r.srcRow ? ` (엑셀 ${r.srcRow}행)` : ''}: ${esc(r.issues.join(', '))}</li>`).join('')}</ul><p class="hint">대장에서 '확인 필요'를 눌러 고치면 사라집니다.</p>` : ''}
  </div>
  <div class="card"><h2>엑셀 내보내기</h2>
    <p class="notice warn" style="padding:8px 10px;border-radius:5px">내보낸 파일에는 신고자 성명·연락처가 그대로 들어갑니다. 업무망 안의 정해진 위치에만 저장하세요.</p>
    <div class="actions"><label class="f">연도<select id="expYear">${years.map(y => `<option>${y}</option>`).join('')}</select></label>
    <button class="btn primary" id="expFac" style="align-self:flex-end">시설불편민원 관리대장</button>
    <button class="btn primary" id="expOth" style="align-self:flex-end">시설 외 민원처리 대장</button></div>
  </div>
  <div class="card" id="holidayCard"><h2>공휴일 관리</h2>
    <p class="hint">소요기간(당일/3일이내/3일초과)을 업무일로 계산할 때 뺄 날짜입니다. 임시공휴일이 생기거나 새해가 되면 한 줄에 날짜 하나씩 추가하세요. 예: 2028-01-01</p>
    <label class="f">공휴일 목록 (${holidayList().length}일)<textarea id="holidayText" rows="8">${esc(holidayList().join('\n'))}</textarea></label>
    <p class="err" id="holidayErr"></p>
    <div class="actions" style="margin-top:0"><button class="btn primary" id="holidaySave">공휴일 저장</button><button class="btn" id="holidayReset">기본 목록으로</button></div>
  </div>
  <div class="card"><h2>백업·복원</h2>
    <p>전체 ${records.length}건 · 마지막 백업: <span id="lastBackup">${esc(last)}</span></p>
    <p class="notice warn" style="padding:8px 10px;border-radius:5px">브라우저 데이터를 지우거나 PC를 교체하면 저장 내용이 사라집니다. 백업 파일에도 인적사항이 그대로 들어가므로 업무망 안에 보관하세요.</p>
    <div class="actions"><button class="btn primary" id="bkSave">백업 저장</button>
    <label class="btn">복원 파일 선택<input id="bkLoad" type="file" accept=".json" hidden></label>
    <button class="btn danger" id="wipe" style="margin-left:auto">전체 삭제</button></div>
  </div>`;
  $('#impFile').onchange = async e => {
    const files = [...e.target.files];
    lastReports = [];
    for (const f of files) {
      try { lastReports.push(await importFile(f)); }
      catch (err) { lastReports.push({ file: f.name, error: err.message }); }
    }
    afterChange(); renderData();
  };
  $('#holidaySave').onclick = async () => {
    const lines = uniq($('#holidayText').value.split(/\s+/));
    const bad = lines.filter(x => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
      return !m || !validDate(+m[1], +m[2], +m[3]);
    });
    if (bad.length) { $('#holidayErr').textContent = `날짜 형식을 확인하세요: ${bad.slice(0, 5).join(', ')}`; return; }
    await setMeta('holidays', lines);
    afterChange(); renderData(); toast('공휴일을 저장했습니다.');
  };
  $('#holidayReset').onclick = async () => {
    await setMeta('holidays', null);
    afterChange(); renderData(); toast('기본 목록으로 되돌렸습니다.');
  };
  $('#demoReset').onclick = resetDemo;
  $('#expFac').onclick = () => runExport(exportFacility);
  $('#expOth').onclick = () => runExport(exportOther);
  $('#bkSave').onclick = async () => {
    const data = { app: 'dg-complaint', version: 1, exportedAt: nowLocal(), records, holidays: meta.holidays || null };
    download(`청사민원_백업_${stamp()}.json`, JSON.stringify(data), 'application/json');
    await setMeta('lastBackup', nowLocal());
    renderBackupNotice(); renderData(); toast('백업 파일을 저장했습니다.');
  };
  $('#bkLoad').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'dg-complaint' || !Array.isArray(data.records)) throw new Error('백업 파일 형식이 아닙니다.');
      if (!confirm(`현재 ${records.length}건을 지우고 백업의 ${data.records.length}건으로 바꿀까요?`)) { e.target.value = ''; return; }
      await replaceAll(data.records);
      await setMeta('holidays', Array.isArray(data.holidays) ? data.holidays : null);
      afterChange(); renderData(); toast(`${data.records.length}건을 복원했습니다.`);
    } catch (err) { alert(`복원 실패: ${err.message}`); e.target.value = ''; }
  };
  $('#wipe').onclick = async () => {
    if (!confirm(`저장된 ${records.length}건을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await replaceAll([]);
    lastReports = [];
    afterChange(); renderData(); toast('모두 삭제했습니다.');
  };
}
async function runExport(fn) {
  const y = Number($('#expYear').value);
  try { const n = await fn(y); toast(`${y}년 ${n}건을 저장했습니다.`); }
  catch (err) { alert(`엑셀 저장 실패: ${err.message}`); }
}
function reportHtml() {
  if (!lastReports.length) return '';
  return lastReports.map(r => (r.error
    ? `<p class="err">${esc(r.file)}: ${esc(r.error)}</p>`
    : `<h3>${esc(r.kind)} 결과</h3><p data-import-summary>새로 추가 ${r.added}건 · 중복 건너뜀 ${r.dup}건${r.blanks ? ` · 번호만 있는 행 건너뜀 ${r.blanks}건` : ''} · 확인 필요 ${r.issues}건</p>
       <table class="report"><thead><tr><th>시트</th><th>읽은 건수</th><th>추가</th><th>중복</th></tr></thead><tbody>${r.sheets.map(s => `<tr><td>${esc(s.name)}</td><td>${s.read}</td><td>${s.added}</td><td>${s.dup}</td></tr>`).join('')}</tbody></table>`)).join('');
}

/* ---------- 탭·시작 ---------- */
let currentTab = 'entry';
const RENDER = { entry: renderEntry, list: renderList, stats: renderStats, data: renderData };
function showTab(t) {
  currentTab = t;
  $$('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $$('.panel').forEach(p => { p.hidden = p.id !== `tab-${t}`; });
  RENDER[t]();
}
function renderBadge() {
  const n = records.filter(r => r.status === '처리중').length;
  const b = $('#pendingBadge');
  b.hidden = !n; b.textContent = n;
}
function renderBackupNotice() {
  const el = $('#backupNotice');
  const last = meta.lastBackup ? new Date(meta.lastBackup) : null;
  const need = records.some(r => r.source !== 'demo') && (!last || Date.now() - last.getTime() > 7 * 86400000);
  const y = new Date().getFullYear();
  const noHoliday = !holidayList().some(d => d.startsWith(`${y}-`));
  const msgs = [];
  if (need) msgs.push(`백업한 지 ${last ? '7일이 넘었습니다' : '아직 없습니다'}. [가져오기·내보내기]에서 백업 파일을 저장하세요.`);
  if (noHoliday) msgs.push(`${y}년 공휴일이 없어 소요기간이 주말만 빼고 계산됩니다. [가져오기·내보내기]에서 공휴일을 추가하세요.`);
  el.hidden = !msgs.length;
  el.textContent = msgs.join(' ');
}
function afterChange() {
  renderBadge(); renderBackupNotice();
  if (currentTab !== 'entry') RENDER[currentTab]();
}
async function start() {
  $$('.tab').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
  try {
    db = await openDb();
    records = await getAll('records');
    (await getAll('meta')).forEach(m => { meta[m.k] = m.v; });
    await seedDemo();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (err) {
    document.querySelector('main').innerHTML = `<p class="err">브라우저 저장소를 열 수 없어 시작하지 못했습니다. Edge 일반 창에서 다시 열어 주세요. (${esc(err.message)})</p>`;
    return;
  }
  renderBadge(); renderBackupNotice();
  showTab('entry');
}
start();
