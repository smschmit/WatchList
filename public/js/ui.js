// Pieces of UI used on several pages.
import { el, toast, uniq } from './util.js';
import { state, readOnly, save, canEdit, actorByTmdb, listShowFor } from './state.js';
import { isMovie, totalHours, fmtHours, years } from './shows.js';
import { STATUS_ORDER, WANT_ORDER, favNamesFor } from './categories.js';
import { go, listHash } from './router.js';
import { searchTmdb } from './tmdb.js';
import { toggleFavorite } from './library.js';

export const IMG = 'https://image.tmdb.org/t/p/';

export function emptyState() {
  return el('div', { class: 'card empty' },
    el('h2', {}, 'No shows yet'),
    el('p', {}, 'Sign in to load your list from the cloud, or import a backup file (for the first time: data/seed.json from the repo).'),
    el('a', { class: 'btn primary', href: '#/account' }, 'Account & import'));
}

export function chipLink(cat, value, n, filters = []) {
  return el('a', { class: `chip ${cat === 'status' ? statusClass(value) : ''}`, href: listHash([...filters, { cat, value }]) },
    value, n != null ? el('span', { class: 'count' }, n) : null);
}
// Status as a pill-styled menu, used wherever a show's status appears. Read-only viewers get a plain pill.
export function statusSelect(s) {
  if (readOnly) return s.status ? el('span', { class: `pill ${statusClass(s.status)}` }, s.status) : null;
  const sel = el('select', { class: `pill status-select ${statusClass(s.status)}`, 'aria-label': `Status for ${s.title}`,
    onchange: () => {
      if (!canEdit()) { sel.value = s.status; return; }
      s.status = sel.value; sel.className = `pill status-select ${statusClass(s.status)}`;
      save({ quiet: true }); toast(`${s.title}: ${s.status || 'no status'}`);
    } },
    uniq(['', ...SELECTS.status()]).map((v) => el('option', { value: v, selected: v === s.status }, v || '—')));
  // With a mouse, open our own menu at the pointer instead of the browser's dropdown. Touch keeps the native picker.
  sel.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !matchMedia('(pointer: fine)').matches) return;
    e.preventDefault();
    openStatusMenu(sel, e.clientX, e.clientY);
  });
  return sel;
}
// A pill menu placed so the current status sits right under the mouse.
export function openStatusMenu(sel, x, y) {
  document.querySelector('.status-menu')?.remove();
  const close = () => { menu.remove(); document.removeEventListener('mousedown', outside, true); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); document.removeEventListener('keydown', key, true); };
  const pick = (v) => { close(); if (v !== sel.value) { sel.value = v; sel.dispatchEvent(new Event('change')); } sel.focus(); };
  const items = [...sel.options].map((o) => el('button', { type: 'button', role: 'menuitem',
    class: `pill status-menu-item ${statusClass(o.value)} ${o.value === sel.value ? 'current' : ''}`, onclick: () => pick(o.value) }, o.textContent));
  const menu = el('div', { class: 'status-menu', role: 'menu' }, items);
  document.body.append(menu);
  const cur = items[sel.selectedIndex] || items[0];
  const mh = menu.offsetHeight, mw = menu.offsetWidth;
  const vh = innerHeight, vw = innerWidth;
  let top = y - (cur.offsetTop + cur.offsetHeight / 2);
  let left = x - Math.min(cur.offsetWidth / 2, 24);
  top = Math.max(4, Math.min(top, vh - mh - 4));
  left = Math.max(4, Math.min(left, vw - mw - 4));
  Object.assign(menu.style, { top: `${top}px`, left: `${left}px` });
  cur.focus({ preventScroll: true });
  const outside = (e) => { if (!menu.contains(e.target)) close(); };
  const key = (e) => {
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); sel.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', outside, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', key, true);
  });
}
export function statusClass(v) {
  if (/^(re)?watching/i.test(v)) return 'st-watching';
  if (/^want/i.test(v)) return 'st-want';
  if (/finished/i.test(v)) return 'st-finished';
  if (/recommended/i.test(v)) return 'st-rec';
  if (/paused|waiting|restart/i.test(v)) return 'st-paused';
  if (/dropped/i.test(v)) return 'st-dropped';
  return '';
}

export function poster(path, size = 'w92', cls = 'poster') {
  return path ? el('img', { class: cls, src: `${IMG}${size}${path}`, alt: '', loading: 'lazy' }) : el('div', { class: `${cls} blank` });
}
export function metaLine(s) {
  const bits = [years(s), s.format, s.network];
  if (!isMovie(s) && s.seasons) bits.push(`${s.seasons} season${s.seasons === 1 ? '' : 's'}`);
  if (s.epLength) bits.push(`${s.epLength} min`);
  const h = totalHours(s);
  if (h && !isMovie(s)) bits.push(`${fmtHours(h)} total`);
  return bits.filter(Boolean).join(' · ');
}
export function showCard(s) {
  const favs = favNamesFor(s);
  const href = `#/show/${encodeURIComponent(s.id)}`;
  // A div, not a link, so the status menu inside it works; tapping anywhere else opens the show.
  return el('div', { class: 'show-card', onclick: (e) => { if (!e.target.closest('select, a')) go(href); } },
    poster(s.tmdb && s.tmdb.poster),
    el('div', { class: 'show-card-body' },
      el('div', { class: 'show-card-title' }, el('a', { href }, s.title), statusSelect(s)),
      el('div', { class: 'muted small' }, metaLine(s)),
      el('div', { class: 'small' }, [...s.genres, ...s.tags.slice(0, 4)].join(' · ')),
      favs.length ? el('div', { class: 'small fav-line' }, '♥ ', favs.join(', ')) : null));
}

// ---------- Show page ----------
export const SELECTS = {
  status: () => uniq([...STATUS_ORDER, ...state.shows.map((s) => s.status)]),
  want: () => uniq(['', ...WANT_ORDER, ...state.shows.map((s) => s.want)]),
  recommend: () => uniq(['', 'Top 50', 'Yes', ...state.shows.map((s) => s.recommend)]),
};

export function personTile(p, sub) {
  const fav = actorByTmdb(p.id);
  return el('div', { class: 'person' },
    el('a', { href: `#/actor/${p.id}` }, poster(p.profile, 'w185', 'face')),
    el('div', { class: 'person-body' },
      el('a', { href: `#/actor/${p.id}`, class: 'person-name' }, p.name),
      sub ? el('div', { class: 'muted small' }, sub) : null),
    heartBtn(p, fav));
}
export function heartBtn(p, fav) {
  return el('button', { class: `heart ${fav ? 'on' : ''}`, title: fav ? 'Remove from favorites' : 'Add to favorites', 'aria-pressed': String(!!fav),
    disabled: readOnly, onclick: (e) => { e.preventDefault(); toggleFavorite(p); } }, fav ? '♥' : '♡');
}

// Search TMDB and pick a match. type: 'tv' | 'movie' | 'multi'
export function tmdbPicker(initial, type, year, onPick) {
  const box = el('div', { class: 'tmdb-picker' });
  const input = el('input', { type: 'search', value: initial || '', placeholder: 'Search TMDB', 'aria-label': 'Search TMDB' });
  const typeSel = el('select', { 'aria-label': 'Type' },
    [['multi', 'TV + movies'], ['tv', 'TV'], ['movie', 'Movies']].map(([v, l]) => el('option', { value: v, selected: v === type }, l)));
  const results = el('div', { class: 'tmdb-results' });
  async function run() {
    results.replaceChildren(el('p', { class: 'muted' }, 'Searching…'));
    try {
      const hits = await searchTmdb(input.value, typeSel.value);
      results.replaceChildren(...hits.slice(0, 10).map((h) => tmdbHit(h, { onclick: () => onPick(h) })));
      if (!hits.length) results.append(el('p', { class: 'muted' }, 'No results.'));
    } catch (e) { results.replaceChildren(el('p', { class: 'muted' }, e.message)); }
  }
  box.append(el('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); run(); } }, input, typeSel, el('button', { class: 'btn' }, 'Search')), results);
  return box;
}
// One TMDB search result. The card does the page's action (pick / link); "Details" opens the title's own page.
export function tmdbHit(h, { onclick, picked = false } = {}) {
  return el('div', { class: `tmdb-hit-wrap${picked ? ' picked' : ''}` },
    el('button', { class: `tmdb-hit${picked ? ' picked' : ''}`, 'aria-pressed': picked ? 'true' : null, onclick },
      poster(h.poster), el('div', {}, el('b', {}, h.title), ` ${h.year || ''} · ${h.type === 'tv' ? 'TV' : 'Movie'}`,
        el('div', { class: 'muted small clamp' }, h.overview))),
    el('a', { class: 'hit-details small', href: titleHash(h) }, 'Details'));
}

export function titleHash(t, src) {
  const mine = listShowFor(t);
  if (mine) return `#/show/${encodeURIComponent(mine.id)}`;
  return `#/title/${t.type}-${t.id}${src ? `?src=${encodeURIComponent(src)}` : ''}`;
}
