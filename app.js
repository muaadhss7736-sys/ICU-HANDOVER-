'use strict';
/* IBN SINA ICU HANDOVER - all data stays on this device (IndexedDB). No network calls are made with patient data. */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }; // local calendar day (not UTC)
const fmt = ts => new Date(ts).toLocaleString();
const DEV = { name: 'MUAADH SAEED AL-SAKOTI', email: 'muaadh.s.s7736@gmail.com', phone: '771491753' };
const credit = () => `<div class="credit"><div class="dby">Developed by</div><div class="dname">${DEV.name}</div><div class="dc">Email: ${DEV.email}</div><div class="dc">Phone: ${DEV.phone}</div></div>`;
const SYSTEMS = [['neuro', 'Neuro (sedation, GCS, pupils)'], ['cv', 'Cardiovascular (rhythm, inotropes)'], ['resp', 'Respiratory / airway (vent settings, O2)'],
  ['renal', 'Renal / fluids (UO, balance, RRT)'], ['gi', 'GI / nutrition'], ['endo', 'Endocrine / glucose'], ['id', 'Infection (cultures, antibiotics)'],
  ['lines', 'Lines, tubes & drains'], ['meds', 'Current medications / infusions (one per line)'], ['problems', 'Active problems'], ['imaging', 'Imaging findings (new)'],
  ['procedures', 'Procedures (new)'], ['events', 'Significant clinical events'], ['plan', 'Management plan / to-do this shift'], ['pending', 'Pending results / escalation']];
const VITALS = [['hr', 'HR'], ['bp', 'BP'], ['rr', 'RR'], ['spo2', 'SpO2 %'], ['temp', 'Temp °C'], ['gcs', 'GCS']];
const ABG = ['pH', 'pCO2', 'pO2', 'HCO3', 'Lactate'];
const LABS = ['Hb', 'WBC', 'Plt', 'Na', 'K', 'Cr', 'Urea', 'Glucose', 'CRP', 'Bili', 'INR'];

/* ---------- local database ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('ibnsina-icu', 2);
      r.onupgradeneeded = () => { const d = r.result; for (const s of ['patients', 'docs', 'shifts', 'tasks']) if (!d.objectStoreNames.contains(s)) { const st = d.createObjectStore(s, { keyPath: 'id' }); if (s !== 'patients') st.createIndex('pid', 'pid'); } };
      r.onsuccess = () => { this.db = r.result; res(); }; r.onerror = () => rej(r.error);
    });
  },
  req(store, mode, fn) { return new Promise((res, rej) => { const t = this.db.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Database write was aborted (device storage may be full)')); }); },
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
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const plug = n => (window.Capacitor.Plugins && window.Capacitor.Plugins[n]) || window.Capacitor.registerPlugin(n);
const cancelled = e => /cancel|abort|dismiss/i.test(String((e && (e.name + ' ' + e.message)) || e));
function diag(e, what) { // never fail silently: show the real error so it can be reported
  const names = window.Capacitor && window.Capacitor.Plugins ? Object.keys(window.Capacitor.Plugins).join(', ') : 'none';
  const m = modal(`<h3>${esc(what)} failed</h3><p class="small">${esc((e && e.message) || String(e))}</p><p class="small muted">Android plugins: ${esc(names)}</p><div class="row"><button class="btn" onclick="this.closest('.modal').remove()">Close</button></div>`); return m;
}
async function nativeSend(bytes, name) { // Android APK: write to cache, then open the system share sheet (Send / Save to Drive or Files)
  const u8 = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes; let bin = ''; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  const FS = plug('Filesystem'), SH = plug('Share'), w = await FS.writeFile({ path: name, data: btoa(bin), directory: 'CACHE' });
  const uri = (w && w.uri) || (await FS.getUri({ path: name, directory: 'CACHE' })).uri;
  try { await SH.share({ title: name, files: [uri], dialogTitle: 'Send or save' }); }
  catch (e) { if (cancelled(e)) return; await SH.share({ title: name, url: uri, dialogTitle: 'Send or save' }); }
}
async function download(bytes, name, type) {
  if (isNative()) { try { await nativeSend(bytes, name); } catch (e) { if (!cancelled(e)) diag(e, 'Save / share'); } return; } // never falls back to a browser download (does nothing inside the APK)
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------- audit helpers ---------- */
let dirty = false, lastHash = location.hash || '#/', restoring = false, shiftBusy = false;
const jget = k => { try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
const putPatient = p => { p.updated = Date.now(); return DB.put('patients', p); };
const putTask = t => { t.mod = Date.now(); return DB.put('tasks', t); };
const RANGES = [['age', 0, 130, 'Age'], ['v.hr', 0, 350, 'HR'], ['v.rr', 0, 100, 'RR'], ['v.spo2', 0, 100, 'SpO2'], ['v.temp', 20, 45, 'Temp'], ['v.gcs', 3, 15, 'GCS']];
function validate(p) { // blocks only physically impossible / non-numeric entries (typos)
  const bad = [], get = k => k.includes('.') ? (p[k.split('.')[0]] || {})[k.split('.')[1]] : p[k];
  for (const [k, lo, hi, n] of RANGES) { const v = String(get(k) ?? '').trim(); if (v && !(/^\d+(\.\d+)?$/.test(v) && +v >= lo && +v <= hi)) bad.push(`${n} (${lo}-${hi})`); }
  const bp = String((p.v || {}).bp || '').trim(); if (bp && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(bp)) bad.push('BP (e.g. 120/80)');
  for (const k of [...LABS, ...ABG]) { const v = String((p.l || {})[k] ?? '').trim(); if (v && !/^[<>]?\d+(\.\d+)?$/.test(v)) bad.push(k); }
  if (/^\d/.test((p.l || {}).pH || '') && !(+p.l.pH >= 6 && +p.l.pH <= 8)) bad.push('pH (6-8)'); return bad;
}
const rtlFix = () => document.querySelectorAll('#main input:not([type=checkbox]):not([type=file]):not([type=date]):not([type=datetime-local]), #main textarea, .modal input, .modal textarea, #main .nm, #main .small, #main .chg, #main td, #main h2, .modal .small, .modal h3').forEach(e => { if (!e.hasAttribute('dir')) e.setAttribute('dir', 'auto'); });

/* ---------- v1.1 helpers ---------- */
const norm = p => { p.h = p.h || {}; p.v = p.v || {}; p.l = p.l || {}; p.t = p.t || {}; p.obs = p.obs || {}; p.cs = p.cs || ''; return p; };
const ago = ts => { if (!ts) return ''; const m = Math.round((Date.now() - ts) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const PR = { High: 0, Medium: 1, Low: 2 };
function touch(p, old) { // stamp the time a group of data was actually changed
  norm(p); const now = Date.now(), same = (a, b) => JSON.stringify(a) === JSON.stringify(b), pick = (o, ks) => ks.map(k => (o.l || {})[k] || '');
  if (!same(p.v, old.v || {})) p.t.v = now; if (!same(pick(p, ABG), pick(old, ABG))) p.t.abg = now; if (!same(pick(p, LABS), pick(old, LABS))) p.t.l = now;
  if ((p.h.meds || '') !== ((old.h || {}).meds || '')) p.t.meds = now; if ((p.cs || '') !== (old.cs || '')) p.t.cs = now;
}
function stamp(p, g, limitH, hasData) {
  if (!hasData) return ''; const rec = p.t[g], obs = p.obs[g] ? new Date(p.obs[g]).getTime() : 0, ref = obs || rec;
  if (!ref) return '<div class="ts old">⚠ Time not recorded (data from an earlier version)</div>';
  const old = Date.now() - ref > limitH * 36e5;
  return `<div class="ts ${old ? 'old' : ''}">Recorded: ${rec ? fmt(rec) : '—'}${obs ? ' · Observed: ' + fmt(obs) : ''} (${ago(ref)})${old ? ' ⚠ older than ' + limitH + ' h' : ''}</div>`;
}
const stTxt = (p, g) => { const r = p.t && p.t[g], o = p.obs && p.obs[g]; return r || o ? `  [${r ? 'Recorded ' + fmt(r) : ''}${o ? (r ? '; ' : '') + 'Observed ' + fmt(new Date(o).getTime()) : ''}]` : '  [time not recorded]'; };
async function taskCounts() { const c = {}; (await DB.all('tasks')).forEach(t => { if (!t.done) c[t.pid] = (c[t.pid] || 0) + 1; }); return c; }
async function prevShift(pid) { return (await DB.byPid('shifts', pid)).sort((a, b) => b.ts - a.ts)[0]; }
async function liveEntry(p) { norm(p); const all = await DB.byPid('tasks', p.id), pv = await prevShift(p.id); return { p, tasks: all.filter(t => !t.done), changes: pv ? Parser.changes(p, pv.snapshot, all, pv.ts) : null }; }
const histEntry = s => ({ p: s.snapshot, tasks: (s.tasks || []).filter(t => !t.done), changes: s.changes === undefined ? null : s.changes });

/* ---------- PDF report ---------- */
function reportPDF(entries, meta, filename) {
  const org = jget('org');
  const it = [{ t: 'IBN SINA ICU HANDOVER REPORT', s: 17, b: 1 }, { t: `${org.hosp || 'IBN SINA Hospital'}  -  ${org.dept || 'Intensive Care Unit'}`, s: 11, b: 1, gap: 2 },
    { t: `Shift: ${meta.shift}   Date: ${meta.date}   Printed: ${fmt(Date.now())}`, s: 9, gap: 2 }, { t: `Doctor handing over: ${meta.from || '-'}      Doctor receiving: ${meta.to || '-'}`, s: 10, rule: 1 }];
  const H = t => it.push({ t, s: 9.5, b: 1, gap: 5 }), T = (t, i = 6) => it.push({ t, s: 10, i });
  entries.forEach(({ p, tasks, changes }, n) => {
    norm(p); const h = p.h, J = ks => ks.filter(k => p.l[k]).map(k => `${k} ${p.l[k]}`).join('   ');
    it.push({ pb: n > 0, t: `Bed ${p.bed || '-'}  -  ${p.name || 'Unnamed'}`, s: 14, b: 1, gap: n ? 0 : 6 });
    H('PATIENT INFORMATION'); T(`${p.age ? p.age + ' y' : ''} ${p.sex || ''}   MRN: ${p.mrn || '-'}   Admitted: ${p.admitted || '-'}${p.status === 'discharged' ? '   (DISCHARGED)' : ''}`);
    T(`Allergies: ${p.allergies || 'Not recorded'}   |   Code status: ${p.code}   |   Isolation: ${p.isolation}`);
    H('DIAGNOSIS'); T(p.dx || '-');
    H('CLINICAL STATUS'); T(p.cs ? p.cs + stTxt(p, 'cs') : 'Not recorded');
    const v = VITALS.filter(([k]) => p.v[k]).map(([k, l]) => `${l} ${p.v[k]}`).join('   '); H('VITAL SIGNS'); T(v ? v + stTxt(p, 'v') : 'No vitals recorded');
    H('CURRENT MEDICATIONS'); T(h.meds ? h.meds + stTxt(p, 'meds') : '-');
    H('IMPORTANT INVESTIGATIONS'); const lb = J(LABS), ab = J(ABG);
    if (lb) T('Labs: ' + lb + stTxt(p, 'l')); if (ab) T('ABG / Lactate: ' + ab + stTxt(p, 'abg')); if (h.imaging) T('Imaging: ' + h.imaging); if (!lb && !ab && !h.imaging) T('-');
    H('PENDING TASKS'); if (tasks && tasks.length) tasks.forEach(t => T(`[ ] ${t.text}  (${t.priority}${t.due ? ', due ' + fmt(new Date(t.due).getTime()) : ''})`)); else T('None');
    H('CHANGES SINCE LAST SHIFT'); if (changes == null) T('No previous saved shift to compare.'); else if (!changes.length) T('No recorded changes.'); else changes.forEach(c => T(`${c.type}: ${c.text}`));
    H('MANAGEMENT PLAN'); T(h.plan || '-');
    const oth = SYSTEMS.filter(([k]) => !['meds', 'plan', 'imaging'].includes(k) && h[k]); if (oth.length) { H('OTHER HANDOVER NOTES'); oth.forEach(([k, l]) => T(l + ': ' + h[k])); }
    it.push({ rule: 1, gap: 2 });
  });
  if (!entries.length) it.push({ t: 'No patients selected.', s: 10 });
  const foot = [{ t: 'Developed by' }, { t: DEV.name, b: 1 }, { t: 'Email: ' + DEV.email }, { t: 'Phone: ' + DEV.phone }];
  pdfModal(PDFW.makePDFAuto(it, foot), filename, it.concat(foot).filter(x => x.t).map(x => x.t).join('\n'));
}
function copyText(text) {
  const fallback = () => { const a = document.createElement('textarea'); a.value = text; a.style.cssText = 'position:fixed;opacity:0'; document.body.append(a); a.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { } a.remove(); return ok; };
  return navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text).then(() => true, fallback) : Promise.resolve(fallback());
}
function pdfModal(bytes, name, text) {
  const m = modal(`<h3>PDF report ready</h3><p class="small muted">${esc(name)}</p><div class="row"><button class="btn gold" id="psh">Share / Send</button><button class="btn" id="psv">Save PDF</button><button class="btn alt" id="pst">Share text</button><button class="btn alt" id="pcp">Copy text</button><button class="btn ghost" id="pcl">Close</button></div>
  <p class="small muted">Share opens WhatsApp, email, etc. Copy text puts the report as plain text on the clipboard.</p>`);
  const save = () => download(bytes, name, 'application/pdf'), native = isNative;
  $('#psv', m).onclick = save; $('#pcl', m).onclick = () => m.close();
  $('#psh', m).onclick = async () => {
    if (native()) return save(); // the Android share sheet offers both send and save
    const f = new File([bytes], name, { type: 'application/pdf' });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: name }); else { await save(); toast('Sharing is not supported here — PDF saved instead'); } }
    catch (e) { if (e.name !== 'AbortError') { await save(); toast('Share failed — PDF saved instead'); } }
  };
  $('#pst', m).onclick = async () => { try { if (native()) await plug('Share').share({ title: name, text, dialogTitle: 'Send report' }); else if (navigator.share) await navigator.share({ title: name, text }); else toast((await copyText(text)) ? 'Sharing not supported — text copied' : 'Sharing not supported'); } catch (e) { if (!cancelled(e)) diag(e, 'Share text'); } };
  $('#pcp', m).onclick = async () => toast((await copyText(text)) ? 'Report text copied' : 'Copy failed');
}

/* ---------- OCR ---------- */
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error(what + ' timed out after ' + ms / 1000 + ' s')), ms))]);
const OCR_FILES = ['tesseract.min.js', 'worker.min.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js', 'lang/eng.traineddata'];
async function runOCR(canvas, stat) { // never swallows errors: the real reason is returned to the screen
  const errs = [];
  try {
    if (!window.Tesseract) await withTimeout(loadScript('vendor/tesseract/tesseract.min.js'), 20000, 'Loading OCR script').catch(() => { throw new Error('OCR engine files are missing from this build (vendor/tesseract/tesseract.min.js not found)'); });
    const w = await withTimeout(Tesseract.createWorker('eng', 1, { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/', langPath: 'vendor/tesseract/lang', gzip: false, workerBlobURL: false, logger: m => stat(`${m.status} ${Math.round((m.progress || 0) * 100)}%`) }), 90000, 'Starting the OCR engine');
    try { const r = await withTimeout(w.recognize(canvas), 180000, 'Reading the image'); return { text: r.data.text, engine: 'Tesseract (on-device)' }; } finally { w.terminate().catch(() => { }); }
  } catch (e) { errs.push((e && e.message) || String(e)); console.warn('OCR failed', e); }
  if ('TextDetector' in window) { try { const r = await new TextDetector().detect(canvas); if (r.length) return { text: r.map(x => x.rawValue).join('\n'), engine: 'Browser text detector' }; } catch (e) { errs.push('TextDetector: ' + e.message); } }
  return { text: '', engine: null, error: errs.join(' | ') };
}
async function ocrFilesStatus() { // is each OCR engine file really present (and not an HTML error page)?
  const out = [];
  for (const f of OCR_FILES) {
    try { const r = await fetch('vendor/tesseract/' + f, { cache: 'no-store' }); if (!r.ok) { out.push({ f, ok: false, note: 'HTTP ' + r.status }); continue; }
      const rd = r.body.getReader(), { value } = await rd.read(); rd.cancel(); const head = value ? new TextDecoder().decode(value.slice(0, 20)) : '';
      out.push({ f, ok: !!(value && value.length) && !/^\s*</.test(head), note: (value && /^\s*</.test(head)) ? 'got an HTML page instead of the file' : Math.round((+r.headers.get('content-length') || value.length) / 1024) + ' KB' });
    } catch (e) { out.push({ f, ok: false, note: e.message }); }
  }
  return out;
}
async function ocrDiagnose() {
  const m = modal('<h3>OCR engine check</h3><p class="small" id="oc1">Checking engine files…</p><div id="oc2"></div><p class="small" id="oc3"></p><div class="row"><button class="btn" onclick="this.closest(\'.modal\').remove()">Close</button></div>');
  const fs = await ocrFilesStatus(); $('#oc1', m).textContent = fs.every(x => x.ok) ? 'Engine files: all present ✔' : 'Engine files: MISSING ✖ (this build has no OCR engine)';
  $('#oc2', m).innerHTML = fs.map(x => `<div class="small">${x.ok ? '✔' : '✖'} ${esc(x.f)} — ${esc(x.note)}</div>`).join('');
  if (!fs.every(x => x.ok)) return; $('#oc3', m).textContent = 'Running a reading test…';
  const c = document.createElement('canvas'); c.width = 700; c.height = 110; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 700, 110); g.fillStyle = '#000'; g.font = '34px Arial, sans-serif'; g.fillText('HR 112   BP 95/58   SpO2 91%', 20, 65);
  const r = await runOCR(c, s => { $('#oc3', m).textContent = 'Reading test: ' + s; });
  $('#oc3', m).innerHTML = r.engine ? `Reading test ${/112/.test(r.text) && /95/.test(r.text) ? 'passed ✔' : 'ran but the text looks wrong ⚠'} (${esc(r.engine)}):<br><b>${esc(r.text.trim())}</b>` : `Reading test FAILED ✖<br>${esc(r.error)}`;
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
function card(p, n) {
  norm(p); const bad = /Det|Crit/.test(p.cs), old = p.t.v && Date.now() - p.t.v > 6 * 36e5;
  return `<div class="card pc ${p.status === 'discharged' ? 'dis' : ''}" data-open="${esc(p.id)}"><div class="bed">BED ${esc(p.bed || '-')}</div><div class="nm">${esc(p.name || 'Unnamed patient')}</div>
  <div class="small muted">${esc([p.age && p.age + 'y', p.sex, p.mrn && 'MRN ' + p.mrn].filter(Boolean).join(' · '))}</div><div class="small">${esc(p.dx || '')}</div>
  ${p.cs ? `<span class="chip ${bad ? 'red' : ''}">${esc(p.cs)}</span>` : ''}<span class="chip ${p.code !== 'Full code' ? 'red' : ''}">${esc(p.code)}</span>${p.allergies ? `<span class="chip red">Allergy: ${esc(p.allergies)}</span>` : ''}${p.isolation && p.isolation !== 'None' ? `<span class="chip gray">${esc(p.isolation)}</span>` : ''}${n ? `<span class="chip">${n} pending task${n > 1 ? 's' : ''}</span>` : ''}
  <div class="small muted">${VITALS.filter(([k]) => p.v?.[k]).map(([k, l]) => `${l} ${esc(p.v[k])}`).join(' · ')}</div>${Object.keys(p.v || {}).length ? `<div class="ts ${old || !p.t.v ? 'old' : ''}">Vitals: ${p.t.v ? ago(p.t.v) : 'time not recorded'}</div>` : ''}</div>`;
}

async function boardView() {
  const ps = (await DB.all('patients')).sort((a, b) => String(a.bed).localeCompare(String(b.bed), undefined, { numeric: true }));
  const tc = await taskCounts(); const grid = () => { const q = board.q.toLowerCase(); const l = ps.filter(p => (board.all || p.status !== 'discharged') && (!q || [p.name, p.bed, p.mrn, p.dx].join(' ').toLowerCase().includes(q)));
    $('#grid').innerHTML = l.map(p => card(p, tc[p.id] || 0)).join('') || '<p class="muted">No patients yet. Tap “+ Add patient”.</p>'; $('#cnt').textContent = `${ps.filter(p => p.status !== 'discharged').length} active patients`; };
  main().innerHTML = `<h2>ICU Board <span class="small muted" id="cnt"></span></h2><div class="bar"><input id="q" placeholder="Search name, bed, MRN, diagnosis" value="${esc(board.q)}"><button class="btn" id="add">+ Add patient</button></div>
  <label class="ck"><input type="checkbox" id="sa" ${board.all ? 'checked' : ''}> Show discharged</label><div class="grid" id="grid"></div>`;
  grid(); $('#q').oninput = e => { board.q = e.target.value; grid(); }; $('#sa').onchange = e => { board.all = e.target.checked; grid(); };
  $('#add').onclick = () => go('#/p/new'); $('#grid').onclick = e => { const c = e.target.closest('[data-open]'); if (c) go('#/p/' + c.dataset.open); };
}

async function profileView(id) {
  const isNew = id === 'new'; let p = isNew ? blankPatient() : await DB.get('patients', id); if (!p) return go('#/'); norm(p);
  let orig = JSON.parse(JSON.stringify(p));
  const [tasks, docs, sh0] = isNew ? [[], [], []] : await Promise.all([DB.byPid('tasks', p.id), DB.byPid('docs', p.id), DB.byPid('shifts', p.id)]);
  docs.sort((a, b) => b.ts - a.ts); const shifts = sh0.sort((a, b) => b.ts - a.ts), prev = shifts[0];
  const ch = prev ? Parser.changes(p, prev.snapshot, tasks, prev.ts) : null, cl = Parser.checklist(p, tasks), miss = cl.filter(x => !x.ok).map(x => x.k);
  const open = tasks.filter(t => !t.done).sort((a, b) => PR[a.priority] - PR[b.priority] || String(a.due || 'z').localeCompare(String(b.due || 'z'))), done = tasks.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
  const inp = (path, label, val, t = 'text') => `<div><label>${label}</label><input type="${t}" data-f="${path}" value="${esc(val)}"></div>`;
  const trow = t => { const od = !t.done && t.due && new Date(t.due).getTime() < Date.now(); return `<div class="doc"><input type="checkbox" data-tk="${esc(t.id)}" ${t.done ? 'checked' : ''} style="width:24px;height:24px"><div class="small ${t.done ? 'muted' : ''}"><b>${esc(t.text)}</b><br><span class="chip ${t.priority === 'High' ? 'red' : t.priority === 'Low' ? 'gray' : ''}">${esc(t.priority)}</span>${od ? '<span class="chip red">OVERDUE</span>' : ''}${t.due ? ' Due ' + fmt(new Date(t.due).getTime()) : ''}${t.carried ? ' · carried ×' + t.carried : ''}${t.done ? ' · done ' + fmt(t.doneAt) : ''}</div><button class="btn sm ghost" data-te="${esc(t.id)}">Edit</button><button class="btn sm red" data-td="${esc(t.id)}">✕</button></div>`; };
  const gv = (g, k) => g.some(x => p.l[x]);
  main().innerHTML = `<h2>${isNew ? 'New patient' : esc((p.bed ? 'Bed ' + p.bed + ' — ' : '') + (p.name || 'Patient'))}</h2>
  <div class="card"><h3>Patient information</h3><div class="f2">${inp('bed', 'Bed', p.bed)}${inp('mrn', 'MRN / file no.', p.mrn)}</div>${inp('name', 'Full name', p.name)}
  <div class="f3">${inp('age', 'Age', p.age)}<div><label>Sex</label><select data-f="sex">${['', 'Male', 'Female'].map(o => `<option ${p.sex === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>${inp('admitted', 'Admitted', p.admitted, 'date')}</div>
  ${inp('dx', 'Diagnosis / problem', p.dx)}${inp('allergies', 'Allergies (type NKDA if none)', p.allergies)}
  <div class="f2"><div><label>Code status</label><select data-f="code">${['Full code', 'DNAR', 'Limited escalation'].map(o => `<option ${p.code === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
  <div><label>Isolation</label><select data-f="isolation">${['None', 'Contact', 'Droplet', 'Airborne', 'Reverse'].map(o => `<option ${p.isolation === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div></div>
  <div class="row"><button class="btn" id="save">Save</button>${isNew ? '' : '<button class="btn gold" id="snap">Hand over ✔</button><button class="btn alt" id="scan">📷 Scan</button><button class="btn ghost" id="pdf">PDF</button>'}</div>
  <div class="card"><h3>Clinical status</h3><select data-f="cs">${['', 'Improving', 'Stable', 'Deteriorating', 'Critical'].map(o => `<option ${p.cs === o ? 'selected' : ''}>${o}</option>`).join('')}</select>${stamp(p, 'cs', 12, !!p.cs)}
  ${isNew ? '' : `<h3>Changes since last shift${prev ? ` <span class="muted small">(vs ${esc(prev.shift)} ${esc(prev.date)})</span>` : ''}</h3>${ch === null ? '<p class="muted small">No previous saved shift to compare.</p>' : ch.length ? ch.map(c => `<div class="chg ${/Deter/.test(c.type) ? 'bad' : ''}"><b>${esc(c.type)}</b>: ${esc(c.text)}</div>`).join('') : '<p class="muted small">No recorded changes.</p>'}
  <h3>Handover checklist</h3><p class="small">${cl.length - miss.length}/${cl.length} complete${miss.length ? `<br><span style="color:var(--red)">⚠ Missing: ${esc(miss.join(' · '))}</span>` : ' ✔'}</p>`}</div>
  ${isNew ? '' : `<div class="card"><h3>Pending tasks (${open.length})</h3>${open.map(trow).join('') || '<p class="muted small">No open tasks.</p>'}
  <label>New task</label><input id="tt" list="tl" placeholder="e.g. Repeat ABG"><datalist id="tl">${['Repeat ABG', 'Follow-up Blood Culture', 'Monitor Urine Output', 'Review Pending Imaging', 'Follow-up Laboratory Results', 'Medication Review'].map(x => `<option value="${x}">`).join('')}</datalist>
  <div class="f2"><div><label>Priority</label><select id="tp"><option>High</option><option selected>Medium</option><option>Low</option></select></div><div><label>Follow-up time (optional)</label><input type="datetime-local" id="tdu"></div></div>
  <div class="row"><button class="btn" id="ta">+ Add task</button></div>${done.length ? `<details><summary>Completed tasks history (${done.length})</summary>${done.map(trow).join('')}</details>` : ''}</div>`}
  <div class="card"><h3>Vital signs</h3><div class="f3">${VITALS.map(([k, l]) => inp('v.' + k, l, p.v[k] ?? '')).join('')}</div>${inp('obs.v', 'Observed at (optional, if different from now)', p.obs.v || '', 'datetime-local')}${stamp(p, 'v', 6, Object.values(p.v).some(Boolean))}
  <h3>ABG / lactate</h3><div class="f3">${ABG.map(k => inp('l.' + k, k, p.l[k] ?? '')).join('')}</div>${inp('obs.abg', 'Sample time (optional)', p.obs.abg || '', 'datetime-local')}${stamp(p, 'abg', 12, gv(ABG))}
  <h3>Laboratory results</h3><div class="f3">${LABS.map(k => inp('l.' + k, k, p.l[k] ?? '')).join('')}</div>${inp('obs.l', 'Result time (optional)', p.obs.l || '', 'datetime-local')}${stamp(p, 'l', 24, gv(LABS))}</div>
  <div class="card"><h3>ICU handover notes</h3>${SYSTEMS.map(([k, l]) => `<label>${l}</label><textarea data-f="h.${k}">${esc(p.h[k] || '')}</textarea>${k === 'meds' ? stamp(p, 'meds', 24, !!p.h.meds) : ''}`).join('')}</div>
  ${isNew ? '' : `<div class="card"><h3>Scanned documents (${docs.length})</h3>${docs.map(d => `<div class="doc"><img src="${esc(d.img)}" alt=""><div class="small"><b>${fmt(d.ts)}</b><br>${esc((d.text || '').slice(0, 70))}</div><button class="btn sm ghost" data-view="${esc(d.id)}">View</button><button class="btn sm red" data-deldoc="${esc(d.id)}">Delete</button></div>`).join('') || '<p class="muted small">No documents yet.</p>'}</div>
  <div class="card"><h3>Shift history (${shifts.length})</h3>${shifts.map(s => `<div class="doc"><div class="small"><b>${esc(s.shift)} · ${esc(s.date)}</b><br>${esc(s.from || '-')} → ${esc(s.to || '-')}</div><button class="btn sm ghost" data-pdfs="${esc(s.id)}">PDF</button></div>`).join('') || '<p class="muted small">No saved handovers yet.</p>'}</div>
  <div class="row"><button class="btn ghost" id="dis">${p.status === 'discharged' ? 'Re-admit patient' : 'Discharge patient'}</button><button class="btn red" id="del">Delete patient & all records</button></div>`}`;
  const collect = () => { document.querySelectorAll('[data-f]').forEach(el => { let v = el.value.trim(); if (/^(v\.|l\.|age$)/.test(el.dataset.f)) v = Parser.ar2en(v); setPath(p, el.dataset.f, v); }); return p; };
  const save = async silent => {
    collect(); if (!p.name && !p.bed) { toast('Enter a name or bed (Patient details)'); return false; }
    const bad = validate(p); if (bad.length) { toast('Please check: ' + bad.join(', ')); return false; }
    if (p.status !== 'discharged' && (isNew || orig.bed !== p.bed || orig.mrn !== p.mrn)) {
      const others = (await DB.all('patients')).filter(o => o.id !== p.id && o.status !== 'discharged');
      const b = p.bed && others.find(o => String(o.bed) === String(p.bed)), m = p.mrn && others.find(o => o.mrn && o.mrn === p.mrn);
      if (b && (isNew || orig.bed !== p.bed) && !confirm(`Bed ${p.bed} is already used by ${b.name || 'another patient'}. Save anyway?`)) return false;
      if (m && (isNew || orig.mrn !== p.mrn) && !confirm(`MRN ${p.mrn} already belongs to ${m.name || 'another patient'}. Save anyway?`)) return false;
    }
    touch(p, orig); await putPatient(p); orig = JSON.parse(JSON.stringify(p)); dirty = false; if (!silent) toast('Saved'); return true;
  };
  dirty = false; main().oninput = main().onchange = () => { dirty = true; };
  document.querySelectorAll('[data-f="age"],[data-f^="v."],[data-f^="l."]').forEach(e => e.setAttribute('inputmode', 'decimal'));
  $('#save').onclick = async () => { if (await save()) { if (isNew) location.replace('#/p/' + p.id); else route(); } };
  if (isNew) return;
  $('#scan').onclick = async () => { if (await save(true)) go('#/scan/' + p.id); };
  $('#pdf').onclick = async () => { collect(); reportPDF([await liveEntry(p)], { shift: 'Current', date: today(), from: '', to: '' }, `handover-${(p.name || p.bed).replace(/\W+/g, '_')}.pdf`); };
  $('#snap').onclick = async () => { if (await save(true)) shiftModal([p.id]); };
  $('#dis').onclick = async () => { collect(); p.status = p.status === 'discharged' ? 'active' : 'discharged'; await putPatient(p); toast('Updated'); route(); };
  $('#del').onclick = async () => { if (!confirm('Permanently delete this patient and all their documents, tasks and handover history?')) return; for (const d of docs) await DB.del('docs', d.id); for (const s of shifts) await DB.del('shifts', s.id); for (const t of tasks) await DB.del('tasks', t.id); await DB.del('patients', p.id); go('#/'); };
  $('#ta').onclick = async () => { const text = $('#tt').value.trim(); if (!text) return toast('Write the task first'); if ($('#ta').disabled) return; $('#ta').disabled = true; if (!await save(true)) { $('#ta').disabled = false; return; } await putTask({ id: uid(), pid: p.id, text, priority: $('#tp').value, due: $('#tdu').value, done: false, created: Date.now(), carried: 0 }); route(); };
  main().onclick = async e => {
    const t = e.target, d = t.dataset;
    if (d.view) { const x = docs.find(z => z.id === d.view); modal(`<h3>Document ${fmt(x.ts)}</h3><img src="${esc(x.img)}"><pre class="small" style="white-space:pre-wrap">${esc(x.text)}</pre><button class="btn" onclick="this.closest('.modal').remove()">Close</button>`); }
    if (d.deldoc && confirm('Delete this document?')) { await DB.del('docs', d.deldoc); route(); }
    if (d.pdfs) { const s = shifts.find(z => z.id === d.pdfs); reportPDF([histEntry(s)], s, `handover-${s.date}-${s.shift}.pdf`); }
    if (d.tk) { if (!await save(true)) return; const k = tasks.find(z => z.id === d.tk); k.done = t.checked; k.doneAt = t.checked ? Date.now() : null; await putTask(k); route(); }
    if (d.td && confirm('Delete this task?')) { await save(true); await DB.del('tasks', d.td); route(); }
    if (d.te) { const k = tasks.find(z => z.id === d.te);
      const m = modal(`<h3>Edit task</h3><label>Task</label><input id="et" value="${esc(k.text)}"><div class="f2"><div><label>Priority</label><select id="ep">${['High', 'Medium', 'Low'].map(o => `<option ${k.priority === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div><div><label>Follow-up time</label><input type="datetime-local" id="ed" value="${esc(k.due || '')}"></div></div><div class="row"><button class="btn" id="eok">Save</button><button class="btn ghost" id="eno">Cancel</button></div>`);
      $('#eno', m).onclick = () => m.close(); $('#eok', m).onclick = async () => { k.text = $('#et', m).value.trim() || k.text; k.priority = $('#ep', m).value; k.due = $('#ed', m).value; await save(true); await putTask(k); m.close(); route(); }; }
  };
}


async function saveShift(pids, meta) {
  for (const pid of pids) {
    const p = await DB.get('patients', pid); if (!p) continue; norm(p);
    const tasks = await DB.byPid('tasks', pid), all = (await DB.byPid('shifts', pid)).sort((a, b) => b.ts - a.ts), dup = all.find(x => x.date === meta.date && x.shift === meta.shift), pv = all.find(x => x !== dup);
    await DB.put('shifts', { id: dup ? dup.id : uid(), pid, ts: Date.now(), shift: meta.shift, date: meta.date, from: meta.from, to: meta.to, snapshot: JSON.parse(JSON.stringify(p)), tasks: JSON.parse(JSON.stringify(tasks)), changes: pv ? Parser.changes(p, pv.snapshot, tasks, pv.ts) : null });
    if (!dup) for (const t of tasks) if (!t.done) { t.carried = (t.carried || 0) + 1; await putTask(t); } // unfinished tasks carry over once per shift
  }
  localStorage.setItem('lastShift', JSON.stringify({ from: meta.from, to: meta.to }));
}
async function checkAndSave(pids, meta) { // checklist = warning only; never blocks. Re-saving the same shift replaces it (no duplicates).
  if (shiftBusy) return false; shiftBusy = true;
  try {
    const bad = [], dups = [];
    for (const pid of pids) { const p = await DB.get('patients', pid); if (!p) continue; norm(p); const miss = Parser.checklist(p, await DB.byPid('tasks', pid)).filter(x => !x.ok).map(x => x.k); if (miss.length) bad.push({ p, miss });
      if ((await DB.byPid('shifts', pid)).some(x => x.date === meta.date && x.shift === meta.shift)) dups.push(pid); }
    if (bad.length) {
      const ok = await new Promise(res => { const m = modal(`<h3>Handover checklist</h3><p class="small muted">Some important information is missing. You can still complete the handover.</p>${bad.map(r => `<div class="small"><b>Bed ${esc(r.p.bed || '-')} — ${esc(r.p.name)}</b><br>⚠ ${r.miss.map(esc).join(' · ')}</div>`).join('<hr>')}<div class="row"><button class="btn gold" id="cy">Complete handover anyway</button><button class="btn ghost" id="cn">Go back</button></div>`);
        $('#cy', m).onclick = () => { m.close(); res(true); }; $('#cn', m).onclick = () => { m.close(); res(false); }; m.onclick = e => { if (e.target === m) { m.close(); res(false); } }; });
      if (!ok) return false;
    }
    if (dups.length && !confirm(`${dups.length} patient(s) already have a ${meta.shift} shift handover saved for ${meta.date}. Replace it? (No duplicate will be created)`)) return false;
    await saveShift(pids, meta); return true;
  } finally { shiftBusy = false; }
}

const shiftForm = () => { const l = jget('lastShift'); const h = new Date().getHours();
  return `<div class="f2"><div><label>Shift</label><select id="sh"><option ${h >= 7 && h < 19 ? 'selected' : ''}>Day</option><option ${h >= 7 && h < 19 ? '' : 'selected'}>Night</option></select></div><div><label>Date</label><input type="date" id="sd" value="${today()}"></div>
  <div><label>Handing over (from)</label><input id="sf" value="${esc(l.to || '')}"></div><div><label>Receiving (to)</label><input id="st"></div></div>`; };
const readShift = () => ({ shift: $('#sh').value, date: $('#sd').value, from: $('#sf').value.trim(), to: $('#st').value.trim() });
function shiftModal(pids) {
  const m = modal(`<h3>Hand over — save to shift history</h3>${shiftForm()}<div class="row"><button class="btn" id="ok">Save</button><button class="btn ghost" id="no">Cancel</button></div>`);
  $('#no', m).onclick = () => m.close(); $('#ok', m).onclick = async () => { const meta = readShift(); m.style.display = 'none'; if (await checkAndSave(pids, meta)) { m.close(); toast('Saved to shift history'); route(); } else m.style.display = ''; };
}

async function handoverView() {
  const ps = (await DB.all('patients')).filter(p => p.status !== 'discharged').sort((a, b) => String(a.bed).localeCompare(String(b.bed), undefined, { numeric: true })), tc = await taskCounts();
  main().innerHTML = `<h2>Shift handover</h2><div class="card">${shiftForm()}</div><div class="card"><h3>Patients included</h3>
  ${ps.map(p => `<label class="ck"><input type="checkbox" class="pk" value="${esc(p.id)}" checked> Bed ${esc(p.bed || '-')} — ${esc(p.name)} ${tc[p.id] ? `<span class="chip">${tc[p.id]} tasks</span>` : ''} <a href="#/p/${esc(p.id)}" class="small">open</a></label>`).join('') || '<p class="muted">No active patients.</p>'}</div>
  <div class="row"><button class="btn gold" id="sv">Complete handover ✔</button><button class="btn" id="wp">Ward PDF report</button></div>`;
  const sel = () => [...document.querySelectorAll('.pk:checked')].map(c => c.value);
  $('#sv').onclick = async () => { const s = sel(); if (!s.length) return toast('Select patients'); if (await checkAndSave(s, readShift())) toast(`Saved ${s.length} handover(s)`); };
  $('#wp').onclick = async () => { const m = readShift(), ids = sel(); reportPDF(await Promise.all(ps.filter(p => ids.includes(p.id)).map(liveEntry)), m, `ICU-handover-${m.date}-${m.shift}.pdf`); };
}

async function historyView() {
  const all = (await DB.all('shifts')).sort((a, b) => b.ts - a.ts);
  main().innerHTML = `<h2>Shift history</h2><input id="hq" placeholder="Search patient, date, doctor"><div id="hl"></div>`;
  const draw = () => { const q = $('#hq').value.toLowerCase(); const l = all.filter(s => !q || [s.snapshot.name, s.snapshot.bed, s.date, s.shift, s.from, s.to].join(' ').toLowerCase().includes(q));
    $('#hl').innerHTML = l.map(s => `<div class="card"><b>${esc(s.snapshot.name || 'Unnamed')}</b> <span class="muted">Bed ${esc(s.snapshot.bed)}</span><div class="small muted">${esc(s.shift)} shift · ${esc(s.date)} · ${esc(s.from || '-')} → ${esc(s.to || '-')}</div><div class="small">${esc(s.snapshot.dx || '')}</div>
    <div class="row"><button class="btn sm ghost" data-v="${esc(s.id)}">View</button><button class="btn sm" data-p="${esc(s.id)}">PDF</button><button class="btn sm red" data-d="${esc(s.id)}">Delete</button></div></div>`).join('') || '<p class="muted">No saved handovers yet.</p>'; };
  draw(); $('#hq').oninput = draw;
  $('#hl').onclick = async e => { const t = e.target, f = id => all.find(s => s.id === id);
    if (t.dataset.p) { const s = f(t.dataset.p); reportPDF([histEntry(s)], s, `handover-${s.date}-${s.shift}.pdf`); }
    if (t.dataset.v) { const s = f(t.dataset.v), p = s.snapshot, en = histEntry(s); modal(`<h3>${esc(p.name)} — Bed ${esc(p.bed)}</h3><p class="small muted">${esc(s.shift)} · ${esc(s.date)} · ${esc(s.from)} → ${esc(s.to)}</p><p class="small">${esc(p.dx)}${p.cs ? ' · <b>' + esc(p.cs) + '</b>' : ''}<br>Allergies: ${esc(p.allergies || 'none')} · ${esc(p.code)}</p>
      ${SYSTEMS.filter(([k]) => p.h?.[k]).map(([k, l]) => `<div class="small"><b>${l}</b><br>${esc(p.h[k])}</div>`).join('')}
      <h3>Pending tasks</h3>${en.tasks.map(x => `<div class="small">• ${esc(x.text)} (${esc(x.priority)})</div>`).join('') || '<div class="small muted">None</div>'}
      <h3>Changes since previous shift</h3>${en.changes == null ? '<div class="small muted">No previous saved shift to compare.</div>' : en.changes.map(c => `<div class="chg"><b>${esc(c.type)}</b>: ${esc(c.text)}</div>`).join('') || '<div class="small muted">No recorded changes.</div>'}<br><button class="btn" onclick="this.closest('.modal').remove()">Close</button>`); }
    if (t.dataset.d && confirm('Delete this history entry?')) { await DB.del('shifts', t.dataset.d); route(); } };
}


let dashTimer = null;
async function dashboardView() {
  const mask = () => localStorage.getItem('dashMask') !== '0';
  const draw = async () => {
    const ps = (await DB.all('patients')).filter(p => p.status !== 'discharged').sort((a, b) => String(a.bed).localeCompare(String(b.bed), undefined, { numeric: true }));
    const last = {}; (await DB.all('shifts')).forEach(x => { if (!last[x.pid] || x.ts > last[x.pid]) last[x.pid] = x.ts; });
    const n = v => parseFloat(v); const tc = await taskCounts();
    const alerts = p => { const a = [], v = p.v || {}, l = p.l || {};
      if (n(v.spo2) < 92) a.push('SpO2 ' + v.spo2); if (n(v.hr) > 120 || n(v.hr) < 50) a.push('HR ' + v.hr); if (n(v.temp) >= 38.0) a.push('Temp ' + v.temp);
      const sb = parseInt((v.bp || '').split('/')[0]); if (sb && sb < 90) a.push('BP ' + v.bp); if (n(l.Lactate) > 2) a.push('Lactate ' + l.Lactate); if (n(l.K) > 5.5 || n(l.K) < 3) a.push('K ' + l.K); return a; };
    const nm = p => mask() ? (p.name || '').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + '.').join(' ') || '—' : p.name || 'Unnamed';
    const al = ps.map(alerts), crit = al.filter(a => a.length).length;
    const stat = (t, v, c = '') => `<div class="card" style="text-align:center;margin:0"><div style="font-size:26px;font-weight:700;color:${c || 'var(--navy)'}">${v}</div><div class="small muted">${t}</div></div>`;
    if (!$('#dbody')) return; $('#dbody').innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));margin-bottom:12px">${stat('Active patients', ps.length)}${stat('With alerts', crit, crit ? 'var(--red)' : '')}${stat('DNAR / limited', ps.filter(p => p.code !== 'Full code').length)}${stat('Isolation', ps.filter(p => p.isolation && p.isolation !== 'None').length)}${stat('Allergies', ps.filter(p => p.allergies).length)}</div>
    <div class="grid">${ps.map((p, i) => `<div class="card pc" style="border-left-color:${al[i].length ? 'var(--red)' : 'var(--teal)'}"><div class="bed">BED ${esc(p.bed || '-')}</div><div class="nm">${esc(nm(p))}</div><div class="small muted">${esc([p.age && p.age + 'y', p.sex].filter(Boolean).join(' · '))}</div><div class="small">${esc(p.dx || '')}</div>
      <span class="chip ${p.code !== 'Full code' ? 'red' : ''}">${esc(p.code)}</span>${p.allergies ? '<span class="chip red">Allergy</span>' : ''}${p.isolation && p.isolation !== 'None' ? `<span class="chip gray">${esc(p.isolation)}</span>` : ''}
      ${al[i].map(x => `<span class="chip red">⚠ ${esc(x)}</span>`).join('')}<div class="small muted" style="margin-top:6px">${VITALS.filter(([k]) => p.v?.[k]).map(([k, l]) => `${l} ${esc(p.v[k])}`).join(' · ')}</div>
      ${p.cs ? `<span class="chip ${/Det|Crit/.test(p.cs) ? 'red' : ''}">${esc(p.cs)}</span>` : ''}${tc[p.id] ? `<span class="chip">${tc[p.id]} tasks</span>` : ''}<div class="small muted">Vitals: ${p.t && p.t.v ? ago(p.t.v) : 'time not recorded'}</div><div class="small muted">Last handover: ${last[p.id] ? fmt(last[p.id]) : 'none'}</div></div>`).join('') || '<p class="muted">No active patients.</p>'}</div><p class="small muted">Updated ${new Date().toLocaleTimeString()} · refreshes every 30 s · view only</p>`;
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
  const setImg = src => { cur.canvas = toCanvas(src); cur.img = cur.canvas.toDataURL('image/jpeg', .7); $('#prev').src = cur.img; $('#prev').hidden = false; $('#vid').hidden = true; $('#snap').hidden = true; stopCam(); };
  $('#cam').onclick = async () => { try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false }); const v = $('#vid'); v.srcObject = stream; await v.play(); v.hidden = false; $('#prev').hidden = true; $('#snap').hidden = false; } catch (e) { toast('Camera unavailable: use “Take / choose photo”'); } };
  $('#snap').onclick = () => setImg($('#vid'));
  $('#file').onchange = e => { const f = e.target.files[0]; if (!f) return; const im = new Image(); im.onload = () => { setImg(im); URL.revokeObjectURL(im.src); }; im.src = URL.createObjectURL(f); };
  $('#ocr').onclick = async () => {
    if (!cur.canvas) return toast('Capture or choose an image first');
    $('#st').textContent = 'Reading…'; const r = await runOCR(enhance(cur.canvas), s => $('#st').textContent = s);
    if (r.engine) { $('#txt').value = r.text; $('#st').textContent = 'Done · ' + r.engine; $('#ext').click(); }
    else $('#st').textContent = 'OCR failed: ' + (r.error || 'unknown reason') + ' — type or paste the text instead (About → Check OCR engine for details).' + (isNative() ? '' : ' (Developers: run setup_ocr.py once.)');
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
  $('#sd').onclick = async () => { if (await saveDoc(false)) { toast('Document saved'); location.replace('#/p/' + pid); } };
  $('#apply').onclick = async () => {
    const old0 = JSON.parse(JSON.stringify(p)); norm(p); document.querySelectorAll('[data-g]').forEach(i => { const v = i.value.trim(); if (v) p[i.dataset.g][i.dataset.k] = v; });
    const bad = validate(p); if (bad.length) { toast('Please check: ' + bad.join(', ')); return; } const meds = [...document.querySelectorAll('.mk:checked')].map(c => c.value).filter(m => !(p.h.meds || '').includes(m));
    if (meds.length) p.h.meds = ((p.h.meds ? p.h.meds + '\n' : '') + meds.join('\n'));
    touch(p, old0); await putPatient(p); if (await saveDoc(true)) { toast('Applied and saved'); location.replace('#/p/' + pid); }
  };
  $('#back').onclick = () => location.replace('#/p/' + pid);
}

async function aboutView() {
  const [pc, dc, sc] = await Promise.all(['patients', 'docs', 'shifts', 'tasks'].map(s => DB.all(s).then(a => a.length)));
  main().innerHTML = `<h2>About the Application</h2><div class="card"><p><b>IBN SINA ICU HANDOVER</b> is an offline-first ICU shift handover tool: patient profiles, document scanning with on-device OCR and structured extraction, shift history and PDF handover reports.</p>
  <p class="small muted">All patient data is stored only in this device’s browser database. Nothing is sent to any server. It is a documentation aid and does not replace clinical judgement or the official medical record.</p></div>
  <div class="card"><h3>Developer</h3>${credit().replace('class="credit"', 'class="credit" style="border:0"').replace(/class="dc"/g, 'class="dc" style="display:block"')}</div>
  <div class="card"><h3>Application credits</h3><p class="small">Design, development and maintenance: <b>${DEV.name}</b><br>OCR engine (optional, bundled locally): Tesseract.js — Apache-2.0 licence.<br>Version 1.2.2</p></div>
  <div class="card"><h3>Report settings</h3><label>Hospital name (PDF header)</label><input id="hosp" value="${esc(jget('org').hosp || '')}" placeholder="IBN SINA Hospital"><label>Department</label><input id="dept" value="${esc(jget('org').dept || '')}" placeholder="Intensive Care Unit"><div class="row"><button class="btn" id="orgs">Save</button></div></div>
  <div class="card"><h3>OCR engine</h3><p class="small muted">Reads English text from scanned documents on this device. If scanning does not work, check the engine here.</p><div class="row"><button class="btn alt" id="ocrchk">Check OCR engine</button></div></div>
  <div class="card"><h3>Data & backup</h3><p class="small muted">${pc} patients · ${dc} documents · ${sc} handover records stored on this device. Last backup: ${localStorage.getItem('lastBackup') ? fmt(+localStorage.getItem('lastBackup')) : 'never'}.</p><div class="row"><button class="btn" id="exp">Export backup</button>
  <label class="btn ghost">Import backup<input type="file" accept=".json" id="imp" hidden></label></div><p class="small muted">Import merges records by ID and never deletes existing data. Keep backups in a safe place — they contain patient information.</p></div>`;
  $('#ocrchk').onclick = ocrDiagnose;
  $('#orgs').onclick = () => { localStorage.setItem('org', JSON.stringify({ hosp: $('#hosp').value.trim(), dept: $('#dept').value.trim() })); toast('Saved'); };
  $('#exp').onclick = async () => { localStorage.setItem('lastBackup', Date.now()); const o = { app: 'ibn-sina-icu', v: 1, ts: Date.now(), patients: await DB.all('patients'), docs: await DB.all('docs'), shifts: await DB.all('shifts'), tasks: await DB.all('tasks') }; download(JSON.stringify(o), `ibn-sina-icu-backup-${today()}.json`, 'application/json'); };
  $('#imp').onchange = async e => {
    try {
      const f = e.target.files[0]; if (!f) return; if (f.size > 300e6) throw new Error('file too large'); const o = JSON.parse(await f.text()); if (!o || o.app !== 'ibn-sina-icu') throw new Error('not an IBN SINA backup');
      const S = ['patients', 'tasks', 'docs', 'shifts'], idOk = v => typeof v === 'string' && /^[\w-]{1,64}$/.test(v), objOk = v => v === undefined || (v && typeof v === 'object' && !Array.isArray(v)), have = {};
      for (const s of S) { have[s] = {}; (await DB.all(s)).forEach(r => have[s][r.id] = r); }
      let add = 0, upd = 0, keep = 0, bad = 0;
      for (const s of S) for (const r of (Array.isArray(o[s]) ? o[s] : [])) {
        if (!r || !idOk(r.id) || (s !== 'patients' && !idOk(r.pid)) || (s === 'patients' && !['h', 'v', 'l', 't', 'obs'].every(k => objOk(r[k]))) || (s === 'tasks' && typeof r.text !== 'string')) { bad++; continue; }
        const cur = have[s][r.id];
        if (!cur) { await DB.put(s, r); add++; } else if ((s === 'patients' || s === 'tasks') && (r.updated || r.mod || 0) > (cur.updated || cur.mod || 0)) { await DB.put(s, r); upd++; } else keep++; // existing data is never replaced by older data
      }
      toast(`Imported ${add} new, ${upd} updated, ${keep} already up to date${bad ? ', ' + bad + ' invalid skipped' : ''}`); route();
    } catch (err) { toast('Import failed: ' + err.message); }
  };
}

/* ---------- router ---------- */
let routing = Promise.resolve();
function route() { routing = routing.then(doRoute, doRoute); return routing; } // serialised: a slow earlier render can never overwrite a newer one
async function doRoute() {
  stopCam(); clearInterval(dashTimer); main().onclick = null; main().oninput = main().onchange = null;
  const [v, a] = (location.hash.slice(2) || '').split('/'); const views = { '': boardView, p: profileView, scan: scanView, handover: handoverView, history: historyView, dashboard: dashboardView, about: aboutView };
  document.body.dataset.view = v || 'board'; $('#hback').hidden = !v; $('#footer').innerHTML = credit();
  document.querySelectorAll('.nav a').forEach(x => x.classList.toggle('on', x.dataset.nav === (v === 'p' || v === 'scan' || v === '' ? 'board' : v)));
  try { await (views[v] || boardView)(a); } catch (e) { console.error(e); main().innerHTML = `<div class="card">Something went wrong: ${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}

(async function init() {
  await DB.open();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  const upd = () => $('#offline').hidden = navigator.onLine; addEventListener('online', upd); addEventListener('offline', upd); upd();
  addEventListener('hashchange', () => { if (restoring) { restoring = false; return; } if (dirty && !confirm('You have unsaved changes. Leave without saving?')) { restoring = true; location.replace(lastHash); return; } dirty = false; lastHash = location.hash || '#/'; route(); });
  addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }); addEventListener('unhandledrejection', e => { const m = e.reason && e.reason.message; toast('Error: ' + (m && m !== 'null' ? m : 'the operation failed (device storage may be full)')); });
  new MutationObserver(rtlFix).observe(document.body, { childList: true, subtree: true }); $('#hback').onclick = () => (history.length > 1 ? history.back() : go('#/'));
  $('#wcredit').innerHTML = credit(); $('#welcome').hidden = false; $('#enter').onclick = () => { $('#welcome').hidden = true; };
  await route();
  if ('serviceWorker' in navigator) {
    if (isNative()) { navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())); if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } // the APK ships its own files; a cache could only serve stale code
    else navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  }
})();
