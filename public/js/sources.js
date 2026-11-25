// What outside sources say about a show: TMDB (details + keywords) and Wikidata (narrative location, set in period).
// Pure functions only (no page, no saved state), so they can be tested on their own. fill.js does the fetching and saving.
//
// The result is stored on the show as `show.sourced` and is never edited by hand. Your own value for a field
// (show.fiction, show.setting, …) wins whenever it is set; see fieldOf() in shows.js.

// ---------- Field options ----------
export const FICTION = ['Scripted', 'Based on a true story', 'Documentary', 'Reality', 'Stand-up / variety'];
export const TONE = ['Light', 'Mixed', 'Dark'];
export const DECADES = ['2010s', '2000s', '1990s', '1980s', '1970s', '1960s', '1950s', '1940s', '1930s', '1920s', '1910s', '1900s'];
export const ERA_ORDER = ['Present day', ...DECADES, 'Before 1900', 'Future'];

// ---------- Names for countries and languages (TMDB gives ISO codes) ----------
export const regionName = (() => {
  let dn; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
  const short = { US: 'US', GB: 'UK', CA: 'Canada', AU: 'Australia', NZ: 'NZ', KR: 'South Korea' };
  return (c) => short[c] || (dn ? dn.of(c) : c);
})();
export const langName = (() => {
  let dn; try { dn = new Intl.DisplayNames(['en'], { type: 'language' }); } catch {}
  return (c) => (dn && c ? dn.of(c) : c || '');
})();
const titleCase = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|The|And|De|Du|La|Le)\b/g, (m, w, i) => (i ? w.toLowerCase() : w));

// ---------- Places ----------
// Regions and big cities named in TMDB keywords, with what they roll up to. Wikidata places get their roll-up
// from Wikidata itself ("located in" / country) and are saved in state.places.
const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
const REGIONS = {
  ...Object.fromEntries(US_STATES.map((s) => [s, ['US']])),
  England: ['UK'], Scotland: ['UK'], Wales: ['UK'], 'Northern Ireland': ['UK'],
  Ontario: ['Canada'], Quebec: ['Canada'], 'British Columbia': ['Canada'], Alberta: ['Canada'], 'Nova Scotia': ['Canada'], Manitoba: ['Canada'],
  'New South Wales': ['Australia'], Victoria: ['Australia'], Queensland: ['Australia'], 'Western Australia': ['Australia'], Tasmania: ['Australia'],
};
const CITIES = {
  'New York City': ['New York', 'US'], Brooklyn: ['New York City', 'New York', 'US'], Manhattan: ['New York City', 'New York', 'US'],
  Queens: ['New York City', 'New York', 'US'], 'The Bronx': ['New York City', 'New York', 'US'], 'Staten Island': ['New York City', 'New York', 'US'],
  'Los Angeles': ['California', 'US'], Hollywood: ['Los Angeles', 'California', 'US'], 'San Francisco': ['California', 'US'],
  'San Diego': ['California', 'US'], Chicago: ['Illinois', 'US'], Boston: ['Massachusetts', 'US'], Miami: ['Florida', 'US'],
  'Washington, D.C.': ['US'], Philadelphia: ['Pennsylvania', 'US'], Pittsburgh: ['Pennsylvania', 'US'], Baltimore: ['Maryland', 'US'],
  Atlanta: ['Georgia', 'US'], 'New Orleans': ['Louisiana', 'US'], Seattle: ['Washington', 'US'], Austin: ['Texas', 'US'],
  Houston: ['Texas', 'US'], Dallas: ['Texas', 'US'], 'Las Vegas': ['Nevada', 'US'], Detroit: ['Michigan', 'US'],
  Albuquerque: ['New Mexico', 'US'], Honolulu: ['Hawaii', 'US'], Nashville: ['Tennessee', 'US'], Denver: ['Colorado', 'US'],
  Cleveland: ['Ohio', 'US'], Minneapolis: ['Minnesota', 'US'], Phoenix: ['Arizona', 'US'],
  London: ['England', 'UK'], Manchester: ['England', 'UK'], Liverpool: ['England', 'UK'], Edinburgh: ['Scotland', 'UK'],
  Glasgow: ['Scotland', 'UK'], Belfast: ['Northern Ireland', 'UK'], Cardiff: ['Wales', 'UK'], Dublin: ['Ireland'],
  Paris: ['France'], Berlin: ['Germany'], Rome: ['Italy'], Madrid: ['Spain'], Barcelona: ['Spain'], Copenhagen: ['Denmark'],
  Stockholm: ['Sweden'], Oslo: ['Norway'], Reykjavík: ['Iceland'], Amsterdam: ['Netherlands'], Tokyo: ['Japan'], Seoul: ['South Korea'],
  Mumbai: ['India'], 'Mexico City': ['Mexico'], Toronto: ['Ontario', 'Canada'], Vancouver: ['British Columbia', 'Canada'],
  Montreal: ['Quebec', 'Canada'], Sydney: ['New South Wales', 'Australia'], Melbourne: ['Victoria', 'Australia'],
  Brisbane: ['Queensland', 'Australia'], Auckland: ['NZ'], Wellington: ['NZ'], 'Tel Aviv': ['Israel'], Jerusalem: ['Israel'],
  Moscow: ['Russia'], Istanbul: ['Turkey'],
};
const ALIAS = { 'new york': 'New York City', nyc: 'New York City', 'new york city, new york': 'New York City', usa: 'US',
  'united states': 'US', 'united states of america': 'US', 'united kingdom': 'UK', uk: 'UK', britain: 'UK', 'great britain': 'UK',
  'washington d.c.': 'Washington, D.C.', 'washington dc': 'Washington, D.C.', 'city of westminster': 'London', 'greater london': 'London',
  'city of london': 'London', 'reykjavik': 'Reykjavík', 'montréal': 'Montreal', 'new zealand': 'NZ' };
// Country names (lowercase) -> the app's name for them ("UK", "US", "South Korea"…).
const COUNTRIES = (() => {
  const out = {};
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    let name; try { name = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(code); } catch {}
    if (name && name !== code) out[name.toLowerCase()] = regionName(code);
  }
  return out;
})();
export const COUNTRY_NAMES = new Set(Object.values(COUNTRIES));

// A known place name in the app's spelling, or null.
export function knownPlace(raw) {
  const k = (raw || '').trim().toLowerCase();
  if (!k) return null;
  if (ALIAS[k]) return ALIAS[k];
  if (COUNTRIES[k]) return COUNTRIES[k];
  for (const name of Object.keys(CITIES)) if (name.toLowerCase() === k) return name;
  for (const name of Object.keys(REGIONS)) if (name.toLowerCase() === k) return name;
  return null;
}
// What a place rolls up to, from the built-in table (Wikidata places are looked up in state.places first; see shows.js).
export function builtInWithin(name) {
  return CITIES[name] || REGIONS[name] || [];
}
// A TMDB keyword that names a place: "london, england", "new york city", "ontario, canada", "california".
// Returns { name, within } or null. Bare city names not in the table are skipped: "paris" could be a person.
export function placeFromKeyword(kw) {
  const known = knownPlace(kw);
  if (known) return { name: known, within: builtInWithin(known) };
  const m = /^(.+?),\s*([^,]+)$/.exec(kw.trim());
  if (!m) return null;
  const parent = knownPlace(m[2]);
  if (!parent) return null;
  const inner = knownPlace(m[1]);
  if (inner) return { name: inner, within: builtInWithin(inner) };
  if (/\b(of|or|and)\b/.test(m[1]) || m[1].split(' ').length > 3) return null; // "based on myths, legends or folklore"
  return { name: titleCase(m[1]), within: [parent, ...builtInWithin(parent)] };
}
// Drop places that another place in the list already sits inside (keep "Albuquerque", drop "New Mexico").
export function mostSpecific(places, withinOf) {
  const names = [...new Set(places)];
  const covered = new Set(names.flatMap((n) => withinOf(n)));
  return names.filter((n) => !covered.has(n));
}

// ---------- Era ----------
const ERA_SPANS = {
  'victorian era': [1837, 1899], 'victorian england': [1837, 1899], 'victorian london': [1837, 1899], 'edwardian era': [1901, 1914],
  'edwardian england': [1901, 1914], 'regency era': [1811, 1820], 'regency england': [1811, 1820], 'georgian era': [1714, 1837],
  'world war i': [1914, 1918], 'first world war': [1914, 1918], 'world war ii': [1940, 1945], 'second world war': [1940, 1945],
  'great depression': [1930, 1939], 'prohibition era': [1920, 1933], 'roaring twenties': [1920, 1929], 'jazz age': [1920, 1929],
  'swinging sixties': [1960, 1969], 'swinging london': [1960, 1969], 'vietnam war': [1965, 1973], 'american civil war': [1861, 1865],
  'wild west': [1865, 1895], 'old west': [1865, 1895], 'american revolution': [1765, 1783], 'french revolution': [1789, 1799],
  'middle ages': [500, 1500], medieval: [500, 1500], 'medieval england': [500, 1500], 'tudor england': [1485, 1603], tudors: [1485, 1603],
  'elizabethan era': [1558, 1603], renaissance: [1400, 1600], 'ancient rome': [-750, 476], 'ancient greece': [-800, -146],
  'ancient egypt': [-3100, -30], 'viking age': [793, 1066], 'gilded age': [1870, 1900], 'belle époque': [1871, 1914],
};
const FUTURE_WORDS = /^(future|distant future|near future|dystopian future|post-apocalyptic future|futuristic|22nd century|23rd century|24th century|25th century)$/;
// Eras for a span of years. Too broad a span (more than three decades, after 1900) says nothing useful, so returns [].
// Decades at or near the release year count as "Present day".
export function erasForSpan(start, end, released) {
  if (start == null) return [];
  if (end == null) end = start;
  if (released && start > released + 5) return ['Future'];
  if (end < 1900) return ['Before 1900'];
  const out = [];
  if (start < 1900) out.push('Before 1900');
  const first = Math.max(1900, Math.floor(start / 10) * 10);
  const last = Math.floor(end / 10) * 10;
  if ((last - first) / 10 + 1 > 3) return start < 1900 && end < 1910 ? ['Before 1900'] : [];
  for (let d = first; d <= last; d += 10) out.push(released && d + 9 >= released - 3 ? 'Present day' : `${d}s`);
  return [...new Set(out)].filter((e) => ERA_ORDER.includes(e));
}
// Eras from one TMDB keyword ("1980s", "world war ii", "middle ages (476-1453)", "19th century", "future").
export function erasFromKeyword(kw, released) {
  const k = kw.trim().toLowerCase();
  if (FUTURE_WORDS.test(k)) return ['Future'];
  let m;
  if ((m = /^(1[5-9]|20)(\d)0s$/.exec(k))) return erasForSpan(Number(m[1] + m[2] + '0'), Number(m[1] + m[2] + '9'), released);
  if ((m = /^(1[5-9]\d\d|20[0-2]\d)$/.exec(k))) return erasForSpan(Number(m[1]), Number(m[1]), released);
  if ((m = /\((\d{3,4})\s*[-–]\s*(\d{3,4})\)/.exec(k))) return erasForSpan(Number(m[1]), Number(m[2]), released);
  if ((m = /^(\d{1,2})(st|nd|rd|th) century$/.exec(k))) {
    const c = Number(m[1]);
    if (c >= 22) return ['Future'];
    return c <= 19 ? ['Before 1900'] : [];
  }
  const key = k.replace(/\s*\(.*\)$/, '');
  if (ERA_SPANS[key]) return erasForSpan(...ERA_SPANS[key], released);
  return [];
}
// Eras from a Wikidata "set in period" item: its label ("1960s"), or its start/end years.
export function erasFromPeriod(p, released) {
  const label = (p.label || '').toLowerCase();
  if (/future/.test(label)) return ['Future'];
  if (/present|contemporary/.test(label)) return ['Present day'];
  const fromLabel = erasFromKeyword(label, released);
  if (fromLabel.length) return fromLabel;
  if (p.start != null || p.point != null) return erasForSpan(p.start ?? p.point, p.end ?? p.point ?? p.start, released);
  return [];
}
export const sortEras = (list) => [...new Set(list)].sort((a, b) => ERA_ORDER.indexOf(a) - ERA_ORDER.indexOf(b));

// ---------- Tone ----------
// TMDB's mood keywords are added by users and are noisy: "amused", "hopeful", "inspirational" and "excited" turn up on
// Snowfall and Battlestar Galactica, so only clearly comic or feel-good words count as light.
const LIGHT = /^(hilarious|feelgood|feel-good|feel good|witty|lighthearted|light-hearted|cheerful|joyful|joyous|playful|whimsical|wholesome|comforting|heartwarming|heart-warming|silly|cozy|cosy|zany|goofy|farcical)$/;
const DARK = /^(dark|bleak|grim|gritty|brutal|violent|disturbing|disturbed|depressing|tragic|sinister|harsh|horrifying|macabre|gloomy|somber|sombre|melancholy|melancholic|nihilistic|menacing|cruel|gruesome|grisly|ominous|haunting|distressing|frightening|terrifying|unsettling|cynical)$/;
const MIXED = /^(dark comedy|black comedy|dark humor|dark humour|gallows humor|bittersweet|tragicomedy|dramedy)$/;
export function toneFrom(keywords, genres) {
  let light = 0, dark = 0;
  for (const raw of keywords) {
    const k = raw.toLowerCase();
    if (MIXED.test(k)) { light++; dark++; } else if (LIGHT.test(k)) light++; else if (DARK.test(k)) dark++;
  }
  if (light || dark) return { tone: light && dark ? 'Mixed' : light ? 'Light' : 'Dark', from: 'keywords' };
  if (genres.includes('Horror')) return { tone: 'Dark', from: 'genres' };
  if (genres.includes('Family') || genres.includes('Kids')) return { tone: 'Light', from: 'genres' };
  // A comedy and nothing heavier.
  if (genres.includes('Comedy') && !genres.some((g) => /^(Drama|Crime|Thriller|Horror|War|Mystery|Politics|Action)$/.test(g))) return { tone: 'Light', from: 'genres' };
  return { tone: '', from: '' };
}

// ---------- Fiction ----------
const TRUE_STORY = /^(based on true story|based on a true story|based on real events|based on real person|biography|biopic|true story|historical figure|based on actual events)$/;
const STANDUP = /^(stand-up comedy|stand up comedy|stand-up comedian|comedy special|stand-up special|sketch comedy|variety show|late night talk show)$/;
export function fictionFrom(genreNames, keywords) {
  const g = new Set(genreNames);
  const k = keywords.map((x) => x.toLowerCase());
  if (g.has('Talk') || k.some((x) => STANDUP.test(x))) return 'Stand-up / variety';
  if (g.has('Reality')) return 'Reality';
  if (g.has('Documentary')) return 'Documentary';
  if (k.some((x) => TRUE_STORY.test(x))) return 'Based on a true story';
  return 'Scripted';
}

// ---------- Putting it together ----------
// TMDB details fetched with append_to_response=keywords (TV: keywords.results, movies: keywords.keywords).
export function keywordsOf(d) {
  const k = d && d.keywords;
  return ((k && (k.results || k.keywords)) || []).map((x) => x.name);
}
export function releasedYear(d) {
  const date = d.first_air_date || d.release_date || '';
  return date ? Number(date.slice(0, 4)) : null;
}
// Everything TMDB alone says. Setting/era here are the keyword fallbacks; Wikidata, when it has an answer, wins (see combine()).
export function fromTmdb(d) {
  const kws = keywordsOf(d);
  const genres = (d.genres || []).map((g) => g.name);
  const released = releasedYear(d);
  const codes = (d.origin_country && d.origin_country.length ? d.origin_country : (d.production_countries || []).map((c) => c.iso_3166_1)) || [];
  const tone = toneFrom(kws, genres.flatMap((g) => g.split(' & ')));
  const places = kws.map(placeFromKeyword).filter(Boolean);
  return {
    country: [...new Set(codes.map(regionName))].join(', '),
    languages: d.original_language ? [langName(d.original_language)] : [],
    fiction: fictionFrom(genres, kws),
    tone: tone.tone, toneFrom: tone.from,
    keywordPlaces: places,
    keywordEras: sortEras(kws.flatMap((k) => erasFromKeyword(k, released))),
    period: kws.some((k) => PERIOD.test(k.toLowerCase())),
    released, genres,
  };
}
const PERIOD = /^(period drama|period piece|costume drama|historical|historical fiction|historical drama|history|period film|historical event)$/;
// Your own tags that say a show is set in the past.
export const PERIOD_TAG = /^(period|period drama|historical|victorian|regency|edwardian|wwi|wwii|ww2|world war (i|ii|2)|cold war|medieval|\d{4}s)$/i;
// Present day, as a last guess: only when nothing says the show is set in the past, in the future or somewhere invented.
// opts.periodTags: your own tags say it's a period piece.
export function guessPresentDay(t, opts = {}) {
  if (opts.periodTags || t.period) return false;
  if (['Documentary', 'Based on a true story'].includes(t.fiction)) return false;
  return !t.genres.some((g) => /history|western|science fiction|sci-fi|fantasy|war/i.test(g));
}
// Combine TMDB and Wikidata into the stored `sourced` record.
// wd: { places: [{ name, within }], periods: [{ label, start, end, point }] } or null.
// Returns { sourced, places } where places are new entries for state.places.
export function combine(t, wd, today, opts = {}) {
  const places = {};
  let setting = [], settingFrom = '';
  const wdPlaces = (wd && wd.places) || [];
  if (wdPlaces.length) {
    for (const p of wdPlaces) places[p.name] = { within: p.within, ...(p.qid ? { qid: p.qid } : {}) };
    setting = wdPlaces.map((p) => p.name); settingFrom = 'wikidata';
  } else if (t.keywordPlaces.length) {
    for (const p of t.keywordPlaces) if (p.within.length) places[p.name] = { within: p.within };
    setting = t.keywordPlaces.map((p) => p.name); settingFrom = 'keywords';
  }
  const withinOf = (n) => (places[n] && places[n].within) || builtInWithin(n);
  setting = mostSpecific(setting, withinOf).slice(0, 5);

  let era = [], eraFrom = '';
  const wdEras = sortEras(((wd && wd.periods) || []).flatMap((p) => erasFromPeriod(p, t.released)));
  if (wdEras.length) { era = wdEras; eraFrom = 'wikidata'; }
  else if (t.keywordEras.length) { era = t.keywordEras; eraFrom = 'keywords'; }
  else if (guessPresentDay(t, opts)) { era = ['Present day']; eraFrom = 'guess'; }

  return {
    sourced: {
      country: t.country, languages: t.languages, fiction: t.fiction, tone: t.tone, setting, era,
      from: { setting: settingFrom, era: eraFrom, tone: t.toneFrom },
      at: today,
    },
    places,
  };
}
