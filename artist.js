const portrait = document.querySelector('#artist-photo');
const choices = [...document.querySelectorAll('[data-photo]')];
let request = 0;
choices.forEach((button, index) => button.addEventListener('click', async () => {
  if (button.getAttribute('aria-pressed') === 'true') return;
  const selectedRequest = ++request;
  const image = new Image();
  image.src = button.dataset.photo;
  portrait.classList.add('is-loading');
  try {
    await image.decode();
    if (selectedRequest !== request) return;
    portrait.src = image.src;
    portrait.alt = button.dataset.alt;
    choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
    document.querySelector('[data-photo-counter]').textContent = String(index + 1).padStart(2, '0');
  } catch {
    // Preserve the displayed photo if the alternate cannot be loaded.
  } finally {
    if (selectedRequest === request) portrait.classList.remove('is-loading');
  }
}));
