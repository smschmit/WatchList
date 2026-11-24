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
