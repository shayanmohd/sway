/* Reviewer pass 1: first run, every screen, real data, reload, persistence.
   Any console error or uncaught exception fails the run through drive.js's own exit code. */
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const K = 'sway.v1';
  const db = () => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), K);
  const vis = sel => page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return 'missing';
    return el.hidden ? 'hidden' : 'shown';
  }, sel);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

  // --- first run: straight into the session, nothing stored yet beyond the opened storm
  await wait(900);
  assert(await vis('#s-session') === 'shown', 'session screen not shown on cold launch');
  await shot('r01-session-first');
  let d = await db();
  assert(d && d.storms.length === 1, 'cold launch should open exactly one storm, got ' + (d && d.storms.length));
  assert(d.storms[0].tools.includes('breathing'), 'breathing not recorded as a tool');
  log('region guessed:', d.settings.region);

  // --- night shelf overlay
  await click('#shelfBtn');
  await wait(500);
  assert(await vis('#shelf') === 'shown', 'shelf did not open');
  await shot('r02-shelf');
  log('shelf lines:', (await text('#shelfLines')).replace(/\n/g, ' | '));
  await click('#shelfCard');
  await wait(500);
  assert(await vis('#s-bystander') === 'shown', 'bystander card did not open');
  await shot('r03-bystander');
  await click('#bysClose');
  await wait(250);

  // --- end the session, fork, grounding
  await click('#endBtn');
  await wait(400);
  assert(await vis('#s-fork') === 'shown', 'fork not shown after ending');
  await shot('r04-fork');
  await click('#forkStorm');
  await wait(350);
  assert(await vis('#s-tools') === 'shown', 'tools not shown');
  await shot('r05-tools');

  // 5-4-3-2-1 all the way through
  await click('[data-tool="senses"]');
  await wait(350);
  await shot('r06-step');
  for (let i = 0; i < 7; i++) { await page.click('#s-step'); await wait(160); }
  await wait(300);
  assert(await vis('#s-fork') === 'shown', 'finishing the senses walk should return to the fork');

  // bilateral tapping
  await click('#forkStorm'); await wait(250);
  await click('[data-tool="tapping"]'); await wait(1200);
  assert(await vis('#s-tap') === 'shown', 'tap screen not shown');
  await shot('r07-tapping');
  const litCount = await page.evaluate(() => document.querySelectorAll('.dot.lit').length);
  assert(litCount === 1, 'exactly one bilateral dot should be lit, got ' + litCount);
  await click('#tapDone'); await wait(300);

  // cold
  await click('#forkStorm'); await wait(250);
  await click('[data-tool="cold"]'); await wait(250);
  for (let i = 0; i < 5; i++) { await page.click('#s-step'); await wait(140); }
  await wait(250);

  // --- log a storm
  await click('#forkPass'); await wait(350);
  assert(await vis('#s-log') === 'shown', 'log screen not shown');
  await page.click('#waveRow button:nth-child(4)'); await wait(200);
  await page.click('#chipRow button:nth-child(2)'); await wait(150);
  await page.click('#chipRow button:nth-child(4)'); await wait(200);
  await shot('r08-log');
  await click('#logSave'); await wait(400);
  assert(await vis('#s-closing') === 'shown', 'closing not shown');
  await shot('r09-closing');
  log('closing:', (await text('#s-closing')).replace(/\n/g, ' | '));

  d = await db();
  const saved = d.storms.filter(s => s.logged);
  assert(saved.length === 1, 'exactly one logged storm expected, got ' + saved.length);
  assert(saved[0].wave === 4, 'wave should be 4, got ' + saved[0].wave);
  assert(saved[0].chips.length === 2, 'two chips expected, got ' + saved[0].chips.length);
  assert(saved[0].tools.length === 4, 'four tools expected, got ' + saved[0].tools.join(','));

  await click('#closeDone'); await wait(500);
  assert(await vis('#v-shelter') === 'shown', 'shelter not shown after done');
  await shot('r10-shelter');

  // --- shelter: contact, region, settings
  await page.type('#cName', 'Rae');
  await page.type('#cPhone', '+44 7700 900123');
  await click('#cSave'); await wait(400);
  log('contact state:', await text('#contactState'));
  await page.select('#regionSel', 'uk'); await page.evaluate(() => document.querySelector('#regionSel').dispatchEvent(new Event('change', { bubbles: true })));
  await wait(300);
  log('region preview:', await text('#regionPreview'));
  await page.select('#protoSel', 'long'); await page.evaluate(() => document.querySelector('#protoSel').dispatchEvent(new Event('change', { bubbles: true })));
  await wait(200);
  await shot('r11-shelter-filled');

  // --- almanac with one storm
  await click('.tab[data-view="almanac"]'); await wait(600);
  await shot('r12-almanac');
  log('almanac:', (await text('#v-almanac')).slice(0, 260).replace(/\n/g, ' | '));

  // --- learn, and a card
  await click('.tab[data-view="learn"]'); await wait(600);
  await shot('r13-learn');
  await page.click('#cardList button:nth-child(2)'); await wait(500);
  assert(await vis('#reader') === 'shown', 'reader did not open');
  await shot('r14-reader');
  await click('#readerClose'); await wait(300);

  // --- export through the browser blob path
  const dl = await page.evaluate(async () => {
    let captured = null;
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { captured = { name: this.download, href: this.href }; };
    document.querySelector('#exportBtn') && document.querySelector('#exportBtn').click();
    HTMLAnchorElement.prototype.click = realClick;
    return captured;
  });
  log('blob export skipped on this screen (learn tab)');

  await click('.tab[data-view="shelter"]'); await wait(400);
  const blob = await page.evaluate(async () => {
    let captured = null;
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { captured = { name: this.download, href: this.href }; };
    document.querySelector('#exportBtn').click();
    HTMLAnchorElement.prototype.click = realClick;
    if (!captured) return null;
    const t = await (await fetch(captured.href)).text();
    return { name: captured.name, body: t };
  });
  assert(blob && blob.name === 'sway-storm-log.txt', 'blob export did not produce a file');
  assert(/Wave size: 4 of 5/.test(blob.body), 'export text missing the logged wave: ' + blob.body.slice(0, 200));
  log('export first lines:', blob.body.split('\n').slice(0, 3).join(' | '));

  // --- reload: persistence
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(900);
  d = await db();
  assert(d.storms.filter(s => s.logged).length === 1, 'logged storm lost across reload');
  assert(d.settings.contact.name === 'Rae', 'contact lost across reload');
  assert(d.settings.region === 'uk', 'region lost across reload');
  assert(d.settings.protocol === 'long', 'protocol lost across reload');
  assert(d.learnSeen.length === 1, 'learn read state lost across reload');
  await page.evaluate(() => window.App.setView('almanac'));
  await wait(600);
  await shot('r15-almanac-after-reload');
  log('almanac after reload:', (await text('#v-almanac')).slice(0, 160).replace(/\n/g, ' | '));

  if (errors.length) throw new Error(errors.length + ' page errors');
};
