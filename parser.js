/* Structured medical data extraction (runs 100% on-device) */
(function (root) {
  const N = '(\\d+(?:[.,]\\d+)?)';
  const SEP = '\\s*[:=\\-]?\\s*';
  const num = (t, re) => { const m = t.match(re); return m ? m[1].replace(',', '.') : null; };
  const VITALS = {
    hr: new RegExp('\\b(?:HR|heart\\s*rate|pulse)' + SEP + '(\\d{2,3})\\b', 'i'),
    rr: new RegExp('\\b(?:RR|resp(?:iratory)?\\s*rate)' + SEP + '(\\d{1,2})\\b', 'i'),
    spo2: new RegExp('\\b(?:SpO2|SaO2|O2\\s*sat(?:uration)?|sats?)' + SEP + '(\\d{2,3})\\b', 'i'),
    temp: new RegExp('\\b(?:Temp(?:erature)?)' + SEP + '(\\d{2}(?:[.,]\\d)?)', 'i'),
    gcs: new RegExp('\\bGCS' + SEP + '(\\d{1,2})\\b', 'i')
  };
  const LABS = {
    Hb: '(?:Hb|Hgb|haemoglobin|hemoglobin)', WBC: '(?:WBC|TLC|white\\s*(?:blood\\s*)?cells?)',
    Plt: '(?:Plt|platelets?)', Na: '(?:Na\\+?|sodium)', K: '(?:K\\+?|potassium)',
    Cr: '(?:Cr|creat(?:inine)?)', Urea: '(?:urea|BUN)', Glucose: '(?:glucose|RBS|FBS|BG|GLU)',
    Lactate: '(?:lactate|lact)', pH: '(?:pH)', pCO2: '(?:pCO2|PaCO2)', pO2: '(?:pO2|PaO2)',
    HCO3: '(?:HCO3-?|bicarb(?:onate)?)', CRP: '(?:CRP)', Bili: '(?:T\\.?\\s*bil(?:irubin)?|bilirubin)',
    INR: '(?:INR)'
  };
  function extract(text) {
    const t = String(text || '').replace(/[|]/g, ' ').replace(/\r/g, '');
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
  const api = { extract };
  if (typeof module !== 'undefined') module.exports = api; else root.Parser = api;
})(typeof self !== 'undefined' ? self : this);
