/* Sway drive script 1: first run, empty state, and the whole happy path that creates real data.
   Run: node ../_shiptools/drive.js http://127.0.0.1:8816/index.html test/01-happy.js --out test/shots */
module.exports = async ({ page, shot, wait, text, click, log, errors }) => {
  // First run: nothing stored yet.
  const before = await page.evaluate(() => localStorage.getItem('sway.v1'));
  log('storage before first paint:', before === null ? 'empty' : 'present');

  await wait(900);
  await shot('01-session-first-run');

  // The rhythm must be running and the canvas must be painting something.
  const live = await page.evaluate(() => {
    const c = document.getElementById('water');
    const g = c.getContext('2d');
    const d = g.getImageData(Math.round(c.width / 2), Math.round(c.height * 0.85), 1, 1).data;
    return { running: Engine.isRunning(), painted: d[3] > 0, w: c.width, h: c.height };
  });
  log('engine running:', live.running, 'canvas painted:', live.painted, live.w + 'x' + live.h);
  if (!live.running) throw new Error('the session did not start on load');
  if (!live.painted) throw new Error('the water canvas painted nothing');

  // A storm record is opened the moment the app opens.
  log('storms after open:', await page.evaluate(() => Store.storms().length));

  // Night shelf.
  await click('#shelfBtn');
  await wait(350);
  await shot('02-shelf');
  log('shelf lines:', await text('#shelfLines'));
  await click('#shelfClose');
  await wait(250);

  // End the session, take the fork.
  await click('#endBtn');
  await wait(400);
  await shot('03-fork');

  await click('#forkStorm');
  await wait(400);
  await shot('04-tools');

  await click('[data-tool="senses"]');
  await wait(450);
  await shot('05-senses');
  const steps = await page.evaluate(() => Content.SENSES.length);
  for (let i = 0; i < steps - 1; i++) { await click('#s-step'); await wait(120); }
  await wait(300);
  await shot('06-senses-last');
  await click('#s-step');            // last tap returns to the fork
  await wait(350);
  log('screen after the last sense:', await page.evaluate(() => document.getElementById('s-fork').hidden ? 'not fork' : 'fork'));

  // Cold, then bilateral tapping.
  await click('#forkStorm'); await wait(200);
  await click('[data-tool="cold"]'); await wait(350);
  await shot('07-cold');
  await click('#s-step'); await wait(150);
  await click('#s-step'); await wait(150);
  await click('#s-step'); await wait(150);
  await click('#s-step'); await wait(150);
  await click('#s-step'); await wait(350);

  await click('#forkStorm'); await wait(200);
  await click('[data-tool="tapping"]'); await wait(900);
  await shot('08-tapping');
  await click('#tapDone'); await wait(350);

  // Passing, then the log.
  await click('#forkPass');
  await wait(400);
  await shot('09-log-empty');
  await page.evaluate(() => document.querySelectorAll('#waveRow .wavebtn')[3].click());
  await wait(200);
  await page.evaluate(() => { const c = document.querySelectorAll('#chipRow .chip'); c[1].click(); c[3].click(); });
  await wait(300);
  await shot('10-log-filled');

  await click('#logSave');
  await wait(400);
  await shot('11-closing');
  log('closing:', await text('#s-closing'));

  await click('#closeDone');
  await wait(500);
  await shot('12-shelter');

  const saved = await page.evaluate(() => Store.logged().map(s => ({ wave: s.wave, chips: s.chips, tools: s.tools, dur: s.durS })));
  log('logged storms:', JSON.stringify(saved));
  if (saved.length !== 1) throw new Error('expected exactly one logged storm, got ' + saved.length);
  if (saved[0].wave !== 4) throw new Error('wave size was not recorded');
  if (!saved[0].tools.includes('senses') || !saved[0].tools.includes('cold') || !saved[0].tools.includes('tapping'))
    throw new Error('tools used were not all recorded: ' + saved[0].tools);

  // Almanac and Learn with one storm in the book.
  await page.evaluate(() => App.setView('almanac'));
  await wait(500);
  await shot('13-almanac-one');
  await page.evaluate(() => App.setView('learn'));
  await wait(400);
  await shot('14-learn');
  await page.evaluate(() => document.querySelectorAll('#cardList .cardbtn')[1].click());
  await wait(400);
  await shot('15-reader');
  await click('#readerClose'); await wait(250);
  await click('#learnBystander'); await wait(450);
  await shot('16-bystander');
  await click('#bysClose'); await wait(250);

  log('errors so far:', errors.length);
};
