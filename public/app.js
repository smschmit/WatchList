'use strict';
// Watch List: browse a TV/movie watch list by any column, mark favorite actors, add their shows.
// Data lives on the device first (localStorage) and syncs to Supabase when signed in (cloud.js).
// Cast and filmographies come from TMDB through the Netlify function in netlify/functions/tmdb.mjs.

const APP_VERSION = '0.1.2';
const STATE_KEY = 'watchlist:state';
const REVIEW_KEY = 'watchlist:review';
const CACHE_KEY = 'watchlist:tmdb-cache';
const IMG = 'https://image.tmdb.org/t/p/';
const cfg = window.WATCHLIST_CONFIG || {};

let state; // loaded at the bottom, once everything it needs is defined
let readOnly = false;

// ---------- State ----------
function normShow(s) {
  return {
    id: s.id || newId('s'),
    title: s.title || 'Untitled',
    format: s.format || '',
    year: toNum(s.year), endYear: toNum(s.endYear),
    seasons: toNum(s.seasons), episodes: toNum(s.episodes), epLength: toNum(s.epLength),
    showStatus: s.showStatus || '',
    genres: arr(s.genres), structure: s.structure || '',
    country: s.country || '', languages: arr(s.languages), tags: arr(s.tags),
    network: s.network || '', confidence: s.confidence || '', researchNotes: s.researchNotes || '',
    status: s.status || '', want: s.want || '', recommend: s.recommend || '',
    sources: arr(s.sources), notes: s.notes || '',
    tmdb: s.tmdb || null,
    ...pickExtra(s, SHOW_KEYS),
  };
}
const SHOW_KEYS = ['id', 'title', 'format', 'year', 'endYear', 'seasons', 'episodes', 'epLength', 'showStatus', 'genres',
  'structure', 'country', 'languages', 'tags', 'network', 'confidence', 'researchNotes', 'status', 'want', 'recommend',
  'sources', 'notes', 'tmdb'];
function normActor(a) {
  return { id: a.id || `p${a.tmdbId}`, tmdbId: a.tmdbId, name: a.name || '', profile: a.profile || null,
    note: a.note || '', credits: arr(a.credits), creditsAt: a.creditsAt || null, ...pickExtra(a, ['id', 'tmdbId', 'name', 'profile', 'note', 'credits', 'creditsAt']) };
}
// Keep fields a newer version added, so an older copy of the app doesn't drop them.
function pickExtra(o, known) {
  const out = {};
  for (const k of Object.keys(o || {})) if (!known.includes(k)) out[k] = o[k];
  return out;
}
function normalizeState(s) {
  s = s || {};
  return { ...s, version: 1, shows: arr(s.shows).map(normShow), actors: arr(s.actors).map(normActor) };
}
function loadState() {
  try { return normalizeState(JSON.parse(localStorage.getItem(STATE_KEY) || 'null')); } catch { return normalizeState(null); }
}
function writeLocal() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { toast('Could not save on this device: storage is full.'); }
}
function save({ quiet = false } = {}) {
  writeLocal();
  if (window.cloud) window.cloud.onLocalSave();
  if (!quiet) render();
}
function canEdit() {
  if (readOnly) { toast('View only.'); return false; }
  return true;
}

// ---------- Helpers ----------
function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function toNum(v) { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function newId(p) { return p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}
let toastTimer;
function toast(msg, action) {
  const t = document.getElementById('toast');
  t.replaceChildren(el('span', {}, msg));
  if (action) t.append(el('button', { class: 'btn small', onclick: () => { t.hidden = true; action.run(); } }, action.label));
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 3000);
}
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const showById = (id) => state.shows.find((s) => s.id === id);
const actorByTmdb = (tid) => state.actors.find((a) => a.tmdbId === tid);
const isMovie = (s) => /movie|special/i.test(s.format);
function totalHours(s) {
  if (isMovie(s)) return s.epLength ? s.epLength / 60 : null;
  return s.episodes && s.epLength ? (s.episodes * s.epLength) / 60 : null;
}
function fmtHours(h) { return h == null ? '' : h < 1 ? `${Math.round(h * 60)} min` : `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`; }
function years(s) {
  if (!s.year) return '';
  if (isMovie(s) || s.endYear === s.year) return String(s.year);
  return s.endYear ? `${s.year}–${s.endYear}` : `${s.year}–`;
}
function download(name, text, type) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const today = () => new Date().toISOString().slice(0, 10);

// ---------- Categories (one per column you can browse by) ----------
const STATUS_ORDER = ['Watching', 'Want to Watch', "Waiting on Release and Now It's Ready", 'Restart Planned', 'Paused',
  'Paused Between Seasons', 'Waiting for Series End', 'Identified', 'Recommended', 'Finished', 'Dropped', 'Some'];
const WANT_ORDER = ['A lot', 'Yes', "Once it's finished", 'Maybe'];
function bucket(v, edges) {
  if (v == null) return '';
  for (const [max, label] of edges) if (v < max) return label;
  return edges[edges.length - 1][1];
}
const LEN_EDGES = [[26, 'Under 26 min'], [36, '26–35 min'], [50, '36–49 min'], [70, '50–69 min'], [Infinity, '70 min +']];
const MOVIE_EDGES = [[90, 'Movie under 90 min'], [120, 'Movie 90–119 min'], [Infinity, 'Movie 2 h +']];
const HOUR_EDGES = [[3, 'Under 3 h'], [10, '3–10 h'], [25, '10–25 h'], [50, '25–50 h'], [100, '50–100 h'], [Infinity, '100 h +']];
const SEASON_EDGES = [[2, '1 season'], [4, '2–3 seasons'], [7, '4–6 seasons'], [Infinity, '7+ seasons']];
let actorIndex = new Map(); // "tv:123" -> [actor names], rebuilt on render
function favNamesFor(s) { return s.tmdb && s.tmdb.id ? actorIndex.get(`${s.tmdb.type}:${s.tmdb.id}`) || [] : []; }
const CATS = [
  { key: 'status', label: 'My status', get: (s) => s.status, order: STATUS_ORDER },
  { key: 'want', label: 'Want to watch?', get: (s) => s.want, order: WANT_ORDER, hideBlank: true },
  { key: 'recommend', label: 'Use to recommend similar', get: (s) => s.recommend, order: ['Top 50', 'Yes'], hideBlank: true },
  { key: 'actor', label: 'Favorite actors', get: favNamesFor, multi: true, hideBlank: true },
  { key: 'format', label: 'Format', get: (s) => s.format },
  { key: 'genre', label: 'Genre', get: (s) => s.genres, multi: true },
  { key: 'tag', label: 'Tags', get: (s) => s.tags, multi: true, top: 40 },
  { key: 'network', label: 'Network / platform', get: (s) => s.network, top: 30 },
  { key: 'country', label: 'Country', get: (s) => s.country.split(/\s*,\s*/), multi: true },
  { key: 'language', label: 'Language', get: (s) => s.languages, multi: true },
  { key: 'decade', label: 'Decade', get: (s) => (s.year ? `${Math.floor(s.year / 10) * 10}s` : ''), sortByValue: true },
  { key: 'showStatus', label: 'Show status', get: (s) => s.showStatus },
  { key: 'structure', label: 'Structure', get: (s) => s.structure },
  { key: 'length', label: 'Episode length', get: (s) => (isMovie(s) ? bucket(s.epLength, MOVIE_EDGES) : bucket(s.epLength, LEN_EDGES)),
    order: [...LEN_EDGES, ...MOVIE_EDGES].map((e) => e[1]) },
  { key: 'time', label: 'Total time to watch', get: (s) => bucket(totalHours(s), HOUR_EDGES), order: HOUR_EDGES.map((e) => e[1]) },
  { key: 'seasons', label: 'Seasons', get: (s) => (isMovie(s) ? '' : bucket(s.seasons, SEASON_EDGES)), order: SEASON_EDGES.map((e) => e[1]), hideBlank: true },
  { key: 'source', label: 'Source', get: (s) => s.sources, multi: true },
  { key: 'confidence', label: 'Research confidence', get: (s) => s.confidence, order: ['High', 'Medium', 'Low', 'Check'] },
];
const catByKey = Object.fromEntries(CATS.map((c) => [c.key, c]));
const BLANK = '(not set)';
function valuesOf(cat, s) {
  const v = cat.get(s);
  const list = (Array.isArray(v) ? v : [v]).filter((x) => x !== '' && x != null);
  return list.length ? list : [BLANK];
}
function counts(cat, shows) {
  const m = new Map();
  for (const s of shows) for (const v of valuesOf(cat, s)) m.set(v, (m.get(v) || 0) + 1);
  if (cat.hideBlank) m.delete(BLANK);
  const entries = [...m.entries()];
  const rank = (v) => { const i = (cat.order || []).indexOf(v); return i < 0 ? 999 : i; };
  entries.sort((a, b) => {
    if (a[0] === BLANK) return 1; if (b[0] === BLANK) return -1;
    if (cat.order) return rank(a[0]) - rank(b[0]) || b[1] - a[1];
    if (cat.sortByValue) return a[0].localeCompare(b[0]);
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  });
  return entries;
}

// ---------- Routing ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'browse', id: parts[1] ? decodeURIComponent(parts[1]) : null, params: new URLSearchParams(qs || '') };
}
function go(hash) { location.hash = hash; }
function listHash(filters, q, sort) {
  const p = new URLSearchParams();
  for (const f of filters) p.append(f.cat, f.value);
  if (q) p.set('q', q);
  if (sort && sort !== 'title') p.set('sort', sort);
  const s = p.toString();
  return `#/list${s ? `?${s}` : ''}`;
}
function filtersFrom(params) {
  const out = [];
  for (const [k, v] of params) if (catByKey[k]) out.push({ cat: k, value: v });
  return out;
}
const scrollPos = new Map();
let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  scrollPos.set(lastHash, window.scrollY);
  lastHash = location.hash;
  render();
  window.scrollTo(0, scrollPos.get(location.hash) || 0);
});

// ---------- Render ----------
function render() {
  actorIndex = new Map();
  for (const a of state.actors) for (const c of a.credits) {
    const k = `${c.type}:${c.id}`;
    if (!actorIndex.has(k)) actorIndex.set(k, []);
    if (!actorIndex.get(k).includes(a.name)) actorIndex.get(k).push(a.name);
  }
  const r = route();
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.name));
  const search = document.getElementById('search');
  if (document.activeElement !== search) search.value = r.name === 'list' ? r.params.get('q') || '' : '';
  const main = document.getElementById('main');
  const views = { browse: viewBrowse, list: viewList, show: viewShow, actor: viewActor, actors: viewActors, add: viewAdd, account: viewAccount, link: viewLink };
  main.replaceChildren((views[r.name] || viewBrowse)(r));
  if (r.name === 'account' && window.cloud && window.cloud.renderAccount) window.cloud.renderAccount();
}

function emptyState() {
  return el('div', { class: 'card empty' },
    el('h2', {}, 'No shows yet'),
    el('p', {}, 'Sign in to load your list from the cloud, or import a backup file (for the first time: data/seed.json from the repo).'),
    el('a', { class: 'btn primary', href: '#/account' }, 'Account & import'));
}

function viewBrowse() {
  if (!state.shows.length) return emptyState();
  const wrap = el('div', { class: 'browse' });
  wrap.append(el('p', { class: 'muted' }, `${state.shows.length} titles. Tap any value to see those shows; add more filters from there.`));
  for (const cat of CATS) {
    const entries = counts(cat, state.shows);
    if (!entries.length) {
      if (cat.key === 'actor') wrap.append(el('section', { class: 'cat card' }, el('h2', {}, cat.label),
        el('p', { class: 'muted small' }, 'Heart actors from a show\'s cast or an actor\'s page and they show up here.')));
      continue;
    }
    const shown = cat.top ? entries.slice(0, cat.top) : entries;
    const sec = el('section', { class: 'cat card' },
      el('h2', {}, cat.label),
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
function chipLink(cat, value, n, filters = []) {
  return el('a', { class: `chip ${cat === 'status' ? statusClass(value) : ''}`, href: listHash([...filters, { cat, value }]) },
    value, n != null ? el('span', { class: 'count' }, n) : null);
}
function statusClass(v) {
  if (/^watching/i.test(v)) return 'st-watching';
  if (/^want/i.test(v)) return 'st-want';
  if (/finished/i.test(v)) return 'st-finished';
  if (/recommended/i.test(v)) return 'st-rec';
  if (/paused|waiting|restart/i.test(v)) return 'st-paused';
  if (/dropped/i.test(v)) return 'st-dropped';
  return '';
}

// ---------- List ----------
const SORTS = {
  title: ['Title', (a, b) => norm(a.title).localeCompare(norm(b.title))],
  newest: ['Newest', (a, b) => (b.year || 0) - (a.year || 0)],
  oldest: ['Oldest', (a, b) => (a.year || 9999) - (b.year || 9999)],
  shortest: ['Least time', (a, b) => (totalHours(a) ?? 1e9) - (totalHours(b) ?? 1e9)],
  longest: ['Most time', (a, b) => (totalHours(b) ?? -1) - (totalHours(a) ?? -1)],
  eplen: ['Shortest episodes', (a, b) => (a.epLength ?? 1e9) - (b.epLength ?? 1e9)],
  seasons: ['Fewest seasons', (a, b) => (a.seasons ?? 1e9) - (b.seasons ?? 1e9)],
};
function applyFilters(shows, filters, q) {
  const byCat = new Map();
  for (const f of filters) { if (!byCat.has(f.cat)) byCat.set(f.cat, new Set()); byCat.get(f.cat).add(f.value); }
  const nq = norm(q);
  return shows.filter((s) => {
    for (const [ck, vals] of byCat) if (!valuesOf(catByKey[ck], s).some((v) => vals.has(v))) return false;
    if (nq && !norm(`${s.title} ${s.notes}`).includes(nq)) return false;
    return true;
  });
}
function viewList(r) {
  if (!state.shows.length) return emptyState();
  const filters = filtersFrom(r.params);
  const q = r.params.get('q') || '';
  const sort = SORTS[r.params.get('sort')] ? r.params.get('sort') : 'title';
  const results = applyFilters(state.shows, filters, q).sort(SORTS[sort][1]);
  const wrap = el('div', { class: 'list-view' });

  const bar = el('div', { class: 'filter-bar' });
  for (const f of filters) {
    const rest = filters.filter((x) => x !== f);
    bar.append(el('a', { class: `chip active ${f.cat === 'status' ? statusClass(f.value) : ''}`, href: listHash(rest, q, sort), title: 'Remove filter' },
      el('span', { class: 'chip-cat' }, `${catByKey[f.cat].label}:`), f.value, el('span', { class: 'x' }, '×')));
  }
  if (q) bar.append(el('a', { class: 'chip active', href: listHash(filters, '', sort) }, `“${q}”`, el('span', { class: 'x' }, '×')));
  const addBtn = el('button', { class: 'btn small', onclick: () => togglePicker() }, '+ Filter');
  bar.append(addBtn);
  if (filters.length || q) bar.append(el('a', { class: 'btn small ghost', href: '#/list' }, 'Clear'));
  const sel = el('select', { 'aria-label': 'Sort', onchange: () => go(listHash(filters, q, sel.value)) },
    Object.entries(SORTS).map(([k, [label]]) => el('option', { value: k, selected: k === sort }, label)));
  bar.append(el('span', { class: 'spacer' }), el('span', { class: 'muted' }, `${results.length} of ${state.shows.length}`), sel);
  wrap.append(bar);

  // Filter picker: every category with counts inside the current results.
  const picker = el('div', { class: 'picker card', hidden: true });
  function togglePicker() {
    picker.hidden = !picker.hidden;
    if (picker.hidden || picker.childElementCount) return;
    const catSel = el('select', { 'aria-label': 'Column' }, CATS.map((c) => el('option', { value: c.key }, c.label)));
    const chips = el('div', { class: 'chips' });
    const fill = () => {
      const cat = catByKey[catSel.value];
      const used = new Set(filters.filter((f) => f.cat === cat.key).map((f) => f.value));
      // Within the same column, values combine with OR, so count against results without that column's filters.
      const base = applyFilters(state.shows, filters.filter((f) => f.cat !== cat.key), q);
      chips.replaceChildren(...counts(cat, base).filter(([v]) => !used.has(v)).map(([v, n]) =>
        el('a', { class: 'chip', href: listHash([...filters, { cat: cat.key, value: v }], q, sort) }, v, el('span', { class: 'count' }, n))));
      if (!chips.childElementCount) chips.append(el('span', { class: 'muted small' }, 'Nothing to add here.'));
    };
    catSel.onchange = fill;
    picker.append(el('label', { class: 'inline' }, 'Filter by ', catSel), chips);
    fill();
  }
  wrap.append(picker);

  const list = el('div', { class: 'show-list' });
  const PAGE = 150;
  let shown = 0;
  const more = el('button', { class: 'btn', onclick: () => page() }, 'Show more');
  function page() {
    results.slice(shown, shown + PAGE).forEach((s) => list.append(showCard(s)));
    shown += PAGE;
    more.hidden = shown >= results.length;
  }
  page();
  wrap.append(list, more);
  if (!results.length) wrap.append(el('p', { class: 'muted' }, 'No shows match.'));
  return wrap;
}
function poster(path, size = 'w92', cls = 'poster') {
  return path ? el('img', { class: cls, src: `${IMG}${size}${path}`, alt: '', loading: 'lazy' }) : el('div', { class: `${cls} blank` });
}
function metaLine(s) {
  const bits = [years(s), s.format, s.network];
  if (!isMovie(s) && s.seasons) bits.push(`${s.seasons} season${s.seasons === 1 ? '' : 's'}`);
  if (s.epLength) bits.push(`${s.epLength} min`);
  const h = totalHours(s);
  if (h && !isMovie(s)) bits.push(`${fmtHours(h)} total`);
  return bits.filter(Boolean).join(' · ');
}
function showCard(s) {
  const favs = favNamesFor(s);
  return el('a', { class: 'show-card', href: `#/show/${encodeURIComponent(s.id)}` },
    poster(s.tmdb && s.tmdb.poster),
    el('div', { class: 'show-card-body' },
      el('div', { class: 'show-card-title' }, s.title, s.status ? el('span', { class: `pill ${statusClass(s.status)}` }, s.status) : null),
      el('div', { class: 'muted small' }, metaLine(s)),
      el('div', { class: 'small' }, [...s.genres, ...s.tags.slice(0, 4)].join(' · ')),
      favs.length ? el('div', { class: 'small fav-line' }, '♥ ', favs.join(', ')) : null));
}

// ---------- Show page ----------
const SELECTS = {
  status: () => uniq([...STATUS_ORDER, ...state.shows.map((s) => s.status)]),
  want: () => uniq(['', ...WANT_ORDER, ...state.shows.map((s) => s.want)]),
  recommend: () => uniq(['', 'Top 50', 'Yes', ...state.shows.map((s) => s.recommend)]),
};
function uniq(a) { return [...new Set(a.filter((x) => x != null))]; }
function viewShow(r) {
  const s = showById(r.id);
  if (!s) return el('p', { class: 'muted' }, 'Show not found. ', el('a', { href: '#/' }, 'Back to browse'));
  const wrap = el('div', { class: 'show-page' });
  const field = (key, label) => {
    const sel = el('select', { disabled: readOnly, onchange: () => { if (!canEdit()) return; s[key] = sel.value; save({ quiet: true }); toast('Saved'); } },
      SELECTS[key]().map((v) => el('option', { value: v, selected: v === s[key] }, v || '—')));
    return el('label', { class: 'field' }, label, sel);
  };
  const notes = el('textarea', { rows: 3, readOnly, placeholder: 'Notes' }, s.notes);
  notes.addEventListener('change', () => { if (!canEdit()) return; s.notes = notes.value; save({ quiet: true }); toast('Saved'); });

  const chips = (cat, list) => el('div', { class: 'chips' }, list.map((v) => chipLink(cat, v)));
  wrap.append(el('div', { class: 'show-head' },
    poster(s.tmdb && s.tmdb.poster, 'w342', 'poster big'),
    el('div', { class: 'show-head-body' },
      el('h1', {}, s.title),
      el('p', { class: 'muted' }, metaLine(s)),
      s.showStatus || s.structure || s.country ? el('p', { class: 'small' },
        [s.showStatus && `Show status: ${s.showStatus}`, s.structure, [s.country, s.languages.join(', ')].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')) : null,
      chips('genre', s.genres), chips('tag', s.tags),
      el('div', { class: 'fields' }, field('status', 'My status'), field('want', 'Want to watch?'), field('recommend', 'Use to recommend')),
      el('label', { class: 'field wide' }, 'Notes', notes),
      s.researchNotes ? el('p', { class: 'small muted' }, `Research notes: ${s.researchNotes}`) : null,
      s.sources.length ? el('p', { class: 'small muted' }, `Source: ${s.sources.join(', ')}`) : null,
      el('div', { class: 'btn-row edit-only' },
        el('button', { class: 'btn', onclick: () => openEdit(s) }, 'Edit details'),
        s.tmdb && s.tmdb.id ? el('button', { class: 'btn', onclick: () => fillFromTmdb(s) }, 'Fill blanks from TMDB') : null,
        el('button', { class: 'btn danger', onclick: () => deleteShow(s) }, 'Delete')))));
  wrap.append(castSection(s));
  return wrap;
}
function deleteShow(s) {
  if (!canEdit() || !confirm(`Delete “${s.title}” from your list?`)) return;
  const i = state.shows.indexOf(s);
  state.shows.splice(i, 1);
  save({ quiet: true });
  history.back();
  toast(`Deleted ${s.title}`, { label: 'Undo', run: () => { state.shows.splice(i, 0, s); save(); } });
}

const EDIT_FIELDS = [
  ['title', 'Title'], ['format', 'Format'], ['year', 'Release year', 'number'], ['endYear', 'End year', 'number'],
  ['seasons', 'Seasons', 'number'], ['episodes', 'Episodes', 'number'], ['epLength', 'Episode length (min)', 'number'],
  ['showStatus', 'Show status'], ['genres', 'Genres (comma-separated)', 'list'], ['structure', 'Structure'],
  ['country', 'Country'], ['languages', 'Languages (comma-separated)', 'list'], ['tags', 'Tags (comma-separated)', 'list'],
  ['network', 'Network / platform'], ['sources', 'Source (comma-separated)', 'list'], ['confidence', 'Research confidence'],
  ['researchNotes', 'Research notes'],
];
function openEdit(s) {
  if (!canEdit()) return;
  const dlg = el('dialog', { class: 'edit-dialog' });
  const form = el('form', { method: 'dialog', class: 'edit-form' },
    el('h2', {}, `Edit ${s.title}`),
    EDIT_FIELDS.map(([k, label, type]) => el('label', { class: 'field' }, label,
      el('input', { name: k, type: type === 'number' ? 'number' : 'text', value: type === 'list' ? s[k].join(', ') : s[k] ?? '',
        list: ['format', 'showStatus', 'structure', 'network', 'country', 'confidence'].includes(k) ? `dl-${k}` : null }))),
    ['format', 'showStatus', 'structure', 'network', 'country', 'confidence'].map((k) =>
      el('datalist', { id: `dl-${k}` }, uniq(state.shows.map((x) => x[k])).filter(Boolean).sort().map((v) => el('option', { value: v })))),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn primary', value: 'save' }, 'Save'),
      el('button', { class: 'btn', value: 'cancel', formnovalidate: true }, 'Cancel')));
  dlg.append(form);
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'save') {
      for (const [k, , type] of EDIT_FIELDS) {
        const v = form.elements[k].value.trim();
        s[k] = type === 'number' ? toNum(v) : type === 'list' ? v.split(',').map((x) => x.trim()).filter(Boolean) : v;
      }
      if (!s.title) s.title = 'Untitled';
      save();
      toast('Saved');
    }
    dlg.remove();
  });
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- TMDB ----------
// Responses are cached on this device (not synced) so pages open fast and work offline.
const memCache = new Map();
function cacheGet(key) {
  if (memCache.has(key)) return memCache.get(key);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const hit = all[key];
    if (hit && Date.now() - hit.t < 7 * 864e5) { memCache.set(key, hit.v); return hit.v; }
  } catch {}
  return undefined;
}
function cacheSet(key, v) {
  memCache.set(key, v);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[key] = { t: Date.now(), v };
    const keys = Object.keys(all);
    if (keys.length > 120) keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - 120).forEach((k) => delete all[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {}
}
async function tmdb(path, params = {}) {
  const qs = new URLSearchParams(params);
  let res;
  if (window.tmdbMock) return window.tmdbMock(path, params); // used by local tests
  if (cfg.tmdbDevToken && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    res = await fetch(`https://api.themoviedb.org/3${path}?${qs}`, { headers: { Authorization: `Bearer ${cfg.tmdbDevToken}` } });
  } else {
    const token = window.cloud && window.cloud.token && await window.cloud.token();
    if (!token) throw new Error('Sign in to look things up on TMDB.');
    qs.set('path', path);
    res = await fetch(`/.netlify/functions/tmdb?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!res.ok) throw new Error(`TMDB lookup failed (${res.status})`);
  return res.json();
}
async function cached(key, fn) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const v = await fn();
  cacheSet(key, v);
  return v;
}
function getCast(t) {
  return cached(`cast:${t.type}:${t.id}`, async () => {
    const d = await tmdb(t.type === 'tv' ? `/tv/${t.id}/aggregate_credits` : `/movie/${t.id}/credits`);
    return (d.cast || []).slice(0, 40).map((c) => ({
      id: c.id, name: c.name, profile: c.profile_path,
      character: c.character || (c.roles || []).map((x) => x.character).filter(Boolean).slice(0, 2).join(' / '),
      episodes: c.total_episode_count || null,
    }));
  });
}
const SKIP_GENRES = [10767, 10763]; // talk shows, news
function getPerson(pid) {
  return cached(`person:${pid}`, async () => {
    const [p, c] = await Promise.all([tmdb(`/person/${pid}`), tmdb(`/person/${pid}/combined_credits`)]);
    const seen = new Map();
    for (const x of c.cast || []) {
      const type = x.media_type;
      if (type !== 'tv' && type !== 'movie') continue;
      const k = `${type}:${x.id}`;
      const date = x.first_air_date || x.release_date || '';
      const item = seen.get(k) || {
        id: x.id, type, title: x.name || x.title, year: date ? Number(date.slice(0, 4)) : null, poster: x.poster_path,
        character: '', episodes: 0, popularity: x.popularity || 0,
        appearance: SKIP_GENRES.some((g) => (x.genre_ids || []).includes(g)) || /\b(self|himself|herself|themselves)\b/i.test(x.character || ''),
      };
      if (x.character && !item.character.includes(x.character)) item.character = [item.character, x.character].filter(Boolean).join(' / ');
      item.episodes += x.episode_count || 0;
      seen.set(k, item);
    }
    return { id: p.id, name: p.name, profile: p.profile_path, bio: p.biography || '', known: p.known_for_department || '',
      credits: [...seen.values()].sort((a, b) => (b.year || 0) - (a.year || 0)) };
  });
}

function castSection(s) {
  const sec = el('section', { class: 'card cast' }, el('h2', {}, 'Cast'));
  if (!s.tmdb || !s.tmdb.id) {
    sec.append(el('p', { class: 'muted small' }, s.tmdb && s.tmdb.none ? 'Marked as not on TMDB.' : 'Link this title to TMDB to see its cast.'));
    if (!readOnly) sec.append(tmdbPicker(s.title, isMovie(s) ? 'movie' : 'tv', s.year, (hit) => linkShow(s, hit)));
    return sec;
  }
  const grid = el('div', { class: 'cast-grid' }, el('p', { class: 'muted' }, 'Loading cast…'));
  sec.append(grid);
  getCast(s.tmdb).then((cast) => {
    grid.replaceChildren(...cast.map((c) => personTile(c, c.character + (c.episodes ? ` · ${c.episodes} ep` : ''))));
    if (!cast.length) grid.append(el('p', { class: 'muted' }, 'No cast listed on TMDB.'));
  }).catch((e) => grid.replaceChildren(el('p', { class: 'muted' }, e.message)));
  if (!readOnly) sec.append(el('button', { class: 'btn small ghost', onclick: () => { if (canEdit() && confirm('Unlink from TMDB?')) { s.tmdb = null; save(); } } }, 'Wrong show? Unlink from TMDB'));
  return sec;
}
function personTile(p, sub) {
  const fav = actorByTmdb(p.id);
  return el('div', { class: 'person' },
    el('a', { href: `#/actor/${p.id}` }, poster(p.profile, 'w185', 'face')),
    el('div', { class: 'person-body' },
      el('a', { href: `#/actor/${p.id}`, class: 'person-name' }, p.name),
      sub ? el('div', { class: 'muted small' }, sub) : null),
    heartBtn(p, fav));
}
function heartBtn(p, fav) {
  return el('button', { class: `heart ${fav ? 'on' : ''}`, title: fav ? 'Remove from favorites' : 'Add to favorites', 'aria-pressed': String(!!fav),
    disabled: readOnly, onclick: (e) => { e.preventDefault(); toggleFavorite(p); } }, fav ? '♥' : '♡');
}
async function toggleFavorite(p) {
  if (!canEdit()) return;
  const existing = actorByTmdb(p.id);
  if (existing) {
    if (!confirm(`Remove ${existing.name} from favorite actors?`)) return;
    state.actors = state.actors.filter((a) => a !== existing);
    save();
    return;
  }
  const a = normActor({ tmdbId: p.id, name: p.name, profile: p.profile });
  state.actors.push(a);
  save();
  toast(`♥ ${p.name}`);
  try { await refreshCredits(a); } catch (e) { toast(`Saved ${p.name}, but couldn't load their shows: ${e.message}`); }
}
async function refreshCredits(a) {
  const person = await getPerson(a.tmdbId);
  a.credits = person.credits.filter((c) => !c.appearance).map(({ id, type, title, year }) => ({ id, type, title, year }));
  a.creditsAt = today();
  if (person.profile) a.profile = person.profile;
  save();
}

// Search TMDB and pick a match. type: 'tv' | 'movie' | 'multi'
function tmdbPicker(initial, type, year, onPick) {
  const box = el('div', { class: 'tmdb-picker' });
  const input = el('input', { type: 'search', value: initial || '', placeholder: 'Search TMDB', 'aria-label': 'Search TMDB' });
  const typeSel = el('select', { 'aria-label': 'Type' },
    [['multi', 'TV + movies'], ['tv', 'TV'], ['movie', 'Movies']].map(([v, l]) => el('option', { value: v, selected: v === type }, l)));
  const results = el('div', { class: 'tmdb-results' });
  async function run() {
    results.replaceChildren(el('p', { class: 'muted' }, 'Searching…'));
    try {
      const hits = await searchTmdb(input.value, typeSel.value);
      results.replaceChildren(...hits.slice(0, 10).map((h) => el('button', { class: 'tmdb-hit', onclick: () => onPick(h) },
        poster(h.poster), el('div', {}, el('b', {}, h.title), ` ${h.year || ''} · ${h.type === 'tv' ? 'TV' : 'Movie'}`,
          el('div', { class: 'muted small clamp' }, h.overview)))));
      if (!hits.length) results.append(el('p', { class: 'muted' }, 'No results.'));
    } catch (e) { results.replaceChildren(el('p', { class: 'muted' }, e.message)); }
  }
  box.append(el('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); run(); } }, input, typeSel, el('button', { class: 'btn' }, 'Search')), results);
  return box;
}
async function searchTmdb(query, type) {
  const d = await tmdb(`/search/${type}`, { query, include_adult: 'false' });
  return (d.results || []).filter((x) => type !== 'multi' || x.media_type === 'tv' || x.media_type === 'movie').map((x) => {
    const t = type === 'multi' ? x.media_type : type;
    const date = x.first_air_date || x.release_date || '';
    return { id: x.id, type: t, title: x.name || x.title, original: x.original_name || x.original_title, year: date ? Number(date.slice(0, 4)) : null,
      poster: x.poster_path, overview: x.overview || '', popularity: x.popularity || 0 };
  });
}
function linkShow(s, hit) {
  if (!canEdit()) return;
  s.tmdb = { id: hit.id, type: hit.type, poster: hit.poster };
  save();
  toast(`Linked to ${hit.title} (${hit.year || '?'})`);
}

// Turn TMDB details into the sheet's columns.
const regionName = (() => {
  let dn; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
  const short = { US: 'US', GB: 'UK', CA: 'Canada', AU: 'Australia', NZ: 'NZ', KR: 'South Korea' };
  return (c) => short[c] || (dn ? dn.of(c) : c);
})();
const langName = (() => {
  let dn; try { dn = new Intl.DisplayNames(['en'], { type: 'language' }); } catch {}
  return (c) => (dn && c ? dn.of(c) : c || '');
})();
function splitGenres(gs) {
  const out = [];
  for (const g of gs || []) for (let part of g.name.split(' & ')) {
    if (part === 'Science Fiction') part = 'Sci-Fi';
    if (part === 'Politics') part = 'Political';
    if (!out.includes(part)) out.push(part);
  }
  return out;
}
async function detailsToShow(t) {
  const d = await tmdb(`/${t.type}/${t.id}`);
  if (t.type === 'tv') {
    const ended = /ended|canceled/i.test(d.status || '');
    return {
      title: d.name, format: d.type === 'Miniseries' ? 'Miniseries' : 'Series',
      year: d.first_air_date ? Number(d.first_air_date.slice(0, 4)) : null,
      endYear: ended && d.last_air_date ? Number(d.last_air_date.slice(0, 4)) : null,
      seasons: d.number_of_seasons || null, episodes: d.number_of_episodes || null,
      epLength: (d.episode_run_time && d.episode_run_time[0]) || (d.last_episode_to_air && d.last_episode_to_air.runtime) || null,
      showStatus: { 'Returning Series': 'Ongoing', Ended: 'Ended', Canceled: 'Canceled', 'In Production': 'In production', Planned: 'Upcoming' }[d.status] || d.status || '',
      genres: splitGenres(d.genres), network: (d.networks && d.networks[0] && d.networks[0].name) || '',
      country: d.origin_country && d.origin_country[0] ? regionName(d.origin_country[0]) : '',
      languages: d.original_language ? [langName(d.original_language)] : [],
      tmdb: { id: d.id, type: 'tv', poster: d.poster_path },
    };
  }
  return {
    title: d.title, format: 'Movie', year: d.release_date ? Number(d.release_date.slice(0, 4)) : null,
    epLength: d.runtime || null, genres: splitGenres(d.genres),
    network: (d.production_companies && d.production_companies[0] && d.production_companies[0].name) || '',
    country: d.origin_country && d.origin_country[0] ? regionName(d.origin_country[0]) : (d.production_countries && d.production_countries[0] ? regionName(d.production_countries[0].iso_3166_1) : ''),
    languages: d.original_language ? [langName(d.original_language)] : [],
    tmdb: { id: d.id, type: 'movie', poster: d.poster_path },
  };
}
async function fillFromTmdb(s) {
  if (!canEdit()) return;
  try {
    const d = await detailsToShow(s.tmdb);
    const filled = [];
    for (const [k, v] of Object.entries(d)) {
      if (k === 'title' || k === 'tmdb') continue;
      const empty = s[k] == null || s[k] === '' || (Array.isArray(s[k]) && !s[k].length);
      const has = v != null && v !== '' && !(Array.isArray(v) && !v.length);
      if (empty && has) { s[k] = v; filled.push(k); }
    }
    s.tmdb.poster = d.tmdb.poster;
    save();
    toast(filled.length ? `Filled: ${filled.join(', ')}` : 'Nothing blank to fill.');
  } catch (e) { toast(e.message); }
}
async function addFromTmdb(t, extra = {}) {
  if (!canEdit()) return null;
  const existing = state.shows.find((s) => s.tmdb && s.tmdb.id === t.id && s.tmdb.type === t.type);
  if (existing) { go(`#/show/${existing.id}`); return existing; }
  let d;
  try { d = await detailsToShow(t); } catch (e) { toast(e.message); return null; }
  const s = normShow({ ...d, status: 'Want to Watch', sources: [`Added in app (${today().slice(0, 7)})`], ...extra });
  state.shows.push(s);
  save({ quiet: true });
  return s;
}

// ---------- Actor page ----------
function viewActor(r) {
  const pid = Number(r.id);
  const fav = actorByTmdb(pid);
  const wrap = el('div', { class: 'actor-page' });
  const head = el('div', { class: 'show-head' }, poster(fav && fav.profile, 'w342', 'poster big'),
    el('div', { class: 'show-head-body' }, el('h1', {}, fav ? fav.name : 'Loading…')));
  wrap.append(head);
  const body = el('div', {}, el('p', { class: 'muted' }, 'Loading filmography…'));
  wrap.append(body);
  getPerson(pid).then((p) => {
    const a = actorByTmdb(pid);
    if (a && (!a.creditsAt || a.creditsAt < today())) {
      a.credits = p.credits.filter((c) => !c.appearance).map(({ id, type, title, year }) => ({ id, type, title, year }));
      a.creditsAt = today(); a.profile = p.profile || a.profile; save({ quiet: true });
    }
    const note = el('textarea', { rows: 2, placeholder: 'Why you like them', readOnly }, a ? a.note : '');
    note.addEventListener('change', () => { if (!canEdit()) return; const x = actorByTmdb(pid); if (x) { x.note = note.value; save({ quiet: true }); } });
    const countLine = el('p', { class: 'muted' });
    const updateCount = () => { countLine.textContent = `${p.known || 'Actor'} · ${p.credits.filter((c) => listShowFor(c)).length} on your list`; };
    updateCount();
    head.replaceChildren(poster(p.profile, 'w342', 'poster big'), el('div', { class: 'show-head-body' },
      el('div', { class: 'row' }, el('h1', {}, p.name), heartBtn({ id: p.id, name: p.name, profile: p.profile }, a)),
      countLine,
      a ? el('label', { class: 'field wide' }, 'Note', note) : null,
      p.bio ? el('details', {}, el('summary', {}, 'Biography'), el('p', { class: 'small' }, p.bio)) : null));

    let showAll = false;
    let onlyMissing = false;
    const listBox = el('div', { class: 'credit-list' });
    const controls = el('div', { class: 'row filter-bar' },
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', onchange: (e) => { onlyMissing = e.target.checked; fill(); } }), ' Only ones not on my list'),
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', onchange: (e) => { showAll = e.target.checked; fill(); } }), ' Include talk shows and appearances as themself'));
    function fill() {
      const items = p.credits.filter((c) => (showAll || !c.appearance) && (!onlyMissing || !listShowFor(c)));
      listBox.replaceChildren(...items.map(creditRow));
      if (!items.length) listBox.append(el('p', { class: 'muted' }, 'Nothing to show.'));
    }
    function creditRow(c) {
      const mine = listShowFor(c);
      const action = mine
        ? el('a', { class: `pill ${statusClass(mine.status)}`, href: `#/show/${mine.id}` }, mine.status || 'On list')
        : readOnly ? null : el('button', { class: 'btn small primary', onclick: async (e) => {
          e.target.disabled = true;
          const s = await addFromTmdb({ id: c.id, type: c.type }, { sources: [`Actor: ${p.name}`] });
          if (s) { toast(`Added ${s.title}`, { label: 'Open', run: () => go(`#/show/${s.id}`) }); fill(); updateCount(); } else e.target.disabled = false;
        } }, '+ Add');
      return el('div', { class: `credit ${mine ? 'mine' : ''}` }, poster(c.poster),
        el('div', { class: 'credit-body' },
          el('div', {}, el('b', {}, c.title), ` ${c.year || ''} · ${c.type === 'tv' ? 'TV' : 'Movie'}`),
          el('div', { class: 'muted small' }, [c.character, c.episodes ? `${c.episodes} ep` : ''].filter(Boolean).join(' · '))),
        action);
    }
    body.replaceChildren(el('h2', {}, 'Filmography'), controls, listBox);
    fill();
  }).catch((e) => body.replaceChildren(el('p', { class: 'muted' }, e.message)));
  return wrap;
}
function listShowFor(c) {
  return state.shows.find((s) => s.tmdb && s.tmdb.id === c.id && s.tmdb.type === c.type);
}

function viewActors() {
  const wrap = el('div', { class: 'actors-page' }, el('h1', {}, 'Favorite actors'));
  if (!state.actors.length) {
    wrap.append(el('p', { class: 'muted' }, 'None yet. Open a show, look at its cast, and tap ♡ on the actors you like. Shows need to be linked to TMDB first: ',
      el('a', { href: '#/link' }, 'link your list'), '.'));
    return wrap;
  }
  const actors = [...state.actors].sort((a, b) => a.name.localeCompare(b.name));
  wrap.append(el('div', { class: 'cast-grid' }, actors.map((a) => {
    const n = state.shows.filter((s) => favNamesFor(s).includes(a.name)).length;
    return el('div', { class: 'person' },
      el('a', { href: `#/actor/${a.tmdbId}` }, poster(a.profile, 'w185', 'face')),
      el('div', { class: 'person-body' }, el('a', { class: 'person-name', href: `#/actor/${a.tmdbId}` }, a.name),
        el('div', { class: 'small' }, n ? el('a', { href: listHash([{ cat: 'actor', value: a.name }]) }, `${n} on your list`) : el('span', { class: 'muted' }, 'none on your list')),
        a.note ? el('div', { class: 'muted small' }, a.note) : null));
  })));
  return wrap;
}

// ---------- Add ----------
function viewAdd() {
  const wrap = el('div', { class: 'add-page card' }, el('h1', {}, 'Add a show or movie'));
  if (readOnly) return wrap.append(el('p', { class: 'muted' }, 'View only.')), wrap;
  wrap.append(el('p', { class: 'muted small' }, 'Pick it from TMDB and the details fill in automatically.'),
    tmdbPicker('', 'multi', null, async (hit) => {
      const s = await addFromTmdb(hit);
      if (s) { toast(`Added ${s.title}`); go(`#/show/${s.id}`); }
    }));
  const title = el('input', { placeholder: 'Title', 'aria-label': 'Title' });
  wrap.append(el('h2', {}, 'Not on TMDB?'), el('form', { class: 'row', onsubmit: (e) => {
    e.preventDefault();
    if (!title.value.trim() || !canEdit()) return;
    const s = normShow({ title: title.value.trim(), status: 'Want to Watch', sources: [`Added in app (${today().slice(0, 7)})`], tmdb: { none: true } });
    state.shows.push(s);
    save({ quiet: true });
    go(`#/show/${s.id}`);
    openEdit(s);
  } }, title, el('button', { class: 'btn' }, 'Add by hand')));
  return wrap;
}

// ---------- Link the list to TMDB ----------
let linker = null; // { running, done, total, auto, review }
function loadReview() { try { return JSON.parse(localStorage.getItem(REVIEW_KEY) || '[]'); } catch { return []; } }
function saveReview(r) { try { localStorage.setItem(REVIEW_KEY, JSON.stringify(r)); } catch {} }
function scoreHit(s, h) {
  let score = 0;
  if (norm(h.title) === norm(s.title) || norm(h.original) === norm(s.title)) score += 2;
  if (s.year && h.year) score += Math.abs(s.year - h.year) <= 1 ? 2 : -2;
  return score;
}
async function matchOne(s) {
  const type = isMovie(s) ? 'movie' : 'tv';
  let hits = await searchTmdb(s.title, type);
  if (!hits.length) hits = await searchTmdb(s.title, 'multi');
  const ranked = hits.map((h) => ({ h, score: scoreHit(s, h) })).sort((a, b) => b.score - a.score || b.h.popularity - a.h.popularity);
  const best = ranked[0];
  const exactTitles = ranked.filter((x) => x.score >= 2);
  const confident = best && (best.score >= 4 || (best.score >= 2 && !s.year && exactTitles.length === 1));
  if (confident) return { link: best.h };
  return { review: { showId: s.id, candidates: ranked.slice(0, 6).map((x) => x.h) } };
}
async function runLinker(update) {
  const todo = state.shows.filter((s) => !s.tmdb);
  const review = loadReview().filter((r) => showById(r.showId) && !showById(r.showId).tmdb);
  const queued = new Set(review.map((r) => r.showId));
  const work = todo.filter((s) => !queued.has(s.id));
  linker = { running: true, done: 0, total: work.length, auto: 0, review };
  update();
  let i = 0;
  let sinceSave = 0;
  async function worker() {
    while (linker.running && i < work.length) {
      const s = work[i++];
      try {
        const r = await matchOne(s);
        if (r.link) { s.tmdb = { id: r.link.id, type: r.link.type, poster: r.link.poster }; linker.auto++; sinceSave++; }
        else linker.review.push(r.review);
      } catch (e) {
        linker.running = false;
        toast(e.message);
      }
      linker.done++;
      if (sinceSave >= 25) { sinceSave = 0; save({ quiet: true }); saveReview(linker.review); }
      update();
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  linker.running = false;
  save({ quiet: true });
  saveReview(linker.review);
  update();
}
function viewLink() {
  const wrap = el('div', { class: 'link-page' }, el('h1', {}, 'Link your list to TMDB'));
  if (readOnly) return wrap.append(el('p', { class: 'muted' }, 'View only.')), wrap;
  const status = el('div', { class: 'card' });
  const reviewBox = el('div', { class: 'review-list' });
  function update() {
    const linked = state.shows.filter((s) => s.tmdb && s.tmdb.id).length;
    const none = state.shows.filter((s) => s.tmdb && s.tmdb.none).length;
    const unlinked = state.shows.filter((s) => !s.tmdb);
    const queued = new Set((linker ? linker.review : loadReview()).map((r) => r.showId));
    const left = unlinked.filter((s) => !queued.has(s.id)).length;
    const waiting = unlinked.length - left;
    status.replaceChildren(
      el('p', {}, `${linked} linked · ${none} marked not on TMDB · ${waiting} waiting for you to pick · ${left} not checked yet`),
      el('p', { class: 'muted small' }, 'Matching searches TMDB for each title and links it when the title and year agree. Anything unsure waits below for you to pick.'),
      linker && linker.running
        ? el('div', {}, el('progress', { max: linker.total, value: linker.done }), el('p', { class: 'small' }, `${linker.done} of ${linker.total} checked, ${linker.auto} linked`),
          el('button', { class: 'btn', onclick: () => { linker.running = false; } }, 'Stop'))
        : el('button', { class: 'btn primary', disabled: !left, onclick: () => runLinker(update) }, left ? `Match ${left} titles` : waiting ? 'Everything else is checked' : 'Everything is linked'));
    if (!linker || !linker.running) renderReview();
  }
  // Picks wait here until "Save picks", so several shows can be linked in one go.
  const picks = new Map(); // showId -> { id, type, poster } or { none: true }
  const pickBar = el('div', { class: 'pick-bar' });
  function renderPickBar() {
    pickBar.hidden = !picks.size;
    pickBar.replaceChildren(
      el('span', {}, `${picks.size} picked`), el('span', { class: 'spacer' }),
      el('button', { class: 'btn small ghost', onclick: () => { picks.clear(); renderReview(); } }, 'Clear'),
      el('button', { class: 'btn small primary', onclick: savePicks }, `Save ${picks.size} ${picks.size === 1 ? 'pick' : 'picks'}`));
  }
  function savePicks() {
    if (!canEdit() || !picks.size) return;
    let n = 0;
    for (const [id, tmdb] of picks) { const s = showById(id); if (s && !s.tmdb) { s.tmdb = tmdb; n++; } }
    picks.clear();
    save({ quiet: true });
    toast(`Saved ${n} ${n === 1 ? 'title' : 'titles'}`);
    renderReview();
    update();
  }
  function togglePick(showId, tmdb, isSame) {
    if (picks.has(showId) && isSame(picks.get(showId))) picks.delete(showId);
    else picks.set(showId, tmdb);
    renderReview();
  }
  function renderReview() {
    const review = (linker ? linker.review : loadReview()).filter((r) => showById(r.showId) && !showById(r.showId).tmdb);
    saveReview(review);
    for (const id of picks.keys()) if (!review.some((r) => r.showId === id)) picks.delete(id);
    reviewBox.replaceChildren(review.length ? el('h2', {}, `Pick the right one (${review.length})`) : '');
    if (review.length) reviewBox.append(el('p', { class: 'muted small' }, 'Tap a result (or Not on TMDB) on as many cards as you like, then Save picks. Tap again to unpick.'));
    for (const r of review.slice(0, 40)) {
      const s = showById(r.showId);
      const pick = picks.get(s.id);
      const noneBtn = el('button', { class: `btn small${pick && pick.none ? ' picked' : ''}`, 'aria-pressed': String(!!(pick && pick.none)),
        onclick: () => togglePick(s.id, { none: true }, (p) => p.none) }, 'Not on TMDB');
      reviewBox.append(el('div', { class: `card review${pick ? ' has-pick' : ''}` },
        el('div', { class: 'row' }, el('b', {}, s.title), el('span', { class: 'muted' }, ` ${years(s)} · ${s.format} · ${s.network}`), el('span', { class: 'spacer' }),
          noneBtn,
          el('button', { class: 'btn small ghost', onclick: () => go(`#/show/${s.id}`) }, 'Search myself')),
        el('div', { class: 'tmdb-results' }, r.candidates.length ? r.candidates.map((h) => {
          const on = !!(pick && pick.id === h.id && pick.type === h.type);
          return el('button', { class: `tmdb-hit${on ? ' picked' : ''}`, 'aria-pressed': String(on),
            onclick: () => togglePick(s.id, { id: h.id, type: h.type, poster: h.poster }, (p) => p.id === h.id && p.type === h.type) },
            poster(h.poster), el('div', {}, el('b', {}, h.title), ` ${h.year || ''} · ${h.type === 'tv' ? 'TV' : 'Movie'}`, el('div', { class: 'muted small clamp' }, h.overview)));
        }) : el('p', { class: 'muted small' }, 'No results.'))));
    }
    if (review.length > 40) reviewBox.append(el('p', { class: 'muted' }, `${review.length - 40} more after these.`));
    renderPickBar();
  }
  wrap.append(status, reviewBox, pickBar);
  update();
  return wrap;
}

// ---------- Account, backup, export ----------
const EXPORT_COLS = [
  ['Title', (s) => s.title], ['My Status', (s) => s.status], ['Want to Watch?', (s) => s.want],
  ['Use to recommend similar shows', (s) => s.recommend], ['Source', (s) => s.sources.join(', ')], ['Notes', (s) => s.notes],
  ['Format', (s) => s.format], ['Release Year', (s) => s.year], ['End Year', (s) => s.endYear], ['Seasons', (s) => s.seasons],
  ['Episodes', (s) => s.episodes], ['Episode Length (min)', (s) => s.epLength], ['Total Hours', (s) => { const h = totalHours(s); return h == null ? '' : Math.round(h * 10) / 10; }],
  ['Show Status', (s) => s.showStatus], ['Genre', (s) => s.genres.join(', ')], ['Structure', (s) => s.structure],
  ['Country', (s) => s.country], ['Language', (s) => s.languages.join(', ')], ['Tags', (s) => s.tags.join(', ')],
  ['Original Network/Platform', (s) => s.network], ['Favorite Actors', (s) => favNamesFor(s).join(', ')],
  ['Confidence', (s) => s.confidence], ['Research Notes', (s) => s.researchNotes],
  ['TMDB', (s) => (s.tmdb && s.tmdb.id ? `https://www.themoviedb.org/${s.tmdb.type}/${s.tmdb.id}` : '')],
];
function exportRows() {
  render(); // make sure the favorite-actor index is current
  const safe = (v) => (v == null ? '' : typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
  return [EXPORT_COLS.map((c) => c[0]), ...[...state.shows].sort(SORTS.title[1]).map((s) => EXPORT_COLS.map(([, f]) => safe(f(s))))];
}
function toCsv(rows) {
  return rows.map((r) => r.map((v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',')).join('\n');
}
async function exportToSheet(btn) {
  if (!canEdit()) return;
  btn.disabled = true;
  try {
    const token = window.cloud && window.cloud.token && await window.cloud.token();
    if (!token) throw new Error('Sign in first.');
    const res = await fetch('/.netlify/functions/sheet-export', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: exportRows() }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || `Export failed (${res.status})`);
    toast(`Google Sheet updated: ${out.rows} rows`);
  } catch (e) { toast(e.message); }
  btn.disabled = false;
}
function importFile(file) {
  if (!canEdit()) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { return toast('That file is not valid JSON.'); }
    if (!Array.isArray(data.shows)) return toast('No shows in that file.');
    const msg = state.shows.length
      ? `Replace your ${state.shows.length} shows and ${state.actors.length} actors with the ${data.shows.length} shows in this file?`
      : `Import ${data.shows.length} shows?`;
    if (!confirm(msg)) return;
    state = normalizeState(data);
    save();
    toast(`Imported ${state.shows.length} shows`);
  };
  reader.readAsText(file);
}
function viewAccount() {
  const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; } });
  const sheetBtn = el('button', { class: 'btn primary', onclick: () => exportToSheet(sheetBtn) }, 'Update Google Sheet');
  const unlinked = state.shows.filter((s) => !s.tmdb).length;
  return el('div', { class: 'account-page' },
    el('section', { class: 'card' }, el('h2', {}, 'Account'), el('div', { id: 'account' })),
    el('section', { class: 'card edit-only' }, el('h2', {}, 'TMDB'),
      el('p', { class: 'small' }, `${state.shows.length - unlinked} of ${state.shows.length} titles linked to TMDB (needed for cast and favorite actors).`),
      el('a', { class: 'btn', href: '#/link' }, unlinked ? 'Link titles' : 'Review links')),
    el('section', { class: 'card' }, el('h2', {}, 'Export and backup'),
      el('div', { class: 'btn-row' },
        el('span', { class: 'edit-only' }, sheetBtn),
        el('button', { class: 'btn', onclick: () => download(`watch-list-${today()}.csv`, toCsv(exportRows()), 'text/csv') }, 'Download CSV'),
        el('button', { class: 'btn', onclick: () => download(`watch-list-backup-${today()}.json`, JSON.stringify(state, null, 1), 'application/json') }, 'Download backup'),
        el('button', { class: 'btn edit-only', onclick: () => file.click() }, 'Import backup…'), file),
      el('p', { class: 'muted small' }, 'Update Google Sheet overwrites the “Watch list (app)” tab with the current list. Edits made in the sheet don’t come back into the app.')),
    el('p', { class: 'muted small' }, `Version ${APP_VERSION}. Show data and images from TMDB; this app is not endorsed or certified by TMDB.`));
}

// ---------- Boot ----------
state = loadState();
document.getElementById('app-version').textContent = `v${APP_VERSION}`;
document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = route();
  const filters = r.name === 'list' ? filtersFrom(r.params) : [];
  go(listHash(filters, document.getElementById('search').value.trim(), r.name === 'list' ? r.params.get('sort') : ''));
});
let searchTimer;
document.getElementById('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const r = route();
    const filters = r.name === 'list' ? filtersFrom(r.params) : [];
    const h = listHash(filters, e.target.value.trim(), r.name === 'list' ? r.params.get('sort') : '');
    if (r.name === 'list') history.replaceState(null, '', h); else history.pushState(null, '', h);
    lastHash = location.hash;
    render();
  }, 250);
});
render();
