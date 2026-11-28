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

  /* Arabic text needs real shaping/RTL, which the built-in Helvetica writer cannot do: render pages with the browser's text engine and embed them as JPEG pages. */
  const AR = /[\u0600-\u06FF\u0750-\u077F]/;
  function makeImagePDF(items, footer) {
    const K = 2, W = 595 * K, H = 842 * K, M = 42 * K, FH = 84 * K, FONT = '"Noto Naskh Arabic","Noto Sans Arabic","Segoe UI",Tahoma,Arial,"DejaVu Sans",sans-serif';
    const pages = []; let c, x, y;
    const isRtl = s => { const m = s.match(/[A-Za-z\u0600-\u06FF\u0750-\u077F]/); return !!m && AR.test(m[0]); };
    const newPage = () => { c = document.createElement('canvas'); c.width = W; c.height = H; x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#000'; pages.push(c); y = M; };
    newPage();
    for (const it of items) {
      const sz = (it.s || 10) * K, lead = sz * 1.4, ind = (it.i || 0) * K, font = `${it.b ? 'bold ' : ''}${sz}px ${FONT}`; x.font = font;
      if (it.pb && y > M) newPage(); if (it.gap) y += it.gap * K;
      if (it.t) for (const para of String(it.t).split('\n')) {
        const dir = isRtl(para) ? 'rtl' : 'ltr', maxw = W - 2 * M - ind, out = []; let line = '';
        for (const w of para.split(/\s+/)) { const tl = line ? line + ' ' + w : w; if (!line || x.measureText(tl).width <= maxw) line = tl; else { out.push(line); line = w; } } out.push(line);
        for (const ln of out) { if (y + lead > H - FH) { newPage(); x.font = font; } y += lead; x.direction = dir; x.textAlign = dir === 'rtl' ? 'right' : 'left'; x.fillText(ln, dir === 'rtl' ? W - M : M + ind, y); }
      }
      if (it.rule) { y += 4 * K; x.fillStyle = '#bbb'; x.fillRect(M, y, W - 2 * M, 1.4 * K); x.fillStyle = '#000'; y += 4 * K; }
    }
    pages.forEach((pc, i) => { const g = pc.getContext('2d'); g.fillStyle = '#bbb'; g.fillRect(M, H - (FH - 8) * K, W - 2 * M, 1.4 * K); g.fillStyle = '#000'; g.direction = 'ltr'; g.textAlign = 'center'; let fy = H - (FH - 22) * K;
      footer.forEach(f => { g.font = `${f.b ? 'bold ' : ''}${8.5 * K}px ${FONT}`; g.fillText(f.t, W / 2, fy); fy += 11 * K; }); g.font = `${8 * K}px ${FONT}`; g.textAlign = 'right'; g.fillText(`Page ${i + 1} of ${pages.length}`, W - M, H - 14 * K); });
    const enc = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
    const parts = [], offs = []; let len = 0; const push = u => { parts.push(u); len += u.length; }, pushS = s => push(enc(s));
    const obj = (n, body, stream) => { offs[n] = len; pushS(`${n} 0 obj\n${body}`); if (stream) { pushS('\nstream\n'); push(stream); pushS('\nendstream'); } pushS('\nendobj\n'); };
    pushS('%PDF-1.4\n'); obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + 3 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`);
    pages.forEach((pc, i) => { const b64 = pc.toDataURL('image/jpeg', 0.82).split(',')[1], bin = atob(b64), jpg = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) jpg[k] = bin.charCodeAt(k);
      const cs = 'q 595 0 0 842 0 0 cm /Im0 Do Q';
      obj(3 + 3 * i, `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
      obj(4 + 3 * i, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${3 + 3 * i} 0 R >> >> /Contents ${5 + 3 * i} 0 R >>`);
      obj(5 + 3 * i, `<< /Length ${cs.length} >>`, enc(cs)); });
    const total = 3 + 3 * pages.length, xr = len; pushS(`xref\n0 ${total}\n0000000000 65535 f \n`); for (let n = 1; n < total; n++) pushS(String(offs[n]).padStart(10, '0') + ' 00000 n \n');
    pushS(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
    const out = new Uint8Array(len); let o = 0; for (const u of parts) { out.set(u, o); o += u.length; } return out;
  }
  function makePDFAuto(items, footer) { const all = items.map(i => i.t || '').join('') + footer.map(f => f.t).join(''); return typeof document !== 'undefined' && AR.test(all) ? makeImagePDF(items, footer) : makePDF(items, footer); }
  const api = { makePDF, makePDFAuto };
  if (typeof module !== 'undefined') module.exports = api; else root.PDFW = api;
})(typeof self !== 'undefined' ? self : this);
