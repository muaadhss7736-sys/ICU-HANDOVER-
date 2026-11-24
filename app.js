'use strict';
/* IBN SINA ICU HANDOVER - all data stays on this device (IndexedDB). No network calls are made with patient data. */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
const fmt = ts => new Date(ts).toLocaleString();
const DEV = { name: 'MUAADH SAEED AL-SAKOTI', email: 'muaadh.s.s7736@gmail.com', phone: '771491753' };
const credit = () => `<div class="credit"><div class="dby">Developed by</div><div class="dname">${DEV.name}</div><div class="dc">Email: ${DEV.email}</div><div class="dc">Phone: ${DEV.phone}</div></div>`;
const SYSTEMS = [['neuro', 'Neuro (sedation, GCS, pupils)'], ['cv', 'Cardiovascular (rhythm, inotropes)'], ['resp', 'Respiratory (vent settings, O2)'],
  ['renal', 'Renal / fluids (UO, balance, RRT)'], ['gi', 'GI / nutrition'], ['endo', 'Endocrine / glucose'], ['id', 'Infection (cultures, antibiotics)'],
  ['lines', 'Lines, tubes & drains'], ['meds', 'Key medications / infusions'], ['plan', 'Plan / to-do this shift'], ['pending', 'Pending results / escalation']];
const VITALS = [['hr', 'HR'], ['bp', 'BP'], ['rr', 'RR'], ['spo2', 'SpO2 %'], ['temp', 'Temp °C'], ['gcs', 'GCS']];
const LABS = ['Hb', 'WBC', 'Plt', 'Na', 'K', 'Cr', 'Urea', 'Glucose', 'Lactate', 'pH', 'pCO2', 'pO2', 'HCO3', 'CRP', 'Bili', 'INR'];

/* ---------- local database ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('ibnsina-icu', 1);
      r.onupgradeneeded = () => { const d = r.result; for (const s of ['patients', 'docs', 'shifts']) if (!d.objectStoreNames.contains(s)) { const st = d.createObjectStore(s, { keyPath: 'id' }); if (s !== 'patients') st.createIndex('pid', 'pid'); } };
      r.onsuccess = () => { this.db = r.result; res(); }; r.onerror = () => rej(r.error);
    });
  },
  req(store, mode, fn) { return new Promise((res, rej) => { const t = this.db.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); },
  all(s) { return this.req(s, 'readonly', o => o.getAll()); },
  get(s, id) { return this.req(s, 'readonly', o => o.get(id)); },
  put(s, v) { return this.req(s, 'readwrite', o => o.put(v)); },
  del(s, id) { return this.req(s, 'readwrite', o => o.delete(id)); },
  byPid(s, pid) { return this.req(s, 'readonly', o => o.index('pid').getAll(pid)); }
};

/* ---------- helpers ---------- */
const main = () => $('#main');
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2400); }
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div>${html}</div>`;
  m.onclick = e => { if (e.target === m) m.remove(); }; document.body.append(m); m.close = () => m.remove(); return m;
}
const go = h => { location.hash = h; };
const blankPatient = () => ({ id: uid(), bed: '', name: '', age: '', sex: '', mrn: '', dx: '', allergies: '', code: 'Full code', isolation: 'None', status: 'active', admitted: today(), h: {}, v: {}, l: {}, created: Date.now() });
function setPath(o, path, val) { const k = path.split('.'); let c = o; while (k.length > 1) { const n = k.shift(); c = c[n] = c[n] || {}; } c[k[0]] = val; }
async function download(bytes, name, type) {
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) { // inside the Android APK: save to cache then open the share sheet
    try {
      const u8 = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes; let bin = ''; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
      const FS = cap.registerPlugin('Filesystem'), SH = cap.registerPlugin('Share');
      await FS.writeFile({ path: name, data: btoa(bin), directory: 'CACHE' }); const r = await FS.getUri({ path: name, directory: 'CACHE' });
      await SH.share({ title: name, url: r.uri, dialogTitle: 'Save or share' }); return;
    } catch (e) { console.warn('native save failed', e); }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

/* ---------- PDF report ---------- */
function reportPDF(patients, meta, filename) {
  const it = [{ t: 'IBN SINA ICU HANDOVER', s: 18, b: 1 }, { t: `${meta.shift} shift  |  ${meta.date}  |  From: ${meta.from || '-'}  To: ${meta.to || '-'}`, s: 10, gap: 2 }, { t: `Generated ${fmt(Date.now())}`, s: 8, rule: 1 }];
  patients.forEach((p, n) => {
    it.push({ t: `Bed ${p.bed || '-'}  -  ${p.name || 'Unnamed'}`, s: 13, b: 1, gap: n ? 12 : 6 });
    it.push({ t: `${p.age ? p.age + 'y' : ''} ${p.sex || ''}   MRN: ${p.mrn || '-'}   Admitted: ${p.admitted || '-'}${p.status === 'discharged' ? '   (DISCHARGED)' : ''}`, s: 9 });
    it.push({ t: `Diagnosis: ${p.dx || '-'}`, s: 10 }, { t: `Allergies: ${p.allergies || 'None recorded'}   |   Code status: ${p.code}   |   Isolation: ${p.isolation}`, s: 10 });
    const v = VITALS.filter(([k]) => p.v?.[k]).map(([k, l]) => `${l} ${p.v[k]}`).join('   ');
    const l = LABS.filter(k => p.l?.[k]).map(k => `${k} ${p.l[k]}`).join('   ');
    if (v) it.push({ t: 'Vitals: ' + v, s: 10, gap: 3 }); if (l) it.push({ t: 'Labs: ' + l, s: 10 });
    for (const [k, lab] of SYSTEMS) if (p.h?.[k]) it.push({ t: lab, s: 9, b: 1, gap: 4 }, { t: p.h[k], s: 10, i: 8 });
    it.push({ rule: 1, gap: 4 });
  });
  if (!patients.length) it.push({ t: 'No patients selected.', s: 10 });
  const bytes = PDFW.makePDF(it, [{ t: 'Developed by' }, { t: DEV.name, b: 1 }, { t: 'Email: ' + DEV.email }, { t: 'Phone: ' + DEV.phone }]);
  download(bytes, filename, 'application/pdf');
}

/* ---------- OCR ---------- */
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
async function runOCR(canvas, stat) {
  if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js').catch(() => {});
  if (window.Tesseract) {
    try {
      const w = await Tesseract.createWorker('eng', 1, { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/', langPath: 'vendor/tesseract/lang', workerBlobURL: false, logger: m => stat(`${m.status} ${Math.round((m.progress || 0) * 100)}%`) });
      const r = await w.recognize(canvas); await w.terminate(); return { text: r.data.text, engine: 'Tesseract (on-device)' };
    } catch (e) { console.warn('Tesseract failed', e); }
  }
  if ('TextDetector' in window) { try { const r = await new TextDetector().detect(canvas); if (r.length) return { text: r.map(x => x.rawValue).join('\n'), engine: 'Browser text detector' }; } catch (e) { } }
  return { text: '', engine: null };
}
function toCanvas(src, max = 1800) {
  const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c;
}
function enhance(c) { // grayscale + contrast stretch for better OCR
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const x = o.getContext('2d'); x.drawImage(c, 0, 0);
  const d = x.getImageData(0, 0, o.width, o.height), p = d.data; let lo = 255, hi = 0;
  for (let i = 0; i < p.length; i += 4) { const g = .299 * p[i] + .587 * p[i + 1] + .114 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = g; if (g < lo) lo = g; if (g > hi) hi = g; }
  const s = 255 / Math.max(1, hi - lo); for (let i = 0; i < p.length; i += 4) p[i] = p[i + 1] = p[i + 2] = Math.max(0, Math.min(255, (p[i] - lo) * s));
  x.putImageData(d, 0, 0); return o;
}

/* ---------- views ---------- */
let stream = null;
function stopCam() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }

const board = { q: '', all: false };
function card(p) {
  return `<div class="card pc ${p.status === 'discharged' ? 'dis' : ''}" data-open="${p.id}"><div class="bed">BED ${esc(p.bed || '-')}</div><div class="nm">${esc(p.name || 'Unnamed patient')}</div>
  <div class="small muted">${esc([p.age && p.age + 'y', p.sex, p.mrn && 'MRN ' + p.mrn].filter(Boolean).join(' · '))}</div><div class="small">${esc(p.dx || '')}</div>
  <span class="chip ${p.code !== 'Full code' ? 'red' : ''}">${esc(p.code)}</span>${p.allergies ? `<span class="chip red">Allergy: ${esc(p.allergies)}</span>` : ''}${p.isolation && p.isolation !== 'None' ? `<span class="chip gray">${esc(p.isolation)}</span>` : ''}
  <div class="small muted">${VITALS.filter(([k]) => p.v?.[k]).map(([k, l]) => `${l} ${esc(p.v[k])}`).join(' · ')}</div></div>`;
}
async function boardView() {
  const ps = (await DB.all('patients')).sort((a, b) => String(a.bed).localeCompare(String(b.bed), undefined, { numeric: true }));
  const grid = () => { const q = board.q.toLowerCase(); const l = ps.filter(p => (board.all || p.status !== 'discharged') && (!q || [p.name, p.bed, p.mrn, p.dx].join(' ').toLowerCase().includes(q)));
    $('#grid').innerHTML = l.map(card).join('') || '<p class="muted">No patients yet. Tap “+ Add patient”.</p>'; $('#cnt').textContent = `${ps.filter(p => p.status !== 'discharged').length} active patients`; };
  main().innerHTML = `<h2>ICU Board <span class="small muted" id="cnt"></span></h2><div class="bar"><input id="q" placeholder="Search name, bed, MRN, diagnosis" value="${esc(board.q)}"><button class="btn" id="add">+ Add patient</button></div>
  <label class="ck"><input type="checkbox" id="sa" ${board.all ? 'checked' : ''}> Show discharged</label><div class="grid" id="grid"></div>`;
  grid(); $('#q').oninput = e => { board.q = e.target.value; grid(); }; $('#sa').onchange = e => { board.all = e.target.checked; grid(); };
  $('#add').onclick = () => go('#/p/new'); $('#grid').onclick = e => { const c = e.target.closest('[data-open]'); if (c) go('#/p/' + c.dataset.open); };
}

async function profileView(id) {
  let p = id === 'new' ? blankPatient() : await DB.get('patients', id), isNew = id === 'new';
  if (!p) return go('#/');
  const docs = isNew ? [] : (await DB.byPid('docs', p.id)).sort((a, b) => b.ts - a.ts);
  const shifts = isNew ? [] : (await DB.byPid('shifts', p.id)).sort((a, b) => b.ts - a.ts);
  const inp = (path, label, val, t = 'text') => `<div><label>${label}</label><input type="${t}" data-f="${path}" value="${esc(val)}"></div>`;
  main().innerHTML = `<h2>${isNew ? 'New patient' : esc(p.name || 'Patient')}</h2>
  <div class="card"><h3>Details</h3><div class="f2">${inp('bed', 'Bed', p.bed)}${inp('mrn', 'MRN / file no.', p.mrn)}</div>${inp('name', 'Full name', p.name)}
  <div class="f3">${inp('age', 'Age', p.age, 'number')}<div><label>Sex</label><select data-f="sex">${['', 'Male', 'Female'].map(o => `<option ${p.sex === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>${inp('admitted', 'Admitted', p.admitted, 'date')}</div>
  ${inp('dx', 'Diagnosis / problem', p.dx)}${inp('allergies', 'Allergies', p.allergies)}
  <div class="f2"><div><label>Code status</label><select data-f="code">${['Full code', 'DNAR', 'Limited escalation'].map(o => `<option ${p.code === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
  <div><label>Isolation</label><select data-f="isolation">${['None', 'Contact', 'Droplet', 'Airborne', 'Reverse'].map(o => `<option ${p.isolation === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div></div>
  <div class="card"><h3>Latest vitals</h3><div class="f3">${VITALS.map(([k, l]) => inp('v.' + k, l, p.v[k] ?? '')).join('')}</div>
  <h3>Latest labs</h3><div class="f3">${LABS.map(k => inp('l.' + k, k, p.l[k] ?? '')).join('')}</div></div>
  <div class="card"><h3>ICU handover notes</h3>${SYSTEMS.map(([k, l]) => `<label>${l}</label><textarea data-f="h.${k}">${esc(p.h[k] || '')}</textarea>`).join('')}</div>
  <div class="row"><button class="btn" id="save">Save patient</button>${isNew ? '' : `<button class="btn alt" id="scan">📷 Scan document</button><button class="btn gold" id="snap">Save to shift history</button><button class="btn ghost" id="pdf">PDF report</button>`}</div>
  ${isNew ? '' : `<div class="card"><h3>Scanned documents (${docs.length})</h3>${docs.map(d => `<div class="doc"><img src="${d.img}" alt=""><div class="small"><b>${fmt(d.ts)}</b><br>${esc((d.text || '').slice(0, 70))}</div><button class="btn sm ghost" data-view="${d.id}">View</button><button class="btn sm red" data-deldoc="${d.id}">Delete</button></div>`).join('') || '<p class="muted small">No documents yet.</p>'}</div>
  <div class="card"><h3>Shift history (${shifts.length})</h3>${shifts.map(s => `<div class="doc"><div class="small"><b>${esc(s.shift)} · ${esc(s.date)}</b><br>${esc(s.from || '-')} → ${esc(s.to || '-')}</div><button class="btn sm ghost" data-pdfs="${s.id}">PDF</button></div>`).join('') || '<p class="muted small">No saved handovers yet.</p>'}</div>
  <div class="row"><button class="btn ghost" id="dis">${p.status === 'discharged' ? 'Re-admit patient' : 'Discharge patient'}</button><button class="btn red" id="del">Delete patient & all records</button></div>`}`;
  const collect = () => { document.querySelectorAll('[data-f]').forEach(el => setPath(p, el.dataset.f, el.value.trim())); return p; };
  const save = async () => { collect(); if (!p.name && !p.bed) { toast('Enter a name or bed'); return false; } await DB.put('patients', p); return true; };
  $('#save').onclick = async () => { if (await save()) { toast('Saved'); if (isNew) go('#/p/' + p.id); } };
  if (isNew) return;
  $('#scan').onclick = async () => { if (await save()) go('#/scan/' + p.id); };
  $('#pdf').onclick = async () => { collect(); reportPDF([p], { shift: 'Current', date: today(), from: '', to: '' }, `handover-${(p.name || p.bed).replace(/\W+/g, '_')}.pdf`); };
  $('#snap').onclick = async () => { if (await save()) shiftModal([p.id]); };
  $('#dis').onclick = async () => { collect(); p.status = p.status === 'discharged' ? 'active' : 'discharged'; await DB.put('patients', p); toast('Updated'); route(); };
  $('#del').onclick = async () => { if (!confirm('Permanently delete this patient and all their documents and handover history?')) return; for (const d of docs) await DB.del('docs', d.id); for (const s of shifts) await DB.del('shifts', s.id); await DB.del('patients', p.id); go('#/'); };
  main().onclick = async e => {
    const t = e.target; if (t.dataset.view) { const d = docs.find(x => x.id === t.dataset.view); modal(`<h3>Document ${fmt(d.ts)}</h3><img src="${d.img}"><pre class="small" style="white-space:pre-wrap">${esc(d.text)}</pre><button class="btn" onclick="this.closest('.modal').remove()">Close</button>`); }
    if (t.dataset.deldoc && confirm('Delete this document?')) { await DB.del('docs', t.dataset.deldoc); route(); }
    if (t.dataset.pdfs) { const s = shifts.find(x => x.id === t.dataset.pdfs); reportPDF([s.snapshot], s, `handover-${s.date}-${s.shift}.pdf`); }
  };
}

async function saveShift(pids, meta) {
  for (const pid of pids) { const p = await DB.get('patients', pid); if (p) await DB.put('shifts', { id: uid(), pid, ts: Date.now(), shift: meta.shift, date: meta.date, from: meta.from, to: meta.to, snapshot: JSON.parse(JSON.stringify(p)) }); }
  localStorage.setItem('lastShift', JSON.stringify({ from: meta.from, to: meta.to }));
}
const shiftForm = () => { const l = JSON.parse(localStorage.getItem('lastShift') || '{}'); const h = new Date().getHours();
  return `<div class="f2"><div><label>Shift</label><select id="sh"><option ${h >= 7 && h < 19 ? 'selected' : ''}>Day</option><option ${h >= 7 && h < 19 ? '' : 'selected'}>Night</option></select></div><div><label>Date</label><input type="date" id="sd" value="${today()}"></div>
  <div><label>Handing over (from)</label><input id="sf" value="${esc(l.to || '')}"></div><div><label>Receiving (to)</label><input id="st"></div></div>`; };
const readShift = () => ({ shift: $('#sh').value, date: $('#sd').value, from: $('#sf').value.trim(), to: $('#st').value.trim() });
function shiftModal(pids) {
  const m = modal(`<h3>Save handover to shift history</h3>${shiftForm()}<div class="row"><button class="btn" id="ok">Save</button><button class="btn ghost" id="no">Cancel</button></div>`);
  $('#no', m).onclick = () => m.close(); $('#ok', m).onclick = async () => { await saveShift(pids, readShift()); m.close(); toast('Saved to shift history'); };
}

async function handoverView() {
  const ps = (await DB.all('patients')).filter(p => p.status !== 'discharged').sort((a, b) => String(a.bed).localeCompare(String(b.bed), undefined, { numeric: true }));
  main().innerHTML = `<h2>Shift handover</h2><div class="card">${shiftForm()}</div><div class="card"><h3>Patients included</h3>
  ${ps.map(p => `<label class="ck"><input type="checkbox" class="pk" value="${p.id}" checked> Bed ${esc(p.bed || '-')} — ${esc(p.name)} <a href="#/p/${p.id}" class="small">edit</a></label>`).join('') || '<p class="muted">No active patients.</p>'}</div>
  <div class="row"><button class="btn gold" id="sv">Save to shift history</button><button class="btn" id="wp">Ward PDF report</button></div>`;
  const sel = () => [...document.querySelectorAll('.pk:checked')].map(c => c.value);
  $('#sv').onclick = async () => { const s = sel(); if (!s.length) return toast('Select patients'); await saveShift(s, readShift()); toast(`Saved ${s.length} handover(s)`); };
  $('#wp').onclick = () => { const m = readShift(); reportPDF(ps.filter(p => sel().includes(p.id)), m, `ICU-handover-${m.date}-${m.shift}.pdf`); };
}

async function historyView() {
  const all = (await DB.all('shifts')).sort((a, b) => b.ts - a.ts);
  main().innerHTML = `<h2>Shift history</h2><input id="hq" placeholder="Search patient, date, nurse"><div id="hl"></div>`;
  const draw = () => { const q = $('#hq').value.toLowerCase(); const l = all.filter(s => !q || [s.snapshot.name, s.snapshot.bed, s.date, s.shift, s.from, s.to].join(' ').toLowerCase().includes(q));
    $('#hl').innerHTML = l.map(s => `<div class="card"><b>${esc(s.snapshot.name || 'Unnamed')}</b> <span class="muted">Bed ${esc(s.snapshot.bed)}</span><div class="small muted">${esc(s.shift)} shift · ${esc(s.date)} · ${esc(s.from || '-')} → ${esc(s.to || '-')}</div><div class="small">${esc(s.snapshot.dx || '')}</div>
    <div class="row"><button class="btn sm ghost" data-v="${s.id}">View</button><button class="btn sm" data-p="${s.id}">PDF</button><button class="btn sm red" data-d="${s.id}">Delete</button></div></div>`).join('') || '<p class="muted">No saved handovers yet.</p>'; };
  draw(); $('#hq').oninput = draw;
  $('#hl').onclick = async e => { const t = e.target, f = id => all.find(s => s.id === id);
    if (t.dataset.p) { const s = f(t.dataset.p); reportPDF([s.snapshot], s, `handover-${s.date}-${s.shift}.pdf`); }
    if (t.dataset.v) { const s = f(t.dataset.v), p = s.snapshot; modal(`<h3>${esc(p.name)} — Bed ${esc(p.bed)}</h3><p class="small muted">${esc(s.shift)} · ${esc(s.date)} · ${esc(s.from)} → ${esc(s.to)}</p><p class="small">${esc(p.dx)}<br>Allergies: ${esc(p.allergies || 'none')} · ${esc(p.code)}</p>
      ${SYSTEMS.filter(([k]) => p.h?.[k]).map(([k, l]) => `<div class="small"><b>${l}</b><br>${esc(p.h[k])}</div>`).join('')}<br><button class="btn" onclick="this.closest('.modal').remove()">Close</button>`); }
    if (t.dataset.d && confirm('Delete this history entry?')) { await DB.del('shifts', t.dataset.d); route(); } };
}


let dashTimer = null;
async function dashboardView() {
  const mask = () => localStorage.getItem('dashMask') !== '0';
  const draw = async () => {
    const ps = (await DB.all('patients')).filter(p => p.status !== 'discharged').sort((a, b) => String(a.bed).localeCompare(String(b.bed), undefined, { numeric: true }));
    const last = {}; (await DB.all('shifts')).forEach(x => { if (!last[x.pid] || x.ts > last[x.pid]) last[x.pid] = x.ts; });
    const n = v => parseFloat(v);
    const alerts = p => { const a = [], v = p.v || {}, l = p.l || {};
      if (n(v.spo2) < 92) a.push('SpO2 ' + v.spo2); if (n(v.hr) > 120 || n(v.hr) < 50) a.push('HR ' + v.hr); if (n(v.temp) >= 38.0) a.push('Temp ' + v.temp);
      const sb = parseInt((v.bp || '').split('/')[0]); if (sb && sb < 90) a.push('BP ' + v.bp); if (n(l.Lactate) > 2) a.push('Lactate ' + l.Lactate); if (n(l.K) > 5.5 || n(l.K) < 3) a.push('K ' + l.K); return a; };
    const nm = p => mask() ? (p.name || '').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + '.').join(' ') || '—' : p.name || 'Unnamed';
    const al = ps.map(alerts), crit = al.filter(a => a.length).length;
    const stat = (t, v, c = '') => `<div class="card" style="text-align:center;margin:0"><div style="font-size:26px;font-weight:700;color:${c || 'var(--navy)'}">${v}</div><div class="small muted">${t}</div></div>`;
    $('#dbody').innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));margin-bottom:12px">${stat('Active patients', ps.length)}${stat('With alerts', crit, crit ? 'var(--red)' : '')}${stat('DNAR / limited', ps.filter(p => p.code !== 'Full code').length)}${stat('Isolation', ps.filter(p => p.isolation && p.isolation !== 'None').length)}${stat('Allergies', ps.filter(p => p.allergies).length)}</div>
    <div class="grid">${ps.map((p, i) => `<div class="card pc" style="border-left-color:${al[i].length ? 'var(--red)' : 'var(--teal)'}"><div class="bed">BED ${esc(p.bed || '-')}</div><div class="nm">${esc(nm(p))}</div><div class="small muted">${esc([p.age && p.age + 'y', p.sex].filter(Boolean).join(' · '))}</div><div class="small">${esc(p.dx || '')}</div>
      <span class="chip ${p.code !== 'Full code' ? 'red' : ''}">${esc(p.code)}</span>${p.allergies ? '<span class="chip red">Allergy</span>' : ''}${p.isolation && p.isolation !== 'None' ? `<span class="chip gray">${esc(p.isolation)}</span>` : ''}
      ${al[i].map(x => `<span class="chip red">⚠ ${esc(x)}</span>`).join('')}<div class="small muted" style="margin-top:6px">${VITALS.filter(([k]) => p.v?.[k]).map(([k, l]) => `${l} ${esc(p.v[k])}`).join(' · ')}</div>
      <div class="small muted">Last handover: ${last[p.id] ? fmt(last[p.id]) : 'none'}</div></div>`).join('') || '<p class="muted">No active patients.</p>'}</div><p class="small muted">Updated ${new Date().toLocaleTimeString()} · refreshes every 30 s · view only</p>`;
  };
  main().innerHTML = `<h2>Ward Dashboard</h2><div class="row"><label class="ck" style="margin:0"><input type="checkbox" id="mk" ${mask() ? 'checked' : ''}> Hide patient names (initials only)</label><button class="btn sm alt" id="fs">Full screen</button></div><div id="dbody"></div>`;
  await draw(); $('#mk').onchange = e => { localStorage.setItem('dashMask', e.target.checked ? '1' : '0'); draw(); };
  $('#fs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  dashTimer = setInterval(draw, 30000);
}

async function scanView(pid) {
  const p = await DB.get('patients', pid); if (!p) return go('#/');
  const cur = { img: null, canvas: null, ext: null };
  main().innerHTML = `<h2>Scan document</h2><p class="small muted">${esc(p.name)} · Bed ${esc(p.bed)} — images are processed on this device only.</p>
  <div class="card"><video id="vid" playsinline muted hidden></video><img id="prev" alt="" hidden><div class="row"><button class="btn alt" id="cam">Start camera</button><button class="btn gold" id="snap" hidden>Capture</button>
  <label class="btn ghost">Take / choose photo<input type="file" accept="image/*" capture="environment" id="file" hidden></label></div></div>
  <div class="card"><div class="row"><button class="btn" id="ocr">Run OCR</button><span class="small muted" id="st"></span></div>
  <label>Recognised / typed text (you can edit or paste text here)</label><textarea id="txt" style="min-height:140px"></textarea><div class="row"><button class="btn alt" id="ext">Extract structured data</button></div><div id="out"></div></div>
  <div class="row"><button class="btn" id="apply" disabled>Apply to patient & save</button><button class="btn ghost" id="sd">Save document only</button><button class="btn ghost" id="back">Back</button></div>`;
  const setImg = src => { cur.canvas = toCanvas(src); cur.img = cur.canvas.toDataURL('image/jpeg', .8); $('#prev').src = cur.img; $('#prev').hidden = false; $('#vid').hidden = true; $('#snap').hidden = true; stopCam(); };
  $('#cam').onclick = async () => { try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false }); const v = $('#vid'); v.srcObject = stream; await v.play(); v.hidden = false; $('#prev').hidden = true; $('#snap').hidden = false; } catch (e) { toast('Camera unavailable: use “Take / choose photo”'); } };
  $('#snap').onclick = () => setImg($('#vid'));
  $('#file').onchange = e => { const f = e.target.files[0]; if (!f) return; const im = new Image(); im.onload = () => { setImg(im); URL.revokeObjectURL(im.src); }; im.src = URL.createObjectURL(f); };
  $('#ocr').onclick = async () => {
    if (!cur.canvas) return toast('Capture or choose an image first');
    $('#st').textContent = 'Reading…'; const r = await runOCR(enhance(cur.canvas), s => $('#st').textContent = s);
    if (r.engine) { $('#txt').value = r.text; $('#st').textContent = 'Done · ' + r.engine; $('#ext').click(); }
    else $('#st').textContent = 'OCR engine not installed (run setup_ocr.py once). Type or paste the text instead.';
  };
  $('#ext').onclick = () => {
    const x = cur.ext = Parser.extract($('#txt').value); const row = (g, k, v) => `<tr><td>${k}</td><td><input data-g="${g}" data-k="${k}" value="${esc(v)}"></td></tr>`;
    const rows = [...Object.entries(x.vitals).map(([k, v]) => row('v', k, v)), ...Object.entries(x.labs).map(([k, v]) => row('l', k, v))].join('');
    $('#out').innerHTML = `<h3>Extracted data (edit before applying)</h3>${rows ? `<table class="t">${rows}</table>` : '<p class="muted small">No vitals or labs recognised.</p>'}
    ${x.meds.length ? `<h3>Medication lines</h3>${x.meds.map(m => `<label class="ck"><input type="checkbox" class="mk" value="${esc(m)}" checked> ${esc(m)}</label>`).join('')}` : ''}
    ${Object.keys(x.patient).length ? `<p class="small muted">Document header: ${esc(JSON.stringify(x.patient))} (not applied automatically)</p>` : ''}`;
    $('#apply').disabled = false;
  };
  const saveDoc = async applied => { if (!cur.img && !$('#txt').value.trim()) { toast('Nothing to save'); return false; }
    await DB.put('docs', { id: uid(), pid, ts: Date.now(), img: cur.img || '', text: $('#txt').value, extracted: cur.ext, applied }); return true; };
  $('#sd').onclick = async () => { if (await saveDoc(false)) { toast('Document saved'); go('#/p/' + pid); } };
  $('#apply').onclick = async () => {
    document.querySelectorAll('[data-g]').forEach(i => { const v = i.value.trim(); if (v) p[i.dataset.g][i.dataset.k] = v; });
    const meds = [...document.querySelectorAll('.mk:checked')].map(c => c.value).filter(m => !(p.h.meds || '').includes(m));
    if (meds.length) p.h.meds = ((p.h.meds ? p.h.meds + '\n' : '') + meds.join('\n'));
    await DB.put('patients', p); if (await saveDoc(true)) { toast('Applied and saved'); go('#/p/' + pid); }
  };
  $('#back').onclick = () => go('#/p/' + pid);
}

async function aboutView() {
  const [pc, dc, sc] = await Promise.all(['patients', 'docs', 'shifts'].map(s => DB.all(s).then(a => a.length)));
  main().innerHTML = `<h2>About the Application</h2><div class="card"><p><b>IBN SINA ICU HANDOVER</b> is an offline-first ICU shift handover tool: patient profiles, document scanning with on-device OCR and structured extraction, shift history and PDF handover reports.</p>
  <p class="small muted">All patient data is stored only in this device’s browser database. Nothing is sent to any server. It is a documentation aid and does not replace clinical judgement or the official medical record.</p></div>
  <div class="card"><h3>Developer</h3>${credit().replace('class="credit"', 'class="credit" style="border:0"').replace(/class="dc"/g, 'class="dc" style="display:block"')}</div>
  <div class="card"><h3>Application credits</h3><p class="small">Design, development and maintenance: <b>${DEV.name}</b><br>OCR engine (optional, bundled locally): Tesseract.js — Apache-2.0 licence.<br>Version 1.0.0</p></div>
  <div class="card"><h3>Data & backup</h3><p class="small muted">${pc} patients · ${dc} documents · ${sc} handover records stored on this device.</p><div class="row"><button class="btn" id="exp">Export backup</button>
  <label class="btn ghost">Import backup<input type="file" accept=".json" id="imp" hidden></label></div><p class="small muted">Import merges records by ID and never deletes existing data. Keep backups in a safe place — they contain patient information.</p></div>`;
  $('#exp').onclick = async () => { const o = { app: 'ibn-sina-icu', v: 1, ts: Date.now(), patients: await DB.all('patients'), docs: await DB.all('docs'), shifts: await DB.all('shifts') }; download(JSON.stringify(o), `ibn-sina-icu-backup-${today()}.json`, 'application/json'); };
  $('#imp').onchange = async e => { try { const o = JSON.parse(await e.target.files[0].text()); if (o.app !== 'ibn-sina-icu') throw 0; let n = 0; for (const s of ['patients', 'docs', 'shifts']) for (const r of o[s] || []) { await DB.put(s, r); n++; } toast(`Imported ${n} records`); route(); } catch { toast('Invalid backup file'); } };
}

/* ---------- router ---------- */
async function route() {
  stopCam(); clearInterval(dashTimer); main().onclick = null;
  const [v, a] = (location.hash.slice(2) || '').split('/'); const views = { '': boardView, p: profileView, scan: scanView, handover: handoverView, history: historyView, dashboard: dashboardView, about: aboutView };
  document.body.dataset.view = v || 'board'; $('#footer').innerHTML = credit();
  document.querySelectorAll('.nav a').forEach(x => x.classList.toggle('on', x.dataset.nav === (v === 'p' || v === 'scan' || v === '' ? 'board' : v)));
  try { await (views[v] || boardView)(a); } catch (e) { console.error(e); main().innerHTML = `<div class="card">Something went wrong: ${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}

(async function init() {
  await DB.open();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  const upd = () => $('#offline').hidden = navigator.onLine; addEventListener('online', upd); addEventListener('offline', upd); upd();
  addEventListener('hashchange', route);
  $('#wcredit').innerHTML = credit(); $('#welcome').hidden = false; $('#enter').onclick = () => { $('#welcome').hidden = true; };
  await route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
})();
