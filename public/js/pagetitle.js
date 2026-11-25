// Keeps a detail page's name (show, actor, title) in the topbar once its heading has scrolled out of view.
// One page title at a time: each call drops the previous one, and pinTitle(null) clears it.
let observer = null;
let pending = 0;

const slot = () => document.getElementById('page-title');

function show(on) {
  document.body.classList.toggle('titled', on);
  const s = slot();
  if (s) s.hidden = !on;
}

export function pinTitle(h1) {
  if (observer) { observer.disconnect(); observer = null; }
  const token = ++pending;
  show(false);
  const s = slot();
  if (!h1 || !s || typeof IntersectionObserver === 'undefined') return;
  s.textContent = h1.textContent;
  s.title = h1.textContent;
  // Views build their page before the router attaches it, so wait a frame to observe the heading in place.
  requestAnimationFrame(() => {
    if (token !== pending || !h1.isConnected) return;
    // The topbar is sticky and its height changes when it wraps, so measure it each time.
    const bar = document.querySelector('.topbar');
    const offset = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
    observer = new IntersectionObserver(([e]) => {
      if (token !== pending || !h1.isConnected) return;
      // Above the topbar means scrolled past; below the screen (not reached yet) doesn't count.
      show(!e.isIntersecting && e.boundingClientRect.top < offset);
    }, { rootMargin: `-${offset}px 0px 0px 0px` });
    observer.observe(h1);
  });
}

export function initPageTitle() {
  const s = slot();
  if (s) s.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
