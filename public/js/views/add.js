// Add a show from TMDB or by hand.
import { el, today } from '../util.js';
import { state, readOnly, normShow, save, canEdit } from '../state.js';
import { go } from '../router.js';
import { tmdbPicker, titleHash } from '../ui.js';
import { openEdit } from './show.js';

// ---------- Add ----------
export function viewAdd() {
  const wrap = el('div', { class: 'add-page card' }, el('h1', {}, 'Add a show or movie'));
  if (readOnly) return wrap.append(el('p', { class: 'muted' }, 'View only.')), wrap;
  wrap.append(el('p', { class: 'muted small' }, 'Search TMDB and tap a result to see its details. Add it from there and the details fill in automatically.'),
    tmdbPicker('', 'multi', null, (hit) => go(titleHash(hit))));
  const title = el('input', { placeholder: 'Title', 'aria-label': 'Title' });
  wrap.append(el('h2', {}, 'Not on TMDB?'), el('form', { class: 'row', onsubmit: (e) => {
    e.preventDefault();
    if (!title.value.trim() || !canEdit()) return;
    const s = normShow({ title: title.value.trim(), status: 'Identified', sources: [`Added in app (${today().slice(0, 7)})`], tmdb: { none: true } });
    state.shows.push(s);
    save({ quiet: true });
    go(`#/show/${s.id}`);
    openEdit(s);
  } }, title, el('button', { class: 'btn' }, 'Add by hand')));
  return wrap;
}
