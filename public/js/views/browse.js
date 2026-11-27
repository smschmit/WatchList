// Home page: every column with its values and counts.
import { el } from '../util.js';
import { state } from '../state.js';
import { CATS, counts } from '../categories.js';
import { emptyState, chipLink } from '../ui.js';
import { recall, remember } from '../router.js';
import { collectionsStrip } from './collections.js';

export function viewBrowse() {
  if (!state.shows.length) return emptyState();
  const wrap = el('div', { class: 'browse' });
  wrap.append(el('p', { class: 'muted' }, `${state.shows.length} titles. Tap any value to see those shows; add more filters from there.`,
    el('span', { class: 'edit-only' }, ' ', el('a', { href: '#/tags/deck' }, `Tag Deck (${state.shows.filter((s) => s.tagsReviewedAt).length} of ${state.shows.length} reviewed)`))));
  const strip = collectionsStrip();
  if (strip) wrap.append(strip);
  for (const cat of CATS) {
    if (cat.hideIf && cat.hideIf()) continue;
    const entries = counts(cat, state.shows);
    if (!entries.length) {
      if (cat.key === 'actor') wrap.append(el('section', { class: 'cat card' }, el('h2', {}, cat.label),
        el('p', { class: 'muted small' }, 'Heart actors from a show\'s cast or an actor\'s page and they show up here.')));
      continue;
    }
    const expanded = recall('expanded', []);
    const shown = cat.top && !expanded.includes(cat.key) ? entries.slice(0, cat.top) : entries;
    const sec = el('section', { class: 'cat card' },
      el('h2', {}, cat.label, cat.key === 'status' ? el('a', { class: 'h2-link edit-only', href: '#/statuses' }, 'Edit options') : null,
        cat.key === 'tag' ? el('a', { class: 'h2-link edit-only', href: '#/tags' }, 'Clean up') : null),
      el('div', { class: 'chips' }, shown.map(([v, n]) => chipLink(cat.key, v, n))));
    if (shown.length < entries.length) {
      const more = el('button', { class: 'btn small', onclick: () => {
        sec.querySelector('.chips').replaceChildren(...entries.map(([v, n]) => chipLink(cat.key, v, n)));
        more.remove();
        remember('expanded', [...recall('expanded', []), cat.key]);
      } }, `All ${entries.length} ${cat.label.toLowerCase()}`);
      sec.append(more);
    }
    wrap.append(sec);
  }
  return wrap;
}
