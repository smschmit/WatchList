// Tag Mode (#/tags/mode?tag=…): pick one tag, then go through shows that might fit it, best guesses first.
// Swipe right (→, Add) puts the tag on the show; left (←, No) skips it and remembers the "no" for that tag
// (state.tagNo), so it isn't asked again. Undo takes back the last answer.
//
// Candidates are shows without the tag, scored by: a TMDB keyword that matches the tag; tags that tend to go with
// it on the shows that already have it; genres those shows share; and favorite actors in common.
import { el, toast, uniq } from '../util.js';
import { state, readOnly, save, canEdit, showById } from '../state.js';
import { years } from '../shows.js';
import { favNamesFor } from '../categories.js';
import { route, listHash } from '../router.js';
import { tagKey, similarTags } from '../tagrules.js';
import { poster } from '../ui.js';
import { tagCounts } from './tags.js';

let session = null; // { tag, queue: [{ id, score, why }], i, history: [], added, skipped }
const noList = (tag) => (state.tagNo && state.tagNo[tagKey(tag)]) || [];

// Words in a TMDB keyword that match the tag ("time travel" matches Time Travel; "lawyer" matches Lawyers).
const loose = (w) => tagKey(w).split(' ').map((x) => (x.length > 3 ? x.replace(/ies$/, 'y').replace(/([^s])s$/, '$1') : x)).join(' ');
function keywordHit(s, tag) {
  const k = loose(tag);
  const kws = (s.sourced && s.sourced.keywords) || [];
  return kws.find((kw) => loose(kw) === k || (k.length >= 5 && loose(kw).includes(k))) || null;
}

export function candidatesFor(tag) {
  const key = tagKey(tag);
  const has = (s) => s.tags.some((t) => tagKey(t) === key);
  const tagged = state.shows.filter(has);
  const no = new Set(noList(tag));
  // How often each other tag, genre and favorite actor appears on the tagged shows, against how common it is overall.
  const overall = new Map(), withTag = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const s of state.shows) {
    const feats = [...s.tags.filter((t) => tagKey(t) !== key).map((t) => `t:${tagKey(t)}`), ...s.genres.map((g) => `g:${g}`), ...favNamesFor(s).map((a) => `a:${a}`)];
    for (const f of new Set(feats)) { bump(overall, f); if (has(s)) bump(withTag, f); }
  }
  const lift = (f) => {
    const w = withTag.get(f) || 0, o = overall.get(f) || 0;
    if (w < 2 || o < 3) return 0; // one shared show is coincidence, not a pattern
    return (w / o) * Math.min(1, w / 5); // share of shows with this feature that have the tag, damped while it rests on few shows
  };
  const label = (f) => f.slice(2);
  const out = [];
  for (const s of state.shows) {
    if (has(s) || no.has(s.id)) continue;
    let score = 0;
    const why = [];
    const kw = keywordHit(s, tag);
    if (kw) { score += 3; why.push(`TMDB keyword “${kw}”`); }
    const tagFeats = uniq(s.tags.map((t) => `t:${tagKey(t)}`)).map((f) => [f, lift(f)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const genreFeats = s.genres.map((g) => [`g:${g}`, lift(`g:${g}`)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const actorFeats = favNamesFor(s).map((a) => [`a:${a}`, lift(`a:${a}`)]).filter(([, v]) => v > 0);
    score += tagFeats.slice(0, 4).reduce((n, [, v]) => n + v * 2, 0) + genreFeats.slice(0, 3).reduce((n, [, v]) => n + v, 0) + actorFeats.reduce((n, [, v]) => n + v, 0);
    const realTags = (fs) => fs.slice(0, 3).map(([f]) => s.tags.find((t) => `t:${tagKey(t)}` === f) || label(f));
    if (tagFeats.length) why.push(`often goes with ${realTags(tagFeats).join(', ')}`);
    if (genreFeats.length && genreFeats[0][1] >= 0.15) why.push(`${genreFeats.slice(0, 2).map(([f]) => label(f)).join(' / ')} like others with it`);
    if (actorFeats.length) why.push(`♥ ${actorFeats.map(([f]) => label(f)).join(', ')}`);
    if (score >= 0.15) out.push({ id: s.id, score, why });
  }
  return { tagged: tagged.length, list: out.sort((a, b) => b.score - a.score) };
}

function startSession(tag) {
  const { list, tagged } = candidatesFor(tag);
  session = { tag, queue: list, tagged, i: 0, history: [], added: 0, skipped: 0 };
}
function answer(yes) {
  const c = session && session.queue[session.i];
  const s = c && showById(c.id);
  if (!s || !canEdit()) return;
  if (!state.tagNo || typeof state.tagNo !== 'object') state.tagNo = {};
  const key = tagKey(session.tag);
  if (yes) { s.tags = uniq([...s.tags, session.tag]); session.added++; }
  else { state.tagNo[key] = uniq([...(state.tagNo[key] || []), s.id]); session.skipped++; }
  session.history.push({ id: s.id, yes });
  session.i++;
  save({ quiet: true });
  rerender();
}
function undo() {
  const h = session && session.history.pop();
  if (!h) return;
  const s = showById(h.id);
  const key = tagKey(session.tag);
  if (s && h.yes) { s.tags = s.tags.filter((t) => t !== session.tag); session.added--; }
  if (!h.yes && state.tagNo && state.tagNo[key]) { state.tagNo[key] = state.tagNo[key].filter((x) => x !== h.id); if (!state.tagNo[key].length) delete state.tagNo[key]; session.skipped--; }
  session.i = Math.max(0, session.i - 1);
  save({ quiet: true });
  rerender();
}
let rerender = () => {};

document.addEventListener('keydown', (e) => {
  const r = route();
  if (r.name !== 'tags' || r.id !== 'mode' || !session || readOnly) return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); answer(true); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); answer(false); }
  else if ((e.key === 'z' && (e.metaKey || e.ctrlKey)) || e.key === 'u') { e.preventDefault(); undo(); }
});
function swipeable(card) {
  let x0 = null, y0 = null, dx = 0, id = null;
  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, select, a, label')) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; id = e.pointerId;
  });
  card.addEventListener('pointermove', (e) => {
    if (x0 == null || e.pointerId !== id) return;
    dx = e.clientX - x0;
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(e.clientY - y0)) return;
    card.setPointerCapture(id);
    card.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    card.classList.toggle('going-right', dx > 80);
    card.classList.toggle('going-left', dx < -80);
  });
  card.addEventListener('pointerup', () => {
    if (x0 == null) return;
    x0 = null;
    card.style.transform = '';
    card.classList.remove('going-right', 'going-left');
    if (dx > 80) answer(true); else if (dx < -80) answer(false);
  });
  card.addEventListener('pointercancel', () => { x0 = null; card.style.transform = ''; });
}

export function viewTagMode(r) {
  const wrap = el('div', { class: 'tagmode-page' }, el('h1', {}, 'Tag Mode'));
  if (readOnly) return wrap.append(el('p', { class: 'muted' }, 'View only.')), wrap;
  const tag = (r.params.get('tag') || '').trim();
  const body = el('div');
  rerender = () => { if (body.isConnected) body.replaceChildren(...draw()); };
  wrap.append(el('p', { class: 'muted small' }, 'Pick a tag, then go through shows that might fit it. Right (→) adds the tag, left (←) is no and won’t be asked again. ',
    el('a', { href: '#/tags/deck' }, 'Tag Deck'), ' · ', el('a', { href: '#/tags' }, 'Tag cleanup')), pickTag(tag), body);
  if (!tag) return wrap;
  if (!session || session.tag !== tag) startSession(tag);
  body.replaceChildren(...draw());
  return wrap;
}

function pickTag(current) {
  const counts = [...tagCounts()].sort((a, b) => b[1] - a[1]);
  const input = el('input', { list: 'tagmode-tags', placeholder: 'Tag (pick or type)', 'aria-label': 'Tag', value: current, autocomplete: 'off' });
  const go = () => {
    const v = input.value.trim();
    if (!v) return;
    const exact = counts.find(([t]) => tagKey(t) === tagKey(v));
    if (!exact) {
      const near = similarTags(v, new Map(counts), 1)[0];
      if (near && confirm(`Did you mean “${near}”? (Cancel to start a new tag “${v}”)`)) input.value = near;
    } else input.value = exact[0];
    session = null;
    location.hash = `#/tags/mode?${new URLSearchParams({ tag: input.value.trim() })}`;
  };
  return el('form', { class: 'row card', onsubmit: (e) => { e.preventDefault(); go(); } },
    el('label', { class: 'inline' }, 'Tag ', input), el('button', { class: 'btn primary' }, current ? 'Switch' : 'Start'),
    el('datalist', { id: 'tagmode-tags' }, counts.map(([t, n]) => el('option', { value: t, label: `${n} shows` }))),
    current ? el('a', { class: 'btn small ghost', href: listHash([{ cat: 'tag', value: current }]) }, `Shows with ${current}`) : null);
}

function draw() {
  const { tag, queue, i } = session;
  const head = el('p', { class: 'small' }, `${session.tagged} show${session.tagged === 1 ? '' : 's'} have ${tag}. `,
    `${Math.max(0, queue.length - i)} to go`, session.added || session.skipped ? ` · ${session.added} added, ${session.skipped} no` : '', '. ',
    session.history.length ? el('button', { class: 'btn small ghost', onclick: undo }, 'Undo') : null,
    noList(tag).length ? el('button', { class: 'btn small ghost', title: 'Ask again about shows you said no to', onclick: () => {
      if (!confirm(`Forget the ${noList(tag).length} “no” answers for ${tag}?`)) return;
      delete state.tagNo[tagKey(tag)]; save({ quiet: true }); startSession(tag); rerender();
    } }, `Forget ${noList(tag).length} no`) : null);
  const c = queue[i];
  const s = c && showById(c.id);
  if (!s) {
    return [head, el('div', { class: 'card' }, el('h2', {}, queue.length ? 'That’s all of them' : 'No likely shows found'),
      el('p', { class: 'small' }, queue.length ? `Added ${tag} to ${session.added} show${session.added === 1 ? '' : 's'}.`
        : session.tagged ? 'Nothing else looks like the shows that have this tag. Tag a few more by hand and try again.'
          : 'Tag Mode finds shows like the ones that already have a tag. Add it to a few shows first (Edit details or the Tag Deck), or pick a tag TMDB keywords use.'),
      el('div', { class: 'btn-row' }, el('button', { class: 'btn', onclick: () => { startSession(tag); rerender(); } }, 'Start again')))];
  }
  const card = el('div', { class: 'card deck-card tagmode-card' },
    el('div', { class: 'show-head' }, poster(s.tmdb && s.tmdb.poster, 'w185', 'poster'),
      el('div', { class: 'show-head-body' },
        el('h2', {}, el('a', { href: `#/show/${encodeURIComponent(s.id)}` }, s.title)),
        el('p', { class: 'muted small' }, [years(s), s.format, s.genres.join(', ')].filter(Boolean).join(' · ')),
        s.tags.length ? el('div', { class: 'chips' }, s.tags.map((t) => el('span', { class: 'chip' }, t))) : el('p', { class: 'muted small' }, 'No tags yet.'),
        c.why.length ? el('p', { class: 'small why' }, 'Why: ', c.why.join('; ')) : null)),
    el('p', { class: 'tagmode-q' }, `${tag}?`),
    el('div', { class: 'btn-row deck-actions' },
      el('button', { class: 'btn', onclick: () => answer(false) }, '← No'),
      el('button', { class: 'btn primary', onclick: () => answer(true) }, `Add ${tag} →`)));
  swipeable(card);
  return [head, card];
}
