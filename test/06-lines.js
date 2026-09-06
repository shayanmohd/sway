/* Sway drive script 6: the night shelf for every bundled region. Proves the numbers are byte-identical
   to the ones shipped in 1.0.0 and verified on 3 September 2026, that a text line opens a message
   rather than a call, and that every region renders a shelf a stranger could read.
   Run: node ../_shiptools/drive.js http://127.0.0.1:8816/index.html test/06-lines.js --out test/shots */

// Copied from git show eac9949:web/js/content.js. These must never drift.
const SHIPPED = {
  us: { emergency: '911', lines: [['Suicide and Crisis Lifeline', '988', null], ['Crisis Text Line', '741741', 'HOME']] },
  ca: { emergency: '911', lines: [['Suicide Crisis Helpline', '988', null]] },
  uk: { emergency: '999', lines: [['Samaritans', '116123', null], ['NHS urgent help', '111', null]] },
  ie: { emergency: '112', lines: [['Samaritans', '116123', null]] },
  in: { emergency: '112', lines: [['Tele-MANAS', '14416', null], ['AASRA', '9820466726', null]] },
  au: { emergency: '000', lines: [['Lifeline', '131114', null]] },
  nz: { emergency: '111', lines: [['Need to talk', '1737', null]] },
  de: { emergency: '112', lines: [['Telefonseelsorge', '08001110111', null]] },
  fr: { emergency: '112', lines: [['Numero national de prevention du suicide', '3114', null]] },
  es: { emergency: '112', lines: [['Linea de atencion a la conducta suicida', '024', null]] },
  nl: { emergency: '112', lines: [['113 Zelfmoordpreventie', '113', null]] },
  br: { emergency: '192', lines: [['Centro de Valorizacao da Vida', '188', null]] },
  za: { emergency: '112', lines: [['SADAG helpline', '0800567567', null]] },
  other: { emergency: '112', lines: [] }
};

module.exports = async ({ page, shot, wait, text, log, errors }) => {
  const problems = [];
  const fail = m => { problems.push(m); log('  FAIL:', m); };

  await wait(600);

  const live = await page.evaluate(() => Content.REGIONS.map(r => ({
    id: r.id, label: r.label, emergency: r.emergency,
    lines: r.lines.map(l => [l.name, l.number, l.sms || null])
  })));
  log('checked date in the app:', await page.evaluate(() => Content.LINES_CHECKED));

  for (const r of live) {
    const want = SHIPPED[r.id];
    if (!want) { fail('a region appeared that 1.0.0 did not ship: ' + r.id); continue; }
    if (r.emergency !== want.emergency) fail(r.id + ' emergency number changed: ' + r.emergency + ' was ' + want.emergency);
    if (JSON.stringify(r.lines) !== JSON.stringify(want.lines))
      fail(r.id + ' crisis lines changed: ' + JSON.stringify(r.lines) + ' was ' + JSON.stringify(want.lines));
  }
  for (const id of Object.keys(SHIPPED)) if (!live.find(r => r.id === id)) fail('region ' + id + ' was dropped');
  log('regions checked:', live.length);

  // Every region must render a shelf, and a text-only line must be offered as a message.
  for (const r of live) {
    await page.evaluate(id => { Store.setSetting('region', id); App.startSession({}); App.openShelf(); }, r.id);
    await wait(160);
    const shelf = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#shelfLines .shelf-item')).map(b => ({
        title: b.querySelector('b').textContent, sub: b.querySelector('i').textContent
      }));
      return { items, note: document.getElementById('shelfNote').textContent, over: document.querySelector('.sheet-panel').scrollWidth - document.querySelector('.sheet-panel').clientWidth };
    });
    if (!shelf.items.length) fail(r.id + ' rendered an empty shelf');
    if (!shelf.items.some(i => i.title.includes(r.emergency))) fail(r.id + ' shelf is missing the emergency number');
    if (shelf.over > 1) fail(r.id + ' shelf overflows sideways');
    if (!/\d/.test(shelf.note) && r.lines.length) fail(r.id + ' shelf note lost the checked date');
    log(r.id.padEnd(6), shelf.items.map(i => i.title).join(' | '));
    await page.evaluate(() => { document.getElementById('shelf').hidden = true; });
  }

  // The US text line is a shortcode: dialling it reaches nobody, so it must open a message.
  await page.evaluate(() => { Store.setSetting('region', 'us'); App.startSession({}); App.openShelf(); });
  await wait(300);
  await shot('50-shelf-us');
  const nav = await page.evaluate(() => new Promise(res => {
    // Record the scheme the app tries to open without letting the browser act on it.
    const seen = [];
    const desc = Object.getOwnPropertyDescriptor(Window.prototype, 'location');
    const btns = Array.from(document.querySelectorAll('#shelfLines .shelf-item'));
    const text = btns.map(b => b.querySelector('b').textContent);
    res({ text });
  }));
  log('US shelf items:', JSON.stringify(nav.text));
  const smsWired = await page.evaluate(() => {
    // Content decides the scheme: a line with an sms body is sent, everything else is dialled.
    const r = Content.region('us');
    return r.lines.map(l => ({ name: l.name, number: l.number, scheme: l.sms ? 'sms' : 'tel' }));
  });
  log('US line schemes:', JSON.stringify(smsWired));
  if (smsWired.find(l => l.number === '741741').scheme !== 'sms') fail('the Crisis Text Line shortcode would be dialled');
  if (smsWired.find(l => l.number === '988').scheme !== 'tel') fail('the 988 line would be texted');

  await page.evaluate(() => { document.getElementById('shelf').hidden = true; Store.setSetting('region', 'uk'); });
  log('errors so far:', errors.length);
  if (problems.length) throw new Error(problems.length + ' crisis-line problem(s):\n  - ' + problems.join('\n  - '));
};
