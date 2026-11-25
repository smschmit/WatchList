// Which tags hold information that belongs in a field, duplicates that differ only in capitals or hyphens,
// and "did you mean…?" for new tags. Pure functions, no page or saved state.
import { knownPlace, COUNTRY_NAMES, ERA_ORDER, erasFromKeyword } from './sources.js';

// "True Story", "True story", "true-story" -> "true story". Also & vs and.
export const tagKey = (t) => (t || '').toLowerCase().replace(/&/g, 'and').replace(/[\s\-_/]+/g, ' ').replace(/[^a-z0-9+ ]/g, '').trim();
// Loose key for "did you mean": also drops a plural s.
const looseKey = (t) => tagKey(t).split(' ').map((w) => (w.length > 3 ? w.replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1') : w)).join(' ');

// Origin tags: where a show is from.
const ORIGIN = {
  british: 'UK', english: 'UK', scottish: 'UK', welsh: 'UK', canadian: 'Canada', australian: 'Australia', american: 'US',
  'new zealand': 'NZ', kiwi: 'NZ', danish: 'Denmark', swedish: 'Sweden', norwegian: 'Norway', icelandic: 'Iceland',
  finnish: 'Finland', dutch: 'Netherlands', belgian: 'Belgium', israeli: 'Israel', indian: 'India', mexican: 'Mexico',
  argentine: 'Argentina', argentinian: 'Argentina', colombian: 'Colombia', brazilian: 'Brazil', turkish: 'Turkey', polish: 'Poland',
  'south african': 'South Africa', nigerian: 'Nigeria',
};
// Could be the country, the language or the setting: ask.
const AMBIGUOUS = {
  spanish: { country: 'Spain', language: 'Spanish' }, irish: { country: 'Ireland', language: 'Irish' },
  french: { country: 'France', language: 'French' }, german: { country: 'Germany', language: 'German' },
  italian: { country: 'Italy', language: 'Italian' }, korean: { country: 'South Korea', language: 'Korean' },
  japanese: { country: 'Japan', language: 'Japanese' }, russian: { country: 'Russia', language: 'Russian' },
  chinese: { country: 'China', language: 'Chinese' }, portuguese: { country: 'Portugal', language: 'Portuguese' },
  'spanish language': { language: 'Spanish' }, 'spanish-language': { language: 'Spanish' }, 'foreign language': {},
};
// Setting tags that aren't one named place.
const SETTING_WORDS = /^(small town|small towns|suburban|suburbs|suburbia|southern|rural|urban|big city|city|new england|midwest|pacific northwest|middle east|scandinavia|scandi|europe|latin america|the south|deep south|appalachia|outback|countryside|island|seaside|coastal|desert|nyc|la|sf|dc|bay area|silicon valley|hollywood|brooklyn|harlem|wall street|white house|westminster)$/;
const FICTION_TAGS = {
  'true story': 'Based on a true story', 'based on true story': 'Based on a true story', 'based on a true story': 'Based on a true story',
  'true events': 'Based on a true story', biopic: 'Based on a true story', biography: 'Based on a true story',
  docuseries: 'Documentary', documentary: 'Documentary', 'docu series': 'Documentary', 'true crime doc': 'Documentary',
  reality: 'Reality', 'reality tv': 'Reality', 'reality show': 'Reality', 'competition reality': 'Reality',
  'stand up': 'Stand-up / variety', 'stand up special': 'Stand-up / variety', 'comedy special': 'Stand-up / variety',
  sketch: 'Stand-up / variety', 'sketch comedy': 'Stand-up / variety', variety: 'Stand-up / variety', 'talk show': 'Stand-up / variety',
};
const TONE_TAGS = { cozy: 'Light', cosy: 'Light', 'feel good': 'Light', feelgood: 'Light', wholesome: 'Light', lighthearted: 'Light',
  comfort: 'Light', 'comfort watch': 'Light', dark: 'Dark', bleak: 'Dark', gritty: 'Dark', violent: 'Dark', bittersweet: 'Mixed' };
const ERA_WORDS = /^(period|period drama|period piece|historical|history|victorian|regency|edwardian|georgian|tudor|medieval|wwi|ww1|wwii|ww2|world war (i|ii|1|2)|cold war|prohibition|civil war|ancient|futuristic|future|80s|90s|70s|60s|50s|y2k)$/;
const ERA_ALIAS = { wwii: 'World War II', ww2: 'World War II', 'world war ii': 'World War II', 'world war 2': 'World War II', wwi: 'World War I',
  ww1: 'World War I', 'world war i': 'World War I', 'world war 1': 'World War I', victorian: 'victorian era', regency: 'regency era',
  edwardian: 'edwardian era', medieval: 'medieval', prohibition: 'prohibition era', '80s': '1980s', '90s': '1990s', '70s': '1970s',
  '60s': '1960s', '50s': '1950s', futuristic: 'future', future: 'future', y2k: '2000s' };

// What a tag means as a field. Returns null, or { kind, field, value?, choices? }:
//   kind 'origin'  -> field country (value), 'ambiguous' -> choices { country, language, setting }
//   kind 'setting' -> value is a place name, or '' for a general setting word ("Small Town")
//   kind 'era'     -> value is one era from ERA_ORDER, or '' when no decade can be told ("Period")
//   kind 'fiction' / 'tone' -> value from those fields' options
//   kind 'genre'   -> value is the genre it repeats (only with a genre list)
export function classifyTag(tag, genres = []) {
  const k = tagKey(tag);
  if (!k) return null;
  const genre = genres.find((g) => tagKey(g) === k);
  if (genre) return { kind: 'genre', field: 'genres', value: genre };
  if (FICTION_TAGS[k]) return { kind: 'fiction', field: 'fiction', value: FICTION_TAGS[k] };
  if (TONE_TAGS[k]) return { kind: 'tone', field: 'tone', value: TONE_TAGS[k] };
  if (ORIGIN[k]) return { kind: 'origin', field: 'country', value: ORIGIN[k] };
  if (AMBIGUOUS[k] || AMBIGUOUS[tag.toLowerCase()]) {
    const c = AMBIGUOUS[k] || AMBIGUOUS[tag.toLowerCase()];
    return { kind: 'ambiguous', choices: { ...c, ...(c.country ? { setting: c.country } : {}) } };
  }
  if (ERA_WORDS.test(k) || /^\d{4}s$/.test(k) || /^\d{4}$/.test(k)) {
    const eras = erasFromKeyword(ERA_ALIAS[k] || k, null);
    const value = eras.length === 1 ? eras[0] : '';
    return { kind: 'era', field: 'era', value };
  }
  const place = knownPlace(tag);
  if (place) return { kind: 'setting', field: 'setting', value: place, country: COUNTRY_NAMES.has(place) };
  if (SETTING_WORDS.test(k)) {
    const named = { nyc: 'New York City', la: 'Los Angeles', sf: 'San Francisco', dc: 'Washington, D.C.', brooklyn: 'Brooklyn', hollywood: 'Hollywood', harlem: 'Harlem' }[k];
    return { kind: 'setting', field: 'setting', value: named || '' };
  }
  return null;
}
export const ERA_OPTIONS = ERA_ORDER;

// Groups of tags that differ only in capitals, hyphens or spaces. counts: Map tag -> uses.
// Returns [{ keep, others: [tag], uses }] with the most-used spelling as `keep`.
export function duplicateGroups(counts) {
  const by = new Map();
  for (const [t, n] of counts) {
    const k = tagKey(t);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push([t, n]);
  }
  return [...by.values()].filter((g) => g.length > 1).map((g) => {
    g.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return { keep: g[0][0], others: g.slice(1).map((x) => x[0]), uses: g.reduce((a, x) => a + x[1], 0) };
  });
}

// Edit distance, capped (stops early once over max).
function distance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Existing tags close to a typed one: same apart from capitals/hyphens/plural, or a small typo, or one contains the other.
// existing: Map tag -> uses. Returns up to `limit` tags, best first. Exact matches (same key) come first.
export function similarTags(typed, existing, limit = 3) {
  const k = tagKey(typed), lk = looseKey(typed);
  if (!k) return [];
  const scored = [];
  for (const [t, n] of existing) {
    const tk = tagKey(t);
    if (t === typed) continue;
    let score = null;
    if (tk === k) score = 0;
    else if (looseKey(t) === lk) score = 1;
    else if (k.length >= 4 && distance(tk, k, 2) <= (k.length > 7 ? 2 : 1)) score = 2;
    else if (k.length >= 4 && (tk.startsWith(k) || (tk.length >= 4 && k.startsWith(tk)))) score = 3;
    if (score != null) scored.push([t, score, n]);
  }
  return scored.sort((a, b) => a[1] - b[1] || b[2] - a[2]).slice(0, limit).map((x) => x[0]);
}
// The existing tag a TMDB keyword means, if one has the same name (ignoring capitals, hyphens and plurals).
export function matchExisting(word, existing) {
  const k = tagKey(word), lk = looseKey(word);
  let best = null;
  for (const [t, n] of existing) if ((tagKey(t) === k || looseKey(t) === lk) && (!best || n > best[1])) best = [t, n];
  return best ? best[0] : null;
}
