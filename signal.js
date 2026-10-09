(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const links = document.querySelectorAll('.site-nav a, .site-footer__links a, .artist-card__link, .back-link, .profile-footer a, .service--active');
  const resets = [];
  const glyphs = '01/<>_−';

  links.forEach(link => {
    const roots = link.matches('.artist-card__link')
      ? link.querySelectorAll('h3, .artist-card__info > span')
      : link.matches('.service--active')
        ? link.querySelectorAll('.service-name, .service-action')
        : [link];
    const labels = [];

    roots.forEach(root => {
      // Keep real text in the accessibility tree; only the overlay is scrambled.
      [...root.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).forEach(node => {
        const label = document.createElement('span');
        const original = document.createElement('span');
        const noise = document.createElement('span');
        label.className = 'signal-label';
        original.className = 'signal-label__original';
        noise.className = 'signal-label__noise';
        noise.setAttribute('aria-hidden', 'true');
        const text = node.textContent;
        original.textContent = text;
        label.append(original, noise);
        node.replaceWith(label);
        labels.push({ label, noise, text: [...text] });
      });
    });

    let frame = 0;
    let lastStep = -1;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      labels.forEach(({ label, noise }) => {
        label.classList.remove('is-decoding');
        noise.textContent = '';
      });
    };
    resets.push(reset);
    const decode = () => {
      reset();
      if (motion.matches) return;
      const started = performance.now();
      lastStep = -1;
      labels.forEach(({ label }) => label.classList.add('is-decoding'));
      const draw = now => {
        const elapsed = now - started;
        if (elapsed >= 280) return reset();
        const step = Math.floor(elapsed / 35);
        if (step !== lastStep) {
          labels.forEach(({ noise, text }) => {
            const resolved = Math.floor(text.length * elapsed / 240);
            noise.textContent = text.map((letter, index) =>
              index < resolved || !/[\p{L}\p{N}]/u.test(letter)
                ? letter : glyphs[(index + step) % glyphs.length]
            ).join('');
          });
          lastStep = step;
        }
        frame = requestAnimationFrame(draw);
      };
      draw(started);
    };
    link.dataset.signalLink = '';
    link.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') decode();
    });
    link.addEventListener('pointerleave', reset);
    link.addEventListener('focus', decode);
    link.addEventListener('blur', reset);
  });
  motion.addEventListener('change', () => resets.forEach(reset => reset()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resets.forEach(reset => reset());
  });
})();
