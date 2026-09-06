/* Reviewer pass 2: window.App.back() on every nested screen, and onPause/onResume. */
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };
  const back = () => page.evaluate(() => window.App.back());
  const state = () => page.evaluate(() => ({
    screen: ['s-session','s-fork','s-tools','s-step','s-tap','s-log','s-closing']
              .filter(id => !document.getElementById(id).hidden)[0] || null,
    view: ['shelter','almanac','learn'].filter(v => !document.getElementById('v-' + v).hidden)[0] || null,
    shelf: !document.getElementById('shelf').hidden,
    reader: !document.getElementById('reader').hidden,
    bys: !document.getElementById('s-bystander').hidden,
    veil: !document.getElementById('pocketVeil').hidden,
    running: window.Engine.isRunning(),
    tabs: !document.getElementById('tabs').hidden
  }));

  await wait(800);
  let s = await state();
  assert(s.screen === 's-session', 'not on session at launch');

  // root: back must NOT be consumed on a live storm session
  assert(await back() === false, 'back() at the session root should return false');

  // overlay: shelf
  await click('#shelfBtn'); await wait(400);
  assert((await state()).shelf, 'shelf not open');
  assert(await back() === true, 'back() should close the shelf');
  assert(!(await state()).shelf, 'shelf still open after back');

  // overlay: bystander from the shelf
  await click('#shelfBtn'); await wait(300);
  await click('#shelfCard'); await wait(400);
  assert((await state()).bys, 'bystander not open');
  assert(await back() === true, 'back() should close the bystander card');
  assert(!(await state()).bys, 'bystander still open');

  // pocket veil
  await page.evaluate(() => { document.getElementById('pocketVeil').hidden = false; });
  assert(await back() === true, 'back() should lift the pocket veil');
  assert(!(await state()).veil, 'veil still up');

  // fork
  await click('#endBtn'); await wait(400);
  assert((await state()).screen === 's-fork', 'not on fork');
  assert(await back() === true, 'back() from fork');
  await wait(300);
  s = await state();
  assert(s.screen === 's-session' && s.running, 'back from fork should resume the rhythm, got ' + JSON.stringify(s));

  // tools
  await click('#endBtn'); await wait(300);
  await click('#forkStorm'); await wait(300);
  assert(await back() === true, 'back() from tools');
  assert((await state()).screen === 's-fork', 'back from tools should land on fork');

  // step
  await click('#forkStorm'); await wait(250);
  await click('[data-tool="senses"]'); await wait(300);
  assert((await state()).screen === 's-step', 'not on step');
  assert(await back() === true, 'back() from step');
  assert((await state()).screen === 's-tools', 'back from step should land on tools');

  // tap, and prove the beat is actually stopped by back
  await click('[data-tool="tapping"]'); await wait(900);
  assert((await state()).screen === 's-tap', 'not on tap');
  assert(await back() === true, 'back() from tap');
  assert((await state()).screen === 's-tools', 'back from tap should land on tools');
  const litBefore = await page.evaluate(() => document.querySelectorAll('.dot.lit').length);
  await wait(1600);
  const litAfter = await page.evaluate(() => document.querySelectorAll('.dot.lit').length);
  assert(litBefore === litAfter, 'the bilateral beat kept running after leaving the tap screen');

  // log
  await back(); await wait(250);
  await click('#forkPass'); await wait(350);
  assert((await state()).screen === 's-log', 'not on log');
  assert(await back() === true, 'back() from log');
  assert((await state()).screen === 's-fork', 'back from log should land on fork');

  // closing
  await click('#forkPass'); await wait(300);
  await click('#logSave'); await wait(400);
  assert((await state()).screen === 's-closing', 'not on closing');
  assert(await back() === true, 'back() from closing');
  await wait(400);
  s = await state();
  assert(s.view === 'shelter' && s.tabs, 'back from closing should land on the Shelter, got ' + JSON.stringify(s));

  // calm layer: nested views consume back, shelter is the root
  await click('.tab[data-view="almanac"]'); await wait(400);
  assert(await back() === true, 'back() from the Almanac tab');
  assert((await state()).view === 'shelter', 'back from almanac should land on shelter');
  await click('.tab[data-view="learn"]'); await wait(400);
  await page.click('#cardList button:nth-child(1)'); await wait(400);
  assert((await state()).reader, 'reader not open');
  assert(await back() === true, 'back() should close the reader');
  assert(await back() === true, 'back() from the Learn tab');
  assert((await state()).view === 'shelter', 'back from learn should land on shelter');
  assert(await back() === false, 'back() at the Shelter root should return false');

  // rehearsal: a nested screen entered from the Shelter
  await click('#rehearseBtn'); await wait(700);
  s = await state();
  assert(s.screen === 's-session' && s.running, 'rehearsal did not start');
  const stormsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')).storms.length);
  assert(await back() === true, 'back() during a rehearsal must be consumed');
  await wait(400);
  s = await state();
  assert(s.view === 'shelter', 'back from a rehearsal should return to the Shelter');
  assert(!s.running, 'the rhythm kept running after leaving the rehearsal');
  const stormsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')).storms.length);
  assert(stormsBefore === stormsAfter, 'a rehearsal wrote a storm record');

  // double tap on the rehearsal button must not stack sessions
  await page.evaluate(() => { const b = document.getElementById('rehearseBtn'); b.click(); b.click(); b.click(); });
  await wait(600);
  const stormsAfter2 = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')).storms.length);
  assert(stormsAfter2 === stormsAfter, 'repeated rehearsal taps wrote storm records');
  await back(); await wait(300);

  // onPause / onResume on each layer
  const cycle = async (label) => {
    const before = await state();
    await page.evaluate(() => window.App.onPause());
    await wait(250);
    await page.evaluate(() => window.App.onResume());
    await wait(400);
    const after = await state();
    assert(after.screen === before.screen && after.view === before.view,
      'pause/resume moved the screen on ' + label);
    log('pause/resume ok on ' + label + ' running=' + after.running);
    return after;
  };
  await cycle('shelter');
  await page.evaluate(() => window.App.setView('almanac')); await wait(300);
  await cycle('almanac');

  // a live session must still be running after a pause/resume, and the canvas must repaint
  await page.evaluate(() => window.App.startSession({})); await wait(700);
  let after = await cycle('session');
  assert(after.running, 'the rhythm did not survive onPause/onResume');
  const painted = await page.evaluate(async () => {
    const cv = document.getElementById('water');
    const a = cv.toDataURL().length;
    await new Promise(r => setTimeout(r, 700));
    return { a, b: cv.toDataURL().length };
  });
  assert(painted.a > 5000 && painted.b > 5000, 'the water canvas is blank after resume');
  log('canvas bytes after resume: ' + painted.a + ' -> ' + painted.b);

  // tapping must restart on resume
  await click('#endBtn'); await wait(300);
  await click('#forkStorm'); await wait(250);
  await click('[data-tool="tapping"]'); await wait(700);
  await page.evaluate(() => window.App.onPause()); await wait(1200);
  const litPaused = await page.evaluate(() => document.querySelectorAll('.dot.lit').length);
  await page.evaluate(() => window.App.onResume()); await wait(1400);
  const flips = await page.evaluate(async () => {
    const seen = new Set();
    for (let i = 0; i < 24; i++) {
      seen.add(document.getElementById('dotL').classList.contains('lit') ? 'L' : 'R');
      await new Promise(r => setTimeout(r, 90));
    }
    return seen.size;
  });
  assert(flips === 2, 'the bilateral beat did not resume after onResume (sides seen: ' + flips + ')');
  log('bilateral beat alternates again after resume, lit while paused=' + litPaused);
  await shot('r20-tap-after-resume');

  if (errors.length) throw new Error(errors.length + ' page errors');
};
