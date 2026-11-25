// Pieces of UI used on several pages.
import { el, toast, uniq, norm } from './util.js';
import { state, readOnly, save, canEdit, actorByTmdb, listShowFor } from './state.js';
import { isMovie, totalHours, fmtHours, years } from './shows.js';
import { WANT_ORDER, favNamesFor, statusNames, statusColors, defaultStatusColor } from './categories.js';
import { go, listHash } from './router.js';
import { searchTmdbPage } from './tmdb.js';
import { toggleFavorite, setStatus } from './library.js';

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
      const unlocked = setStatus(s, sel.value); sel.className = `pill status-select ${statusClass(s.status)}`;
      save({ quiet: true }); toast(`${s.title}: ${s.status || 'no status'}${unlocked ? ' · spoilers on' : ''}`);
    } },
    SELECTS.status().map((v) => el('option', { value: v, selected: v === s.status }, v || '—')));
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
  if (!v) return '';
  const c = statusColors.get(v) || defaultStatusColor(v);
  return c === 'none' ? '' : `st-${c}`;
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
// Makes a whole card open `href` when tapped, except on the controls inside it (links, buttons, menus, fields),
// and not when the tap ends a text selection. Ctrl/Cmd-click opens it in a new tab.
const CONTROLS = 'a, button, select, input, textarea, label, summary, [role="button"]';
export function cardClick(href) {
  return (e) => {
    if (e.target.closest(CONTROLS)) return;
    if (String(window.getSelection && window.getSelection()).trim()) return;
    if (e.metaKey || e.ctrlKey) window.open(href, '_blank'); else go(href);
  };
}
// The favorite actors in a title, as a ♥ line. `t` is a show on the list or a TMDB title ({ type, id }).
// `skip`: a name to leave out (on an actor's own page every credit has them). Nothing when there are none.
export function favLine(t, { skip = null, cls = 'small' } = {}) {
  const names = (!t ? [] : t.tmdb ? favNamesFor(t) : t.type && t.id ? favNamesFor({ tmdb: t }) : []).filter((n) => n !== skip);
  if (!names.length) return null;
  // Each name links to that actor's page (they may not be in the cast list if their part was small).
  const parts = names.flatMap((n, i) => {
    const a = state.actors.find((x) => x.name === n);
    return [i ? ', ' : '', a && a.tmdbId ? el('a', { href: `#/actor/${a.tmdbId}` }, n) : n];
  });
  return el('div', { class: `${cls} fav-line` }, '♥ ', ...parts);
}
export function showCard(s) {
  const href = `#/show/${encodeURIComponent(s.id)}`;
  // A div, not a link, so the status menu inside it works; tapping anywhere else opens the show.
  return el('div', { class: 'show-card', onclick: cardClick(href) },
    poster(s.tmdb && s.tmdb.poster),
    el('div', { class: 'show-card-body' },
      el('div', { class: 'show-card-title' }, el('a', { href }, s.title), statusSelect(s)),
      el('div', { class: 'muted small' }, metaLine(s)),
      el('div', { class: 'small' }, [...s.genres, ...s.tags.slice(0, 4)].join(' · ')),
      favLine(s)));
}

// Compact version of showCard for scanning long lists: title and status, then year, format, genres and tags on one cut-off line.
export function showRow(s) {
  const href = `#/show/${encodeURIComponent(s.id)}`;
  const meta = [years(s), s.format, ...s.genres, ...s.tags].filter(Boolean).join(' · ');
  return el('div', { class: 'show-row', onclick: cardClick(href) },
    el('a', { class: 'show-row-title', href }, s.title), statusSelect(s),
    el('div', { class: 'show-row-meta muted small' }, meta),
    favLine(s, { cls: 'small show-row-meta' }));
}
export const DENSITY_KEY = 'watchlist:density';
export function getDensity() { try { return localStorage.getItem(DENSITY_KEY) === 'rows' ? 'rows' : 'cards'; } catch { return 'cards'; } }
export function setDensity(v) { try { localStorage.setItem(DENSITY_KEY, v); } catch { /* per-device nicety only */ } }

// ---------- Show page ----------
export const SELECTS = {
  status: () => uniq(['', ...statusNames()]),
  want: () => uniq(['', ...WANT_ORDER, ...state.shows.map((s) => s.want)]),
  recommend: () => uniq(['', 'Top 50', 'Yes', ...state.shows.map((s) => s.recommend)]),
};

export function personTile(p, sub) {
  const fav = actorByTmdb(p.id);
  return el('div', { class: 'person clickable', onclick: cardClick(`#/actor/${p.id}`) },
    el('a', { href: `#/actor/${p.id}` }, poster(p.profile, 'w185', 'face')),
    el('div', { class: 'person-body' },
      el('a', { href: `#/actor/${p.id}`, class: 'person-name' }, p.name),
      sub ? el('div', { class: 'muted small' }, sub) : null),
    heartBtn(p, fav));
}
export function heartBtn(p, fav) {
  return el('button', { class: `heart ${fav ? 'on' : ''}`, 'data-person': String(p.id), title: fav ? 'Remove from favorites' : 'Add to favorites', 'aria-pressed': String(!!fav),
    disabled: readOnly, onclick: (e) => { e.preventDefault(); toggleFavorite(p); } }, fav ? '♥' : '♡');
}

// Search TMDB and pick a match. type: 'tv' | 'movie' | 'multi'
// Options: extras(hit, refresh) returns nodes shown under a result (refresh re-draws that result);
// onQuery(query, type) runs after each new search; autoRun searches for `initial` straight away.
// Searches as you type (after a pause); a newer search wins over a slower older one.
export function tmdbPicker(initial, type, year, onPick, { extras, onQuery, autoRun = false } = {}) {
  const box = el('div', { class: 'tmdb-picker' });
  const input = el('input', { type: 'search', value: initial || '', placeholder: 'Search TMDB', 'aria-label': 'Search TMDB', autocomplete: 'off' });
  const typeSel = el('select', { 'aria-label': 'Type', onchange: () => { if (input.value.trim()) run(); } },
    [['multi', 'TV + movies'], ['tv', 'TV'], ['movie', 'Movies']].map(([v, l]) => el('option', { value: v, selected: v === type }, l)));
  const results = el('div', { class: 'tmdb-results', 'aria-live': 'polite' });
  const more = el('button', { class: 'btn small', type: 'button', hidden: true, onclick: () => run(page + 1) }, 'Show more');
  let seq = 0, page = 1, timer;
  // Each result lives in a stable slot, so refresh (from a later Undo too) always redraws what's on screen.
  const renderHit = (h) => {
    const slot = el('div', { class: 'hit-slot' });
    const draw = () => slot.replaceChildren(tmdbHit(h, { onclick: () => onPick(h), extra: extras ? extras(h, draw) : null }));
    draw();
    return slot;
  };
  async function run(p = 1) {
    clearTimeout(timer);
    const q = input.value.trim(), t = typeSel.value;
    const my = ++seq;
    if (!q) { results.replaceChildren(); more.hidden = true; return; }
    if (p === 1) { results.replaceChildren(el('p', { class: 'muted' }, 'Searching…')); more.hidden = true; }
    more.disabled = true;
    try {
      const r = await searchTmdbPage(q, t, p);
      if (my !== seq) return; // a newer search started while this one was out
      page = p;
      const nodes = r.hits.map(renderHit);
      if (p === 1) results.replaceChildren(...nodes); else results.append(...nodes);
      if (p === 1 && !r.hits.length) results.append(el('p', { class: 'muted' }, 'No results.'));
      more.hidden = !r.more;
      if (p === 1 && onQuery) onQuery(q, t);
    } catch (e) {
      if (my !== seq) return;
      if (p === 1) results.replaceChildren(el('p', { class: 'muted' }, e.message)); else toast(e.message);
    }
    more.disabled = false;
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    if (input.value.trim().length >= 2) timer = setTimeout(() => run(), 350);
  });
  box.append(el('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); run(); } }, input, typeSel, el('button', { class: 'btn' }, 'Search')),
    results, el('div', { class: 'more-row' }, more));
  if (autoRun && input.value.trim()) run();
  return box;
}
// One TMDB search result. The card does the page's action (pick / link); "Details" opens the title's own page.
// `extra`: nodes for an actions row under the card (the Add page's + Add / Link / On your list).
export function tmdbHit(h, { onclick, picked = false, extra = null } = {}) {
  const original = h.original && norm(h.original) !== norm(h.title) ? h.original : null;
  const details = el('a', { class: 'hit-details small', href: titleHash(h) }, 'Details');
  return el('div', { class: `tmdb-hit-wrap${picked ? ' picked' : ''}${extra ? ' has-actions' : ''}` },
    el('button', { class: `tmdb-hit${picked ? ' picked' : ''}`, 'aria-pressed': picked ? 'true' : null, onclick },
      poster(h.poster), el('div', {}, el('b', {}, h.title), ` ${h.year || ''} · ${h.type === 'tv' ? 'TV' : 'Movie'}`,
        original ? el('div', { class: 'muted small' }, original) : null,
        favLine(h),
        el('div', { class: 'muted small clamp' }, h.overview))),
    extra ? el('div', { class: 'hit-actions' }, extra, details) : details);
}
export function titleHash(t, src) {
  const mine = listShowFor(t);
  if (mine) return `#/show/${encodeURIComponent(mine.id)}`;
  return `#/title/${t.type}-${t.id}${src ? `?src=${encodeURIComponent(src)}` : ''}`;
}
