/* Sway drive script 8: the states the eye has to find. Focus-visible on every control, the pressed
   state, and the whole app with prefers-reduced-motion on, which must still start and still breathe.
   Run: node ../_shiptools/drive.js http://127.0.0.1:8816/index.html test/08-states.js --out test/shots */
module.exports = async ({ page, shot, wait, click, log, errors }) => {
  const problems = [];
  const fail = m => { problems.push(m); log('  FAIL:', m); };

  await wait(700);

  // ---- every focusable control must show a ring ----
  const ring = async (sel, label) => {
    const r = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return 'missing';
      el.focus();
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, offset: cs.outlineOffset };
    }, sel);
    if (r === 'missing') { fail(label + ' (' + sel + ') is not in the page'); return; }
    const w = parseFloat(r.width);
    log(('focus ' + label).padEnd(30), JSON.stringify(r));
    if (r.style === 'none' || !(w >= 2)) fail(label + ' has no focus ring');
  };

  await page.evaluate(() => App.startSession({}));
  await wait(300);
  await ring('#endBtn', 'end session');
  await ring('#shelfBtn', 'night shelf');
  await ring('#calmBtn', 'not in a storm');
  await shot('80-focus-session');

  await page.evaluate(() => { document.getElementById('endBtn').click(); });
  await wait(250);
  await ring('#forkStorm', 'still stormy');
  await shot('81-focus-fork');
  await page.evaluate(() => document.getElementById('forkStorm').click());
  await wait(200);
  await ring('[data-tool="cold"]', 'a grounding tool');

  await page.evaluate(() => App.openLog());
  await wait(250);
  await ring('#waveRow .wavebtn', 'a wave size');
  await ring('#chipRow .chip', 'a context chip');
  await ring('#logSave', 'save the log');
  await shot('82-focus-log');

  await page.evaluate(() => { App.setView('shelter'); });
  await wait(400);
  await ring('#cName', 'the name field');
  await ring('#protoSel', 'the rhythm select');
  await ring('#hapticsChk', 'the haptics checkbox');
  await ring('#strengthRange', 'the strength slider');
  await ring('#exportBtn', 'export');
  await ring('.tab', 'a tab');
  await shot('83-focus-shelter');

  await page.evaluate(() => { App.startSession({}); App.openShelf(); });
  await wait(300);
  await ring('#shelfClose', 'close the shelf');
  await shot('84-focus-shelf');
  await page.evaluate(() => { document.getElementById('shelf').hidden = true; });

  // ---- reduced motion: the app still starts, still breathes, and nothing animates ----
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(900);
  const rm = await page.evaluate(() => {
    const c = document.getElementById('water'), g = c.getContext('2d');
    const durations = [];
    document.querySelectorAll('.panel, .cardbtn, .shelf-item, .big, .sheet-panel').forEach(el => {
      const cs = getComputedStyle(el);
      durations.push(parseFloat(cs.animationDuration), parseFloat(cs.transitionDuration));
    });
    return { running: Engine.isRunning(), painted: g.getImageData(4, Math.round(c.height * 0.95), 1, 1).data[3] > 0,
             maxAnim: Math.max.apply(null, durations.concat([0])) };
  });
  log('reduced motion:', JSON.stringify(rm));
  if (!rm.running) fail('the session did not start with reduced motion on');
  if (!rm.painted) fail('the water did not draw with reduced motion on');
  if (rm.maxAnim > 0.01) fail('animations still run at ' + rm.maxAnim + 's with reduced motion on');
  await wait(600);
  await shot('85-reduced-motion-session');
  await page.evaluate(() => App.setView('almanac'));
  await wait(500);
  await shot('86-reduced-motion-almanac');

  // The breath must still travel: it is the guide, not decoration.
  const height = async (level) => page.evaluate(L => new Promise(res => {
    Engine.level = () => L;
    let n = 0;
    const step = () => {
      if (n++ < 30) return requestAnimationFrame(step);
      const c = document.getElementById('water'), g = c.getContext('2d');
      const col = Math.round(c.width / 2);
      const px = g.getImageData(col, 0, 1, c.height).data;
      let best = -1, bestY = -1;
      for (let y = 0; y < c.height; y++) {
        // Nearly transparent pixels carry meaningless colour, so only solid ink counts.
        const r = px[y * 4], b = px[y * 4 + 2], a = px[y * 4 + 3];
        const amber = r - b;                    // the warm line is the reddest thing on the field
        if (a > 200 && r > 170 && amber > best) { best = amber; bestY = y; }
      }
      res(bestY / c.height);
    };
    step();
  }), level);

  await page.evaluate(() => App.startSession({}));
  await wait(500);
  const lo = await height(0), hi = await height(1);
  log('breath travel with reduced motion (fraction down the screen):', 'exhale', lo.toFixed(3), 'inhale', hi.toFixed(3));
  if (!(lo > 0 && hi > 0 && lo - hi > 0.2))
    fail('the breath stopped travelling with reduced motion on: exhale ' + lo + ', inhale ' + hi);
  await shot('87-reduced-motion-inhale');

  log('errors so far:', errors.length);
  if (problems.length) throw new Error(problems.length + ' state problem(s):\n  - ' + problems.join('\n  - '));
};
