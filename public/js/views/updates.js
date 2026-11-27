// Updates: ask TMDB about your TV shows (manual button), then list what changed and where your
// show status disagrees. Nothing on your list changes until you tap a button on a card.
import { el, toast } from '../util.js';
import { state, readOnly, save, canEdit, bulk, listShowFor } from '../state.js';
import { checkFacts, setStatus, refreshCredits } from '../library.js';
import { labelClass, factClass, updateFor, factsSignature, describeNext, fmtDate, WAITING, READY, FINISHED, waitingStatus } from '../facts.js';
import { poster, statusSelect, cardClick, favLine, titleHash } from '../ui.js';
import { statusNames } from '../categories.js';
import { getProgress, epLabel, episodesBetween, nextAfter } from '../progress.js';

// Statuses whose titles count for "Now on / Left your services": ones you mean to watch.
const WANTING = ['Want to Watch', 'Restart Planned', READY, ...WAITING];

// Kept outside the view so a check keeps going (and its progress shows) if you open a show and come back.
let checker = null; // { running, done, total, changed, missing, onProgress }

const linkedTv = () => state.shows.filter((s) => s.tmdb && s.tmdb.id && s.tmdb.type === 'tv');
// Shows you have as over, once TMDB has confirmed it, rarely change, so they're skipped unless asked
// (revivals are the exception the checkbox is for). Everything else, including never-checked shows, is checked.
// Finished shows are always checked, so a revival of something you watched to the end isn't missed.
// Finished shows TMDB already has as over are checked once a month rather than every run (revivals are rare, and
// there are hundreds of them); other finished shows are checked every time.
const MONTH = 30 * 864e5;
const checkedWithin = (s, ms) => !!(s.facts && s.facts.checkedAt) && Date.now() - new Date(`${s.facts.checkedAt}T12:00:00`).getTime() < ms;
const confirmedOver = (s) => !!s.facts && factClass(s.facts) === 'over';
const worthChecking = (s) => {
  if (s.status === FINISHED) return !confirmedOver(s) || !checkedWithin(s, MONTH);
  return WAITING.includes(s.status) || labelClass(s.showStatus) !== 'over' || !confirmedOver(s);
};

const runCheck = (list) => bulk(() => checkAll(list));
// Favorite actors: look up each one's credits again (skipping the cache) and note new projects (library.js noteNewCredits).
let actorCheck = null; // { running, done, total, found }
async function checkActors(onProgress) {
  const list = [...state.actors];
  actorCheck = { running: true, done: 0, total: list.length, found: 0 };
  onProgress();
  let i = 0;
  await bulk(async () => {
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (actorCheck.running && i < list.length) {
        const a = list[i++];
        const before = (a.news || []).length;
        try { await refreshCredits(a, { quiet: true, fresh: true }); } catch (e) { if (!/\(404\)/.test(e.message)) { actorCheck.running = false; toast(e.message); } }
        actorCheck.found += Math.max(0, (a.news || []).length - before);
        actorCheck.done++;
        onProgress();
      }
    }));
    actorCheck.running = false;
    save({ quiet: true });
  });
  onProgress();
}
async function checkAll(list) {
  checker = { running: true, done: 0, total: list.length, changed: 0, missing: 0, onProgress: checker && checker.onProgress };
  const progress = () => checker.onProgress && checker.onProgress();
  progress();
  let i = 0;
  let sinceSave = 0;
  async function worker() {
    while (checker.running && i < list.length) {
      const s = list[i++];
      try {
        if ((await checkFacts(s)).length) checker.changed++;
        sinceSave++;
      } catch (e) {
        if (/\(404\)/.test(e.message)) checker.missing++; // gone from TMDB: skip it
        else { checker.running = false; toast(e.message); }
      }
      checker.done++;
      if (sinceSave >= 25) { sinceSave = 0; save({ quiet: true }); }
      progress();
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker)); // TMDB allows ~40 requests a second; 6 at once stays well under
  checker.running = false;
  save({ quiet: true });
  progress();
}

// "4 new episodes since S3 · E8 · resume at S3 · E9", from where you are and the last check's episode counts.
export function resumeLine(s) {
  const p = getProgress(s);
  const f = s.facts;
  if (!p || !f || !f.lastSeason || !f.seasonEps) return null;
  const n = episodesBetween(p, { season: f.lastSeason, episode: f.lastEpisode }, f.seasonEps);
  if (!n) return null;
  const next = nextAfter(p, f.seasonEps);
  return `${n} new episode${n === 1 ? '' : 's'} since ${epLabel(p.season, p.episode)}${next ? ` · resume at ${epLabel(next.season, next.episode)}` : ''}`;
}

export function viewUpdates() {
  const wrap = el('div', { class: 'updates-page' }, el('h1', {}, 'Updates'));
  if (readOnly) return wrap.append(el('p', { class: 'muted' }, 'View only.')), wrap;
  let includeEnded = false;
  const status = el('div', { class: 'card check-status' });
  const list = el('div', { class: 'update-list' });

  function renderStatus() {
    const all = linkedTv();
    const todo = includeEnded ? all : all.filter(worthChecking);
    const checked = all.map((s) => s.facts && s.facts.checkedAt).filter(Boolean).sort();
    const unlinked = state.shows.filter((s) => !s.tmdb && !/movie|special/i.test(s.format)).length;
    status.replaceChildren(...[
      el('p', { class: 'small' }, 'Checking asks TMDB about your linked TV shows: whether they were renewed, canceled or ended, and whether a new season is out. ',
        'Your show status is your own label and only changes when you tap a button below.'),
      el('p', { class: 'muted small' }, checked.length ? `Last checked ${fmtDate(checked[checked.length - 1])}. ` : 'Not checked yet. ',
        unlinked ? el('span', {}, `${unlinked} TV shows aren't linked to TMDB yet and can't be checked (`, el('a', { href: '#/link' }, 'link them'), ').') : null),
      checker && checker.running
        ? el('div', {}, el('progress', { max: checker.total, value: checker.done }),
          el('p', { class: 'small' }, `${checker.done} of ${checker.total} checked, ${checker.changed} with news`),
          el('button', { class: 'btn', onclick: () => { checker.running = false; } }, 'Stop'))
        : el('div', { class: 'row' },
          el('button', { class: 'btn primary', disabled: !todo.length, onclick: () => runCheck(todo) }, `Check ${todo.length} shows`),
          el('label', { class: 'inline small' }, el('input', { type: 'checkbox', checked: includeEnded, onchange: (e) => { includeEnded = e.target.checked; renderStatus(); } }),
            ` Recheck shows TMDB already confirmed as ended or canceled (${all.length} in all)`)),
      includeEnded ? null : el('p', { class: 'muted small' }, 'Finished shows that TMDB has as ended or canceled are rechecked once a month, in case of a revival.'),
      checker && !checker.running && checker.done
        ? el('p', { class: 'small' }, `Checked ${checker.done}: ${checker.changed} changed since the last check${checker.missing ? `, ${checker.missing} no longer on TMDB` : ''}.`)
        : null,
      state.actors.length ? (actorCheck && actorCheck.running
        ? el('p', { class: 'small' }, `Checking favorite actors: ${actorCheck.done} of ${actorCheck.total}… `,
          el('button', { class: 'btn small', onclick: () => { actorCheck.running = false; } }, 'Stop'))
        : el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => checkActors(() => { if (wrap.isConnected) { renderStatus(); if (!actorCheck.running) renderList(); } }) },
            `Check ${state.actors.length} favorite actor${state.actors.length === 1 ? '' : 's'} for new projects`),
          actorCheck && actorCheck.done ? el('span', { class: 'small muted' }, `${actorCheck.found} new found.`) : null)) : null].filter(Boolean));
  }

  function renderList() {
    const items = state.shows.map((s) => ({ s, u: updateFor(s) })).filter((x) => x.u)
      .sort((a, b) => a.s.title.localeCompare(b.s.title));
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    const watchNews = state.shows.filter((s) => s.watch && s.watch.news && WANTING.includes(s.status)).sort(byTitle);
    const actorNews = state.actors.filter((a) => (a.news || []).length).sort((a, b) => a.name.localeCompare(b.name));
    const groups = [
      ['Ready to watch', 'Shows you were waiting on.', items.filter((x) => x.u.ready)],
      ['More coming', 'Shows you finished that have a new season on the way or out.', items.filter((x) => !x.u.ready && x.u.more)],
      ['What changed', 'Since the previous check.', items.filter((x) => !x.u.ready && !x.u.more && x.u.changes.length)],
      ['Show status to review', 'Your label and TMDB disagree, or TMDB has more seasons than your list.', items.filter((x) => !x.u.ready && !x.u.more && !x.u.changes.length)],
    ];
    list.replaceChildren();
    const joined = watchNews.filter((s) => s.watch.news.kind === 'joined');
    const left = watchNews.filter((s) => s.watch.news.kind === 'left');
    if (joined.length) list.append(el('h2', {}, `Now on your services (${joined.length})`),
      el('p', { class: 'muted small' }, 'Titles you want to watch that weren’t on any of your services at the last look, and now are.'), ...joined.map(watchCard));
    if (left.length) list.append(el('h2', {}, `Left your services (${left.length})`),
      el('p', { class: 'muted small' }, 'Titles you want to watch that were on one of your services and no longer are. TMDB gives no warning before they go.'), ...left.map(watchCard));
    if (actorNews.length) list.append(el('h2', {}, `New from your favorite actors (${actorNews.reduce((n, a) => n + a.news.length, 0)})`),
      el('p', { class: 'muted small' }, 'Projects that appeared in their TMDB credits since the last look.'), ...actorNews.map(actorCard));
    if (!items.length && (joined.length || left.length || actorNews.length)) return;
    if (!items.length) list.append(el('p', { class: 'muted' }, linkedTv().some((s) => s.facts) ? 'Nothing new. Everything matches TMDB.' : 'Run a check to see what\'s new.'));
    for (const [title, sub, xs] of groups) {
      if (!xs.length) continue;
      list.append(el('h2', {}, `${title} (${xs.length})`), el('p', { class: 'muted small' }, sub), ...xs.map(({ s, u }) => updateCard(s, u)));
    }
  }

  function updateCard(s, u) {
    const f = s.facts;
    // Any action means you've seen the changes; the card stays only if something else is still open.
    const act = (fn) => () => { if (!canEdit()) return; fn(); s.facts.changes = []; save({ quiet: true }); renderList(); };
    const lines = [...u.changes];
    if (u.ready) lines.push(u.ready);
    if (u.more) lines.push(u.more);
    if (u.conflict) lines.push(u.conflict.text);
    if (u.seasons) lines.push(`TMDB has ${u.seasons} seasons; your list says ${s.seasons}.`);
    const where = resumeLine(s);
    if (where && (u.ready || u.more || u.changes.length)) lines.push(where);
    const href = `#/show/${encodeURIComponent(s.id)}`;
    return el('div', { class: 'card update clickable', onclick: cardClick(href) },
      el('div', { class: 'update-head' }, el('a', { href, 'aria-hidden': 'true', tabindex: '-1' }, poster(s.tmdb && s.tmdb.poster)),
        el('div', {},
          el('div', { class: 'show-card-title' }, el('a', { href }, el('b', {}, s.title)), statusSelect(s)),
          el('div', { class: 'muted small' }, `Your show status: ${s.showStatus || '—'} · TMDB: ${f.status}${f.nextAir ? ` · ${describeNext(f)}` : ''}`),
          favLine(s),
          el('ul', { class: 'update-lines' }, lines.map((l) => el('li', {}, l))))),
      el('div', { class: 'btn-row' },
        u.ready ? el('button', { class: 'btn small primary', onclick: act(() => { setStatus(s, READY); }) }, 'Mark ready to watch') : null,
        u.more ? el('button', { class: 'btn small primary', onclick: act(() => { setStatus(s, waitingStatus(statusNames())); }) }, 'Waiting for next season') : null,
        u.more && u.seasons ? el('button', { class: 'btn small', onclick: act(() => { setStatus(s, READY); }) }, 'Mark ready to watch') : null,
        u.conflict ? u.conflict.labels.map((l) => el('button', { class: 'btn small', onclick: act(() => { s.showStatus = l; }) }, `Show status: ${l}`)) : null,
        u.seasons ? el('button', { class: 'btn small', onclick: act(() => { s.seasons = u.seasons; if (f.episodes) s.episodes = f.episodes; }) },
          `Update to ${u.seasons} seasons`) : null,
        el('button', { class: 'btn small ghost', title: 'Hide until TMDB says something new', onclick: act(() => { s.factsAck = factsSignature(f); }) }, 'Dismiss')));
  }

  function watchCard(s) {
    const n = s.watch.news;
    const href = `#/show/${encodeURIComponent(s.id)}`;
    return el('div', { class: 'card update clickable', onclick: cardClick(href) },
      el('div', { class: 'update-head' }, el('a', { href, 'aria-hidden': 'true', tabindex: '-1' }, poster(s.tmdb && s.tmdb.poster)),
        el('div', {},
          el('div', { class: 'show-card-title' }, el('a', { href }, el('b', {}, s.title)), statusSelect(s)),
          el('div', { class: 'small' }, n.kind === 'joined' ? `Now on ${n.names.join(', ')}` : `No longer on ${n.names.join(', ')}`,
            el('span', { class: 'muted' }, ` · noticed ${fmtDate(n.at)}`)),
          favLine(s))),
      el('div', { class: 'btn-row' }, el('button', { class: 'btn small ghost', onclick: () => {
        if (!canEdit()) return; delete s.watch.news; save({ quiet: true }); renderList();
      } }, 'Dismiss')));
  }
  function actorCard(a) {
    const dismiss = (keys) => {
      if (!canEdit()) return;
      a.newsSeen = [...new Set([...(a.newsSeen || []), ...keys])].slice(-200);
      a.news = a.news.filter((c) => !keys.includes(`${c.type}:${c.id}`));
      save({ quiet: true }); renderList();
    };
    return el('div', { class: 'card update' },
      el('div', { class: 'update-head' }, el('a', { href: `#/actor/${a.tmdbId}`, 'aria-hidden': 'true', tabindex: '-1' }, poster(a.profile, 'w185', 'poster')),
        el('div', {},
          el('div', {}, el('a', { href: `#/actor/${a.tmdbId}` }, el('b', {}, a.name))),
          el('ul', { class: 'update-lines' }, a.news.map((c) => {
            const mine = listShowFor(c);
            return el('li', {}, el('a', { href: titleHash(c, `Actor: ${a.name}`) }, c.title), ` ${c.year || 'no date yet'} · ${c.type === 'tv' ? 'TV' : 'Movie'}`,
              mine ? el('span', { class: 'muted' }, ` · on your list${mine.status ? ` (${mine.status})` : ''}`) : null,
              ' ', el('button', { class: 'linklike small', onclick: () => dismiss([`${c.type}:${c.id}`]) }, 'dismiss'));
          })))),
      el('div', { class: 'btn-row' }, el('button', { class: 'btn small ghost', onclick: () => dismiss(a.news.map((c) => `${c.type}:${c.id}`)) }, 'Dismiss all')));
  }

  const onProgress = () => {
    if (!wrap.isConnected && checker && checker.onProgress === onProgress) return; // page closed; a new visit takes over
    renderStatus();
    if (!checker || !checker.running) renderList();
  };
  if (checker) checker.onProgress = onProgress;
  else checker = { running: false, done: 0, onProgress };
  wrap.append(status, list);
  renderStatus();
  renderList();
  return wrap;
}
