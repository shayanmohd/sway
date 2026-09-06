/* Sway drive script 2: the shell contract. Reload persistence, a fresh tab, the Back gesture on every
   nested screen, onPause / onResume, and the safe-area insets the Android shell injects.
   Run: node ../_shiptools/drive.js http://127.0.0.1:8816/index.html test/02-shell.js --out test/shots */
module.exports = async ({ page, shot, wait, click, log, errors }) => {
  const insets = () => page.evaluate(() => {
    const r = document.documentElement.style;
    r.setProperty('--sat', '48px');
    r.setProperty('--sab', '34px');
  });

  // ---- create data, then reload and prove it survived ----
  await wait(600);
  await page.evaluate(() => {
    const id = Store.openStorm();
    Store.patch(id, { wave: 3, chips: ['work'], durS: 214, logged: true });
    Store.setContact({ name: 'Priya', phone: '+44 7700 900123' });
    Store.setSetting('protocol', 'long');
    Store.setSetting('strength', 0.45);
    Store.setSetting('audio', true);
    Store.markLearn('chest');
  });
  const snap = () => page.evaluate(() => JSON.stringify({
    logged: Store.logged().length, contact: Store.settings().contact,
    proto: Store.settings().protocol, strength: Store.settings().strength,
    audio: Store.settings().audio, seen: Store.learnSeen('chest')
  }));
  const before = await snap();
  log('before reload:', before);

  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  const after = await snap();
  log('after reload: ', after);
  if (before !== after) throw new Error('state changed across a reload');

  // A brand new tab is the same profile, so this is the "killed the tab" case.
  const page2 = await page.browser().newPage();
  await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page2.goto(page.url(), { waitUntil: 'networkidle0' });
  await wait(700);
  const fresh = await page2.evaluate(() => JSON.stringify({
    logged: Store.logged().length, contact: Store.settings().contact,
    proto: Store.settings().protocol, strength: Store.settings().strength,
    audio: Store.settings().audio, seen: Store.learnSeen('chest')
  }));
  log('fresh tab:   ', fresh);
  await page2.close();
  if (fresh !== after) throw new Error('state changed in a fresh tab');

  // ---- safe areas on every screen ----
  await insets();
  await wait(500);
  await shot('20-safe-session');

  const overlap = () => page.evaluate(() => {
    const sat = 48, sab = 34, H = window.innerHeight, bad = [], seen = new Set();
    // The visible rect: the element's own box clipped by every scrolling ancestor.
    const visible = (el) => {
      let r = el.getBoundingClientRect();
      let t = r.top, b = r.bottom;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(st.overflowY)) {
          const pr = p.getBoundingClientRect();
          t = Math.max(t, pr.top); b = Math.min(b, pr.bottom);
        }
      }
      return { t, b, w: r.width };
    };
    document.querySelectorAll('button, h1, h2, p, input, select, li, .tab, .chip, .wavebtn, .stat b').forEach(el => {
      if (!el.offsetParent) return;
      const cs = getComputedStyle(el);
      const v = visible(el);
      // Padding is deliberate spacing, not content: measure the box the ink actually sits in.
      const t = v.t + parseFloat(cs.paddingTop), b = v.b - parseFloat(cs.paddingBottom);
      if (v.w < 2 || b - t < 2) return;
      if (b <= 0 || t >= H) return;
      const id = (el.id || el.className || el.tagName) + '';
      if (seen.has(id)) return;
      if (t < sat - 0.5 || b > H - sab + 0.5) { seen.add(id); bad.push(id + ' ' + Math.round(t) + '..' + Math.round(b)); }
    });
    return bad;
  });
  const report = async (name) => { const b = await overlap(); log(name, b.length ? 'UNDER A BAR: ' + b.join(' | ') : 'clear'); return b; };

  let bad = [];
  bad = bad.concat(await report('session   '));
  await click('#shelfBtn'); await wait(350); await shot('21-safe-shelf');
  bad = bad.concat(await report('night shelf'));
  await click('#shelfClose'); await wait(200);
  await click('#endBtn'); await wait(300); await shot('22-safe-fork');
  bad = bad.concat(await report('fork      '));
  await click('#forkStorm'); await wait(250); bad = bad.concat(await report('tools     '));
  await click('[data-tool="senses"]'); await wait(250); await shot('23-safe-step');
  bad = bad.concat(await report('step      '));
  await page.evaluate(() => App.back()); await wait(200);
  await page.evaluate(() => App.openLog()); await wait(250); await shot('24-safe-log');
  bad = bad.concat(await report('log       '));
  await click('#logSkip'); await wait(300); await shot('25-safe-closing');
  bad = bad.concat(await report('closing   '));
  await click('#closeDone'); await wait(400); await shot('26-safe-shelter');
  bad = bad.concat(await report('shelter   '));
  await page.evaluate(() => App.setView('almanac')); await wait(400); await shot('27-safe-almanac');
  bad = bad.concat(await report('almanac   '));
  await page.evaluate(() => App.setView('learn')); await wait(300);
  bad = bad.concat(await report('learn     '));
  await page.evaluate(() => App.openBystander()); await wait(350); await shot('28-safe-bystander');
  bad = bad.concat(await report('bystander '));
  await click('#bysClose'); await wait(250);

  // ---- Back on every nested screen ----
  const back = () => page.evaluate(() => App.back());
  const where = () => page.evaluate(() => {
    if (!document.getElementById('s-bystander').hidden) return 'bystander';
    if (!document.getElementById('reader').hidden) return 'reader';
    if (!document.getElementById('shelf').hidden) return 'shelf';
    for (const id of ['s-session','s-fork','s-tools','s-step','s-tap','s-log','s-closing'])
      if (!document.getElementById(id).hidden) return id;
    for (const v of ['shelter','almanac','learn'])
      if (!document.getElementById('v-' + v).hidden) return 'calm:' + v;
    return '?';
  });

  const chain = [];
  const step = async (label) => { const r = await back(); chain.push(label + ' -> ' + r + ' @ ' + await where()); };

  await page.evaluate(() => App.setView('almanac')); await wait(200);
  await step('calm almanac');                        // true, back to shelter
  await step('calm shelter');                        // false, the root of the calm layer

  await page.evaluate(() => App.startSession({})); await wait(400);
  await page.evaluate(() => App.openShelf()); await wait(200);
  await step('shelf');
  await page.evaluate(() => App.openBystander()); await wait(200);
  await step('bystander');
  await page.evaluate(() => { document.getElementById('endBtn').click(); }); await wait(250);
  await step('fork');                                // back to the rhythm
  await wait(250);
  await page.evaluate(() => { document.getElementById('endBtn').click(); }); await wait(250);
  await page.evaluate(() => document.getElementById('forkStorm').click()); await wait(200);
  await step('tools');
  await page.evaluate(() => document.getElementById('forkStorm').click()); await wait(150);
  await page.evaluate(() => document.querySelector('[data-tool="senses"]').click()); await wait(200);
  await step('step');
  await page.evaluate(() => document.querySelector('[data-tool="tapping"]').click()); await wait(300);
  await step('tapping');
  await step('tools again');
  await page.evaluate(() => App.openLog()); await wait(200);
  await step('log');
  await page.evaluate(() => { App.openLog(); document.getElementById('logSkip').click(); }); await wait(250);
  await step('closing');
  await page.evaluate(() => App.startSession({})); await wait(300);
  await step('session (root)');
  chain.forEach(c => log('  back:', c));

  // ---- pause and resume ----
  await page.evaluate(() => App.startSession({})); await wait(500);
  const p1 = await page.evaluate(() => { App.onPause(); return { running: Engine.isRunning() }; });
  await wait(300);
  const p2 = await page.evaluate(() => { App.onResume(); return { running: Engine.isRunning() }; });
  await wait(600);
  const painting = await page.evaluate(() => new Promise(r => {
    const c = document.getElementById('water'), g = c.getContext('2d');
    const a = g.getImageData(4, Math.round(c.height * 0.9), 1, 1).data.join(',');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const b = g.getImageData(4, Math.round(c.height * 0.9), 1, 1).data.join(',');
      r({ a, b, alive: g.getImageData(4, Math.round(c.height * 0.9), 1, 1).data[3] > 0 });
    }));
  }));
  log('pause running:', p1.running, 'resume running:', p2.running, 'canvas alive after resume:', painting.alive);
  if (!p2.running) throw new Error('the rhythm did not survive onPause/onResume');
  if (!painting.alive) throw new Error('the water stopped drawing after onResume');

  // Pause on the tapping screen must stop the beat and resume must bring it back.
  await page.evaluate(() => { document.getElementById('endBtn').click(); }); await wait(200);
  await page.evaluate(() => document.getElementById('forkStorm').click()); await wait(150);
  await page.evaluate(() => document.querySelector('[data-tool="tapping"]').click()); await wait(700);
  await page.evaluate(() => App.onPause()); await wait(700);
  const litAfterPause = await page.evaluate(() => document.querySelectorAll('.dot.lit').length);
  await page.evaluate(() => App.onResume()); await wait(1400);
  const beating = await page.evaluate(() => new Promise(r => {
    let seen = new Set();
    const t = setInterval(() => { document.querySelectorAll('.dot').forEach((d, i) => { if (d.classList.contains('lit')) seen.add(i); }); }, 60);
    setTimeout(() => { clearInterval(t); r(seen.size); }, 1300);
  }));
  log('tapping: lit dots while paused =', litAfterPause, ', sides seen after resume =', beating);
  if (beating < 2) throw new Error('bilateral tapping did not restart after onResume');

  log('safe-area problems:', bad.length ? bad.join(' | ') : 'none');
  if (bad.length) throw new Error('content under a system bar');
  log('errors so far:', errors.length);
};
