/* Sway drive script 3: upgrading from the shipped 1.0.0.
   Seeds localStorage with a record shaped exactly as 1.0.0's web/js/store.js wrote it
   (git show eac9949:web/js/store.js), loads the new build over it, and proves nothing is lost
   or misread. Also covers a record from a half-written 1.0.0 session and a corrupt one.
   Run: node ../_shiptools/drive.js http://127.0.0.1:8816/index.html test/03-upgrade.js --out test/shots */

// Exactly the shape DEFAULTS + openStorm + patch + recordPulse produced in 1.0.0.
const V100 = {
  storms: [
    { id: 'sm1a2b3c', at: 1756100000000, endedAt: 1756100420000, wave: 4, chips: ['transit', 'work'],
      tools: ['breathing', 'senses'], durS: 420, launchMs: 71, pocket: false, logged: true },
    { id: 'sm1a2b3d', at: 1756300000000, endedAt: 1756300260000, wave: 2, chips: ['night'],
      tools: ['breathing'], durS: 260, launchMs: 64, pocket: true, logged: true },
    { id: 'sm1a2b3e', at: 1756500000000, endedAt: 1756500310000, wave: 5, chips: [],
      tools: ['breathing', 'cold', 'tapping'], durS: 310, launchMs: 88, pocket: false, logged: true }
  ],
  pulses: [71, 64, 88, 59, 77],
  settings: {
    protocol: 'long', strength: 0.45, haptics: true, audio: true, pocketDim: false,
    contact: { name: 'Raj', phone: '+91 98204 66726', rel: '' },
    region: 'in', calibrated: true
  },
  learnSeen: ['chest', 'air', 'ends'],
  firstRun: 1756000000000
};

module.exports = async ({ page, shot, wait, text, click, log, errors }) => {
  const load = async (raw) => {
    await page.evaluate(v => { localStorage.setItem('sway.v1', v); }, raw);
    await page.reload({ waitUntil: 'networkidle0' });
    await wait(700);
  };

  // ---- 1. a full 1.0.0 record ----
  await load(JSON.stringify(V100));
  const read = await page.evaluate(() => ({
    logged: Store.logged().length,
    waves: Store.logged().map(s => s.wave),
    chips: Store.logged().map(s => s.chips.join('+')),
    tools: Store.logged().map(s => s.tools.join('+')),
    durs: Store.logged().map(s => s.durS),
    settings: Store.settings(),
    seen: ['chest', 'air', 'ends', 'cold'].map(id => Store.learnSeen(id)),
    pulses: Store.pulseStats(),
    almanacN: Store.almanac().n,
    headline: Store.headline()
  }));
  log('1.0.0 record read back:', JSON.stringify(read, null, 0));

  const want = V100.storms.filter(s => s.logged);
  if (read.logged !== want.length) throw new Error('lost storms: ' + read.logged + ' of ' + want.length);
  if (read.waves.join() !== want.map(s => s.wave).join()) throw new Error('wave sizes changed');
  if (read.chips.join() !== want.map(s => s.chips.join('+')).join()) throw new Error('context chips changed');
  if (read.tools.join() !== want.map(s => s.tools.join('+')).join()) throw new Error('tools changed');
  if (read.durs.join() !== want.map(s => s.durS).join()) throw new Error('durations changed');
  if (read.settings.protocol !== 'long' || read.settings.strength !== 0.45) throw new Error('settings changed');
  if (read.settings.contact.name !== 'Raj' || read.settings.contact.phone !== '+91 98204 66726') throw new Error('trusted contact lost');
  if (read.settings.region !== 'in') throw new Error('region lost');
  if (read.settings.audio !== true || read.settings.pocketDim !== false) throw new Error('toggles changed');
  if (read.seen.join() !== 'true,true,true,false') throw new Error('read Learn cards changed');
  // Opening the app records one more pulse, so 5 old ones become at least 6.
  if (!read.pulses || read.pulses.n < 5 || read.pulses.worst !== 88) throw new Error('pulse receipts lost');
  if (read.almanacN !== 3) throw new Error('almanac does not see the old storms');

  await page.evaluate(() => App.setView('almanac'));
  await wait(600);
  await shot('30-upgrade-almanac');
  log('almanac after upgrade:', (await text('#almBody')).split('\n').slice(0, 8).join(' / '));

  await page.evaluate(() => App.setView('shelter'));
  await wait(400);
  await shot('31-upgrade-shelter');
  const shelter = await page.evaluate(() => ({
    name: document.getElementById('cName').value,
    phone: document.getElementById('cPhone').value,
    region: document.getElementById('regionSel').value,
    proto: document.getElementById('protoSel').value,
    strength: document.getElementById('strengthRange').value,
    audio: document.getElementById('audioChk').checked,
    dim: document.getElementById('dimChk').checked
  }));
  log('shelter shows:', JSON.stringify(shelter));
  if (shelter.name !== 'Raj' || shelter.region !== 'in' || shelter.proto !== 'long' || shelter.strength !== '45')
    throw new Error('the shelter screen did not show the upgraded settings');
  if (!shelter.audio || shelter.dim) throw new Error('toggle states did not survive the upgrade');

  // The export must still contain every old storm.
  const exp = await page.evaluate(() => Store.exportText());
  for (const s of want) if (!exp.includes('Wave size: ' + s.wave + ' of 5')) throw new Error('export lost a storm');
  log('export lines:', exp.split('\n').length);

  // ---- 2. a 1.0.0 record with an unfinished session in it ----
  const half = JSON.parse(JSON.stringify(V100));
  half.storms.push({ id: 'smhalf', at: Date.now() - 3600000, endedAt: null, wave: null, chips: [],
                     tools: ['breathing'], durS: 0, launchMs: null, pocket: false, logged: false });
  await load(JSON.stringify(half));
  const h = await page.evaluate(() => ({ logged: Store.logged().length, all: Store.storms().length }));
  log('half-written session:', JSON.stringify(h));
  if (h.logged !== 3) throw new Error('an unfinished session leaked into the log');

  // ---- 3. junk in the key must not brick the app ----
  await load('{"storms":"not an array","settings":null,"learnSeen":7}');
  const j = await page.evaluate(() => ({ logged: Store.logged().length, proto: Store.settings().protocol, running: Engine.isRunning() }));
  log('corrupt record:', JSON.stringify(j));
  if (!j.running) throw new Error('a corrupt record stopped the app from starting');

  await load('this is not json at all');
  const k = await page.evaluate(() => ({ proto: Store.settings().protocol, running: Engine.isRunning() }));
  log('unparseable record:', JSON.stringify(k));
  if (!k.running || k.proto !== 'tide') throw new Error('unparseable storage did not fall back to defaults');
  await shot('32-upgrade-corrupt');

  log('errors so far:', errors.length);
};
