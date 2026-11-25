// Home page: every column with its values and counts.
import { el } from '../util.js';
import { state } from '../state.js';
import { CATS, counts } from '../categories.js';
import { emptyState, chipLink } from '../ui.js';

export function viewBrowse() {
  if (!state.shows.length) return emptyState();
  const wrap = el('div', { class: 'browse' });
  wrap.append(el('p', { class: 'muted' }, `${state.shows.length} titles. Tap any value to see those shows; add more filters from there.`,
    el('span', { class: 'edit-only' }, ' ', el('a', { href: '#/tags/deck' }, `Tag Deck (${state.shows.filter((s) => s.tagsReviewedAt).length} of ${state.shows.length} reviewed)`))));
  for (const cat of CATS) {
    const entries = counts(cat, state.shows);
    if (!entries.length) {
      if (cat.key === 'actor') wrap.append(el('section', { class: 'cat card' }, el('h2', {}, cat.label),
        el('p', { class: 'muted small' }, 'Heart actors from a show\'s cast or an actor\'s page and they show up here.')));
      continue;
    }
    const shown = cat.top ? entries.slice(0, cat.top) : entries;
    const sec = el('section', { class: 'cat card' },
      el('h2', {}, cat.label, cat.key === 'status' ? el('a', { class: 'h2-link edit-only', href: '#/statuses' }, 'Edit options') : null,
        cat.key === 'tag' ? el('a', { class: 'h2-link edit-only', href: '#/tags' }, 'Clean up') : null),
      el('div', { class: 'chips' }, shown.map(([v, n]) => chipLink(cat.key, v, n))));
    if (cat.top && entries.length > cat.top) {
      const more = el('button', { class: 'btn small', onclick: () => {
        sec.querySelector('.chips').replaceChildren(...entries.map(([v, n]) => chipLink(cat.key, v, n)));
        more.remove();
      } }, `All ${entries.length} ${cat.label.toLowerCase()}`);
      sec.append(more);
    }
    wrap.append(sec);
  }
  return wrap;
}
