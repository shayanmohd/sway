/* Reviewer pass 5: WCAG AA contrast, measured off the real painted pixels.
   The page is screenshotted, the shot is drawn back into a canvas inside the page, and the
   background under every piece of text is the modal colour of the pixels it sits on. That is the
   only way to judge text over gradients, glows and the live water canvas. */
module.exports = async ({ page, shot, wait, click, errors, log }) => {
  const shoot = async () => {
    const b64 = await page.screenshot({ encoding: 'base64' });
    return page.evaluate(async (data) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + data; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      window.__shot = c;
      return [img.width, img.height];
    }, b64);
  };

  const measure = () => page.evaluate(() => {
    const c = window.__shot, g = c.getContext('2d');
    const sx = c.width / window.innerWidth, sy = c.height / window.innerHeight;
    const lum = ([r, gg, b]) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const parse = s => { const m = String(s).match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : null; };
    const over = (fg, bg) => { const a = fg[3] == null ? 1 : fg[3];
      return [0, 1, 2].map(i => Math.round(fg[i] * a + bg[i] * (1 - a))); };

    const modal = (el) => {
      const r = el.getBoundingClientRect();
      const x0 = Math.max(0, Math.round(r.left * sx)), x1 = Math.min(c.width, Math.round(r.right * sx));
      const y0 = Math.max(0, Math.round(r.top * sy)), y1 = Math.min(c.height, Math.round(r.bottom * sy));
      if (x1 - x0 < 2 || y1 - y0 < 2) return null;
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const hist = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const k = (d[i] >> 2 << 12) | (d[i + 1] >> 2 << 6) | (d[i + 2] >> 2);
        const e = hist.get(k) || { n: 0, r: 0, g: 0, b: 0 };
        e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2];
        hist.set(k, e);
      }
      let best = null;
      for (const e of hist.values()) if (!best || e.n > best.n) best = e;
      const total = d.length / 4;
      return { rgb: [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)],
               share: best.n / total };
    };

    const modalEl = document.querySelector('.sheet:not([hidden]), .bystander:not([hidden])');
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[hidden]')) continue;
      if (modalEl && !modalEl.contains(el)) continue;
      if (el.closest('svg') || el.tagName === 'SVG') continue;
      const own = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim());
      const isInput = el.tagName === 'INPUT' || el.tagName === 'SELECT';
      if (!own.length && !(isInput && el.type !== 'checkbox' && el.type !== 'range')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      let alpha = 1;
      for (let p = el; p; p = p.parentElement) { const o = parseFloat(getComputedStyle(p).opacity); if (o < 1) alpha *= o; }
      if (alpha < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3 || r.bottom < 0 || r.top > window.innerHeight) continue;
      const bgSample = modal(el);
      if (!bgSample || bgSample.share < 0.25) continue;      // too busy to judge honestly
      let col = parse(cs.color); if (!col) continue;
      col[3] = (col[3] == null ? 1 : col[3]) * alpha;
      const fg = over(col, bgSample.rgb);
      const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(fg, bgSample.rgb);
      const txt = (own.map(n => n.textContent.trim()).join(' ') || cs.getPropertyValue('placeholder') || el.value || el.tagName).slice(0, 40);
      out.push({ sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : (el.className ? '.' + String(el.className).split(' ')[0] : '')),
                 txt, size, weight, need, got: +got.toFixed(2), bgShare: +bgSample.share.toFixed(2),
                 fg: 'rgb(' + fg.join(',') + ')', bg: 'rgb(' + bgSample.rgb.join(',') + ')' });
    }
    // placeholders are drawn text too and never carry a text node
    for (const el of document.querySelectorAll('input[placeholder]')) {
      if (el.closest('[hidden]') || el.value) continue;
      const cs = getComputedStyle(el, '::placeholder');
      const bgSample = modal(el); if (!bgSample) continue;
      const col = parse(cs.color); if (!col) continue;
      const fg = over(col, bgSample.rgb);
      out.push({ sel: el.tagName.toLowerCase() + '#' + el.id + '::placeholder', txt: el.placeholder,
                 size: parseFloat(cs.fontSize), weight: 400, need: 4.5,
                 got: +ratio(fg, bgSample.rgb).toFixed(2), bgShare: +bgSample.share.toFixed(2),
                 fg: 'rgb(' + fg.join(',') + ')', bg: 'rgb(' + bgSample.rgb.join(',') + ')' });
    }
    return out;
  });

  const fails = [];
  const seen = new Set();
  const audit = async (label) => {
    await wait(350);
    await shoot();
    const rows = await measure();
    let worst = null;
    for (const r of rows) {
      const key = label + '|' + r.sel + '|' + r.txt;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!worst || r.got < worst.got) worst = r;
      if (r.got < r.need) fails.push(label + ' :: ' + r.sel + ' "' + r.txt + '" ' +
        r.got + ':1 needs ' + r.need + ' (' + r.fg + ' on ' + r.bg + ', ' + r.size + 'px/' + r.weight + ')');
    }
    log(label + ': ' + rows.length + ' text items, worst ' +
      (worst ? worst.got + ':1 on "' + worst.txt + '"' : 'n/a'));
  };

  await wait(900);
  await audit('session');
  await page.evaluate(() => { document.getElementById('pocketVeil').hidden = false; });
  await audit('session-pocket-dim');
  await page.evaluate(() => { document.getElementById('pocketVeil').hidden = true; });
  await page.evaluate(() => { document.getElementById('phase').classList.add('on');
                              document.getElementById('phase').textContent = 'Breathe out, slowly'; });
  await audit('session-phase-label');

  await page.evaluate(() => window.App.openShelf()); await wait(400); await audit('shelf-empty-contact');
  await page.evaluate(() => window.App.openBystander()); await wait(400); await audit('bystander');
  await page.evaluate(() => { document.getElementById('s-bystander').hidden = true; });

  await click('#endBtn'); await wait(350); await audit('fork');
  await click('#forkStorm'); await wait(300); await audit('tools');
  await click('[data-tool="senses"]'); await wait(300); await audit('step');
  await page.evaluate(() => window.App.back()); await wait(250);
  await click('[data-tool="tapping"]'); await wait(700); await audit('tap');
  await click('#tapDone'); await wait(300);
  await click('#forkPass'); await wait(350); await audit('log-empty');
  await page.click('#waveRow button:nth-child(3)'); await wait(150);
  await page.click('#chipRow button:nth-child(1)'); await wait(250);
  await audit('log-chosen');
  await click('#logSave'); await wait(400); await audit('closing');
  await click('#closeDone'); await wait(500); await audit('shelter');

  // the disabled calibration state, which is where a dimmed label would hide
  await page.evaluate(() => { const c = document.getElementById('hapticsChk'); c.checked = false;
                              c.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(300);
  await page.evaluate(() => { document.getElementById('calibPanel').scrollIntoView({ block: 'center' }); });
  await audit('shelter-haptics-off');
  await page.evaluate(() => { const c = document.getElementById('hapticsChk'); c.checked = true;
                              c.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(250);

  // the error state on a number with no digits
  await page.evaluate(() => { document.getElementById('cName').value = 'Sam';
                              document.getElementById('cPhone').value = 'call me';
                              document.getElementById('cSave').click(); });
  await wait(400);
  await page.evaluate(() => { document.getElementById('contactState').scrollIntoView({ block: 'center' }); });
  await audit('shelter-bad-number');
  await page.evaluate(() => window.App.openShelf()); await wait(400); await audit('shelf-disabled-contact');
  await page.evaluate(() => window.App.back()); await wait(300);

  // the armed erase state
  await page.evaluate(() => { document.getElementById('eraseBtn').click();
                              document.getElementById('eraseBtn').scrollIntoView({ block: 'center' }); });
  await wait(400); await audit('shelter-erase-armed');

  await page.evaluate(() => window.App.setView('almanac')); await wait(500); await audit('almanac-populated');
  await page.evaluate(() => { const s = document.querySelector('#v-almanac .scroller'); s.scrollTop = s.scrollHeight; });
  await wait(400); await audit('almanac-bottom');
  await page.evaluate(() => { window.Store.eraseAll(); window.App.setView('almanac'); });
  await wait(500); await audit('almanac-empty');
  await page.evaluate(() => window.App.setView('learn')); await wait(500); await audit('learn');
  await page.evaluate(() => { document.querySelectorAll('#cardList .cardbtn')[0].click(); }); await wait(500);
  await audit('reader');
  await page.evaluate(() => window.App.back()); await wait(300);
  await page.evaluate(() => { document.querySelector('#v-learn .scroller').scrollTop = 0; }); await wait(300);
  await audit('learn-with-read-card');

  if (fails.length) { log('FAILS:'); fails.forEach(f => log('  ' + f)); throw new Error(fails.length + ' contrast failures'); }
  log('no WCAG AA failures');
  if (errors.length) throw new Error(errors.length + ' page errors');
};
