/* Reviewer pass 7: the drawn states and the icon language, at real size. */
module.exports = async ({ page, shot, wait, click, errors, log }) => {
  await wait(800);
  await click('#endBtn'); await wait(300);
  await click('#forkStorm'); await wait(400);
  await shot('r70-tools-glyphs');
  // the glyph sheet at the size the eye actually meets it
  await page.evaluate(() => {
    const ids = ['g-shelter','g-almanac','g-learn','g-call','g-text','g-ring','g-card','g-person','g-play',
                 'g-pulse','g-moon','g-export','g-senses','g-cold','g-tap','g-clock','g-place','g-check','g-chev'];
    const wrap = document.createElement('div');
    wrap.id = 'sheet';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99;background:#12203A;display:grid;' +
      'grid-template-columns:repeat(4,1fr);align-content:start;gap:14px;padding:40px 18px;';
    wrap.innerHTML = ids.map(id =>
      '<div style="display:grid;justify-items:center;gap:6px">' +
      '<svg class="ic" style="width:22px;height:22px" viewBox="0 0 24 24"><use href="#' + id + '"/></svg>' +
      '<svg class="ic" style="width:44px;height:44px" viewBox="0 0 24 24"><use href="#' + id + '"/></svg>' +
      '<span style="font-size:10px;color:#9BB0C4">' + id.slice(2) + '</span></div>').join('');
    document.body.appendChild(wrap);
  });
  await wait(400);
  await shot('r71-glyph-sheet');
  await page.evaluate(() => document.getElementById('sheet').remove());
  if (errors.length) throw new Error(errors.length + ' page errors');
};
