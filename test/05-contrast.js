/* Sway drive script 5: a WCAG AA audit of every piece of text the app actually paints, on every
   screen, measured from computed styles rather than guessed from the stylesheet.
   Run: node ../_shiptools/drive.js http://127.0.0.1:8816/index.html test/05-contrast.js --out test/shots */
module.exports = async ({ page, wait, log, errors }) => {
  await page.evaluate(() => {
    localStorage.setItem('sway.v1', JSON.stringify({
      storms: [1, 2, 3, 4, 5, 6].map((n, i) => ({
        id: 's' + n, at: Date.now() - (14 - i * 2) * 86400000 - i * 3600000, endedAt: null,
        wave: (i % 5) + 1, chips: [['transit'], ['night'], ['work'], ['home'], ['social'], ['transit']][i],
        tools: ['breathing', 'senses'], durS: 400 - i * 30, launchMs: 60 + i, pocket: false, logged: true
      })),
      pulses: [71, 64, 88, 59, 77],
      settings: { protocol: 'tide', strength: 0.72, haptics: true, audio: false, pocketDim: true,
                  contact: { name: 'Priya', phone: '+44 7700 900123', rel: '' }, region: 'uk', calibrated: true },
      learnSeen: ['chest'], firstRun: Date.now() - 30 * 86400000
    }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(800);

  const audit = () => page.evaluate(() => {
    const lum = ([r, g, b]) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = s => {
      const m = String(s).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
      return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg, bg) => fg.c.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

    // The colour behind an element: walk up compositing every painted layer. Gradients are not one
    // colour, so each level contributes its lightest and darkest stop and both stacks are tested.
    const layers = (el) => {
      const cs = getComputedStyle(el);
      const list = [];
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) list.push(bg);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).forEach(c => {
          const p = parse(c); if (p && p.a > 0.02) list.push(p);
        });
      }
      return list;
    };
    const stacks = (el) => {
      const dark = [], light = [];
      for (let p = el; p; p = p.parentElement) {
        const l = layers(p);
        if (!l.length) continue;
        const byLum = l.slice().sort((a, b) => lum(a.c) - lum(b.c));
        dark.push(byLum[0]); light.push(byLum[byLum.length - 1]);
        if (byLum[0].a === 1 && byLum[byLum.length - 1].a === 1) break;
      }
      const fold = (st) => { let base = [11, 21, 38]; for (let i = st.length - 1; i >= 0; i--) base = over(st[i], base); return base; };
      return [fold(dark), fold(light)];
    };

    const out = [];
    document.querySelectorAll('body *').forEach(el => {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) return;
      const own = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
      if (!own) return;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      if (!fg) return;
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      let got = Infinity, bg = null;
      for (const b of stacks(el)) { const r = ratio(over(fg, b), b); if (r < got) { got = r; bg = b; } }
      out.push({ sel: (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')),
                 text: own.slice(0, 34), size, weight, need, got: Math.round(got * 100) / 100, ok: got >= need - 0.005 });
    });
    return out;
  });

  const screens = [
    ['session', () => { App.startSession({}); }],
    ['fork', () => { App.startSession({}); document.getElementById('endBtn').click(); }],
    ['tools', () => { document.getElementById('forkStorm').click(); }],
    ['step', () => { document.querySelector('[data-tool="senses"]').click(); }],
    ['tapping', () => { App.back(); document.querySelector('[data-tool="tapping"]').click(); }],
    ['log', () => { App.openLog(); const w = document.querySelectorAll('#waveRow .wavebtn'); w[2].click(); document.querySelectorAll('#chipRow .chip')[0].click(); }],
    ['closing', () => { document.getElementById('logSave').click(); }],
    ['shelf', () => { App.startSession({}); App.openShelf(); }],
    ['bystander', () => { App.openBystander(); }],
    ['shelter', () => { App.back(); App.setView('shelter'); }],
    ['almanac', () => { App.setView('almanac'); }],
    ['learn', () => { App.setView('learn'); }],
    ['reader', () => { document.querySelectorAll('#cardList .cardbtn')[0].click(); }],
    ['toast', () => { document.getElementById('reader').hidden = true; App.setView('shelter'); document.getElementById('cSave').click(); }],
    ['pocket', () => { App.startSession({}); document.getElementById('pocketVeil').hidden = false; }],
    // The states a switch can put the app into have to read as well as the default ones.
    ['no haptics', () => { Store.setSetting('haptics', false); App.setView('shelter');
                           document.getElementById('calibPanel').scrollIntoView({ block: 'center' }); }],
    ['tap silent', () => { Store.setSetting('haptics', false); App.startSession({});
                           document.getElementById('endBtn').click();
                           document.getElementById('forkStorm').click();
                           document.querySelector('[data-tool="tapping"]').click(); }],
    ['empty', () => { Store.setSetting('haptics', true); App.back(); App.back();
                      Store.eraseAll(); App.setView('almanac'); }]
  ];

  const bad = [];
  for (const [name, fn] of screens) {
    await page.evaluate(`(${fn.toString()})()`);
    await wait(320);
    const rows = await audit();
    const fails = rows.filter(r => !r.ok);
    log(name.padEnd(10), rows.length + ' text runs, ' + (fails.length ? fails.length + ' BELOW AA' : 'all pass'));
    fails.forEach(f => { log('     ', f.sel, JSON.stringify(f.text), f.size + 'px/' + f.weight, f.got + ' need ' + f.need); bad.push(name + ' ' + f.sel + ' ' + f.got + '<' + f.need); });
  }

  log('contrast failures:', bad.length);
  if (bad.length) throw new Error('WCAG AA failures:\n  - ' + bad.join('\n  - '));
  log('errors so far:', errors.length);
};
