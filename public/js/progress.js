// Where you are in each TV show: the last episode you watched, in state.progress = { [showId]: { season, episode, at } }.
// Kept off the show record on purpose: sync merges a whole show at a time, so progress marked on one device and a
// notes edit on another would lose one of the two. A top-level map merges show by show on its own (cloud.js).
import { state, save, canEdit } from './state.js';
import { today } from './util.js';

export const epLabel = (season, ep) => (season === 0 ? `Special ${ep}` : `S${season} · E${ep}`);
export function getProgress(s) {
  const p = state.progress && state.progress[s.id];
  return p && p.season >= 1 && p.episode >= 1 ? p : null;
}
export function progressLabel(s) { const p = getProgress(s); return p ? epLabel(p.season, p.episode) : ''; }
// Negative if episode a comes before b.
export const cmpEp = (a, b) => (a.season - b.season) || (a.episode - b.episode);
export function setProgress(s, season, episode, { quiet = true } = {}) {
  if (!canEdit()) return false;
  if (!state.progress || typeof state.progress !== 'object') state.progress = {};
  if (!season || !episode) delete state.progress[s.id];
  else state.progress[s.id] = { season, episode, at: today() };
  save({ quiet });
  return true;
}
// Seen as far as this episode? Specials (season 0) are never counted as watched.
export function watched(s, season, episode) {
  const p = getProgress(s);
  return !!p && season >= 1 && cmpEp({ season, episode }, p) <= 0;
}
// Episode titles, summaries and stills are spoilers: shown up to where you are, or for everything with Show spoilers on.
export const unlocked = (s, season, episode) => !!s.spoilers || watched(s, season, episode);

// The episode after `p` given episodes per season (counts[n] = episodes in season n). Null when there isn't one.
export function nextAfter(p, counts) {
  const last = counts.length - 1;
  if (!p) { for (let n = 1; n <= last; n++) if (counts[n] > 0) return { season: n, episode: 1 }; return null; }
  if (p.episode < (counts[p.season] || 0)) return { season: p.season, episode: p.episode + 1 };
  for (let n = p.season + 1; n <= last; n++) if (counts[n] > 0) return { season: n, episode: 1 };
  return null;
}
// The episode before `p` (to un-tick), or null for S1 · E1.
export function prevBefore(p, counts) {
  if (p.episode > 1) return { season: p.season, episode: p.episode - 1 };
  for (let n = p.season - 1; n >= 1; n--) if (counts[n] > 0) return { season: n, episode: counts[n] };
  return null;
}
// How many episodes come after `p` up to and including `last` (both { season, episode }).
export function episodesBetween(p, last, counts) {
  if (!last || !last.season) return 0;
  if (p && cmpEp(p, last) >= 0) return 0;
  let n = 0;
  let cur = p ? { ...p } : { season: 1, episode: 0 };
  // Count the rest of the current season, then whole seasons, then the last season up to `last`.
  if (cur.season === last.season) return last.episode - cur.episode;
  n += Math.max(0, (counts[cur.season] || 0) - cur.episode);
  for (let k = cur.season + 1; k < last.season; k++) n += counts[k] || 0;
  return n + last.episode;
}
