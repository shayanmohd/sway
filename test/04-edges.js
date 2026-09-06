/* Sway drive script 4: the edges. Empty and enormous input, duplicate saves, rapid double taps,
   fast screen rotation, the erase gate, both export paths, and the pocket veil.
   Run: node ../_shiptools/drive.js http://127.0.0.1:8816/index.html test/04-edges.js --out test/shots */
module.exports = async ({ page, shot, wait, text, click, type, log, errors }) => {
  // Collect every failure so one bad edge does not hide the rest, then fail the run at the end.
  const problems = [];
  const fail = m => { problems.push(m); log('  FAIL:', m); };

  // A mocked Android bridge, installed before any script runs, so the Native export path is exercised.
  await page.evaluateOnNewDocument(() => {
    window.__native = { vibrations: 0, saved: null, awake: null, cancels: 0 };
    try { if (localStorage.getItem('__noNative')) return; } catch (e) {}
    window.Native = {
      isNative: () => true,
      vibrate: (ms, amp) => { window.__native.vibrations++; },
      vibratePattern: () => {},
      hasAmplitudeControl: () => true,
      cancelVibration: () => { window.__native.cancels++; },
      keepAwake: (b) => { window.__native.awake = b; },
      saveFile: (name, mime, b64) => { window.__native.saved = { name, mime, bytes: b64.length }; return 'content://downloads/' + name; },
      shareText: () => {}, shareUri: () => {}
    };
  });
  await page.evaluate(() => localStorage.removeItem('sway.v1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(900);

  log('native bridge saw vibrations:', await page.evaluate(() => window.__native.vibrations));
  log('keepAwake:', await page.evaluate(() => window.__native.awake));
  if (await page.evaluate(() => window.__native.vibrations) < 1) fail('no haptic fired on open');
  if (await page.evaluate(() => window.__native.awake) !== true) fail('keepAwake was not requested for the session');

  await page.evaluate(() => App.setView('shelter'));
  await wait(400);

  // ---- empty contact ----
  await click('#cSave');
  await wait(300);
  let st = await text('#contactState');
  log('empty contact state:', st.slice(0, 60));
  const shelfEmpty = await page.evaluate(() => { App.openShelf(); const b = document.getElementById('shelfContact'); const r = { name: document.getElementById('shelfContactName').textContent, disabled: b.disabled }; document.getElementById('shelf').hidden = true; return r; });
  log('shelf with no contact:', JSON.stringify(shelfEmpty));
  if (!shelfEmpty.disabled) fail('the shelf offered to call a contact that does not exist');

  // ---- a phone with no name ----
  await page.evaluate(() => { Store.setContact({ name: '', phone: '07700900123' }); App.setView('shelter'); });
  await wait(250);
  const noName = await page.evaluate(() => { App.openShelf(); const r = { name: document.getElementById('shelfContactName').textContent, disabled: document.getElementById('shelfContact').disabled }; document.getElementById('shelf').hidden = true; return r; });
  log('shelf with a number but no name:', JSON.stringify(noName));
  if (!noName.disabled && /not set/i.test(noName.name))
    fail('the shelf says the person is not set but the call button is live');

  // ---- an enormous name and a number full of junk ----
  const long = 'Alexandrina Constantina '.repeat(9).trim();
  await page.evaluate(() => { document.getElementById('cName').value = ''; document.getElementById('cPhone').value = ''; });
  await type('#cName', long.slice(0, 120));
  await type('#cPhone', '  +44 (0) 7700-900 123 ext. 4455  ');
  await click('#cSave');
  await wait(350);
  await shot('40-long-contact');
  const wide = await page.evaluate(() => {
    App.openShelf();
    const b = document.getElementById('shelfContactName');
    const r = { over: b.scrollWidth - b.clientWidth, panel: document.querySelector('.sheet-panel').scrollWidth - document.querySelector('.sheet-panel').clientWidth };
    return r;
  });
  await wait(250);
  await shot('41-long-contact-shelf');
  log('long name overflow (px past the box):', JSON.stringify(wide));
  await page.evaluate(() => { document.getElementById('shelf').hidden = true; });
  if (wide.over > 1 || wide.panel > 1) fail('a long contact name overflows the night shelf');

  // ---- saving the same contact twice must not double anything ----
  await page.evaluate(() => App.setView('shelter'));
  await wait(200);
  await click('#cSave'); await click('#cSave');
  await wait(300);
  const dupes = await page.evaluate(() => JSON.parse(localStorage.getItem('sway.v1')).settings.contact);
  log('after two identical saves:', JSON.stringify(dupes));

  // ---- the range at both ends ----
  for (const v of ['15', '100']) {
    await page.evaluate(x => { const r = document.getElementById('strengthRange'); r.value = x; r.dispatchEvent(new Event('change')); }, v);
    await wait(120);
  }
  log('strength after both ends:', await page.evaluate(() => Store.settings().strength));

  // ---- every protocol, and the swell test ----
  for (const p of ['even', 'long', 'tide']) {
    await page.evaluate(x => { const s = document.getElementById('protoSel'); s.value = x; s.dispatchEvent(new Event('change')); }, p);
    await wait(80);
    const ph = await page.evaluate(() => Engine.phasesAt(0));
    log('protocol', p, JSON.stringify(ph));
    if (!(ph.inh > 0 && ph.exh > 0)) fail('protocol ' + p + ' produced a broken cycle');
  }
  await click('#testSwell');
  await wait(900);

  // ---- rapid double taps on every primary button ----
  const doubleTap = async (sel) => page.evaluate(s => {
    const el = document.querySelector(s); if (!el) return 'missing';
    el.click(); el.click(); return 'ok';
  }, sel);

  await page.evaluate(() => { Store.eraseAll(); App.startSession({}); });
  await wait(500);
  const before = await page.evaluate(() => Store.storms().length);
  await doubleTap('#endBtn'); await wait(300);
  await doubleTap('#forkStorm'); await wait(250);
  await doubleTap('[data-tool="senses"]'); await wait(250);
  await doubleTap('#s-step'); await wait(200);
  await page.evaluate(() => { while (!document.getElementById('s-step').hidden) document.getElementById('s-step').click(); });
  await wait(250);
  await doubleTap('#forkPass'); await wait(250);
  await doubleTap('#logSave'); await wait(350);
  await shot('42-double-tap-closing');
  const afterSave = await page.evaluate(() => ({ logged: Store.logged().length, all: Store.storms().length }));
  log('storms after a double-tapped run (was ' + before + '):', JSON.stringify(afterSave));
  if (afterSave.logged !== 1) fail('double tapping Save logged ' + afterSave.logged + ' storms');

  await doubleTap('#closeAgain'); await wait(600);
  const afterAgain = await page.evaluate(() => ({ all: Store.storms().length, running: Engine.isRunning() }));
  log('after double-tapping "back to the rhythm":', JSON.stringify(afterAgain));
  if (afterAgain.all > 2) fail('double tapping opened ' + afterAgain.all + ' storms');
  if (!afterAgain.running) fail('the rhythm did not restart');

  // ---- rotating through screens quickly ----
  await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 6; i++) {
      App.setView('almanac'); await w(30);
      App.setView('learn'); await w(30);
      App.setView('shelter'); await w(30);
      App.startSession({}); await w(30);
      App.openLog(); await w(30);
      App.openShelf(); await w(30);
      App.back(); await w(30);
      App.openBystander(); await w(30);
      App.back(); await w(30);
    }
  });
  await wait(600);
  await shot('43-after-thrash');
  log('after thrashing screens, engine running:', await page.evaluate(() => Engine.isRunning()));

  // ---- export through the native bridge ----
  await page.evaluate(() => { App.setView('shelter'); });
  await wait(400);
  await click('#exportBtn');
  await wait(500);
  const saved = await page.evaluate(() => window.__native.saved);
  log('Native.saveFile got:', JSON.stringify(saved));
  log('toast:', await text('#toast'));
  if (!saved || saved.name !== 'sway-storm-log.txt' || saved.bytes < 40) fail('the native export path did not fire');
  const decoded = await page.evaluate(() => Store.exportText());
  if (!/Sway storm log/.test(decoded)) fail('the export is not the storm log');

  // ---- export through the browser download path ----
  // App captures window.Native once at load, so the browser path needs a load without the bridge.
  await page.evaluate(() => { localStorage.setItem('__noNative', '1'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  const dl = await page.evaluate(() => new Promise(res => {
    const realClick = HTMLAnchorElement.prototype.click;
    const t = setTimeout(() => { HTMLAnchorElement.prototype.click = realClick; res({ name: 'timed out', href: '' }); }, 3000);
    HTMLAnchorElement.prototype.click = function () {
      clearTimeout(t); HTMLAnchorElement.prototype.click = realClick;
      res({ name: this.download, href: this.href.slice(0, 5) });
    };
    App.setView('shelter');
    setTimeout(() => document.getElementById('exportBtn').click(), 80);
  }));
  log('browser download path:', JSON.stringify(dl));
  if (dl.name !== 'sway-storm-log.txt' || dl.href !== 'blob:') fail('the browser export path did not fire');

  // ---- the erase gate ----
  await wait(300);
  await click('#eraseBtn');
  await wait(200);
  await shot('44-erase-armed');
  log('armed label:', await text('#eraseBtn'), '|', await text('#ioNote'));
  const stillThere = await page.evaluate(() => Store.logged().length);
  if (stillThere === 0) fail('one tap erased everything');
  await click('#eraseBtn');
  await wait(400);
  const erased = await page.evaluate(() => ({ logged: Store.logged().length, region: Store.settings().region, contact: Store.settings().contact.name }));
  log('after the second tap:', JSON.stringify(erased));
  if (erased.logged !== 0 || erased.contact !== '') fail('erase did not clear everything');
  if (!erased.region) fail('erase dropped the region guess');
  await shot('45-erased');

  // ---- the pocket veil ----
  await page.evaluate(() => { Store.setSetting('pocketDim', true); App.startSession({}); });
  await wait(400);
  await page.evaluate(() => { document.getElementById('pocketVeil').hidden = false; });
  await wait(300);
  await shot('46-pocket');
  const veil = await page.evaluate(() => ({ running: Engine.isRunning(), hidden: document.getElementById('pocketVeil').hidden }));
  await page.evaluate(() => App.back());
  await wait(200);
  const after = await page.evaluate(() => ({ running: Engine.isRunning(), hidden: document.getElementById('pocketVeil').hidden }));
  log('pocket veil:', JSON.stringify(veil), '-> back ->', JSON.stringify(after));
  if (!after.hidden || !after.running) fail('the pocket veil did not lift, or stopped the rhythm');

  await page.evaluate(() => localStorage.removeItem('__noNative'));
  log('errors so far:', errors.length);
  if (problems.length) throw new Error(problems.length + ' edge case(s) failed:\n  - ' + problems.join('\n  - '));
};
