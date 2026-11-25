// Updates: ask TMDB about your TV shows (manual button), then list what changed and where your
// show status disagrees. Nothing on your list changes until you tap a button on a card.
import { el, toast } from '../util.js';
import { state, readOnly, save, canEdit } from '../state.js';
import { checkFacts, setStatus } from '../library.js';
import { labelClass, factClass, updateFor, factsSignature, describeNext, fmtDate, WAITING, READY } from '../facts.js';
import { poster, statusSelect } from '../ui.js';

// Kept outside the view so a check keeps going (and its progress shows) if you open a show and come back.
let checker = null; // { running, done, total, changed, missing, onProgress }

const linkedTv = () => state.shows.filter((s) => s.tmdb && s.tmdb.id && s.tmdb.type === 'tv');
// Shows you have as over, once TMDB has confirmed it, rarely change, so they're skipped unless asked
// (revivals are the exception the checkbox is for). Everything else, including never-checked shows, is checked.
const worthChecking = (s) => WAITING.includes(s.status) || labelClass(s.showStatus) !== 'over' || !s.facts || factClass(s.facts) !== 'over';

async function runCheck(list) {
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
  await Promise.all([worker(), worker(), worker(), worker()]);
  checker.running = false;
  save({ quiet: true });
  progress();
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
      checker && !checker.running && checker.done
        ? el('p', { class: 'small' }, `Checked ${checker.done}: ${checker.changed} changed since the last check${checker.missing ? `, ${checker.missing} no longer on TMDB` : ''}.`)
        : null].filter(Boolean));
  }

  function renderList() {
    const items = state.shows.map((s) => ({ s, u: updateFor(s) })).filter((x) => x.u)
      .sort((a, b) => a.s.title.localeCompare(b.s.title));
    const groups = [
      ['Ready to watch', 'Shows you were waiting on.', items.filter((x) => x.u.ready)],
      ['What changed', 'Since the previous check.', items.filter((x) => !x.u.ready && x.u.changes.length)],
      ['Show status to review', 'Your label and TMDB disagree, or TMDB has more seasons than your list.', items.filter((x) => !x.u.ready && !x.u.changes.length)],
    ];
    list.replaceChildren();
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
    if (u.conflict) lines.push(u.conflict.text);
    if (u.seasons) lines.push(`TMDB has ${u.seasons} seasons; your list says ${s.seasons}.`);
    const href = `#/show/${encodeURIComponent(s.id)}`;
    return el('div', { class: 'card update' },
      el('div', { class: 'update-head' }, el('a', { href, 'aria-hidden': 'true', tabindex: '-1' }, poster(s.tmdb && s.tmdb.poster)),
        el('div', {},
          el('div', { class: 'show-card-title' }, el('a', { href }, el('b', {}, s.title)), statusSelect(s)),
          el('div', { class: 'muted small' }, `Your show status: ${s.showStatus || '—'} · TMDB: ${f.status}${f.nextAir ? ` · ${describeNext(f)}` : ''}`),
          el('ul', { class: 'update-lines' }, lines.map((l) => el('li', {}, l))))),
      el('div', { class: 'btn-row' },
        u.ready ? el('button', { class: 'btn small primary', onclick: act(() => { setStatus(s, READY); }) }, 'Mark ready to watch') : null,
        u.conflict ? u.conflict.labels.map((l) => el('button', { class: 'btn small', onclick: act(() => { s.showStatus = l; }) }, `Show status: ${l}`)) : null,
        u.seasons ? el('button', { class: 'btn small', onclick: act(() => { s.seasons = u.seasons; if (f.episodes) s.episodes = f.episodes; }) },
          `Update to ${u.seasons} seasons`) : null,
        el('button', { class: 'btn small ghost', title: 'Hide until TMDB says something new', onclick: act(() => { s.factsAck = factsSignature(f); }) }, 'Dismiss')));
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
