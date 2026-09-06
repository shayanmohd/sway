/* Reviewer pass 3: upgrade from 1.0.0.
   The 1.0.0 store module is loaded from git and used, through its own public API, to write a
   realistic history into localStorage. Then the 1.0.1 build is loaded on top of it. */
const fs = require('fs');
const LEGACY = fs.readFileSync('/tmp/sway-100-store.js', 'utf8');

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

  const seeded = await page.evaluate((src) => {
    localStorage.clear();
    const S = new Function(src + '\n; return Store;')();   // the 1.0.0 module, in its own scope
    const DAY = 86400000;
    const now = Date.now();
    // A real 1.0.0 phone opened each storm at its own wall-clock moment, so the ids it wrote are
    // base36 of those moments. Reproduce that exactly rather than nine ids from one millisecond.
    const realNow = Date.now;
    const mk = (daysAgo, hour, wave, chips, tools, durS) => {
      const d = new Date(now - daysAgo * DAY);
      d.setHours(hour, 17, 0, 0);
      Date.now = () => d.getTime();
      const id = S.openStorm();
      tools.forEach(t => S.addTool(id, t));
      S.patch(id, { endedAt: d.getTime() + durS * 1000, wave: wave,
                    chips: chips, durS: durS, launchMs: 380 + daysAgo, pocket: daysAgo % 3 === 0,
                    logged: true });
      Date.now = realNow;
      return id;
    };
    mk(96, 2, 5, ['night', 'home'], ['breathing', 'senses'], 640);
    mk(88, 23, 4, ['night'], ['breathing'], 590);
    mk(71, 8, 3, ['transit'], ['breathing', 'cold'], 470);
    mk(52, 14, 4, ['work', 'social'], ['breathing', 'tapping'], 505);
    mk(37, 1, 5, ['night'], ['breathing', 'senses', 'cold'], 430);
    mk(21, 19, 2, ['home'], ['breathing'], 300);
    mk(9, 3, 3, ['night', 'unknown'], ['breathing', 'senses'], 265);
    mk(2, 22, 2, ['home'], ['breathing'], 210);
    // an abandoned, never saved session, exactly as 1.0.0 left them behind
    Date.now = () => now - 5 * DAY;
    const stale = S.openStorm();
    Date.now = realNow;
    [412, 366, 501, 389, 344, 458, 377, 402].forEach(ms => S.recordPulse(ms));
    S.setContact({ name: 'Marta', phone: '+34 600 123 456' });
    S.setSetting('region', 'es');
    S.setSetting('protocol', 'long');
    S.setSetting('strength', 0.45);
    S.setSetting('haptics', false);
    S.setSetting('audio', true);
    S.setSetting('pocketDim', false);
    S.setSetting('calibrated', true);
    S.markLearn('air'); S.markLearn('heart'); S.markLearn('ends');
    return localStorage.getItem('sway.v1');
  }, LEGACY);

  const before = JSON.parse(seeded);
  log('1.0.0 record: ' + seeded.length + ' bytes, ' + before.storms.length + ' storms, ' +
      before.pulses.length + ' pulses, learnSeen ' + before.learnSeen.join('/'));
  log('1.0.0 keys: ' + Object.keys(before).join(',') + ' / settings ' + Object.keys(before.settings).join(','));

  // --- load the 1.0.1 build on top of it
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(900);
  if (errors.length) throw new Error('errors while opening on 1.0.0 data: ' + errors.join(' | '));

  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')));
  const keptLogged = after.storms.filter(s => s.logged);
  assert(keptLogged.length === 8, '1.0.0 saved storms lost: ' + keptLogged.length + ' of 8');
  for (const old of before.storms.filter(s => s.logged)) {
    const now = keptLogged.find(s => s.id === old.id);
    assert(now, 'storm ' + old.id + ' vanished');
    for (const k of ['at', 'endedAt', 'wave', 'durS', 'launchMs', 'pocket', 'logged']) {
      assert(JSON.stringify(now[k]) === JSON.stringify(old[k]),
        'storm ' + old.id + ' field ' + k + ' changed: ' + old[k] + ' -> ' + now[k]);
    }
    assert(now.chips.join() === old.chips.join(), 'chips changed on ' + old.id);
    assert(now.tools.join() === old.tools.join(), 'tools changed on ' + old.id);
  }
  // opening the new build legitimately measures one more launch, so the old run must survive as a prefix
  assert(after.pulses.slice(0, before.pulses.length).join() === before.pulses.join(),
    'pulse history changed: ' + before.pulses.join() + ' -> ' + after.pulses.join());
  assert(after.pulses.length === before.pulses.length + 1, 'the new launch was not measured');
  assert(after.learnSeen.join() === before.learnSeen.join(), 'read cards changed');
  assert(after.firstRun === before.firstRun, 'firstRun changed');
  for (const k of Object.keys(before.settings)) {
    assert(JSON.stringify(after.settings[k]) === JSON.stringify(before.settings[k]),
      'setting ' + k + ' changed: ' + JSON.stringify(before.settings[k]) + ' -> ' + JSON.stringify(after.settings[k]));
  }
  log('every 1.0.0 field survived unchanged');

  // --- and the new build actually reads it: every screen renders the old data
  await page.evaluate(() => window.App.setView('almanac'));
  await wait(700);
  const alm = await text('#v-almanac');
  assert(/8\s*\n?\s*storms saved/.test(alm.replace(/\s+/g, ' ')) || /8 storms saved/.test(alm.replace(/\s+/g, ' ')),
    'almanac does not count the 8 migrated storms: ' + alm.slice(0, 120));
  assert(/Marta|wave/.test(alm) && /Receipts/.test(alm), 'almanac missing sections: ' + alm.slice(0, 200));
  await shot('r30-almanac-migrated');
  log('almanac headline: ' + (await text('#almHead')));

  await page.evaluate(() => window.App.setView('shelter'));
  await wait(500);
  const cName = await page.evaluate(() => document.getElementById('cName').value);
  const cPhone = await page.evaluate(() => document.getElementById('cPhone').value);
  assert(cName === 'Marta' && cPhone === '+34 600 123 456', 'contact not restored: ' + cName + ' / ' + cPhone);
  const ui = await page.evaluate(() => ({
    region: document.getElementById('regionSel').value,
    proto: document.getElementById('protoSel').value,
    strength: document.getElementById('strengthRange').value,
    haptics: document.getElementById('hapticsChk').checked,
    audio: document.getElementById('audioChk').checked,
    dim: document.getElementById('dimChk').checked,
    rangeDisabled: document.getElementById('strengthRange').disabled
  }));
  assert(ui.region === 'es' && ui.proto === 'long' && ui.strength === '45' &&
         ui.haptics === false && ui.audio === true && ui.dim === false,
         'settings not restored into the UI: ' + JSON.stringify(ui));
  assert(ui.rangeDisabled === true, 'the strength slider should be disabled with haptics off');
  await shot('r31-shelter-migrated');

  await page.evaluate(() => window.App.setView('learn'));
  await wait(500);
  const readCount = await page.evaluate(() => document.querySelectorAll('.cardbtn.read').length);
  assert(readCount === 3, 'read cards not restored: ' + readCount);

  // the night shelf must show the migrated Spanish lines and the migrated person
  await page.evaluate(() => window.App.openShelf());
  await wait(500);
  const shelf = await text('#shelf');
  assert(/Marta/.test(shelf), 'shelf lost the migrated contact');
  assert(/024/.test(shelf) && /112/.test(shelf), 'shelf lost the migrated region lines: ' + shelf.replace(/\n/g, ' | '));
  await shot('r32-shelf-migrated');
  await page.evaluate(() => window.App.back());
  await wait(200);

  // export carries the whole migrated history
  const body = await page.evaluate(() => window.Store.exportText());
  const rows = (body.match(/Wave size/g) || []).length;
  assert(rows === 8, 'export lost migrated storms: ' + rows);
  assert(/Median time from opening Sway to the first pulse: \d+ ms over 9 sessions/.test(body),
    'export lost the migrated pulse history: ' + body.split('\n').slice(-2).join(' '));
  log('export rows: ' + rows);

  if (errors.length) throw new Error(errors.length + ' page errors');
};
