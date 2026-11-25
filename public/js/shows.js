// Facts worked out from a show's fields (movie or series, total time, year range).

export const isMovie = (s) => /movie|special/i.test(s.format);
export function totalHours(s) {
  if (isMovie(s)) return s.epLength ? s.epLength / 60 : null;
  return s.episodes && s.epLength ? (s.episodes * s.epLength) / 60 : null;
}
export function fmtHours(h) { return h == null ? '' : h < 1 ? `${Math.round(h * 60)} min` : `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`; }
export function years(s) {
  if (!s.year) return '';
  if (isMovie(s) || s.endYear === s.year) return String(s.year);
  return s.endYear ? `${s.year}–${s.endYear}` : `${s.year}–`;
}

// ---------- Fields filled from TMDB / Wikidata ----------
// Your value when you've set one (even blank on purpose), otherwise what the sources said (show.sourced).
export const SOURCED_KEYS = ['fiction', 'tone', 'setting', 'era'];
export const LIST_KEYS = ['setting', 'era'];
export function fieldOf(s, k) {
  if (s[k] != null) return s[k];
  const v = s.sourced && s.sourced[k];
  return v != null ? v : LIST_KEYS.includes(k) ? [] : '';
}
// Is the value shown for this field from the sources (not yours)?
export const isSourced = (s, k) => !!(s[k] == null && s.sourced && (LIST_KEYS.includes(k) ? (s.sourced[k] || []).length : s.sourced[k]));
// Set your own value. Setting it back to exactly what the sources say clears your value, so later fills keep it current.
export function setField(s, k, v) {
  const src = s.sourced ? s.sourced[k] : undefined;
  const same = LIST_KEYS.includes(k) ? JSON.stringify(v) === JSON.stringify(src || []) && (src || []).length : v === src && !!src;
  s[k] = same ? null : v;
}
