// Changes to the list that come from TMDB: linking, filling in, adding titles, favorite actors.
import { toast, today, norm } from './util.js';
import { state, normShow, normActor, save, canEdit, actorByTmdb } from './state.js';
import { isMovie } from './shows.js';
import { statusNames, spoilerStatusNames } from './categories.js';
import { go } from './router.js';
import { tmdb, getPerson, detailsToShow } from './tmdb.js';
import { applyFacts, factsFromDetails } from './facts.js';

// Hearting flips every heart for that person on screen straight away; the save and the page redraw wait until
// after the browser has painted, and an add redraws once (when the actor's shows are in), not twice.
export async function toggleFavorite(p) {
  if (!canEdit()) return;
  const existing = actorByTmdb(p.id);
  if (existing) {
    if (!confirm(`Remove ${existing.name} from favorite actors?`)) return;
    state.actors = state.actors.filter((a) => a !== existing);
    syncHearts(p.id, false);
    afterPaint(() => save());
    return;
  }
  const a = normActor({ tmdbId: p.id, name: p.name, profile: p.profile });
  state.actors.push(a);
  syncHearts(p.id, true);
  toast(`♥ ${p.name}`);
  afterPaint(() => save({ quiet: true }));
  try { await refreshCredits(a, { quiet: true }); } catch (e) { toast(`Saved ${p.name}, but couldn't load their shows: ${e.message}`); }
  afterPaint(() => save());
}
const afterPaint = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
function syncHearts(id, on) {
  document.querySelectorAll(`button.heart[data-person="${id}"]`).forEach((b) => {
    b.classList.toggle('on', on);
    b.textContent = on ? '♥' : '♡';
    b.title = on ? 'Remove from favorites' : 'Add to favorites';
    b.setAttribute('aria-pressed', String(on));
  });
}
// What's saved for each of a favorite actor's credits. Episodes (TV) let long-running shows hide one-episode
// guest spots from the ♥ line.
export function slimCredits(credits) {
  return credits.filter((c) => !c.appearance).map(({ id, type, title, year, episodes }) => ({ id, type, title, year, ...(type === 'tv' && episodes ? { episodes } : {}) }));
}
// New projects: credits TMDB lists now that weren't in the saved ones, from this year or later (or with no date yet),
// so TMDB filling in someone's back catalog doesn't count as news. Kept on the actor (a.news) until dismissed on Updates.
// Nothing is noted the first time an actor's credits are saved.
export function noteNewCredits(a, fresh) {
  if (!a.credits || !a.credits.length) return [];
  const had = new Set(a.credits.map((c) => `${c.type}:${c.id}`));
  const dismissed = new Set(a.newsSeen || []);
  const year = new Date().getFullYear();
  const found = slimCredits(fresh).filter((c) => !had.has(`${c.type}:${c.id}`) && !dismissed.has(`${c.type}:${c.id}`) && (!c.year || c.year >= year));
  if (!found.length) return [];
  const news = a.news || [];
  const have = new Set(news.map((c) => `${c.type}:${c.id}`));
  a.news = [...news, ...found.filter((c) => !have.has(`${c.type}:${c.id}`)).map((c) => ({ ...c, at: today() }))];
  return found;
}
export async function refreshCredits(a, { quiet = false } = {}) {
  const person = await getPerson(a.tmdbId);
  noteNewCredits(a, person.credits);
  a.credits = slimCredits(person.credits);
  a.creditsAt = today();
  if (person.profile) a.profile = person.profile;
  if (!quiet) save();
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
// Change a show's status. Statuses flagged to (Finished, Rewatching, Dropped unless changed) turn the TV show's
// Show spoilers switch on; nothing ever turns it off. Returns true if it was just turned on.
export function setStatus(s, value) {
  s.status = value;
  if (s.spoilers || isMovie(s) || !spoilerStatusNames().includes(value)) return false;
  s.spoilers = true;
  return true;
}
// Status for newly added titles: Identified, or Want to Watch if Identified was removed from the status list.
export const newShowStatus = () => (statusNames().includes('Identified') ? 'Identified' : 'Want to Watch');
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
// The status for "✓ Seen it": Finished if the list has it, else the first status that turns spoilers on, else null.
export function seenStatus() {
  const names = statusNames();
  return names.includes('Finished') ? 'Finished' : spoilerStatusNames()[0] || null;
}
// One-tap add for something you've already watched: added from TMDB as Finished (or its stand-in), with Show spoilers
// on for TV, as picking Finished by hand would do. Falls back to a plain add if no status fits.
export async function addAsFinished(t, extra = {}) {
  const status = seenStatus();
  const s = await addFromTmdb(t, status ? { ...extra, status } : extra);
  if (s && status && s.status === status && !isMovie(s) && !s.spoilers && spoilerStatusNames().includes(status)) { s.spoilers = true; save({ quiet: true }); }
  return s;
}

// Ask TMDB about a linked TV show now (skipping the cache) and store the facts. Returns what changed since the last check.
// The caller saves.
export async function checkFacts(s) {
  const d = await tmdb(`/tv/${s.tmdb.id}`);
  return applyFacts(s, factsFromDetails(d));
}
