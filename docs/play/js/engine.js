/* Sway. The breath clock, the haptic wave vocabulary, the tide underlay and the horizon.
   Nothing here touches the network; the audio is synthesised on the device. */
const Engine = (() => {
  const N = window.Native || null;

  let startedAt = 0, cycleAt = 0, cur = null, cycleNo = 0, pausedElapsed = 0;
  let cycleTimer = null, timers = [], running = false;
  let firstPulseAt = null;
  let onPhase = null;

  /* ---------- protocols ---------- */
  /** Sessions open a little quicker than comfortable and decelerate on a fixed gentle curve. */
  function phasesAt(t) {
    const p = Store.settings().protocol;
    if (p === 'even') return { inh: 4, h1: 4, exh: 4, h2: 4 };
    if (p === 'long') return { inh: 4, h1: 7, exh: 8, h2: 0 };
    const u = Math.min(1, t / 180);
    const e = u * u * (3 - 2 * u);
    return { inh: 3.6 + 0.4 * e, h1: 2.0 * e, exh: 5.0 + 2.0 * e, h2: 0 };
  }
  const total = p => p.inh + p.h1 + p.exh + p.h2;
  const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));

  /* ---------- haptics ---------- */
  // Browsers refuse vibration before the page has been touched; asking anyway logs an intervention.
  const canWebVibrate = () =>
    !!navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive);

  function fire(ms, amp) {
    try {
      if (N && N.vibrate) N.vibrate(ms, amp);
      else if (canWebVibrate()) navigator.vibrate(ms);
    } catch (e) {}
  }
  function at(delay, ms, amp) { timers.push(setTimeout(() => fire(ms, amp), delay)); }
  function clearHaptics() {
    timers.forEach(clearTimeout); timers = [];
    try { if (N && N.cancelVibration) N.cancelVibration(); else if (canWebVibrate()) navigator.vibrate(0); } catch (e) {}
  }

  function amp(v) {
    const s = Store.settings().strength || 0.7;
    return Math.max(1, Math.min(255, Math.round(255 * s * v)));
  }

  /** A gathering swell for the inhale, stillness for the hold, a fading train for the exhale. */
  function scheduleHaptics(p) {
    if (!Store.settings().haptics) return;
    const slot = 150;
    const steps = Math.max(4, Math.round(p.inh * 1000 / slot));
    for (let i = 0; i < steps; i++) {
      const v = 0.16 + 0.84 * ease(i / (steps - 1));
      at(i * slot, Math.round(40 + 110 * v), amp(v));
    }
    let t = (p.inh + p.h1) * 1000;
    const end = t + p.exh * 1000;
    while (t < end - 80) {
      const x = (t - (p.inh + p.h1) * 1000) / (p.exh * 1000);
      const v = 0.12 + 0.80 * (1 - x);
      const dur = Math.round(60 + 70 * (1 - x));
      at(t, dur, amp(v));
      t += dur + 70 + 320 * x;
    }
  }

  /* ---------- the tide underlay, synthesised ---------- */
  let ctx = null, gain = null, filt = null;
  function initAudio() {
    if (ctx) return true;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    try {
      ctx = new C();
      const len = Math.floor(ctx.sampleRate * 3);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.022 * w) / 1.022; d[i] = last * 3.4; }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 240; filt.Q.value = 0.6;
      gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      src.start();
      return true;
    } catch (e) { ctx = null; return false; }
  }
  /** Browsers refuse an AudioContext before a gesture and warn if you ask; the shell has no such rule. */
  function audioAllowed() {
    if (N) return true;
    return !navigator.userActivation || navigator.userActivation.hasBeenActive;
  }
  function audioResume() {
    if (!Store.settings().audio || !audioAllowed()) return;
    if (!initAudio()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  function audioStop() {
    if (!ctx) return;
    try { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15); } catch (e) {}
  }
  function audioFollow(level) {
    if (!ctx || !gain || ctx.state !== 'running') return;
    const on = Store.settings().audio && running;
    try {
      gain.gain.setTargetAtTime(on ? 0.015 + 0.10 * level : 0, ctx.currentTime, 0.09);
      filt.frequency.setTargetAtTime(180 + 260 * level, ctx.currentTime, 0.12);
    } catch (e) {}
  }

  /* ---------- session ---------- */
  function cycle() {
    const t = (performance.now() - startedAt) / 1000;
    cur = phasesAt(t);
    cycleAt = performance.now();
    cycleNo++;
    clearHaptics();
    scheduleHaptics(cur);
    cycleTimer = setTimeout(cycle, total(cur) * 1000);
  }

  function start(resume) {
    if (running) return;
    running = true;
    startedAt = performance.now() - (resume ? pausedElapsed * 1000 : 0);
    if (!resume) pausedElapsed = 0;
    cycleNo = 0;
    fire(90, amp(0.55));                 // the covenant: something arrives before anything is drawn
    if (firstPulseAt === null) {
      firstPulseAt = performance.now();
      Store.recordPulse(firstPulseAt);
    }
    cycle();
    try { if (N && N.keepAwake) N.keepAwake(true); } catch (e) {}
  }

  function stop() {
    pausedElapsed = elapsed();
    running = false;
    clearTimeout(cycleTimer); cycleTimer = null;
    clearHaptics();
    audioStop();
    try { if (N && N.keepAwake) N.keepAwake(false); } catch (e) {}
  }

  function pause() { clearTimeout(cycleTimer); cycleTimer = null; clearHaptics(); audioStop(); }
  function resume() { if (running && !cycleTimer) cycle(); }

  function level(now) {
    if (!cur) return 0;
    const u = (now - cycleAt) / 1000;
    if (u < cur.inh) return ease(u / cur.inh);
    if (u < cur.inh + cur.h1) return 1;
    if (u < cur.inh + cur.h1 + cur.exh) return 1 - ease((u - cur.inh - cur.h1) / cur.exh);
    return 0;
  }
  function phase(now) {
    if (!cur) return '';
    const u = (now - cycleAt) / 1000;
    if (u < cur.inh) return 'Breathe in';
    if (u < cur.inh + cur.h1) return 'Hold, gently';
    if (u < cur.inh + cur.h1 + cur.exh) return 'Breathe out, slowly';
    return 'Rest';
  }
  const elapsed = () => (running ? (performance.now() - startedAt) / 1000 : pausedElapsed);
  const isRunning = () => running;
  const launchMs = () => firstPulseAt;

  /* ---------- bilateral tapping: the phone keeps time, your hands alternate ---------- */
  let tapTimer = null, tapSide = 0, tapCb = null;
  function tapStart(cb) {
    tapStop();
    tapCb = cb;
    const beat = () => {
      tapSide = 1 - tapSide;
      fire(tapSide ? 55 : 90, amp(tapSide ? 0.55 : 0.9));
      if (tapCb) tapCb(tapSide);
      tapTimer = setTimeout(beat, 520);
    };
    beat();
  }
  function tapStop() { clearTimeout(tapTimer); tapTimer = null; tapCb = null; }

  function buzz(v, ms) { fire(ms || 40, amp(v == null ? 0.5 : v)); }

  return { start, stop, pause, resume, level, phase, elapsed, isRunning, launchMs,
           audioResume, audioFollow, audioStop, initAudio, tapStart, tapStop, buzz, phasesAt };
})();

/* The horizon. One continuous slow oscillation and nothing else moves. */
const Water = (() => {
  let cv = null, g = null, raf = null, w = 0, h = 0, dpr = 1, t0 = 0;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = 0;

  function mount(canvas) {
    cv = canvas; g = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!g || !w) return;
    if (!t0) t0 = now;
    const target = Engine.level(now);
    shown += (target - shown) * 0.22;          // one frame of softening, no more
    Engine.audioFollow(shown);

    const deep = css('--water') || '#12283C';
    const line = css('--fg') || '#EAF0F4';
    const glow = css('--accent') || '#E8C89A';

    g.clearRect(0, 0, w, h);
    const lo = h * 0.80, hi = h * 0.30;
    const base = lo + (hi - lo) * shown;
    const amp1 = reduce ? 0 : 5 + 5 * shown;
    const amp2 = reduce ? 0 : 3 + 3 * shown;
    const ph = (now - t0) / 1000;

    const yAt = x => base
      + amp1 * Math.sin((x / w) * Math.PI * 2 + ph * 0.55)
      + amp2 * Math.sin((x / w) * Math.PI * 3.4 - ph * 0.33);

    const grad = g.createLinearGradient(0, base - 20, 0, h);
    grad.addColorStop(0, deep);
    grad.addColorStop(1, css('--water-deep') || '#0A1521');
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, yAt(x));
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = grad; g.fill();

    g.beginPath();
    for (let x = 0; x <= w; x += 3) { const y = yAt(x); x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.lineWidth = 2.5;
    g.strokeStyle = line;
    g.globalAlpha = 0.92;
    g.stroke();

    g.globalAlpha = 0.10 + 0.28 * shown;
    g.lineWidth = 9;
    g.strokeStyle = glow;
    g.stroke();
    g.globalAlpha = 1;
  }

  function play() { if (!raf) raf = requestAnimationFrame(frame); }
  function halt() { if (raf) cancelAnimationFrame(raf); raf = null; }
  return { mount, play, halt, resize };
})();
