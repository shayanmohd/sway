/* Reviewer pass 4: safe areas. --sat 48px, --sab 34px on every screen.
   Measures the visible content box: the border box shrunk by its own padding (padding is how the
   app clears the bars) and clipped by every scrolling ancestor, so a row hidden behind the tab bar
   is not miscounted as a row under the navigation bar. Scroll containers are checked at rest;
   a scrolled list passing behind a transparent status bar is Android's own behaviour. */
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const SAT = 48, SAB = 34;

  const apply = () => page.evaluate((sat, sab) => {
    document.documentElement.style.setProperty('--sat', sat + 'px');
    document.documentElement.style.setProperty('--sab', sab + 'px');
  }, SAT, SAB);

  const offenders = (topToo) => page.evaluate((sat, sab, topToo) => {
    const H = window.innerHeight, W = window.innerWidth;
    const clipOf = el => {
      let box = { top: 0, bottom: H, left: 0, right: W };
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/auto|scroll|hidden/.test(cs.overflowY + cs.overflowX)) {
          const r = p.getBoundingClientRect();
          box = { top: Math.max(box.top, r.top), bottom: Math.min(box.bottom, r.bottom),
                  left: Math.max(box.left, r.left), right: Math.min(box.right, r.right) };
        }
      }
      return box;
    };
    const out = [];
    // while a sheet or the bystander card is up, the screen under the scrim is not the screen
    const modal = document.querySelector('.sheet:not([hidden]), .bystander:not([hidden])');
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[hidden]')) continue;
      if (modal && !modal.contains(el)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'svg' || el.closest('svg')) continue;
      const control = tag === 'button' || tag === 'input' || tag === 'select' || tag === 'a';
      const ownText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (!control && !ownText) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      // the content box: padding is exactly how this app holds text off the bars
      const top = r.top + parseFloat(cs.paddingTop || 0);
      const bottom = r.bottom - parseFloat(cs.paddingBottom || 0);
      const clip = clipOf(el);
      const vTop = Math.max(top, clip.top), vBottom = Math.min(bottom, clip.bottom);
      if (vBottom - vTop < 1) continue;              // clipped away entirely
      const label = tag + (el.id ? '#' + el.id : (el.className ? '.' + String(el.className).split(' ')[0] : ''));
      const txt = (el.textContent || '').trim().slice(0, 34);
      if (topToo && vTop < sat) out.push(label + ' top ' + Math.round(vTop) + ' "' + txt + '"');
      if (vBottom > H - sab) out.push(label + ' bottom ' + Math.round(vBottom) + '/' + H + ' "' + txt + '"');
    }
    return out;
  }, SAT, SAB, topToo);

  let idx = 0;
  const bad = [];
  const check = async (label, opts) => {
    opts = opts || {};
    await apply();
    await wait(320);
    const o = await offenders(opts.top !== false);
    await shot('r4' + String(idx++).padStart(2, '0') + '-' + label);
    if (o.length) { log('OFFENDERS on ' + label + ': ' + o.join(' | ')); bad.push(label + ': ' + o.join(' | ')); }
    else log('safe: ' + label);
  };

  await wait(800);
  await check('session');
  await page.evaluate(() => { document.getElementById('pocketVeil').hidden = false; });
  await check('session-pocket-dim');
  await page.evaluate(() => { document.getElementById('pocketVeil').hidden = true; });

  await page.evaluate(() => window.App.openShelf()); await wait(400);
  await check('shelf');
  await page.evaluate(() => window.App.openBystander()); await wait(400);
  await check('bystander');
  await page.evaluate(() => { document.getElementById('s-bystander').hidden = true; });

  await click('#endBtn'); await wait(350); await check('fork');
  await click('#forkStorm'); await wait(300); await check('tools');
  await click('[data-tool="senses"]'); await wait(300); await check('step');
  await page.evaluate(() => window.App.back()); await wait(250);
  await click('[data-tool="tapping"]'); await wait(600); await check('tap');
  await click('#tapDone'); await wait(300);
  await click('#forkPass'); await wait(350); await check('log');
  await page.click('#waveRow button:nth-child(3)'); await wait(150);
  await click('#logSave'); await wait(400); await check('closing');
  await click('#closeDone'); await wait(500); await check('shelter');

  // scrolled to the end: the fixed tab bar must still clear the navigation bar
  await page.evaluate(() => { const s = document.querySelector('#v-shelter .scroller'); s.scrollTop = s.scrollHeight; });
  await check('shelter-scrolled-to-end', { top: false });

  await click('.tab[data-view="almanac"]'); await wait(500); await check('almanac');
  await page.evaluate(() => { const s = document.querySelector('#v-almanac .scroller'); s.scrollTop = s.scrollHeight; });
  await check('almanac-scrolled-to-end', { top: false });

  await page.evaluate(() => { window.Store.eraseAll(); window.App.setView('almanac'); });
  await wait(500); await check('almanac-empty');

  await click('.tab[data-view="learn"]'); await wait(500); await check('learn');
  await page.evaluate(() => { const s = document.querySelector('#v-learn .scroller'); s.scrollTop = s.scrollHeight; });
  await check('learn-scrolled-to-end', { top: false });
  await page.evaluate(() => { document.querySelector('#v-learn .scroller').scrollTop = 0; });
  await wait(200);
  await page.click('#cardList button:nth-child(9)'); await wait(500); await check('reader');
  await page.evaluate(() => { const b = document.getElementById('readerBody'); b.parentElement.scrollTop = b.parentElement.scrollHeight; });
  await check('reader-scrolled-to-end', { top: false });
  await page.evaluate(() => window.App.back()); await wait(300);

  await click('.tab[data-view="shelter"]'); await wait(400);
  await page.evaluate(() => { document.getElementById('cPhone').value = '07700 900123'; document.getElementById('cSave').click(); });
  await wait(400);
  await check('shelter-toast');

  if (bad.length) throw new Error('safe-area violations:\n' + bad.join('\n'));
  if (errors.length) throw new Error(errors.length + ' page errors');
};
