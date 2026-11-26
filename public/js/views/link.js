// Link the list to TMDB.
import { el, toast, norm } from '../util.js';
import { state, readOnly, save, canEdit, showById, bulk } from '../state.js';
import { isMovie, years } from '../shows.js';
import { go } from '../router.js';
import { searchTmdb } from '../tmdb.js';
import { tmdbHit } from '../ui.js';

export const REVIEW_KEY = 'watchlist:review';

// ---------- Link the list to TMDB ----------
export let linker = null; // { running, done, total, auto, review }
// Link-page picks wait here until "Save picks", so several shows can be linked in one go.
// Kept outside the view so they survive opening a title's Details and coming back.
export const picks = new Map(); // showId -> { id, type, poster } or { none: true }
export function loadReview() { try { return JSON.parse(localStorage.getItem(REVIEW_KEY) || '[]'); } catch { return []; } }
export function saveReview(r) { try { localStorage.setItem(REVIEW_KEY, JSON.stringify(r)); } catch {} }
export function scoreHit(s, h) {
  let score = 0;
  if (norm(h.title) === norm(s.title) || norm(h.original) === norm(s.title)) score += 2;
  if (s.year && h.year) score += Math.abs(s.year - h.year) <= 1 ? 2 : -2;
  return score;
}
export async function matchOne(s) {
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
export const runLinker = (update) => bulk(() => linkAll(update));
async function linkAll(update) {
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
export function viewLink() {
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
          return tmdbHit(h, { picked: on, onclick: () => togglePick(s.id, { id: h.id, type: h.type, poster: h.poster }, (p) => p.id === h.id && p.type === h.type) });
        }) : el('p', { class: 'muted small' }, 'No results.'))));
    }
    if (review.length > 40) reviewBox.append(el('p', { class: 'muted' }, `${review.length - 40} more after these.`));
    renderPickBar();
  }
  wrap.append(status, reviewBox, pickBar);
  update();
  return wrap;
}
