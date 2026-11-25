// Add a show from TMDB or by hand.
import { el, today, toast, norm } from '../util.js';
import { state, readOnly, normShow, save, canEdit, listShowFor } from '../state.js';
import { go, syncLastHash } from '../router.js';
import { tmdbPicker, titleHash, statusClass } from '../ui.js';
import { addFromTmdb, possibleMatch, linkAndFill, removeShow } from '../library.js';
import { openEdit } from './show.js';

const showHref = (s) => `#/show/${encodeURIComponent(s.id)}`;
const label = (s) => `${s.title}${s.year ? ` (${s.year})` : ''}`;

// What goes under each search result: already on the list, maybe on the list (unlinked), or + Add.
function hitActions(h, refresh) {
  const mine = listShowFor(h);
  if (mine) return el('a', { class: `pill ${statusClass(mine.status)}`, href: showHref(mine) }, `On your list${mine.status ? ` · ${mine.status}` : ''}`);
  const busy = (fn) => async (e) => { e.currentTarget.disabled = true; await fn(); refresh(); };
  const add = busy(async () => {
    const s = await addFromTmdb(h);
    if (s) toast(`Added ${s.title} as ${s.status}`, { label: 'Undo', run: () => { removeShow(s); refresh(); } });
  });
  const match = possibleMatch(h);
  if (match) {
    return [
      el('span', { class: 'small maybe' }, 'Might be on your list: ', el('a', { href: showHref(match) }, label(match))),
      el('button', { class: 'btn small primary', type: 'button', title: `Link “${match.title}” to this TMDB title and fill in blanks`,
        onclick: busy(() => linkAndFill(match, h)) }, 'Link'),
      el('button', { class: 'btn small', type: 'button', onclick: add }, 'Add anyway'),
    ];
  }
  return el('button', { class: 'btn small primary', type: 'button', onclick: add }, '+ Add');
}

// ---------- Add ----------
// #/add?q=…&type=tv searches on load, so a search can be bookmarked and Back returns to the results.
export function viewAdd(r) {
  const wrap = el('div', { class: 'add-page card' }, el('h1', {}, 'Add a show or movie'));
  if (readOnly) return wrap.append(el('p', { class: 'muted' }, 'View only.')), wrap;
  const q = r.params.get('q') || '';
  const title = el('input', { placeholder: 'Title', 'aria-label': 'Title', value: q });
  const type = ['tv', 'movie'].includes(r.params.get('type')) ? r.params.get('type') : 'multi';
  wrap.append(el('p', { class: 'muted small' }, 'Search TMDB. + Add puts a title on your list with the details filled in; tap a result to see more first.'),
    tmdbPicker(q, type, null, (hit) => go(titleHash(hit)), {
      autoRun: true,
      extras: hitActions,
      onQuery: (query, t) => {
        const p = new URLSearchParams({ q: query });
        if (t !== 'multi') p.set('type', t);
        history.replaceState(null, '', `#/add?${p}`);
        syncLastHash();
        title.value = query;
      },
    }));
  wrap.append(el('h2', {}, 'Not on TMDB?'), el('form', { class: 'row', onsubmit: (e) => {
    e.preventDefault();
    const name = title.value.trim();
    if (!name || !canEdit()) return;
    const same = state.shows.find((s) => norm(s.title) === norm(name));
    if (same && !confirm(`“${label(same)}” is already on your list. Add another?`)) return;
    const s = normShow({ title: name, status: 'Identified', sources: [`Added in app (${today().slice(0, 7)})`], tmdb: { none: true } });
    state.shows.push(s);
    save({ quiet: true });
    go(showHref(s));
    openEdit(s);
  } }, title, el('button', { class: 'btn' }, 'Add by hand')));
  return wrap;
}
