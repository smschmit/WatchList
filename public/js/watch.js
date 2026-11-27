// Where to watch: the services a title is on today, from TMDB (data from JustWatch). Kept apart from the
// Network / platform field, which is the original network and is never changed by this.
import { el, today, uniq } from './util.js';
import { state, readOnly, save } from './state.js';
import { getWatchProviders } from './tmdb.js';
import { IMG } from './ui.js';

// One region for the whole list (stored with it, so every device and viewer sees the same one). US unless changed.
export const REGIONS = [['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['AU', 'Australia'], ['IE', 'Ireland'],
  ['NZ', 'New Zealand'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'], ['SE', 'Sweden'],
  ['DK', 'Denmark'], ['NO', 'Norway'], ['IN', 'India'], ['JP', 'Japan'], ['KR', 'South Korea'], ['BR', 'Brazil'], ['MX', 'Mexico']];
export const watchRegion = () => state.watchRegion || 'US';
export const regionLabel = (code) => (REGIONS.find(([c]) => c === code) || [code, code])[1];
// The services you pay for, by folded service name ("Netflix", "HBO Max"), so every plan and channel of one counts.
export const myServices = () => (Array.isArray(state.myServices) ? state.myServices : []);
export const isMine = (name) => myServices().some((n) => n.toLowerCase() === String(name).toLowerCase());

// TMDB lists each plan and reseller separately ("Netflix Standard with Ads", "HBO Max Amazon Channel",
// "Peacock Premium Plus"). Fold them into one entry per service. A channel bought through Amazon, Apple or
// Roku keeps a "via" note, unless the service is also listed directly.
const ALIASES = [
  [/^Amazon Prime Video( with Ads)?$/i, 'Prime Video'],
  [/^Amazon Prime Video Free with Ads$/i, 'Prime Video'],
  [/^Netflix( Standard| Basic)? with Ads$/i, 'Netflix'],
  [/^Peacock Premium( Plus)?$/i, 'Peacock'],
  [/^Paramount (Plus|\+)( Premium| Essential| with Showtime)?$/i, 'Paramount+'],
  [/^Disney Plus$/i, 'Disney+'],
  [/^(AMC|MGM|Apple TV) Plus$/i, (m) => `${m[1]}+`],
  [/^Hulu \(?(No Ads|with Ads)\)?$/i, 'Hulu'],
];
const VIA = /\s+(Amazon Channel|Apple TV Channel|Roku Premium Channel)\s*$/i;
const VIA_NAME = { 'amazon channel': 'Amazon', 'apple tv channel': 'Apple TV', 'roku premium channel': 'Roku' };
export function serviceName(raw) {
  let name = (raw || '').trim();
  let via = '';
  const v = VIA.exec(name);
  if (v) { via = VIA_NAME[v[1].toLowerCase()]; name = name.slice(0, v.index).trim(); }
  for (const [re, to] of ALIASES) {
    const m = re.exec(name);
    if (m) { name = typeof to === 'function' ? to(m) : to; break; }
  }
  name = name.replace(/^(\w+) Plus$/, '$1+'); // Paramount Plus, Discovery Plus…
  return { name, via };
}
// One group's providers, folded by service and ordered by TMDB's display priority.
export function foldProviders(list) {
  const byName = new Map();
  for (const p of [...list].sort((a, b) => a.order - b.order)) {
    const { name, via } = serviceName(p.name);
    const key = name.toLowerCase(); // BritBox and Britbox are one service
    const have = byName.get(key);
    if (!have) byName.set(key, { name, via, logo: p.logo, order: p.order, ids: [p.id] });
    else {
      have.ids.push(p.id);
      if (have.via && !via) Object.assign(have, { via: '', logo: p.logo }); // listed directly too: drop the "via"
    }
  }
  return [...byName.values()];
}
// The groups shown: subscription, free (with or without ads), and rent or buy together. A service is listed
// once: free beats subscription (Prime Video's free-with-ads tier), and either beats rent or buy.
export function watchGroups(w) {
  const free = foldProviders([...w.free, ...w.ads]);
  const key = (x) => x.name.toLowerCase();
  const freeNames = new Set(free.map(key));
  const stream = foldProviders(w.flatrate).filter((x) => !freeNames.has(key(x)));
  const seen = new Set([...freeNames, ...stream.map(key)]);
  const shop = foldProviders([...w.rent, ...w.buy]).filter((x) => !seen.has(key(x)));
  return { stream, free, shop };
}

function chip(p, link) {
  const label = p.via ? `${p.name} (via ${p.via})` : p.name;
  const mine = isMine(p.name);
  const kids = [p.logo ? el('img', { src: `${IMG}w92${p.logo}`, alt: '', loading: 'lazy' }) : null, el('span', {}, label), mine ? el('span', { class: 'mine-mark', title: 'One of your services' }, '✓') : null];
  const cls = `chip watch-chip${mine ? ' mine' : ''}`;
  return link ? el('a', { class: cls, href: link, target: '_blank', rel: 'noopener', title: `${label}${mine ? ' (yours)' : ''}: see options on TMDB` }, kids)
    : el('span', { class: cls }, kids);
}
// Yours first, then TMDB's order.
const mineFirst = (list) => [...list].sort((a, b) => isMine(b.name) - isMine(a.name));

// ---------- Stored snapshot (show.watch) ----------
// What a lookup found, as service names: subscription and free (with or without ads), plus how many stores rent or sell it.
export function snapshotOf(w) {
  const { stream, free, shop } = watchGroups(w);
  return { stream: stream.map((x) => x.name), free: free.map((x) => x.name), shop: shop.length };
}
export function snapshotAge(s) {
  const w = s.watch;
  if (!w || !w.at || w.region !== watchRegion()) return Infinity;
  return Date.now() - new Date(`${w.at}T12:00:00`).getTime();
}
const yours = (x) => [...(x.stream || []), ...(x.free || [])].filter(isMine);
// Save a fresh lookup on the show. If it wasn't on any of your services before and now is (or the other way round),
// that's kept as news (watch.news) for the Updates page until dismissed. The caller saves.
export function applyWatch(s, w) {
  const snap = snapshotOf(w);
  const old = s.watch && s.watch.region === watchRegion() ? s.watch : null;
  let news = old && old.news ? old.news : null;
  if (old && myServices().length) {
    const was = yours(old), now = yours(snap);
    if (!was.length && now.length) news = { kind: 'joined', names: now, at: today() };
    else if (was.length && !now.length) news = { kind: 'left', names: was, at: today() };
    else if (news && ((news.kind === 'joined' && !now.length) || (news.kind === 'left' && now.length))) news = null;
    else if (news && news.kind === 'joined') news = { ...news, names: uniq(now) };
  }
  const changed = !old || JSON.stringify([old.stream, old.free, old.shop, old.news || null]) !== JSON.stringify([snap.stream, snap.free, snap.shop, news]);
  s.watch = { region: watchRegion(), at: today(), ...snap, ...(news ? { news } : {}) };
  return changed;
}
export const WATCH_MAX_AGE = 7 * 864e5;
function row(label, list, link) {
  return el('div', { class: 'watch-row' }, el('span', { class: 'watch-label muted small' }, label), el('div', { class: 'chips' }, mineFirst(list).map((p) => chip(p, link))));
}

// The "Where to watch" block for a TMDB title ({ type, id }). Shows a loading line, then the services,
// "Not streaming" when TMDB has nothing, or nothing at all if the lookup fails.
// `show`: the show on your list, whose stored snapshot is refreshed when it's over 7 days old (owner only).
export function whereToWatch(t, show = null) {
  if (!t || !t.id) return null;
  const region = watchRegion();
  const box = el('div', { class: 'where-to-watch' }, el('p', { class: 'muted small' }, 'Where to watch: loading…'));
  getWatchProviders(t, region).then((w) => {
    if (show && !readOnly && snapshotAge(show) > WATCH_MAX_AGE) { applyWatch(show, w); save({ quiet: true }); }
    const { stream, free, shop } = watchGroups(w);
    const mineCount = [...stream, ...free].filter((p) => isMine(p.name)).length;
    const credit = el('p', { class: 'muted small watch-credit' },
      myServices().length ? (mineCount ? 'On your services. ' : 'Not on your services. ') : el('span', {}, el('a', { href: '#/watch' }, 'Pick your services'), ' to see which are yours. '),
      `${regionLabel(region)}, data from JustWatch via TMDB`,
      w.link ? [' · ', el('a', { href: w.link, target: '_blank', rel: 'noopener' }, 'all options')] : null);
    const parts = [el('h3', { class: 'section' }, 'Where to watch')];
    if (stream.length) parts.push(row('Stream', stream, w.link));
    if (free.length) parts.push(row('Free', free, w.link));
    if (!stream.length && !free.length) parts.push(el('p', { class: 'small' }, shop.length ? 'Not streaming right now.' : 'Not listed anywhere right now.'));
    if (shop.length) parts.push(el('details', { class: 'watch-shop' },
      el('summary', { class: 'small' }, `Rent or buy from ${shop.length} store${shop.length === 1 ? '' : 's'}`),
      el('div', { class: 'chips' }, mineFirst(shop).map((p) => chip(p, w.link)))));
    parts.push(credit);
    box.replaceChildren(...parts);
  }).catch(() => box.remove());
  return box;
}
