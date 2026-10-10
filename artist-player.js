(() => {
  const player = document.querySelector('[data-intro-player]');
  if (!player) return;
  const track = player.dataset.track;
  const title = player.dataset.trackTitle;
  const localSource = player.dataset.localAudio;
  const body = document.body;
  const button = player.querySelector('[data-player-toggle]');
  const status = player.querySelector('[data-player-status]');
  const iframe = player.querySelector('iframe');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let widget;
  let localAudio;
  let watchdog;
  let autoplayCheck;
  let state = 'loading';
  let ready = false;
  let playing = false;
  let meterFrame = 0;
  let lastProgressMs = 0;
  let lastProgressAt = 0;
  let hasPlayed = false;
  let analysis;
  const bars = [];
  const hasSpectrum = body.classList.contains('profile--emohead') || body.classList.contains('profile--woomzzzoid');

  if (hasSpectrum) {
    const spectrum = document.createElement('div');
    spectrum.className = 'spectrum';
    spectrum.setAttribute('aria-hidden', 'true');
    const count = body.classList.contains('profile--woomzzzoid') ? 56 : 42;
    for (let index = 0; index < count; index++) {
      const bar = document.createElement('i');
      bar.className = 'spectrum__bar';
      spectrum.append(bar);
      bars.push(bar);
    }
    body.prepend(spectrum);
    body.addEventListener('pointermove', event => {
      body.style.setProperty('--pointer-x', `${event.clientX / innerWidth * 100}%`);
      body.style.setProperty('--pointer-y', `${event.clientY / innerHeight * 100}%`);
    }, { passive: true });
  }

  const drawAudio = position => {
    if (!analysis || !bars.length) return;
    if (Array.isArray(analysis.frames)) {
      const frame = analysis.frames[Math.min(analysis.frames.length - 1,
        Math.max(0, Math.floor(position / analysis.duration * analysis.frames.length)))];
      bars.forEach((bar, index) => {
        const band = frame[Math.min(frame.length - 1, Math.floor(index / bars.length * frame.length))] / 255;
        bar.style.setProperty('--scale', (.06 + band * band * .94).toFixed(4));
      });
      const energy = analysis.energy?.[Math.min(analysis.energy.length - 1,
        Math.max(0, Math.floor(position / analysis.duration * analysis.energy.length)))] || 0;
      body.style.setProperty('--track-energy', (energy / 255).toFixed(3));
      return;
    }
    if (Array.isArray(analysis.samples)) {
      bars.forEach((bar, index) => {
        const delay = Math.abs(index - (bars.length - 1) / 2) * 24;
        const time = Math.max(0, Math.min(analysis.duration, position - delay));
        const sample = time / analysis.duration * (analysis.samples.length - 1);
        const left = Math.floor(sample);
        const a = analysis.samples[left];
        const b = analysis.samples[Math.min(left + 1, analysis.samples.length - 1)];
        const level = (a + (b - a) * (sample - left)) / analysis.peak;
        bar.style.setProperty('--scale', (.05 + .95 * level * level).toFixed(4));
      });
    }
  };

  const paintMeter = now => {
    meterFrame = 0;
    if (!playing || document.hidden || motion.matches || !analysis) return;
    const position = localAudio ? localAudio.currentTime * 1000
      : lastProgressMs + Math.min(250, Math.max(0, now - lastProgressAt));
    drawAudio(position);
    meterFrame = requestAnimationFrame(paintMeter);
  };
  const updateMeter = () => {
    const active = playing && !document.hidden && !motion.matches;
    body.classList.toggle('is-audio-playing', active);
    if (active && analysis && !meterFrame) meterFrame = requestAnimationFrame(paintMeter);
    if (!active && meterFrame) { cancelAnimationFrame(meterFrame); meterFrame = 0; }
  };
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

  const analysisSource = player.dataset.spectrum || player.dataset.waveform;
  if (hasSpectrum && analysisSource) {
    fetch(analysisSource)
      .then(response => { if (!response.ok) throw new Error('Spectrum unavailable'); return response.json(); })
      .then(data => {
        if (!(data.duration > 0) || (!Array.isArray(data.frames) && !Array.isArray(data.samples))) return;
        if (Array.isArray(data.frames) && (!data.frames.length || !data.frames[0]?.length || data.frames.length > 10000)) return;
        if (Array.isArray(data.samples) && (data.samples.length < 2 || data.samples.length > 10000 ||
            !data.samples.every(value => Number.isFinite(value) && value >= 0))) return;
        analysis = Array.isArray(data.samples) ? { ...data, peak: Math.max(1, ...data.samples) } : data;
        drawAudio(lastProgressMs);
        updateMeter();
      })
      .catch(() => { /* Audio remains available with a static visual fallback. */ });
  }

  if (localSource) {
    localAudio = document.createElement('audio');
    localAudio.className = 'intro-player__local-audio';
    localAudio.controls = true;
    localAudio.preload = 'metadata';
    localAudio.src = localSource;
    player.append(localAudio);
    const syncLocalPosition = () => {
      lastProgressMs = localAudio.currentTime * 1000;
      lastProgressAt = performance.now();
      drawAudio(lastProgressMs);
    };
    localAudio.addEventListener('loadedmetadata', () => { ready = true; setState('ready'); });
    localAudio.addEventListener('play', () => { hasPlayed = true; ready = true; setState('playing'); });
    localAudio.addEventListener('pause', () => { if (state !== 'error') setState(hasPlayed ? 'paused' : 'ready'); });
    localAudio.addEventListener('ended', () => setState('ended'));
    localAudio.addEventListener('timeupdate', syncLocalPosition);
    localAudio.addEventListener('error', () => fail());
    button.addEventListener('click', () => {
      if (!ready) return;
      if (playing) localAudio.pause();
      else { if (state === 'ended') localAudio.currentTime = 0; localAudio.play().catch(() => setState('ready')); }
    });
    localAudio.load();
  } else {
    const parameters = new URLSearchParams({
      url: track, auto_play: 'true', color: body.classList.contains('profile--emohead') ? '#312126' : getComputedStyle(body).getPropertyValue('--accent').trim(),
      hide_related: 'true', show_comments: 'false', show_reposts: 'false', show_teaser: 'false', visual: 'false'
    });
    iframe.src = `https://w.soundcloud.com/player/?${parameters}`;
    iframe.title = `${title} — SoundCloud`;
    const initialize = () => {
      if (!window.SC?.Widget) return fail();
      widget = window.SC.Widget(iframe);
      const events = window.SC.Widget.Events;
      widget.bind(events.READY, () => {
        clearTimeout(watchdog); ready = true; setState('ready'); widget.setVolume(55); widget.play();
        autoplayCheck = setTimeout(() => widget.isPaused(paused => { if (paused && state === 'ready') setState('ready'); }), 1800);
      });
      const syncPosition = position => {
        if (!Number.isFinite(position) || position < 0) return;
        lastProgressMs = position; lastProgressAt = performance.now();
      };
      widget.bind(events.PLAY, () => {
        clearTimeout(autoplayCheck); ready = true; clearTimeout(watchdog); lastProgressAt = performance.now();
        widget.getPosition(syncPosition); setState('playing');
      });
      widget.bind(events.PAUSE, () => { if (state !== 'error') setState(hasPlayed ? 'paused' : 'ready'); });
      widget.bind(events.FINISH, () => setState('ended'));
      widget.bind(events.PLAY_PROGRESS, data => { syncPosition(data?.currentPosition); if (data?.currentPosition > 0) hasPlayed = true; });
      widget.bind(events.SEEK, data => { syncPosition(data?.currentPosition); drawAudio(lastProgressMs); });
      widget.bind(events.ERROR, fail);
    };
    if (window.SC?.Widget) initialize();
    else {
      const script = document.createElement('script');
      script.src = 'https://w.soundcloud.com/player/api.js'; script.async = true;
      script.addEventListener('load', initialize, { once: true }); script.addEventListener('error', fail, { once: true });
      document.head.append(script);
    }
    button.addEventListener('click', () => {
      if (!ready || !widget) return;
      if (playing) widget.pause(); else { if (state === 'ended') widget.seekTo(0); widget.play(); }
    });
    watchdog = setTimeout(fail, 20000);
  }

  function fail() {
    clearTimeout(watchdog); clearTimeout(autoplayCheck); ready = false; setState('error');
  }
  document.addEventListener('visibilitychange', updateMeter);
  motion.addEventListener('change', updateMeter);
  window.addEventListener('pagehide', () => {
    clearTimeout(watchdog); clearTimeout(autoplayCheck);
    if (meterFrame) cancelAnimationFrame(meterFrame);
    if (localAudio) localAudio.pause(); else if (widget && ready) widget.pause();
  });
})();
