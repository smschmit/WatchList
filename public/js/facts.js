// Facts vs labels. `show.facts` holds what TMDB says right now (filled in by a check); it is never
// edited by hand. `show.showStatus` stays your own label ("Canceled (cliffhanger)", "Awaiting Renewal"…).
// This module turns TMDB details into facts, notices what changed between checks, and works out
// where your label and the facts disagree, so the Updates page can suggest a new label.
import { today } from './util.js';

// What TMDB's data means, in plain words. TMDB's own status is kept too (facts.tmdbStatus).
export const FACT_ORDER = ['Airing', 'New season scheduled', 'Renewed', 'Returning, no news', 'Upcoming', 'Ended', 'Canceled'];

export function factsFromDetails(d) {
  const last = d.last_episode_to_air || null;
  const next = d.next_episode_to_air || null;
  // Aired seasons; if TMDB has no last-episode record but the show has aired, fall back to its season count.
  const lastSeason = last ? last.season_number : d.last_air_date ? d.number_of_seasons || 1 : 0;
  const announced = Math.max(0, ...(d.seasons || []).map((x) => x.season_number || 0));
  let status;
  if (d.status === 'Canceled') status = 'Canceled';
  else if (d.status === 'Ended') status = 'Ended';
  else if (next && lastSeason && next.season_number > lastSeason) status = 'New season scheduled';
  else if (next && lastSeason) status = 'Airing';
  else if (!lastSeason) status = 'Upcoming';
  else if (announced > lastSeason) status = 'Renewed';
  else if (d.status === 'Returning Series') status = 'Returning, no news';
  else if (/production|planned|pilot/i.test(d.status || '')) status = 'Renewed';
  else status = d.status || '';
  return {
    status,
    tmdbStatus: d.status || '',
    seasonsAired: lastSeason || null,
    episodes: d.number_of_episodes || null,
    lastAir: (last && last.air_date) || d.last_air_date || null,
    nextAir: (next && next.air_date) || null,
    nextSeason: next ? next.season_number : null,
    nextEpisode: next ? next.episode_number : null,
    // The last aired episode, and episodes per season (index = season number; 0 = specials), so the Updates page
    // can say how many episodes came out since where you are, without another lookup.
    lastSeason: last ? last.season_number : null,
    lastEpisode: last ? last.episode_number : null,
    seasonEps: seasonCounts(d.seasons),
    checkedAt: today(),
  };
}

export function seasonCounts(seasons) {
  const out = [];
  for (const x of seasons || []) if (x.season_number >= 0 && x.season_number < 200) out[x.season_number] = x.episode_count || 0;
  return Array.from(out, (n) => n || 0);
}
const epCode = (season, ep) => `S${season}${ep ? `E${ep}` : ''}`;
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function describeNext(f) {
  return f && f.nextAir ? `next episode ${epCode(f.nextSeason, f.nextEpisode)} on ${fmtDate(f.nextAir)}` : '';
}

// What changed since the previous check, in words.
export function diffFacts(old, f) {
  const out = [];
  if (old.status !== f.status) out.push(`TMDB: ${old.status || 'unknown'} → ${f.status}`);
  if (f.seasonsAired && old.seasonsAired && f.seasonsAired > old.seasonsAired) out.push(`Season ${f.seasonsAired} started airing`);
  if (f.nextAir && (f.nextAir !== old.nextAir || f.nextSeason !== old.nextSeason)) out.push(`Scheduled: ${describeNext(f)}`);
  return out;
}

// Store a check's result on the show. Changes pile up until you deal with them on the Updates page.
export function applyFacts(s, f) {
  const old = s.facts;
  const fresh = old ? diffFacts(old, f) : [];
  const changes = [...new Set([...((old && old.changes) || []), ...fresh])];
  s.facts = { ...f, changes, changedAt: fresh.length ? today() : (old && old.changedAt) || null };
  return fresh;
}

// ---------- Your labels vs the facts ----------
// Your show-status labels, grouped by what they claim.
export function labelClass(label) {
  if (!label) return 'blank';
  if (/cancel|^ended/i.test(label)) return 'over';
  if (/renewed/i.test(label)) return 'renewed';
  if (/awaiting|^check$/i.test(label)) return 'unknown';
  if (/airing|ongoing/i.test(label)) return 'airing';
  return 'other';
}
const FACT_CLASS = { Canceled: 'over', Ended: 'over', Renewed: 'renewed', 'New season scheduled': 'renewed', Airing: 'airing', 'Returning, no news': 'unknown', Upcoming: 'upcoming' };
export const factClass = (f) => (f ? FACT_CLASS[f.status] || 'other' : 'none');

// Labels (in your wording) that fit what TMDB says.
export function suggestedLabels(f) {
  return {
    Canceled: ['Canceled (cliffhanger)', 'Canceled (wrapped up)'],
    Ended: ['Ended'],
    Renewed: ['Renewed'],
    'New season scheduled': ['Renewed'],
    Airing: ['Airing'],
    'Returning, no news': ['Awaiting Renewal'],
    Upcoming: ['Upcoming'],
  }[f && f.status] || [];
}
// The label to give a newly added show: only when there's one obvious choice (canceled needs you to pick).
export function initialLabel(f) {
  const s = suggestedLabels(f);
  return s.length === 1 ? s[0] : '';
}

// Does your label disagree with TMDB? Only flags clear disagreements: TMDB not knowing about a
// renewal doesn't mean there isn't one, so "Renewed" vs "Returning, no news" is left alone.
export function labelConflict(s) {
  const f = s.facts;
  if (!f) return null;
  const lc = labelClass(s.showStatus), fc = factClass(f);
  const labels = suggestedLabels(f).filter((l) => l !== s.showStatus);
  if (!labels.length || lc === 'other') return null;
  if (lc === 'blank') return { text: `No show status yet. TMDB says ${f.status.toLowerCase()}.`, labels };
  if (fc === 'over' && lc !== 'over') return { text: `TMDB says it ${f.status === 'Canceled' ? 'was canceled' : 'has ended'}.`, labels };
  if (lc === 'over' && fc !== 'over' && fc !== 'other') return { text: `You have it as over, but TMDB says ${f.status.toLowerCase()}.`, labels };
  if (lc === 'unknown' && (fc === 'renewed' || fc === 'airing')) return { text: `TMDB says ${f.status.toLowerCase()}.`, labels };
  return null;
}

// Statuses that mean "I'm waiting for more of this show".
export const WAITING = ['Waiting for Series End', 'Paused Between Seasons', 'Waiting Next Release'];
export const READY = "Waiting on Release and Now It's Ready";
export const FINISHED = 'Finished';
// What a finished show becomes when you choose to wait for its next season. Uses whichever waiting
// status your list has (names are editable), preferring Paused Between Seasons.
export function waitingStatus(names) {
  return ['Paused Between Seasons', 'Waiting Next Release'].find((n) => names.includes(n)) || 'Paused Between Seasons';
}

// TMDB has more aired seasons than your list records.
export function newSeasons(s) {
  const f = s.facts;
  return f && f.seasonsAired && s.seasons && f.seasonsAired > s.seasons ? f.seasonsAired : null;
}
// You're waiting on this show and what you were waiting for has happened.
export function readyToWatch(s) {
  if (!WAITING.includes(s.status) || !s.facts) return null;
  if (s.status === 'Waiting for Series End') return factClass(s.facts) === 'over' ? 'The series is over, so you can watch it all.' : null;
  if (newSeasons(s)) {
    const airing = s.facts.nextAir && s.facts.nextSeason === s.facts.seasonsAired;
    return `Season ${s.facts.seasonsAired} is out${airing ? ' (still airing)' : ''}.`;
  }
  return null;
}

// You finished this show, but TMDB says there's more: renewed, a season scheduled or airing, or more aired seasons than your list.
export function moreComing(s) {
  if (s.status !== FINISHED || !s.facts) return null;
  const fc = factClass(s.facts);
  const n = newSeasons(s);
  if (n) return `You finished it, but season ${n} is out.`;
  if (fc !== 'renewed' && fc !== 'airing') return null;
  return `You finished it, but TMDB says ${s.facts.status.toLowerCase()}.`;
}

// Everything worth telling you about one show, or null. Dismissing remembers the facts you saw
// (factsAck), so the show stays quiet until TMDB says something new.
export const factsSignature = (f) => (f ? [f.status, f.seasonsAired, f.nextAir].join('|') : '');
export function updateFor(s) {
  const f = s.facts;
  if (!f || s.factsAck === factsSignature(f)) return null;
  const changes = f.changes || [];
  const conflict = labelConflict(s);
  const ready = readyToWatch(s);
  const seasons = newSeasons(s);
  const more = moreComing(s);
  if (!changes.length && !conflict && !ready && !seasons && !more) return null;
  return { changes, conflict, ready, seasons, more };
}
