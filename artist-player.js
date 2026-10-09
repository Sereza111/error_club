(() => {
  const player = document.querySelector('[data-intro-player]');
  if (!player) return;
  const track = player.dataset.track;
  const title = player.dataset.trackTitle;
  const body = document.body;
  const button = player.querySelector('[data-player-toggle]');
  const status = player.querySelector('[data-player-status]');
  const iframe = player.querySelector('iframe');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let widget;
  let watchdog;
  let autoplayCheck;
  let state = 'loading';
  let ready = false;
  let playing = false;
  let meterFrame = 0;
  let lastProgressMs = 0;
  let lastProgressAt = 0;
  let hasPlayed = false;
  let waveform;
  const bars = [];

  // SoundCloud exposes a public amplitude envelope, not decoded audio/FFT bands.
  // Render that envelope at the widget's actual playback position; no invented BPM.
  if (body.classList.contains('profile--emohead')) {
    const spectrum = document.createElement('div');
    spectrum.className = 'spectrum';
    spectrum.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 42; i++) {
      const bar = document.createElement('i');
      bar.className = 'spectrum__bar';
      spectrum.append(bar);
      bars.push(bar);
    }
    body.prepend(spectrum);
  }

  const drawEnvelope = position => {
    if (!waveform) return;
    bars.forEach((bar, index) => {
      // A short trail fans out from the middle, using only amplitudes already heard.
      const delay = Math.abs(index - (bars.length - 1) / 2) * 24;
      const time = Math.max(0, Math.min(waveform.duration, position - delay));
      const sample = time / waveform.duration * (waveform.samples.length - 1);
      const left = Math.floor(sample);
      const a = waveform.samples[left];
      const b = waveform.samples[Math.min(left + 1, waveform.samples.length - 1)];
      const level = (a + (b - a) * (sample - left)) / waveform.peak;
      bar.style.setProperty('--scale', (.05 + .95 * level * level).toFixed(4));
    });
  };
  const paintMeter = now => {
    meterFrame = 0;
    if (!playing || document.hidden || motion.matches || !waveform) return;
    // Cap interpolation: buffering or missing SDK events must not run a fake rhythm.
    drawEnvelope(lastProgressMs + Math.min(250, Math.max(0, now - lastProgressAt)));
    meterFrame = requestAnimationFrame(paintMeter);
  };
  const updateMeter = () => {
    const active = playing && !document.hidden && !motion.matches;
    body.classList.toggle('is-audio-playing', active);
    if (active && waveform && !meterFrame) meterFrame = requestAnimationFrame(paintMeter);
    if (!active && meterFrame) { cancelAnimationFrame(meterFrame); meterFrame = 0; }
  };
  if (bars.length && player.dataset.waveform) {
    fetch(player.dataset.waveform)
      .then(response => { if (!response.ok) throw new Error('Waveform unavailable'); return response.json(); })
      .then(data => {
        if (data.track !== track || !(data.duration > 0) || !Array.isArray(data.samples) ||
            data.samples.length < 2 || data.samples.length > 10000 ||
            !data.samples.every(value => Number.isFinite(value) && value >= 0)) return;
        waveform = { ...data, peak: Math.max(1, ...data.samples) };
        drawEnvelope(lastProgressMs);
        updateMeter();
      })
      .catch(() => { /* Keep a static baseline; audio playback remains available. */ });
  }
  const setState = next => {
    state = next;
    playing = next === 'playing';
    player.dataset.state = next;
    updateMeter();
    button.disabled = !ready;
    button.textContent = playing ? 'Ⅱ' : '▶';
    button.setAttribute('aria-label', `${playing ? 'Приостановить' : 'Включить'} ${title}`);
    button.setAttribute('aria-pressed', String(playing));
    const messages = {
      loading: 'Подключаем звук…', ready: 'Нажмите ▶, чтобы включить звук',
      playing: 'Сейчас играет', paused: 'На паузе', ended: 'Ещё раз?',
      error: 'Не удалось подключить плеер. Трек доступен по ссылке.'
    };
    status.textContent = messages[next];
  };
  setState('loading');

  const parameters = new URLSearchParams({
    url: track, auto_play: 'true', color: body.classList.contains('profile--emohead') ? '#312126' : getComputedStyle(body).getPropertyValue('--accent').trim(),
    hide_related: 'true', show_comments: 'false', show_reposts: 'false', show_teaser: 'false', visual: 'false'
  });
  iframe.src = `https://w.soundcloud.com/player/?${parameters}`;
  iframe.title = `${title} — SoundCloud`;

  // Only actual SDK playback events mark the player as playing. Autoplay can be denied.
  const initialize = () => {
    if (!window.SC?.Widget) return fail();
    widget = window.SC.Widget(iframe);
    const events = window.SC.Widget.Events;
    widget.bind(events.READY, () => {
      clearTimeout(watchdog);
      ready = true;
      setState('ready');
      widget.setVolume(55);
      widget.play();
      autoplayCheck = setTimeout(() => {
        widget.isPaused(paused => { if (paused && state === 'ready') setState('ready'); });
      }, 1800);
    });
    const syncPosition = position => {
      if (!Number.isFinite(position) || position < 0) return;
      lastProgressMs = position;
      lastProgressAt = performance.now();
    };
    widget.bind(events.PLAY, () => {
      clearTimeout(autoplayCheck); ready = true; clearTimeout(watchdog);
      lastProgressAt = performance.now();
      widget.getPosition(syncPosition);
      setState('playing');
    });
    widget.bind(events.PAUSE, () => { if (state !== 'error') setState(hasPlayed ? 'paused' : 'ready'); });
    widget.bind(events.FINISH, () => setState('ended'));
    widget.bind(events.PLAY_PROGRESS, data => {
      syncPosition(data?.currentPosition);
      if (data?.currentPosition > 0) hasPlayed = true;
    });
    widget.bind(events.SEEK, data => {
      syncPosition(data?.currentPosition);
      if (!motion.matches) drawEnvelope(lastProgressMs);
    });
    widget.bind(events.ERROR, fail);
  };
  const fail = () => { clearTimeout(watchdog); clearTimeout(autoplayCheck); ready = false; setState('error'); };
  button.addEventListener('click', () => {
    if (!ready || !widget) return;
    if (playing) widget.pause();
    else { if (state === 'ended') widget.seekTo(0); widget.play(); }
  });
  watchdog = setTimeout(fail, 20000);
  if (window.SC?.Widget) initialize();
  else {
    const script = document.createElement('script');
    script.src = 'https://w.soundcloud.com/player/api.js';
    script.async = true;
    script.addEventListener('load', initialize, { once: true });
    script.addEventListener('error', fail, { once: true });
    document.head.append(script);
  }
  document.addEventListener('visibilitychange', updateMeter);
  motion.addEventListener('change', updateMeter);
  window.addEventListener('pagehide', () => {
    clearTimeout(watchdog);
    clearTimeout(autoplayCheck);
    if (meterFrame) cancelAnimationFrame(meterFrame);
    if (widget && ready) widget.pause();
  });
})();
