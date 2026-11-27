// Suggestions (#/suggestions): titles you might like, kept apart from your list until you add one.
// Candidates come from TMDB only: its recommendations for the titles you rate highest (Top 50, Use to recommend,
// 4–5 stars) and your favorite actors' credits. Anything on your list or marked Not interested is left out
// (state.suggestNo, remembered). Ranked by simple overlap: how many of your favorites lead to it, and how strongly.
import { el, toast, today } from '../util.js';
import { state, readOnly, save, canEdit, listShowFor } from '../state.js';
import { statusNames } from '../categories.js';
import { cached, genreNames, tmdb } from '../tmdb.js';
import { addFromTmdb, addAsFinished, removeShow } from '../library.js';
import { poster, titleHash, favLine } from '../ui.js';

const MAX_SEEDS = 40;
let run = null; // { running, done, total, results } kept while the app is open

// How much a title on your list says about your taste: Top 50 most, then stars and Use to recommend.
// Dropped or 1–2 stars count against what TMDB recommends from them.
export function seedWeight(s) {
  if (s.status === 'Dropped' || (s.rating && s.rating <= 2)) return -1;
  let w = 0;
  if (s.recommend === 'Top 50') w = 3;
  else if (s.rating === 5) w = 2.5;
  else if (s.recommend === 'Yes' || s.rating === 4) w = 1.5;
  return w;
}
export function seeds() {
  const linked = state.shows.filter((s) => s.tmdb && s.tmdb.id && (s.tmdb.type === 'tv' || s.tmdb.type === 'movie'));
  const pos = linked.filter((s) => seedWeight(s) > 0).sort((a, b) => seedWeight(b) - seedWeight(a)).slice(0, MAX_SEEDS);
  const neg = linked.filter((s) => seedWeight(s) < 0).slice(0, 10);
  return [...pos, ...neg];
}
const keyOf = (t) => `${t.type}:${t.id}`;
const dismissed = () => (state.suggestNo && typeof state.suggestNo === 'object' ? state.suggestNo : {});

// TMDB's recommendations for one title, slimmed and cached for two weeks.
function recsFor(t) {
  return cached(`recs:${t.type}:${t.id}`, async () => {
    const d = await tmdb(`/${t.type}/${t.id}/recommendations`);
    return (d.results || []).slice(0, 15).map((x) => {
      const date = x.first_air_date || x.release_date || '';
      return { id: x.id, type: x.media_type || t.type, title: x.name || x.title, year: date ? Number(date.slice(0, 4)) : null,
        poster: x.poster_path, overview: (x.overview || '').slice(0, 200), vote: x.vote_average || 0, votes: x.vote_count || 0, genres: genreNames(x.genre_ids) };
    });
  }, 14 * 864e5);
}

export function rank(recLists, actors = state.actors) {
  const no = dismissed();
  const cand = new Map();
  const get = (x) => {
    const k = keyOf(x);
    if (!cand.has(k)) cand.set(k, { ...x, score: 0, because: [], against: [], actors: [] });
    return cand.get(k);
  };
  for (const { seed, recs } of recLists) {
    const w = seedWeight(seed);
    for (const x of recs) {
      if (x.type !== 'tv' && x.type !== 'movie') continue;
      const c = get(x);
      c.score += w;
      if (w > 0) c.because.push(seed.title); else c.against.push(seed.title);
      if (!c.overview && x.overview) Object.assign(c, x, { score: c.score, because: c.because, against: c.against, actors: c.actors });
    }
  }
  // Favorite actors: a small boost per actor, so a title two of them are in rises.
  for (const a of actors) for (const cr of a.credits || []) {
    const k = keyOf(cr);
    const c = cand.get(k);
    if (c) { c.score += 0.75; if (!c.actors.includes(a.name)) c.actors.push(a.name); }
  }
  return [...cand.values()]
    .filter((c) => c.score > 0 && c.because.length && !no[keyOf(c)] && !listShowFor(c))
    // Well-liked and widely seen titles break ties.
    .map((c) => ({ ...c, rankScore: c.score + (c.votes >= 50 ? (c.vote - 6) * 0.2 : -0.3) }))
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 150);
}

async function findSuggestions(onProgress) {
  const list = seeds();
  run = { running: true, done: 0, total: list.length, results: run ? run.results : null, error: '' };
  onProgress();
  const recLists = [];
  let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (run.running && i < list.length) {
      const s = list[i++];
      try { recLists.push({ seed: s, recs: await recsFor(s.tmdb) }); } catch (e) { if (!/\(404\)/.test(e.message)) { run.running = false; run.error = e.message; } }
      run.done++;
      onProgress();
    }
  }));
  run.running = false;
  run.recLists = recLists;
  run.results = rank(recLists);
  run.at = today();
  onProgress();
}

// A plain-text summary of your taste to paste into Claude (or anything else) for ideas, instead of a built-in AI.
export function tasteProfile() {
  const line = (s) => `- ${s.title}${s.year ? ` (${s.year})` : ''}${s.rating ? ` ${'★'.repeat(s.rating)}` : ''}${s.genres.length ? ` [${s.genres.join(', ')}]` : ''}`;
  const top = state.shows.filter((s) => s.recommend === 'Top 50');
  const loved = state.shows.filter((s) => s.recommend !== 'Top 50' && s.rating >= 4);
  const dropped = state.shows.filter((s) => s.status === 'Dropped' || (s.rating && s.rating <= 2));
  const want = state.shows.filter((s) => s.status === 'Want to Watch').slice(0, 60);
  const parts = [
    'Here is my TV and movie taste. Suggest 15 titles I have not listed, with one line each on why they fit.',
    '', `Top 50 / favorites (${top.length}):`, ...top.map(line),
    '', `Also rated highly (${loved.length}):`, ...loved.map(line),
    '', `Didn't like or dropped (${dropped.length}):`, ...dropped.map(line),
    '', `Already on my want-to-watch list (don't suggest these):`, ...want.map((s) => `- ${s.title}`),
  ];
  if (state.actors.length) parts.push('', `Favorite actors: ${state.actors.map((a) => a.name).join(', ')}`);
  return parts.join('\n');
}

export function viewSuggestions() {
  const wrap = el('div', { class: 'suggestions-page' }, el('h1', {}, 'Suggestions'));
  if (readOnly) return wrap.append(el('p', { class: 'muted' }, 'View only.')), wrap;
  const status = el('div', { class: 'card check-status' });
  const listBox = el('div', { class: 'credit-list' });
  let shown = 30;
  const onProgress = () => { if (wrap.isConnected) { drawStatus(); if (!run.running) drawList(); } };
  function drawStatus() {
    const n = seeds().filter((s) => seedWeight(s) > 0).length;
    status.replaceChildren(...[
      el('p', { class: 'small' }, `Looks at what TMDB recommends for the ${n} title${n === 1 ? '' : 's'} you rate highest (Top 50, Use to recommend, 4–5 stars) and at your favorite actors’ credits. `,
        'Nothing is added to your list unless you tap Add. Not interested is remembered.'),
      n ? null : el('p', { class: 'small' }, 'Mark some titles as Top 50 or give them 4–5 stars first.'),
      run && run.running
        ? el('div', {}, el('progress', { max: run.total, value: run.done }), el('p', { class: 'small' }, `${run.done} of ${run.total} looked at`),
          el('button', { class: 'btn', onclick: () => { run.running = false; } }, 'Stop'))
        : el('div', { class: 'row' },
          el('button', { class: 'btn primary', disabled: !n, onclick: () => findSuggestions(onProgress) }, run && run.results ? 'Look again' : 'Find suggestions'),
          el('button', { class: 'btn', title: 'Copy a summary of your taste to paste into Claude for more ideas', onclick: async () => {
            try { await navigator.clipboard.writeText(tasteProfile()); toast('Copied. Paste it into Claude to ask for ideas.'); } catch { toast('Could not copy on this device.'); }
          } }, 'Copy taste profile'),
          Object.keys(dismissed()).length ? el('button', { class: 'btn small ghost', onclick: () => {
            if (!confirm(`Forget ${Object.keys(dismissed()).length} “Not interested” answers?`)) return;
            state.suggestNo = {}; save({ quiet: true }); if (run && run.recLists) run.results = rank(run.recLists); drawStatus(); drawList();
          } }, `Forget ${Object.keys(dismissed()).length} not interested`) : null),
      run && run.error ? el('p', { class: 'small error' }, run.error) : null,
    ].filter(Boolean));
  }
  function drawList() {
    const items = run && run.results ? run.results.filter((c) => !dismissed()[keyOf(c)] && !listShowFor(c)) : [];
    listBox.replaceChildren(...items.slice(0, shown).map(card));
    if (run && run.results && !items.length) listBox.append(el('p', { class: 'muted' }, 'No suggestions left. Rate more titles, or forget some “not interested” answers.'));
    if (items.length > shown) listBox.append(el('button', { class: 'btn small', onclick: () => { shown += 30; drawList(); } }, `Show more (${items.length - shown})`));
  }
  function card(c) {
    const t = { id: c.id, type: c.type };
    const href = titleHash(t, 'Suggestion');
    const add = (fn, extra) => async (e) => {
      e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const s = await fn(t, { sources: [`Suggestion (${today().slice(0, 7)})`], ...extra });
      if (s) { toast(`Added ${s.title} as ${s.status}`, { label: 'Undo', run: () => { removeShow(s); drawList(); } }); drawList(); }
    };
    const want = statusNames().includes('Want to Watch') ? { status: 'Want to Watch' } : {};
    const why = [c.because.length ? `Because you liked ${c.because.slice(0, 3).join(', ')}${c.because.length > 3 ? ` and ${c.because.length - 3} more` : ''}` : '',
      c.against.length ? `(but also recommended for ${c.against.slice(0, 2).join(', ')}, which you didn’t like)` : ''].filter(Boolean).join(' ');
    return el('div', { class: 'credit suggestion' },
      el('a', { href, 'aria-hidden': 'true', tabindex: '-1' }, poster(c.poster)),
      el('div', { class: 'credit-body' },
        el('div', {}, el('a', { class: 'credit-title', href }, el('b', {}, c.title)), ` ${c.year || ''} · ${c.type === 'tv' ? 'TV' : 'Movie'}`,
          c.votes >= 50 ? el('span', { class: 'muted small' }, ` · ★ ${c.vote.toFixed(1)}`) : null),
        c.genres && c.genres.length ? el('div', { class: 'muted small' }, c.genres.join(' · ')) : null,
        el('div', { class: 'small' }, why),
        favLine(t),
        c.overview ? el('div', { class: 'muted small clamp' }, c.overview) : null,
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn small primary', onclick: add(addFromTmdb, want) }, '+ Add'),
          el('button', { class: 'btn small', onclick: add(addAsFinished, {}) }, '✓ Seen it'),
          el('button', { class: 'btn small ghost', onclick: () => {
            if (!canEdit()) return;
            if (!state.suggestNo || typeof state.suggestNo !== 'object') state.suggestNo = {};
            state.suggestNo[keyOf(c)] = today();
            save({ quiet: true });
            drawList();
            toast(`Not interested in ${c.title}`, { label: 'Undo', run: () => { delete state.suggestNo[keyOf(c)]; save({ quiet: true }); drawList(); } });
          } }, 'Not interested'))));
  }
  wrap.append(status, listBox);
  drawStatus();
  drawList();
  return wrap;
}
