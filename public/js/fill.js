// "Fill from TMDB": asks TMDB (details + keywords) and Wikidata (setting, era) about linked shows and stores the
// answer in show.sourced. Your own values are never overwritten; Country and Language are copied in only where blank.
import { today } from './util.js';
import { state, save, bulk } from './state.js';
import { tmdb } from './tmdb.js';
import { fromTmdb, combine, PERIOD_TAG } from './sources.js';
import { wikidataFor } from './wikidata.js';

export const linkedShows = () => state.shows.filter((s) => s.tmdb && s.tmdb.id && (s.tmdb.type === 'tv' || s.tmdb.type === 'movie'));

// Your own signs that a show is set in the past, so "Present day" isn't guessed for it.
const pastHints = (s) => s.tags.some((t) => PERIOD_TAG.test(t) || /true story/i.test(t)) || (s.era && s.era.length && !s.era.includes('Present day'))
  || s.fiction === 'Based on a true story';

// Store one show's result. Returns nothing; counts go in the tally.
export function applySourced(s, sourced, places) {
  s.sourced = sourced;
  if (!s.country && sourced.country) s.country = sourced.country;
  if (!s.languages.length && sourced.languages.length) s.languages = [...sourced.languages];
  if (Object.keys(places).length) state.places = { ...(state.places || {}), ...places };
}

// Kept outside the view so a fill keeps going if you open another page and come back.
export let filler = null;
export function stopFill() { if (filler) filler.running = false; }

const BATCH = 40;
export const runFill = (list, onProgress) => bulk(() => fillAll(list, onProgress));
async function fillAll(list, onProgress) {
  const tally = { setting: { wikidata: 0, keywords: 0, none: 0 }, era: { wikidata: 0, keywords: 0, guess: 0, none: 0 },
    tone: { keywords: 0, genres: 0, none: 0 }, wikidataFound: 0 };
  filler = { running: true, done: 0, total: list.length, missing: 0, error: '', tally, onProgress: onProgress || (filler && filler.onProgress) };
  const progress = () => filler.onProgress && filler.onProgress();
  progress();
  for (let b = 0; b < list.length && filler.running; b += BATCH) {
    const batch = list.slice(b, b + BATCH);
    // TMDB, four at a time.
    const details = new Map();
    let i = 0;
    const worker = async () => {
      while (filler.running && i < batch.length) {
        const s = batch[i++];
        try { details.set(s.id, await tmdb(`/${s.tmdb.type}/${s.tmdb.id}`, { append_to_response: 'keywords' })); }
        catch (e) {
          if (/\(404\)/.test(e.message)) filler.missing++;
          else { filler.running = false; filler.error = e.message; }
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (!filler.running) break;
    // Wikidata, the whole batch in one go. If it fails, keep going with TMDB keywords only.
    let wd = new Map();
    try { wd = await wikidataFor(batch.filter((s) => details.has(s.id)).map((s) => s.tmdb)); }
    catch (e) { filler.error = `${e.message}. Setting and era came from TMDB keywords only for some shows.`; }
    for (const s of batch) {
      const d = details.get(s.id);
      if (!d) { filler.done++; continue; }
      const w = wd.get(`${s.tmdb.type}:${s.tmdb.id}`);
      if (w && w.found) tally.wikidataFound++;
      const { sourced, places } = combine(fromTmdb(d), w, today(), { periodTags: pastHints(s) });
      applySourced(s, sourced, places);
      tally.setting[sourced.from.setting || 'none']++;
      tally.era[sourced.from.era || 'none']++;
      tally.tone[sourced.from.tone || 'none']++;
      filler.done++;
    }
    save({ quiet: true });
    progress();
  }
  filler.running = false;
  save({ quiet: true });
  progress();
  return filler;
}
// One show, from its page.
export async function fillOne(s) {
  const d = await tmdb(`/${s.tmdb.type}/${s.tmdb.id}`, { append_to_response: 'keywords' });
  let w = null;
  try { w = (await wikidataFor([s.tmdb])).get(`${s.tmdb.type}:${s.tmdb.id}`); } catch {}
  const { sourced, places } = combine(fromTmdb(d), w, today(), { periodTags: pastHints(s) });
  applySourced(s, sourced, places);
  save();
  return sourced;
}
