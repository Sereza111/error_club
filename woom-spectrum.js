(() => {
  const canvas = document.querySelector('[data-spectrum-field]');
  if (!canvas) return;

  const context = canvas.getContext('2d', { alpha: true });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: .32, y: .47, active: false };
  let analysis;
  let texture;
  let audio;
  let frameRequest = 0;
  let lastPaint = 0;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  const resize = () => {
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(innerWidth * ratio));
    canvas.height = Math.max(1, Math.round(innerHeight * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint();
  };

  const buildTexture = data => {
    const width = data.frames.length;
    const height = data.frames[0].length;
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const layerContext = layer.getContext('2d');
    const pixels = layerContext.createImageData(width, height);

    data.frames.forEach((frame, x) => {
      frame.forEach((raw, band) => {
        const level = raw / 255;
        const y = height - band - 1;
        const offset = (y * width + x) * 4;
        const flare = Math.max(0, level - .72) / .28;
        pixels.data[offset] = Math.round(19 + level * 58 + flare * 178);
        pixels.data[offset + 1] = Math.round(52 + level * 203);
        pixels.data[offset + 2] = Math.round(58 + level * 186 + flare * 45);
        pixels.data[offset + 3] = Math.round(18 + level * 222);
      });
    });
    layerContext.putImageData(pixels, 0, 0);
    return layer;
  };

  const currentFrame = () => {
    const frames = analysis.frames;
    const durationSeconds = analysis.duration / 1000;
    const playing = audio && !audio.paused && !audio.ended && Number.isFinite(audio.duration);
    const progress = playing
      ? clamp(audio.currentTime / (audio.duration || durationSeconds), 0, 1)
      : pointer.x;
    const index = clamp(Math.floor(progress * (frames.length - 1)), 0, frames.length - 1);
    return { frame: frames[index], progress, playing };
  };

  const paint = () => {
    if (!analysis || !texture) return;
    const width = innerWidth;
    const height = innerHeight;
    const bands = texture.height;
    const stripHeight = height / bands;
    const selected = currentFrame();
    const scanX = selected.progress * width;
    const focusBand = clamp((1 - pointer.y) * (bands - 1), 0, bands - 1);

    context.clearRect(0, 0, width, height);
    context.save();
    context.globalAlpha = .44;
    for (let screenBand = 0; screenBand < bands; screenBand += 1) {
      const sourceBand = bands - screenBand - 1;
      const level = selected.frame[sourceBand] / 255;
      const distance = Math.abs(sourceBand - focusBand) / Math.max(1, bands * .32);
      const focus = pointer.active ? Math.max(0, 1 - distance) : .18;
      const displacement = motion.matches ? 0 : (level * level - .14) * (32 + focus * 118);
      const y = screenBand * stripHeight;
      context.drawImage(texture, 0, screenBand, texture.width, 1,
        -displacement, y, width + Math.abs(displacement) + 2, stripHeight + 1);
    }
    context.restore();

    context.save();
    context.globalCompositeOperation = 'lighter';
    context.shadowBlur = 22;
    context.shadowColor = '#62fff0';
    context.strokeStyle = '#62fff0';
    context.lineWidth = pointer.active || selected.playing ? 1.5 : .75;
    context.globalAlpha = pointer.active || selected.playing ? .92 : .34;
    context.beginPath();
    for (let screenBand = 0; screenBand < bands; screenBand += 1) {
      const sourceBand = bands - screenBand - 1;
      const level = selected.frame[sourceBand] / 255;
      const y = (screenBand + .5) * stripHeight;
      const x = scanX - 12 - level * level * Math.min(210, width * .16);
      if (screenBand === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
    context.beginPath();
    for (let screenBand = 0; screenBand < bands; screenBand += 1) {
      const sourceBand = bands - screenBand - 1;
      const level = selected.frame[sourceBand] / 255;
      const y = (screenBand + .5) * stripHeight;
      const x = scanX + 12 + level * level * Math.min(210, width * .16);
      if (screenBand === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();

    context.shadowBlur = 16;
    context.strokeStyle = '#ff3ee8';
    context.globalAlpha = .34;
    context.beginPath();
    context.moveTo(scanX + 6, 0);
    context.lineTo(scanX + 6, height);
    context.stroke();
    context.strokeStyle = '#62fff0';
    context.globalAlpha = .86;
    context.beginPath();
    context.moveTo(scanX, 0);
    context.lineTo(scanX, height);
    context.stroke();

    if (pointer.active && !motion.matches) {
      const focusY = pointer.y * height;
      context.globalAlpha = .5;
      context.setLineDash([2, 8]);
      context.beginPath();
      context.moveTo(0, focusY);
      context.lineTo(width, focusY);
      context.stroke();
    }
    context.restore();
  };

  const animate = timestamp => {
    frameRequest = 0;
    if (!audio || audio.paused || audio.ended || document.hidden || motion.matches) return;
    if (timestamp - lastPaint > 30) {
      paint();
      lastPaint = timestamp;
    }
    frameRequest = requestAnimationFrame(animate);
  };

  const start = () => {
    if (!frameRequest && !motion.matches) frameRequest = requestAnimationFrame(animate);
  };
  const stop = () => {
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    paint();
  };

  fetch(canvas.dataset.spectrumField)
    .then(response => {
      if (!response.ok) throw new Error('Spectrum unavailable');
      return response.json();
    })
    .then(data => {
      if (!(data.duration > 0) || !Array.isArray(data.frames) || !data.frames.length || !data.frames[0]?.length) return;
      analysis = data;
      texture = buildTexture(data);
      audio = document.querySelector('[data-intro-player] audio');
      if (audio) {
        audio.addEventListener('play', start);
        audio.addEventListener('pause', stop);
        audio.addEventListener('ended', stop);
        audio.addEventListener('seeked', paint);
      }
      resize();
    })
    .catch(() => canvas.remove());

  addEventListener('pointermove', event => {
    if (motion.matches) return;
    pointer.x = clamp(event.clientX / innerWidth, 0, 1);
    pointer.y = clamp(event.clientY / innerHeight, 0, 1);
    pointer.active = true;
    if (!audio || audio.paused) paint();
  }, { passive: true });
  addEventListener('pointerleave', () => {
    pointer.active = false;
    if (!audio || audio.paused) paint();
  });
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  motion.addEventListener('change', () => { stop(); if (!motion.matches) start(); });
})();
