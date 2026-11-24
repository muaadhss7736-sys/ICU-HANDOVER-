/* Minimal dependency-free PDF writer (A4, Helvetica) - works offline */
(function (root) {
  const clean = s => String(s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
  const pesc = s => s.replace(/[\\()]/g, '\\$&');
  function wrap(text, max) {
    const res = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (let w of para.split(/\s+/)) {
        while (w.length > max) { if (line) { res.push(line); line = ''; } res.push(w.slice(0, max)); w = w.slice(max); }
        if (!line) line = w; else if ((line + ' ' + w).length <= max) line += ' ' + w; else { res.push(line); line = w; }
      }
      res.push(line);
    }
    return res;
  }
  /* items: {t,s,b,i,gap,rule}; footer: [{t,b}] */
  function makePDF(items, footer) {
    const W = 595, H = 842, M = 42, FH = 84;
    const pages = [[]]; let y = H - M;
    const cur = () => pages[pages.length - 1];
    for (const it of items) {
      const sz = it.s || 10, lead = sz * 1.4, ind = it.i || 0;
      const max = Math.max(10, Math.floor((W - 2 * M - ind) / (sz * (it.b ? 0.56 : 0.5))));
      if (it.pb && cur().length) { pages.push([]); y = H - M; }
      if (it.gap) y -= it.gap;
      if (it.t) for (const ln of wrap(clean(it.t), max)) {
        if (y - lead < FH) { pages.push([]); y = H - M; }
        y -= lead;
        cur().push(`BT /${it.b ? 'F2' : 'F1'} ${sz} Tf ${M + ind} ${y.toFixed(1)} Td (${pesc(ln)}) Tj ET`);
      }
      if (it.rule) { y -= 4; cur().push(`0.75 g ${M} ${y.toFixed(1)} ${W - 2 * M} 0.7 re f 0 g`); y -= 4; }
    }
    const n = pages.length;
    pages.forEach((p, idx) => {
      p.push(`0.75 g ${M} ${FH - 8} ${W - 2 * M} 0.7 re f 0 g`);
      let fy = FH - 22;
      for (const f of footer) {
        const t = clean(f.t), sz = 8.5, x = (W - t.length * sz * (f.b ? 0.56 : 0.5)) / 2;
        p.push(`BT /${f.b ? 'F2' : 'F1'} ${sz} Tf ${x.toFixed(1)} ${fy} Td (${pesc(t)}) Tj ET`); fy -= 11;
      }
      p.push(`BT /F1 8 Tf ${W - M - 50} 18 Td (Page ${idx + 1} of ${n}) Tj ET`);
    });
    const objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${n} >>`;
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    pages.forEach((p, i) => {
      const s = p.join('\n');
      objs[5 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`;
      objs[6 + 2 * i] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`;
    });
    let out = '%PDF-1.4\n'; const off = [];
    for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
    const xr = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + off.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n ').join('\n') +
      `\ntrailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
    return u;
  }
  const api = { makePDF };
  if (typeof module !== 'undefined') module.exports = api; else root.PDFW = api;
})(typeof self !== 'undefined' ? self : this);
