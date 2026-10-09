const header = document.querySelector('[data-header]');
const fieldVideo = document.querySelector('[data-field-video]');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const updateHeader = () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 24);
};
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const rosterCount = document.querySelectorAll('[data-artist-card]').length;
const rosterLabel = document.querySelector('[data-roster-count]');
if (rosterLabel) {
  rosterLabel.textContent = `${String(rosterCount).padStart(2, '0')} artists`;
}

document.querySelectorAll('[data-artist-card]').forEach((card) => {
  const media = card.querySelector('.artist-card__media');
  if (!media) return;
  media.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const rect = media.getBoundingClientRect();
    const reveal = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    card.style.setProperty('--reveal', `${(reveal * 100).toFixed(2)}%`);
    card.classList.add('is-tracking');
  }, { passive: true });
  media.addEventListener('pointerleave', () => card.classList.remove('is-tracking'));
});

if (fieldVideo) {
  fieldVideo.autoplay = true;
  fieldVideo.muted = true;
  fieldVideo.defaultMuted = true;
  fieldVideo.src = window.matchMedia('(max-width: 800px)').matches
    ? 'assets/field/black-hole-v28-mobile.mp4'
    : 'assets/field/black-hole-v28-720p.mp4';

  const playField = () => {
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fieldVideo.pause();
      return;
    }
    fieldVideo.play().catch(() => {
      // Muted autoplay is supported by modern browsers; retry after a lifecycle change.
    });
  };
  fieldVideo.addEventListener('loadeddata', playField, { once: true });
  document.addEventListener('visibilitychange', () => {
    playField();
  });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', playField);
  playField();
}
