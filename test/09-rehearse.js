/* Sway drive script 9: the calm-hours paths the crisis scripts never reach. A rehearsal from the
   Shelter, the Back gesture while one is running, the haptics switch actually silencing the motor,
   and the tide sound letting go of the audio hardware when a session ends.
   Run: node ../_shiptools/drive.js http://127.0.0.1:8816/index.html test/09-rehearse.js --out test/shots */
module.exports = async ({ page, shot, wait, text, click, log, errors }) => {
  const problems = [];
  const fail = m => { problems.push(m); log('  FAIL:', m); };

  await page.evaluateOnNewDocument(() => {
    window.__native = { vibrations: 0, awake: null };
    window.Native = {
      isNative: () => true,
      vibrate: () => { window.__native.vibrations++; },
      vibratePattern: () => {},
      hasAmplitudeControl: () => true,
      cancelVibration: () => {},
      keepAwake: (b) => { window.__native.awake = b; },
      saveFile: () => 'content://x', shareText: () => {}, shareUri: () => {}
    };
  });
  await page.evaluate(() => localStorage.removeItem('sway.v1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(900);

  const where = () => page.evaluate(() => {
    for (const id of ['s-session', 's-fork', 's-tools', 's-step', 's-tap', 's-log', 's-closing'])
      if (!document.getElementById(id).hidden) return id;
    for (const v of ['shelter', 'almanac', 'learn'])
      if (!document.getElementById('v-' + v).hidden) return 'calm:' + v;
    return '?';
  });

  // ---- a rehearsal must log nothing and must not be mistaken for a storm ----
  await page.evaluate(() => { App.setView('shelter'); });
  await wait(400);
  const stormsBefore = await page.evaluate(() => Store.storms().length);
  await click('#rehearseBtn');
  await wait(700);
  await shot('90-rehearsal');
  const inRehearsal = await page.evaluate(() => ({
    where: document.getElementById('s-session').hidden ? 'not session' : 'session',
    hint: document.getElementById('hint').textContent,
    running: Engine.isRunning(),
    storms: Store.storms().length
  }));
  log('rehearsal:', JSON.stringify(inRehearsal));
  if (inRehearsal.where !== 'session' || !inRehearsal.running) fail('the rehearsal did not start');
  if (inRehearsal.storms !== stormsBefore) fail('a rehearsal opened a storm record');
  if (!/rehearsal/i.test(inRehearsal.hint)) fail('the rehearsal screen does not say it is a rehearsal');

  // Back during a rehearsal: the rehearsal was entered from the Shelter, so it is nested.
  const backOut = await page.evaluate(() => App.back());
  await wait(500);
  const afterBack = await where();
  log('Back during a rehearsal returned', backOut, 'and landed on', afterBack);
  if (backOut !== true) fail('Back during a rehearsal returned false, so the shell would quit the app');
  if (afterBack !== 'calm:shelter') fail('Back during a rehearsal did not return to the Shelter, it went to ' + afterBack);
  const stillRunning = await page.evaluate(() => Engine.isRunning());
  if (stillRunning) fail('the rehearsal kept running after Back');

  // Ending a rehearsal with the X must go to the Shelter, never to the storm fork.
  await click('#rehearseBtn'); await wait(600);
  await click('#endBtn'); await wait(600);
  const afterX = await where();
  log('ending a rehearsal with X landed on', afterX, '| toast:', (await text('#toast') || '').slice(0, 40));
  if (afterX !== 'calm:shelter') fail('ending a rehearsal landed on ' + afterX);
  if (await page.evaluate(() => Store.storms().length) !== stormsBefore) fail('ending a rehearsal wrote a storm');

  // A double tap on Rehearse must not stack two sessions.
  await page.evaluate(() => { const b = document.getElementById('rehearseBtn'); b.click(); b.click(); });
  await wait(600);
  log('after a double-tapped rehearse, storms:', await page.evaluate(() => Store.storms().length));
  if (await page.evaluate(() => Store.storms().length) !== stormsBefore) fail('a double-tapped rehearsal wrote a storm');
  await page.evaluate(() => App.back()); await wait(400);

  // ---- the haptics switch has to silence the motor, not just the breathing rhythm ----
  await page.evaluate(() => { Store.setSetting('haptics', false); App.setView('shelter'); });
  await wait(300);
  await page.evaluate(() => { window.__native.vibrations = 0; });
  await page.evaluate(() => { App.startSession({}); });
  await wait(1400);
  const vibSession = await page.evaluate(() => window.__native.vibrations);
  log('vibrations in 1.4s of a session with haptics off:', vibSession);
  if (vibSession > 0) fail('haptics are off but the session vibrated ' + vibSession + ' times');

  await page.evaluate(() => { window.__native.vibrations = 0; document.getElementById('endBtn').click(); });
  await wait(300);
  await page.evaluate(() => document.getElementById('forkStorm').click());
  await wait(250);
  await page.evaluate(() => document.querySelector('[data-tool="tapping"]').click());
  await wait(1400);
  const vibTaps = await page.evaluate(() => window.__native.vibrations);
  const dotsMoved = await page.evaluate(() => new Promise(r => {
    const seen = new Set();
    const t = setInterval(() => document.querySelectorAll('.dot').forEach((d, i) => { if (d.classList.contains('lit')) seen.add(i); }), 60);
    setTimeout(() => { clearInterval(t); r(seen.size); }, 1300);
  }));
  await shot('91-tapping-haptics-off');
  log('with haptics off: button and beat vibrations =', vibTaps, ', dot sides still alternating =', dotsMoved);
  if (vibTaps > 0) fail('haptics are off but ' + vibTaps + ' vibrations still fired');
  if (dotsMoved < 2) fail('with haptics off the bilateral beat stopped moving on screen too');
  const tapCopy = await text('#s-tap');
  log('tapping copy with haptics off:', tapCopy.split('\n').slice(-1)[0]);
  if (/phone has one motor/.test(tapCopy)) fail('the tapping screen still says the phone keeps the beat when it cannot');

  // The calibration controls must not pretend to work with the motor switched off.
  await page.evaluate(() => { App.back(); App.back(); App.setView('shelter'); });
  await wait(400);
  const calib = await page.evaluate(() => ({
    swell: document.getElementById('testSwell').disabled,
    range: document.getElementById('strengthRange').disabled,
    note: document.getElementById('ampNote').textContent
  }));
  log('calibration with haptics off:', JSON.stringify(calib));
  if (!calib.swell || !calib.range) fail('the calibration controls are live with haptics off');
  await page.evaluate(() => document.getElementById('calibPanel').scrollIntoView({ block: 'center' }));
  await wait(400);
  await shot('92-calibration-off');

  await page.evaluate(() => { Store.setSetting('haptics', true); App.setView('shelter'); });
  await wait(300);
  await page.evaluate(() => { window.__native.vibrations = 0; App.startSession({}); });
  await wait(1200);
  const vibOn = await page.evaluate(() => window.__native.vibrations);
  log('vibrations in 1.2s with haptics back on:', vibOn);
  if (vibOn < 1) fail('turning haptics back on did not restore the rhythm');

  // ---- the tide sound must let go of the audio hardware when the session ends ----
  await page.evaluate(() => { Store.setSetting('audio', true); App.startSession({}); Engine.audioResume(); });
  await wait(900);
  const audioLive = await page.evaluate(() => Engine.audioState());
  await page.evaluate(() => { document.getElementById('endBtn').click(); });
  await wait(1400);
  const audioAfter = await page.evaluate(() => Engine.audioState());
  log('audio context during a session:', audioLive, '| after it ends:', audioAfter);
  if (audioLive !== 'running') fail('the tide sound never started: ' + audioLive);
  if (audioAfter === 'running') fail('the audio context is still running after the session ended');

  await page.evaluate(() => { Store.setSetting('audio', false); });
  log('errors so far:', errors.length);
  if (problems.length) throw new Error(problems.length + ' problem(s):\n  - ' + problems.join('\n  - '));
};
