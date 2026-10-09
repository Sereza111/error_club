const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'artist-player.js'), 'utf8');
const wave = JSON.parse(fs.readFileSync(path.join(root, 'assets/audio-analysis/emohead-plevat.json')));

async function setup({ missingWave = false } = {}) {
  const events = {}, listeners = {}, frames = new Map(), bars = [];
  let now = 1000, nextFrame = 1, position = 0, pauses = 0;
  const motion = { matches: false, addEventListener: (_, cb) => { listeners.motion = cb; } };
  const element = () => ({ dataset: {}, style: { setProperty(k, v) { this[k] = v; } },
    setAttribute(k, v) { this[k] = v; }, addEventListener(k, cb) { this[k] = cb; },
    append(child) { bars.push(child); } });
  const button = element(), status = element(), iframe = element();
  const player = { dataset: { track: wave.track, trackTitle: 'track', waveform: '/wave.json' },
    querySelector: selector => selector === 'iframe' ? iframe : selector.includes('toggle') ? button : status };
  const widget = { bind(k, cb) { events[k] = cb; }, setVolume() {}, play() {},
    pause() { pauses++; }, seekTo(value) { position = value; },
    getPosition(cb) { cb(position); }, isPaused(cb) { cb(true); } };
  const Widget = () => widget;
  Widget.Events = Object.fromEntries(['READY', 'PLAY', 'PAUSE', 'FINISH', 'PLAY_PROGRESS', 'SEEK', 'ERROR'].map(x => [x, x]));
  const document = { hidden: false, body: { classList: { contains: () => true, toggle() {} }, prepend() {} },
    querySelector: () => player, createElement: element, addEventListener: (k, cb) => { listeners[k] = cb; } };
  const context = { document, window: { SC: { Widget }, addEventListener: (k, cb) => { listeners[k] = cb; } },
    performance: { now: () => now }, matchMedia: () => motion, URLSearchParams,
    setTimeout: () => 1, clearTimeout() {},
    requestAnimationFrame: cb => { const id = nextFrame++; frames.set(id, cb); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    fetch: async () => ({ ok: !missingWave, json: async () => wave }) };
  vm.runInNewContext(code, context);
  await new Promise(setImmediate);
  return { events, listeners, frames, bars, button, status, player, motion, document,
    values: () => bars.map(b => b.style['--scale']),
    tick(ms = 16) { now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(now)); },
    pausedCount: () => pauses };
}

(async () => {
  const p = await setup();
  assert.equal(p.button.disabled, true);
  p.events.READY();
  p.events.PAUSE();
  assert.equal(p.status.textContent, 'Нажмите ▶, чтобы включить звук');
  p.events.PLAY();
  p.events.PLAY_PROGRESS({ currentPosition: 18000 });
  p.tick();
  const at18s = p.values();
  assert.equal(p.button['aria-pressed'], 'true');
  p.events.PAUSE();
  p.tick(1000);
  assert.deepEqual(p.values(), at18s, 'Paused meter must stay still');
  assert.equal(p.frames.size, 0);
  p.events.SEEK({ currentPosition: 70000 });
  assert.notDeepEqual(p.values(), at18s, 'Seeking must sample the new audio position');
  const at70s = p.values();
  p.events.SEEK({ currentPosition: 18000 });
  p.events.SEEK({ currentPosition: 70000 });
  assert.deepEqual(p.values(), at70s, 'Same audio position must always render the same envelope');
  p.events.PLAY();
  p.events.PLAY_PROGRESS({ currentPosition: 18000 });
  p.tick(1000);
  const stalled = p.values();
  p.tick(1000);
  assert.deepEqual(p.values(), stalled, 'Missing playback progress must not invent ongoing music');
  p.motion.matches = true;
  p.listeners.motion();
  assert.equal(p.frames.size, 0, 'Reduced motion cancels animation');
  p.motion.matches = false;
  p.document.hidden = true;
  p.listeners.visibilitychange();
  assert.equal(p.frames.size, 0, 'Hidden page cancels animation');
  p.events.ERROR();
  assert.equal(p.player.dataset.state, 'error');
  assert.equal(p.button.disabled, true);

  const offline = await setup({ missingWave: true });
  offline.events.READY();
  offline.events.PLAY();
  offline.events.PLAY_PROGRESS({ currentPosition: 18000 });
  offline.tick();
  assert.equal(offline.frames.size, 0, 'Missing waveform must remain static');
  assert.equal(offline.button.disabled, false, 'Waveform failure must not break the audio player');
  offline.listeners.pagehide();
  assert.equal(offline.pausedCount(), 1);
  console.log('OK: playback, pause, seek, buffering, reduced motion, hidden page and waveform failure');
})().catch(error => { console.error(error); process.exitCode = 1; });
