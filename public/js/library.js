// Changes to the list that come from TMDB: linking, filling in, adding titles, favorite actors.
import { toast, today, norm } from './util.js';
import { state, normShow, normActor, save, canEdit, actorByTmdb } from './state.js';
import { isMovie } from './shows.js';
import { statusNames } from './categories.js';
import { go } from './router.js';
import { tmdb, getPerson, detailsToShow } from './tmdb.js';
import { applyFacts, factsFromDetails } from './facts.js';

export async function toggleFavorite(p) {
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
export async function refreshCredits(a) {
  const person = await getPerson(a.tmdbId);
  a.credits = person.credits.filter((c) => !c.appearance).map(({ id, type, title, year }) => ({ id, type, title, year }));
  a.creditsAt = today();
  if (person.profile) a.profile = person.profile;
  save();
}

export function linkShow(s, hit) {
  if (!canEdit()) return;
  s.tmdb = { id: hit.id, type: hit.type, poster: hit.poster };
  save();
  toast(`Linked to ${hit.title} (${hit.year || '?'})`);
}

export async function fillFromTmdb(s) {
  if (!canEdit()) return;
  try {
    const d = await detailsToShow(s.tmdb);
    const filled = [];
    for (const [k, v] of Object.entries(d)) {
      if (k === 'title' || k === 'tmdb' || k === 'facts') continue;
      const empty = s[k] == null || s[k] === '' || (Array.isArray(s[k]) && !s[k].length);
      const has = v != null && v !== '' && !(Array.isArray(v) && !v.length);
      if (empty && has) { s[k] = v; filled.push(k); }
    }
    s.tmdb.poster = d.tmdb.poster;
    if (d.facts) applyFacts(s, d.facts);
    save();
    toast(filled.length ? `Filled: ${filled.join(', ')}` : 'Nothing blank to fill.');
  } catch (e) { toast(e.message); }
}
// A show on the list that isn't linked to TMDB yet but looks like this TMDB title (same title, year within 1).
// Linked shows are matched by TMDB id instead (listShowFor), so a remake linked to a different id isn't flagged.
export function possibleMatch(h) {
  const titles = [norm(h.title), norm(h.original)].filter(Boolean);
  return state.shows.find((s) => {
    if (s.tmdb && s.tmdb.id) return false;
    if (!titles.includes(norm(s.title))) return false;
    if (s.format && isMovie(s) !== (h.type === 'movie')) return false;
    return !s.year || !h.year || Math.abs(s.year - h.year) <= 1;
  }) || null;
}
// Link a show already on the list to a TMDB title and fill in its blank columns.
export async function linkAndFill(s, hit) {
  if (!canEdit()) return;
  linkShow(s, hit);
  await fillFromTmdb(s);
}
// Status for titles added from TMDB: Want to Watch (you chose to add it), or Identified if that status was removed.
export const newShowStatus = () => (statusNames().includes('Want to Watch') ? 'Want to Watch' : 'Identified');
export function removeShow(s) {
  const i = state.shows.indexOf(s);
  if (i < 0) return;
  state.shows.splice(i, 1);
  save({ quiet: true });
}

export async function addFromTmdb(t, extra = {}) {
  if (!canEdit()) return null;
  const existing = state.shows.find((s) => s.tmdb && s.tmdb.id === t.id && s.tmdb.type === t.type);
  if (existing) { go(`#/show/${existing.id}`); return existing; }
  let d;
  try { d = await detailsToShow(t); } catch (e) { toast(e.message); return null; }
  const s = normShow({ ...d, status: newShowStatus(), sources: [`Added in app (${today().slice(0, 7)})`], ...extra });
  state.shows.push(s);
  save({ quiet: true });
  return s;
}

// Ask TMDB about a linked TV show now (skipping the cache) and store the facts. Returns what changed since the last check.
// The caller saves.
export async function checkFacts(s) {
  const d = await tmdb(`/tv/${s.tmdb.id}`);
  return applyFacts(s, factsFromDetails(d));
}
