// A grabbable scroll handle for long pages, since phone scroll bars can't be dragged.
// Shows on the right edge while scrolling any page taller than a few screens; drag it to jump anywhere.
// Items with a data-jump attribute (e.g. list rows) label the bubble beside the handle with where you are.

const MIN_SCREENS = 3; // shorter pages don't get a handle
const THUMB = 48; // px, the handle's height (and touch target)

let track, thumb, bubble, hideTimer, dragging = false, grabOffset = 0;

function topInset() {
  const bar = document.querySelector('.topbar');
  return bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
}
const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
const tall = () => document.documentElement.scrollHeight > innerHeight * MIN_SCREENS;

function layout() {
  const top = topInset();
  track.style.top = `${top}px`;
  const h = innerHeight - top - 8;
  const ratio = maxScroll() > 0 ? scrollY / maxScroll() : 0;
  thumb.style.transform = `translateY(${Math.round(ratio * (h - THUMB))}px)`;
  return { top, h };
}

// The data-jump label of the item at the top of the visible list.
function currentLabel() {
  const y = topInset() + 12;
  const x = Math.min(innerWidth / 2, 300);
  const hit = document.elementFromPoint(x, y);
  const item = hit && hit.closest('[data-jump]');
  if (item) return item.dataset.jump;
  // Between items (gaps, headers): take the first labelled item below the line.
  for (const it of document.querySelectorAll('[data-jump]')) if (it.getBoundingClientRect().bottom > y) return it.dataset.jump;
  return '';
}

// Long pages keep a strip clear on the right (body.fastscroll-room) so the handle never sits on row buttons like + Add.
function sync() {
  const on = tall();
  document.body.classList.toggle('fastscroll-room', on);
  if (!on) track.hidden = true;
  return on;
}

function show() {
  if (!sync()) return;
  track.hidden = false;
  layout();
  track.classList.add('on');
  clearTimeout(hideTimer);
  if (!dragging) hideTimer = setTimeout(() => track.classList.remove('on'), 1500);
}

function scrollToPointer(clientY) {
  const { top, h } = layout();
  const ratio = Math.min(1, Math.max(0, (clientY - top - grabOffset) / (h - THUMB)));
  window.scrollTo(0, ratio * maxScroll());
  const label = currentLabel();
  bubble.textContent = label;
  bubble.hidden = !label;
  bubble.style.top = `${Math.round(ratio * (h - THUMB)) + THUMB / 2}px`;
}

export function startFastScroll() {
  track = document.createElement('div');
  track.className = 'fastscroll';
  track.hidden = true;
  thumb = document.createElement('div');
  thumb.className = 'fastscroll-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  bubble = document.createElement('div');
  bubble.className = 'fastscroll-bubble';
  bubble.hidden = true;
  track.append(thumb, bubble);
  document.body.append(track);

  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    grabOffset = e.clientY - thumb.getBoundingClientRect().top;
    thumb.setPointerCapture(e.pointerId);
    track.classList.add('on', 'dragging');
    clearTimeout(hideTimer);
    scrollToPointer(e.clientY);
  });
  thumb.addEventListener('pointermove', (e) => { if (dragging) scrollToPointer(e.clientY); });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove('dragging');
    bubble.hidden = true;
    show();
  };
  thumb.addEventListener('pointerup', end);
  thumb.addEventListener('pointercancel', end);

  window.addEventListener('scroll', () => { if (!dragging) show(); }, { passive: true });
  window.addEventListener('resize', () => { if (!track.hidden) layout(); });
  window.addEventListener('hashchange', () => { track.classList.remove('on'); track.hidden = true; sync(); });
  // Pages render and grow after navigation; reserve the strip as soon as one gets tall, not on first scroll.
  new ResizeObserver(sync).observe(document.body);
}
