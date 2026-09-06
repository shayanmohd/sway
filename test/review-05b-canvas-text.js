/* Reviewer pass 5b: the two lines that sit directly on the live water canvas, which the modal
   sampler skips as too busy. Sampled pixel by pixel across the whole strip each line occupies,
   at the brightest point of the breath and at the darkest, and judged on the worst pixel. */
module.exports = async ({ page, wait, click, errors, log }) => {
  const shoot = async () => {
    const b64 = await page.screenshot({ encoding: 'base64' });
    await page.evaluate(async (data) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + data; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      window.__shot = c;
    }, b64);
  };
  const worstUnder = (sel) => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const c = window.__shot, g = c.getContext('2d');
    const sx = c.width / window.innerWidth, sy = c.height / window.innerHeight;
    const r = el.getBoundingClientRect();
    const lum = ([R, G, B]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(R) + 0.7152 * f(G) + 0.0722 * f(B); };
    const cs = getComputedStyle(el);
    const fg = cs.color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lf = lum(fg);
    // one row of pixels just above and just below the text: the field the glyphs sit on
    const rows = [Math.round((r.top - 3) * sy), Math.round((r.bottom + 3) * sy)];
    let worst = Infinity, at = null;
    for (const y of rows) {
      if (y < 0 || y >= c.height) continue;
      const d = g.getImageData(Math.max(0, Math.round(r.left * sx)), y,
        Math.min(c.width, Math.round(r.width * sx)), 1).data;
      for (let i = 0; i < d.length; i += 4) {
        const lb = lum([d[i], d[i + 1], d[i + 2]]);
        const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
        if (ratio < worst) { worst = ratio; at = [d[i], d[i + 1], d[i + 2]]; }
      }
    }
    return { sel, color: cs.color, size: parseFloat(cs.fontSize), weight: cs.fontWeight,
             worst: +worst.toFixed(2), onPixel: 'rgb(' + (at || []).join(',') + ')' };
  }, sel);

  const fails = [];
  const probe = async (sel, label) => {
    await shoot();
    const r = await worstUnder(sel);
    const large = r.size >= 24 || (r.size >= 18.66 && +r.weight >= 700);
    const need = large ? 3 : 4.5;
    log(label + ' ' + r.sel + ' ' + r.color + ' ' + r.size + 'px: worst ' + r.worst + ':1 on ' + r.onPixel + ' (needs ' + need + ')');
    if (r.worst < need) fails.push(label + ' ' + r.sel + ' ' + r.worst + ':1 needs ' + need);
  };

  await wait(900);
  await page.evaluate(() => { const p = document.getElementById('phase');
                              p.classList.add('on'); p.textContent = 'Breathe out, slowly';
                              document.getElementById('hint').classList.remove('gone'); });
  // sample repeatedly so both ends of the breath, where the halo is brightest, are covered
  for (let i = 0; i < 8; i++) {
    await probe('#hint', 'cycle' + i);
    await probe('#phase', 'cycle' + i);
    await wait(700);
  }
  if (fails.length) { fails.forEach(f => log('FAIL ' + f)); throw new Error(fails.length + ' contrast failures on the water'); }
  log('the text on the water passes AA at every sampled point of the breath');
  if (errors.length) throw new Error(errors.length + ' page errors');
};
