/* Structured medical data extraction (runs 100% on-device) */
(function (root) {
  const N = '(\\d+(?:[.,]\\s?\\d+)?)'; // tolerates OCR gap after the decimal point ("38. 4")
  const SEP = '\\s*[:=\\-]?\\s*';
  const num = (t, re) => { const m = t.match(re); return m ? m[1].replace(',', '.').replace(/\s/g, '') : null; };
  const VITALS = {
    hr: new RegExp('\\b(?:HR|heart\\s*rate|pulse)' + SEP + '(\\d{2,3})\\b', 'i'),
    rr: new RegExp('\\b(?:RR|resp(?:iratory)?\\s*rate)' + SEP + '(\\d{1,2})\\b', 'i'),
    spo2: new RegExp('\\b(?:Sp[O0]2|Sa[O0]2|O2\\s*sat(?:uration)?|sats?)' + SEP + '(\\d{2,3})\\b', 'i'),
    temp: new RegExp('\\b(?:Temp(?:erature)?)' + SEP + '(\\d{2}(?:[.,]\\s?\\d)?)', 'i'),
    gcs: new RegExp('\\bGCS' + SEP + '(\\d{1,2})\\b', 'i')
  };
  const LABS = {
    Hb: '(?:Hb|Hgb|haemoglobin|hemoglobin)', WBC: '(?:WBC|TLC|white\\s*(?:blood\\s*)?cells?)',
    Plt: '(?:Plt|P[li1]t|platelets?)', Na: '(?:Na\\+?[lI]?|sodium)', K: '(?:K\\+?|potassium)',
    Cr: '(?:Cr|creat(?:inine)?)', Urea: '(?:urea|BUN)', Glucose: '(?:glucose|RBS|FBS|BG|GLU)',
    Lactate: '(?:lactate|lact)', pH: '(?:pH)', pCO2: '(?:pCO2|PaCO2)', pO2: '(?:pO2|PaO2)',
    HCO3: '(?:HCO3-?|bicarb(?:onate)?)', CRP: '(?:CRP)', Bili: '(?:T\\.?\\s*bil(?:irubin)?|bilirubin)',
    INR: '(?:INR)'
  };
  function extract(text) {
    const t = ar2en(text || '').replace(/[|]/g, ' ').replace(/\r/g, '');
    const out = { patient: {}, vitals: {}, labs: {}, meds: [] };
    for (const k in VITALS) { const v = num(t, VITALS[k]); if (v) out.vitals[k] = v; }
    let m = t.match(/\b(?:BP|blood\s*pressure|NIBP|ABP)\s*[:=\-]?\s*(\d{2,3})\s*[\/\\]\s*(\d{2,3})/i) ||
            t.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\s*mm\s*hg/i);
    if (m) out.vitals.bp = m[1] + '/' + m[2];
    for (const k in LABS) {
      const v = num(t, new RegExp('(?:^|[^A-Za-z0-9])' + LABS[k] + SEP + N, 'i'));
      if (v) out.labs[k] = v;
    }
    m = t.match(/\bname\s*[:\-]\s*([^\n]{3,60})/i); if (m) out.patient.name = m[1].trim();
    m = t.match(/\b(?:MRN|file\s*(?:no|number)|patient\s*id|ID)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-]{3,})/i); if (m) out.patient.mrn = m[1];
    m = t.match(/\bage\s*[:\-]?\s*(\d{1,3})/i); if (m) out.patient.age = m[1];
    m = t.match(/\b(?:sex|gender)\s*[:\-]?\s*(male|female|M|F)\b/i); if (m) out.patient.sex = /^m/i.test(m[1]) ? 'Male' : 'Female';
    const dose = /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|ug|g|ml|iu|units?|mmol)\b(?:\s*\/\s*(?:kg|h|hr|min|ml))?/i;
    const seen = new Set();
    for (let line of t.split('\n')) {
      line = line.trim().replace(/^[-•*\d.)\s]{1,4}(?=[A-Za-z])/, '');
      if (line.length < 4 || line.length > 110 || !dose.test(line) || !/[A-Za-z]{3,}/.test(line)) continue;
      if (/^(?:Hb|WBC|Plt|Na|K|Cr|Urea|CRP|INR|BP|HR|RR)\b/i.test(line)) continue;
      const key = line.toLowerCase(); if (!seen.has(key)) { seen.add(key); out.meds.push(line); }
    }
    return out;
  }

  /* ---- Handover logic: changes since last saved shift + checklist (only compares data that was actually saved) ---- */
  const RANK = { Improving: 0, Stable: 1, Deteriorating: 2, Critical: 3 };
  const KEYS = ['pH', 'pCO2', 'pO2', 'HCO3', 'Lactate', 'Hb', 'WBC', 'Plt', 'Na', 'K', 'Cr', 'Urea', 'Glucose', 'CRP', 'Bili', 'INR'];
  const ar2en = s => String(s).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x6F0).replace(/٫/g, '.').replace(/[٬،]/g, '');
  const nz = v => { const s = String(v == null ? '' : v).trim(); return /^\d+(\.\d+)?$/.test(s) ? String(parseFloat(s)) : s.toLowerCase(); };
  const nt = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase();
  const lines = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);
  function changes(cur, prev, tasks, since) {
    if (!prev) return null;
    const out = [], add = (type, text) => out.push({ type, text }), ch = cur.h || {}, ph = prev.h || {};
    if (cur.dx && nt(cur.dx) !== nt(prev.dx)) add('New Diagnosis', (prev.dx ? prev.dx + ' -> ' : '') + cur.dx);
    if (cur.cs && prev.cs && cur.cs !== prev.cs) add(RANK[cur.cs] > RANK[prev.cs] ? 'Clinical Deterioration' : 'Improvement in Clinical Status', prev.cs + ' -> ' + cur.cs);
    else if (cur.cs && !prev.cs) add('Clinical Status', cur.cs);
    const pm = lines(ph.meds), cm = lines(ch.meds), pn = pm.map(nt), cn = cm.map(nt);
    cm.filter((x, i) => !pn.includes(cn[i])).forEach(x => add('New Medication', x));
    pm.filter((x, i) => !cn.includes(pn[i])).forEach(x => add('Medication Discontinued', x));
    for (const k of KEYS) { const a = (cur.l || {})[k], b = (prev.l || {})[k]; if (a && nz(a) !== nz(b)) add('New Laboratory Results', k + ' ' + a + (b ? ' (was ' + b + ')' : '')); }
    const txt = (k, type) => { const a = String(ch[k] || '').trim(); if (a && nt(a) !== nt(ph[k])) add(type, a); };
    txt('resp', 'Changes in Ventilator / Respiratory Settings'); txt('imaging', 'New Imaging Findings'); txt('procedures', 'New Procedures'); txt('events', 'Significant Clinical Events');
    (tasks || []).forEach(t => { if (t.created > since) add('New Task', t.text); if (t.done && t.doneAt > since) add('Task Completed', t.text); });
    return out;
  }
  function checklist(p, tasks) {
    const h = p.h || {}, l = p.l || {}, v = p.v || {}, has = x => String(x || '').trim().length > 0;
    return [['Patient Diagnosis', has(p.dx)], ['Current Clinical Condition', has(p.cs)], ['Allergies', has(p.allergies)], ['Current Medications', has(h.meds)],
      ['Airway / Respiratory Support', has(h.resp)], ['Hemodynamic Status', has(h.cv) || has(v.bp)], ['Important Laboratory Results', Object.values(l).some(has)],
      ['Active Problems', has(h.problems)], ['Pending Tasks', (tasks || []).length > 0], ['Management Plan', has(h.plan)]].map(([k, ok]) => ({ k, ok }));
  }
  const api = { extract, changes, checklist, ar2en };
  if (typeof module !== 'undefined') module.exports = api; else root.Parser = api;
})(typeof self !== 'undefined' ? self : this);
