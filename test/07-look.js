/* Sway drive script 7: look at it. The signature element frozen at the bottom, middle and top of a
   breath, plus every calm screen with real data in it, so the design can be judged from pictures.
   Run: node ../_shiptools/drive.js http://127.0.0.1:8816/index.html test/07-look.js --out test/shots */
module.exports = async ({ page, shot, wait, click, log, errors }) => {
  await page.evaluate(() => {
    const day = 86400000, now = Date.now();
    const spec = [[36, 3, 8, ['transit'], ['breathing'], 441], [32, 4, 18, ['work', 'transit'], ['breathing', 'senses'], 498],
      [29, 2, 23, ['night', 'home'], ['breathing'], 372], [24, 5, 7, ['transit'], ['breathing', 'cold'], 455],
      [19, 3, 8, ['transit'], ['breathing', 'senses'], 348], [15, 4, 2, ['night'], ['breathing', 'tapping'], 311],
      [11, 3, 17, ['work'], ['breathing'], 268], [7, 2, 8, ['transit'], ['breathing'], 236],
      [4, 3, 21, ['social'], ['breathing', 'senses'], 205], [1, 2, 7, ['transit'], ['breathing', 'cold'], 182]];
    const storms = spec.map((s, i) => { const d = new Date(now - s[0] * day); d.setHours(s[2], 7 + i * 3, 0, 0);
      return { id: 'seed' + i, at: d.getTime(), endedAt: d.getTime() + s[5] * 1000, wave: s[1], chips: s[3],
               tools: s[4], durS: s[5], launchMs: 62 + i * 4, pocket: i % 3 === 0, logged: true }; });
    localStorage.setItem('sway.v1', JSON.stringify({ storms, pulses: [71, 64, 83, 68, 77, 59, 74, 66, 80, 62],
      settings: { protocol: 'tide', strength: 0.72, haptics: true, audio: false, pocketDim: false,
        contact: { name: 'Priya', phone: '+44 7700 900123', rel: '' }, region: 'uk', calibrated: true },
      learnSeen: ['chest', 'air'], firstRun: now - 37 * day }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(900);

  // Freeze the breath so the wave can be looked at at three points in the cycle.
  const at = async (level, name, phaseText) => {
    await page.evaluate((L, t) => {
      Engine.level = () => L;
      const h = document.getElementById('hint'); h.classList.add('gone');
      const p = document.getElementById('phase');
      if (t) { p.classList.add('on'); p.textContent = t; } else { p.classList.remove('on'); p.textContent = ''; }
    }, level, phaseText);
    await wait(700);
    await shot(name);
  };
  await at(0.02, '60-breath-out', 'Breathe out, slowly');
  await at(0.5, '61-breath-mid', '');
  await at(1, '62-breath-in', 'Breathe in');

  await click('#shelfBtn'); await wait(600); await shot('63-shelf');
  await click('#shelfClose'); await wait(250);
  await click('#endBtn'); await wait(400); await shot('64-fork');
  await click('#forkStorm'); await wait(500); await shot('65-tools');
  await page.evaluate(() => App.back()); await wait(250);
  await page.evaluate(() => App.openLog()); await wait(300);
  await page.evaluate(() => { document.querySelectorAll('#waveRow .wavebtn')[3].click();
    const c = document.querySelectorAll('#chipRow .chip'); c[1].click(); c[3].click(); });
  await wait(400); await shot('66-log');
  await click('#logSave'); await wait(500); await shot('67-closing');
  await click('#closeDone'); await wait(700); await shot('68-shelter');
  await page.evaluate(() => { const s = document.querySelector('#v-shelter .scroller'); s.scrollTop = s.scrollHeight; });
  await wait(500); await shot('69-shelter-bottom');
  await page.evaluate(() => App.setView('almanac')); await wait(800); await shot('70-almanac');
  await page.evaluate(() => { const s = document.querySelector('#v-almanac .scroller'); s.scrollTop = 700; });
  await wait(400); await shot('71-almanac-2');
  await page.evaluate(() => App.setView('learn')); await wait(700); await shot('72-learn');
  await page.evaluate(() => document.querySelectorAll('#cardList .cardbtn')[2].click());
  await wait(500); await shot('73-reader');
  await click('#readerClose'); await wait(250);
  await page.evaluate(() => App.openBystander()); await wait(600); await shot('74-bystander');
  await click('#bysClose'); await wait(300);

  // The empty Almanac, with its drawn state.
  await page.evaluate(() => { Store.eraseAll(); App.setView('almanac'); });
  await wait(700); await shot('75-almanac-empty');

  log('errors so far:', errors.length);
};
