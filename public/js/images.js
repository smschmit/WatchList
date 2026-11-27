// Images from TMDB: a backdrop strip for every linked title, and the full-size viewer (also used for episode stills).
import { el } from './util.js';
import { getBackdrops } from './tmdb.js';
import { IMG } from './ui.js';

// Full-size view of one image, with arrows (buttons or keys) to move through the set it came from.
export function openViewer(list, i, caption) {
  const dlg = el('dialog', { class: 'image-viewer', 'aria-label': 'Image' });
  const img = el('img', { alt: '' });
  const cap = el('p', { class: 'small image-caption' });
  const show = (j) => {
    i = (j + list.length) % list.length;
    img.src = `${IMG}w1280${list[i].path}`;
    cap.textContent = [caption ? caption(list[i]) : '', list.length > 1 ? `${i + 1} of ${list.length}` : ''].filter(Boolean).join(' · ');
  };
  const nav = list.length > 1 ? [
    el('button', { class: 'viewer-nav prev', type: 'button', 'aria-label': 'Previous', onclick: (e) => { e.stopPropagation(); show(i - 1); } }, '‹'),
    el('button', { class: 'viewer-nav next', type: 'button', 'aria-label': 'Next', onclick: (e) => { e.stopPropagation(); show(i + 1); } }, '›'),
  ] : [];
  dlg.append(img, cap, ...nav, el('button', { class: 'viewer-close', type: 'button', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕'));
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target === img) dlg.close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
  });
  dlg.addEventListener('close', () => dlg.remove());
  show(i);
  document.body.append(dlg);
  dlg.showModal();
}
export function thumb(list, i, size, cls, caption) {
  return el('button', { type: 'button', class: `thumb ${cls}`, 'aria-label': caption ? caption(list[i]) : 'Open image', onclick: () => openViewer(list, i, caption) },
    el('img', { src: `${IMG}${size}${list[i].path}`, alt: '', loading: 'lazy' }));
}

// A row of the title's main key art (backdrops with no text). Hidden if TMDB has none; onShow runs when it appears.
export function backdropStrip(t, onShow) {
  const strip = el('div', { class: 'backdrop-strip', hidden: true });
  getBackdrops(t).then((list) => {
    if (!list.length) return;
    strip.replaceChildren(...list.map((_, i) => thumb(list, i, 'w500', 'backdrop')));
    strip.hidden = false;
    if (onShow) onShow();
  }).catch(() => {});
  return strip;
}
// An Images card with only backdrops (movies, and titles not on the list). Stays hidden if there are none.
export function backdropCard(t) {
  const sec = el('section', { class: 'card images', hidden: true }, el('h2', {}, 'Images'));
  sec.append(backdropStrip(t, () => { sec.hidden = false; }));
  return sec;
}

// The Images card on a show page: the backdrop strip. Episode stills live in the Episodes card (episodes.js).
export function imagesSection(s) {
  if (!s.tmdb || !s.tmdb.id) return null;
  return backdropCard(s.tmdb);
}
