// Seasons and episodes on a TV show's page, and where you are in it (progress.js).
// Episode lists come from TMDB when a season is opened and are cached on the device, not stored in the list.
// Titles, summaries and stills count as spoilers: shown up to where you are, or for everything with Show spoilers on.
import { el, toast, today } from './util.js';
import { readOnly, save, canEdit } from './state.js';
import { spoilerStatusNames, statusNames } from './categories.js';
import { getDetails, getSeasonEpisodes } from './tmdb.js';
import { setStatus } from './library.js';
import { fmtDate, waitingStatus, seasonCounts, FINISHED } from './facts.js';
import { thumb } from './images.js';
import { getProgress, setProgress, epLabel, cmpEp, nextAfter, prevBefore, watched, unlocked } from './progress.js';

const DAY = 864e5;
const isOver = (d) => /ended|canceled/i.test(d.status || '');
const aired = (iso) => !!iso && iso <= today();

// Everything the show page needs for one TV show: the "Up next" line for the header and the Episodes card.
// onStatus() runs when a prompt here changes My status, so the page can update its status menu.
export function episodesFor(s, { onStatus } = {}) {
  if (!s.tmdb || !s.tmdb.id || s.tmdb.type !== 'tv') return null;
  const t = s.tmdb;
  const over = s.facts && /Ended|Canceled/.test(s.facts.status);
  const detailsP = getDetails(t, over ? undefined : DAY);
  const upNext = el('div', { class: 'up-next', hidden: true });
  const card = el('section', { class: 'card episodes' });
  let d = null;
  let counts = [];
  let lastAired = null; // { season, episode } of the newest aired episode
  const rows = new Map(); // season number -> { row, draw } for seasons opened so far

  function refresh() {
    drawUpNext();
    drawHead();
    for (const r of rows.values()) r.draw();
    for (const r of seasonRowsList) r.summary();
  }
  // Mark everything up to this episode as watched, then offer a status change if you're caught up.
  function markTo(p, { undoable = true } = {}) {
    if (!canEdit()) return;
    const before = getProgress(s);
    setProgress(s, p && p.season, p && p.episode);
    refresh();
    const undo = { label: 'Undo', run: () => { setProgress(s, before && before.season, before && before.episode); refresh(); } };
    const next = p && nextAfter(p, counts);
    const caughtUp = p && lastAired && cmpEp(p, lastAired) >= 0;
    if (caughtUp && (!next || isOver(d) || !aired(nextAirOf(next)))) {
      const target = isOver(d) && !next ? FINISHED : !isOver(d) ? waitingStatus(statusNames()) : null;
      if (target && s.status !== target && statusNames().includes(target)) {
        toast(isOver(d) ? `That was the last episode of ${s.title}.` : `You're caught up on ${s.title}.`, { label: `Set to ${target}`, run: () => {
          const on = setStatus(s, target); save({ quiet: true }); if (onStatus) onStatus(); refresh();
          toast(`${s.title}: ${target}${on ? ' · spoilers on' : ''}`);
        } });
        return;
      }
    }
    if (undoable) toast(p ? `Watched up to ${epLabel(p.season, p.episode)}` : 'Progress cleared', undo);
  }
  // The next episode's air date if its season is loaded or it's TMDB's announced next episode.
  function nextAirOf(p) {
    const ne = d && d.next_episode_to_air;
    if (ne && ne.season_number === p.season && ne.episode_number === p.episode) return ne.air_date;
    const r = seasonData.get(p.season);
    const e = r && r.find((x) => x.ep === p.episode);
    if (e) return e.air;
    return lastAired && cmpEp(p, lastAired) <= 0 ? today() : null;
  }
  const seasonData = new Map(); // season -> episodes, once loaded

  function drawUpNext() {
    if (!d) return;
    const p = getProgress(s);
    const next = nextAfter(p, counts);
    const bits = [];
    const btn = (label, target) => (readOnly ? null : el('button', { class: 'btn small primary', onclick: () => markTo(target) }, label));
    if (next && (!lastAired || cmpEp(next, lastAired) <= 0)) {
      bits.push(el('span', {}, el('span', { class: 'muted' }, p ? 'Up next: ' : 'Start with '), el('b', {}, epLabel(next.season, next.episode))),
        btn('Watched it', next));
    } else if (p) {
      const ne = d.next_episode_to_air;
      bits.push(el('span', {}, el('span', { class: 'muted' }, isOver(d) && !next ? 'Watched all of it' : 'Caught up'),
        ` through ${epLabel(p.season, p.episode)}`,
        ne && !isOver(d) ? el('span', { class: 'muted' }, ` · ${epLabel(ne.season_number, ne.episode_number)} airs ${fmtDate(ne.air_date)}`) : null));
    } else {
      upNext.hidden = true;
      return;
    }
    if (p && !readOnly) bits.push(el('button', { class: 'btn small ghost', title: 'Clear where you are', onclick: () => { if (confirm(`Clear your progress in ${s.title}?`)) markTo(null); } }, 'Reset'));
    upNext.replaceChildren(...bits.filter(Boolean));
    upNext.hidden = false;
  }

  // Header: title, the Show spoilers switch, and a note on what's hidden.
  const head = el('div', { class: 'stills-head' });
  const note = el('p', { class: 'muted small' });
  function drawHead() {
    const box = el('input', { type: 'checkbox', role: 'switch', checked: !!s.spoilers, disabled: readOnly,
      onchange: () => {
        if (!canEdit()) { box.checked = !!s.spoilers; return; }
        s.spoilers = box.checked;
        save({ quiet: true });
        toast(s.spoilers ? 'Spoilers on: every episode shown' : 'Spoilers off: episodes past where you are hidden');
        refresh();
      } });
    head.replaceChildren(el('h2', {}, 'Episodes'),
      el('label', { class: 'switch' }, box, el('span', { class: 'switch-track', 'aria-hidden': 'true' }), 'Show spoilers'));
    const names = spoilerStatusNames();
    const auto = names.length ? ` Setting the status to ${names.join(', ').replace(/, ([^,]*)$/, ' or $1')} turns it on.` : '';
    note.textContent = s.spoilers ? '' : `Titles, summaries and stills are shown up to where you are, so they don't spoil what you haven't seen.${auto}`;
    note.hidden = !!s.spoilers;
  }

  const list = el('div', { class: 'season-rows' }, el('p', { class: 'muted small' }, 'Loading seasons…'));
  const seasonRowsList = [];
  card.append(head, note, list);
  drawHead();

  function seasonRow(x, openNow) {
    const n = x.season_number;
    const label = n === 0 ? 'Specials' : `Season ${n}`;
    const sum = el('span', { class: 'muted small' });
    const body = el('div', { class: 'ep-list' });
    const row = el('details', { class: 'season-row', open: openNow }, el('summary', {}, label, sum), body);
    const summary = () => {
      const p = getProgress(s);
      const seen = n === 0 || !p ? 0 : n < p.season ? x.episode_count : n === p.season ? Math.min(p.episode, x.episode_count) : 0;
      const when = x.air_date && !aired(x.air_date) ? ` · starts ${fmtDate(x.air_date)}` : '';
      sum.textContent = ` · ${x.episode_count} episode${x.episode_count === 1 ? '' : 's'}${seen ? ` · ${seen === x.episode_count ? 'all' : seen} watched` : ''}${when}`;
    };
    summary();
    seasonRowsList.push({ summary });
    let loaded = false;
    const draw = () => {
      const eps = seasonData.get(n);
      if (!eps) return;
      if (!eps.length) { body.replaceChildren(el('p', { class: 'muted small' }, 'No episodes listed on TMDB.')); return; }
      const stills = eps.filter((e) => e.still && unlocked(s, n, e.ep)).map((e) => ({ path: e.still, ep: e.ep }));
      const caption = (e) => epLabel(n, e.ep);
      body.replaceChildren(...eps.map((e) => episodeRow(n, e, stills, caption)));
    };
    const load = () => {
      if (loaded) return;
      loaded = true;
      body.replaceChildren(el('p', { class: 'muted small' }, 'Loading episodes…'));
      const current = !isOver(d) && lastAired && n >= lastAired.season;
      getSeasonEpisodes(t, n, current ? DAY : undefined).then((eps) => {
        seasonData.set(n, eps);
        rows.set(n, { row, draw });
        draw();
      }).catch((e) => { loaded = false; body.replaceChildren(el('p', { class: 'muted small' }, e.message)); });
    };
    row.addEventListener('toggle', () => { if (row.open) load(); });
    if (openNow) load();
    return row;
  }

  function episodeRow(n, e, stills, caption) {
    const open = unlocked(s, n, e.ep);
    const isAired = aired(e.air);
    const done = watched(s, n, e.ep);
    const p = getProgress(s);
    const isCur = p && p.season === n && p.episode === e.ep;
    const tick = n === 0 || readOnly || !isAired ? null : el('button', {
      class: `ep-tick ${done ? 'on' : ''}`, 'aria-pressed': String(done),
      title: isCur ? 'Un-mark this episode' : done ? 'Watched. Tap to go back to here' : 'Mark watched up to here',
      'aria-label': `${epLabel(n, e.ep)}: ${done ? 'watched' : 'mark watched up to here'}`,
      onclick: () => markTo(isCur ? prevBefore(p, counts) : { season: n, episode: e.ep }),
    }, done ? '✓' : '');
    const i = stills.findIndex((x) => x.ep === e.ep);
    const pic = open && e.still && i >= 0 ? thumb(stills, i, 'w300', 'ep-still', caption) : null;
    const when = !e.air ? 'Air date not announced' : isAired ? fmtDate(e.air) : `Airs ${fmtDate(e.air)}`;
    return el('div', { class: `ep-row ${done ? 'done' : ''} ${isAired ? '' : 'unaired'}` },
      tick || el('span', { class: 'ep-tick-space' }),
      pic,
      el('div', { class: 'ep-body' },
        el('div', {}, el('b', {}, epLabel(n, e.ep)), open && e.name ? ` ${e.name}` : null),
        el('div', { class: 'muted small' }, [when, e.runtime ? `${e.runtime} min` : ''].filter(Boolean).join(' · ')),
        open && e.overview ? el('div', { class: 'small clamp ep-overview' }, e.overview) : null));
  }

  detailsP.then((details) => {
    d = details;
    counts = seasonCounts(d.seasons);
    const le = d.last_episode_to_air;
    lastAired = le ? { season: le.season_number, episode: le.episode_number } : null;
    const seasons = (d.seasons || []).filter((x) => x.episode_count > 0)
      .sort((a, b) => (a.season_number || 999) - (b.season_number || 999)); // specials (season 0) last
    if (!seasons.length) { list.replaceChildren(el('p', { class: 'muted small' }, 'No seasons listed on TMDB.')); return; }
    // The season you're in opens by default: the one with your next episode, or your last one if you're caught up.
    const p = getProgress(s);
    const next = nextAfter(p, counts);
    const openSeason = p ? (next && (!lastAired || cmpEp(next, lastAired) <= 0) ? next.season : p.season) : null;
    list.replaceChildren(...seasons.map((x) => seasonRow(x, x.season_number === openSeason)));
    drawUpNext();
  }).catch((e) => list.replaceChildren(el('p', { class: 'muted small' }, e.message)));

  return { upNext, card, refresh };
}
