/* Reviewer pass 6: the native bridge, the haptics gate, the audio lifecycle, and every input edge. */
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

  await page.evaluateOnNewDocument(() => {
    window.__vib = [];
    window.__files = [];
    window.__awake = [];
    window.Native = {
      isNative: () => true,
      vibrate: (ms, amp) => { window.__vib.push([ms, amp]); },
      vibratePattern: (j, a) => { window.__vib.push(['pattern', j, a]); },
      hasAmplitudeControl: () => true,
      cancelVibration: () => {},
      keepAwake: (b) => { window.__awake.push(b); },
      saveFile: (name, mime, b64) => { window.__files.push({ name, mime, b64 }); return 'content://downloads/' + name; },
      shareText: () => {}, shareUri: () => {}
    };
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(900);

  const vib = () => page.evaluate(() => window.__vib.length);
  assert(await vib() > 0, 'the covenant pulse never reached the native bridge');
  log('pulses on the bridge after launch: ' + await vib());
  assert((await page.evaluate(() => window.__awake)).includes(true), 'keepAwake was never asked for');

  // --- the haptics gate: switching the motor off must silence everything, not just the rhythm
  await page.evaluate(() => { window.App.setView('shelter');
    const c = document.getElementById('hapticsChk'); c.checked = false;
    c.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(400);
  await page.evaluate(() => { window.__vib = []; });
  await page.evaluate(() => {
    document.getElementById('testSwell').click();                     // disabled, must do nothing
    const r = document.getElementById('strengthRange');
    r.value = 80; r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(600);
  assert(await vib() === 0, 'the calibration controls vibrated with haptics off: ' + await vib());

  await page.evaluate(() => window.App.startSession({}));
  await wait(3000);
  assert(await vib() === 0, 'the breathing rhythm vibrated with haptics off: ' + await vib());
  await click('#endBtn'); await wait(300);
  await click('#forkStorm'); await wait(250);
  await click('[data-tool="tapping"]'); await wait(2200);
  assert(await vib() === 0, 'the bilateral beat vibrated with haptics off: ' + await vib());
  // and the copy on that screen tells the truth about it
  const how = await text('#tapHow');
  assert(/lights keep the beat/.test(how), 'the tapping screen still claims the phone keeps the beat: ' + how);
  const flips = await page.evaluate(async () => {
    const seen = new Set();
    for (let i = 0; i < 22; i++) { seen.add(document.getElementById('dotL').classList.contains('lit') ? 'L' : 'R');
      await new Promise(r => setTimeout(r, 90)); }
    return seen.size;
  });
  assert(flips === 2, 'with haptics off the two lights must still keep the beat');
  log('haptics off: 0 vibrations anywhere, the lights still alternate');

  await click('#tapDone'); await wait(300);
  await page.evaluate(() => { window.App.setView('shelter');
    const c = document.getElementById('hapticsChk'); c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(300);
  await page.evaluate(() => { window.__vib = []; });
  await page.evaluate(() => window.App.startSession({}));
  await wait(2500);
  assert(await vib() > 4, 'the rhythm did not vibrate with haptics back on: ' + await vib());
  const amps = await page.evaluate(() => window.__vib.map(v => v[1]));
  assert(Math.max.apply(null, amps) <= 255 && Math.min.apply(null, amps) >= 1,
    'amplitudes out of the 1..255 range: ' + amps.join(','));
  log('haptics on: ' + amps.length + ' pulses, amplitude ' + Math.min.apply(null, amps) + '..' + Math.max.apply(null, amps));

  // --- the tide sound must start with the session and hand the hardware back at the end
  await page.evaluate(() => { window.App.setView('shelter');
    const c = document.getElementById('audioChk'); c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(300);
  await page.evaluate(() => window.App.startSession({}));
  await wait(900);
  const running = await page.evaluate(() => window.Engine.audioState());
  assert(running === 'running', 'the tide sound did not start: ' + running);
  await page.evaluate(() => window.App.onPause()); await wait(1400);
  const paused = await page.evaluate(() => window.Engine.audioState());
  assert(paused === 'suspended', 'the audio context stayed open after onPause: ' + paused);
  await page.evaluate(() => window.App.onResume()); await wait(700);
  assert(await page.evaluate(() => window.Engine.audioState()) === 'running', 'the tide sound did not come back on resume');
  await click('#endBtn'); await wait(1500);
  const ended = await page.evaluate(() => window.Engine.audioState());
  assert(ended === 'suspended', 'the audio context was left running after the session ended: ' + ended);
  log('tide sound: starts, suspends on pause, returns on resume, suspends at the end');
  await page.evaluate(() => { window.App.setView('shelter');
    const c = document.getElementById('audioChk'); c.checked = false;
    c.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(250);

  // --- export through the native bridge
  await page.evaluate(() => { document.getElementById('exportBtn').click(); });
  await wait(400);
  const files = await page.evaluate(() => window.__files);
  assert(files.length === 1 && files[0].name === 'sway-storm-log.txt', 'Native.saveFile was not used: ' + JSON.stringify(files));
  const decoded = Buffer.from(files[0].b64, 'base64').toString('utf8');
  assert(/Sway storm log/.test(decoded), 'the saved file is not the log: ' + decoded.slice(0, 80));
  assert(await text('#toast') === 'Saved to your Downloads folder', 'no confirmation after a native save');
  log('native export wrote ' + decoded.length + ' bytes and confirmed');

  // --- inputs at their edges
  const long = 'Aurelia-Konstantina Vasconcelos-Whitmore de la Fuente y Santamaria the third';
  await page.evaluate((n) => { document.getElementById('cName').value = n;
    document.getElementById('cPhone').value = '+1 (555) 010-9999 ext. 4412';
    document.getElementById('cSave').click(); }, long);
  await wait(400);
  await page.evaluate(() => window.App.openShelf()); await wait(400);
  await shot('r60-shelf-long-name');
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('#shelf .sheet-panel');
    return { scroll: el.scrollWidth, client: el.clientWidth,
             docScroll: document.documentElement.scrollWidth, docClient: document.documentElement.clientWidth };
  });
  assert(overflow.scroll <= overflow.client + 1, 'a very long name burst the shelf sheet: ' + JSON.stringify(overflow));
  assert(overflow.docScroll <= overflow.docClient + 1, 'the page scrolls sideways: ' + JSON.stringify(overflow));
  await page.evaluate(() => window.App.openBystander()); await wait(400);
  await shot('r61-bystander-long-name');
  const bOver = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  assert(bOver.s <= bOver.c + 1, 'the bystander card scrolls sideways with a long name');
  await page.evaluate(() => window.App.back()); await wait(300);

  // empty save clears the person
  await page.evaluate(() => { document.getElementById('cName').value = '';
    document.getElementById('cPhone').value = ''; document.getElementById('cSave').click(); });
  await wait(300);
  const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')).settings.contact);
  assert(cleared.name === '' && cleared.phone === '', 'clearing the person did not stick');
  assert(/One person you would want/.test(await text('#contactState')), 'the empty person copy did not come back');

  // a number with no digits at all
  await page.evaluate(() => { document.getElementById('cPhone').value = 'ring the doorbell';
    document.getElementById('cSave').click(); });
  await wait(300);
  await page.evaluate(() => window.App.openShelf()); await wait(400);
  const disabled = await page.evaluate(() => document.getElementById('shelfContact').disabled);
  assert(disabled, 'a number with no digits still offered a live Call button');
  await page.evaluate(() => window.App.back()); await wait(250);

  // --- the region with no bundled line
  await page.evaluate(() => { const s = document.getElementById('regionSel'); s.value = 'other';
    s.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(300);
  await page.evaluate(() => window.App.openShelf()); await wait(400);
  const shelfTxt = await text('#shelf');
  assert(/112/.test(shelfTxt), 'the fallback region lost its emergency number');
  assert(/No local line is bundled/.test(shelfTxt), 'the fallback region does not say so');
  await shot('r62-shelf-other-region');
  await page.evaluate(() => window.App.back()); await wait(250);

  // --- rapid double taps on every primary button
  const stormsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')).storms.length);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) document.getElementById('rehearseBtn').click(); });
  await wait(700);
  await page.evaluate(() => window.App.back()); await wait(400);
  await page.evaluate(() => { window.App.startSession({}); });
  await wait(500);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) document.getElementById('endBtn').click(); });
  await wait(500);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) document.getElementById('forkPass').click(); });
  await wait(500);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) document.getElementById('logSave').click(); });
  await wait(500);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) document.getElementById('closeDone').click(); });
  await wait(600);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')).storms);
  const loggedNow = after.filter(s => s.logged).length;
  assert(loggedNow === 1, 'rapid taps produced ' + loggedNow + ' logged storms instead of 1');
  assert(after.length - stormsBefore <= 1, 'rapid taps opened extra storm records: ' +
    stormsBefore + ' -> ' + after.length);
  log('rapid taps: ' + after.length + ' records, ' + loggedNow + ' logged');

  // --- rotating through screens fast
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.App.setView('almanac'));
    await page.evaluate(() => window.App.setView('learn'));
    await page.evaluate(() => window.App.setView('shelter'));
  }
  await wait(500);
  await page.evaluate(() => window.App.startSession({}));
  await wait(400);
  await page.evaluate(() => window.App.back());
  await wait(400);

  // --- erase everything: two taps, then the region guess must come back
  await page.evaluate(() => { const s = document.getElementById('regionSel'); s.value = 'uk';
    s.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(200);
  await page.evaluate(() => document.getElementById('eraseBtn').click());
  await wait(200);
  assert(/Tap again/.test(await page.evaluate(() => document.getElementById('eraseBtn').textContent)),
    'the erase button did not arm');
  const still = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')).storms.length);
  assert(still > 0, 'one tap on erase already destroyed the log');
  await page.evaluate(() => document.getElementById('eraseBtn').click());
  await wait(400);
  const wiped = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')));
  assert(wiped.storms.length === 0 && wiped.pulses.length === 0 && wiped.settings.contact.name === '',
    'erase left data behind: ' + JSON.stringify(wiped).slice(0, 160));
  assert(wiped.settings.region, 'erase left the region blank, so the shelf falls back to no local line');
  log('erase: armed, then wiped, region re-guessed as ' + wiped.settings.region);

  // --- a corrupt record must not take the app down
  await page.evaluate(() => localStorage.setItem('sway.v1', '{not json at all'));
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(800);
  assert(await page.evaluate(() => !document.getElementById('s-session').hidden), 'a corrupt record broke the launch');
  log('a corrupt record falls back to defaults and still opens into the rhythm');

  if (errors.length) throw new Error(errors.length + ' page errors');
};
