const katarsisBackground = document.querySelector('[data-katarsis-background]');

if (katarsisBackground) {
  const root = document.documentElement;
  const mobile = window.matchMedia('(max-width: 760px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeSource = '';
  let pointerFrame = 0;

  const pause = () => katarsisBackground.pause();

  const play = () => {
    if (!reducedMotion.matches && !document.hidden) {
      katarsisBackground.play().catch(() => {});
    }
  };

  const selectSource = () => {
    if (reducedMotion.matches) {
      pause();
      katarsisBackground.removeAttribute('src');
      katarsisBackground.load();
      activeSource = '';
      return;
    }

    const source = mobile.matches ? katarsisBackground.dataset.mobile : katarsisBackground.dataset.desktop;
    if (source !== activeSource) {
      activeSource = source;
      katarsisBackground.src = source;
      katarsisBackground.load();
    }
    play();
  };

  const updatePointer = (event) => {
    if (reducedMotion.matches || pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      const x = Math.max(0, Math.min(1, event.clientX / window.innerWidth));
      const y = Math.max(0, Math.min(1, event.clientY / window.innerHeight));
      root.style.setProperty('--katarsis-x', `${(x * 100).toFixed(2)}%`);
      root.style.setProperty('--katarsis-y', `${(y * 100).toFixed(2)}%`);
      root.style.setProperty('--katarsis-shift-x', `${((x - .5) * -18).toFixed(1)}px`);
      root.style.setProperty('--katarsis-shift-y', `${((y - .5) * -12).toFixed(1)}px`);
      pointerFrame = 0;
    });
  };

  document.addEventListener('visibilitychange', () => document.hidden ? pause() : play());
  window.addEventListener('pointermove', updatePointer, { passive: true });
  window.addEventListener('pagehide', pause);
  mobile.addEventListener('change', selectSource);
  reducedMotion.addEventListener('change', selectSource);
  selectSource();
}
