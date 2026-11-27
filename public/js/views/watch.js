// Where to watch (#/watch): the region, the services you pay for, and a bulk check that stores where each linked
// title streams (show.watch), for the browse categories and the Updates page.
import { el, toast, uniq } from '../util.js';
import { state, readOnly, save, canEdit, bulk } from '../state.js';
import { listHash } from '../router.js';
import { fetchWatchProviders, getProviderList } from '../tmdb.js';
import { fmtDate } from '../facts.js';
import { REGIONS, watchRegion, regionLabel, myServices, foldProviders, applyWatch, snapshotAge } from '../watch.js';
import { IMG } from '../ui.js';

const MONTH = 30 * 864e5;
let checker = null; // { running, done, total, missing, onProgress }
const linked = () => state.shows.filter((s) => s.tmdb && s.tmdb.id);

async function checkAll(list) {
  checker = { running: true, done: 0, total: list.length, missing: 0, onProgress: checker && checker.onProgress };
  const progress = () => checker.onProgress && checker.onProgress();
  progress();
  const region = watchRegion();
  let i = 0, since = 0;
  async function worker() {
    while (checker.running && i < list.length) {
      const s = list[i++];
      try {
        applyWatch(s, await fetchWatchProviders(s.tmdb, region));
        since++;
      } catch (e) {
        if (/\(404\)/.test(e.message)) checker.missing++;
        else { checker.running = false; toast(e.message); }
      }
      checker.done++;
      if (since >= 25) { since = 0; save({ quiet: true }); }
      progress();
    }
  }
  await bulk(async () => {
    await Promise.all(Array.from({ length: 6 }, worker));
    checker.running = false;
    save({ quiet: true });
  });
  progress();
}

export function viewWatch() {
  const wrap = el('div', { class: 'watch-page' }, el('h1', {}, 'Where to watch'));
  wrap.append(el('p', { class: 'muted small' }, 'Data from JustWatch via TMDB. Where to watch is kept apart from Network / platform, which stays the original network.'));
  if (readOnly) {
    wrap.append(el('p', { class: 'small' }, `Region: ${regionLabel(watchRegion())}. Services: ${myServices().join(', ') || 'none picked'}.`));
    return wrap;
  }
  // Region
  const regionSel = el('select', { 'aria-label': 'Region', onchange: () => {
    if (!canEdit()) return;
    state.watchRegion = regionSel.value;
    state.myServices = [];
    save();
    toast(`Region: ${regionLabel(regionSel.value)}. Pick your services for it below; stored results are looked up again.`);
  } }, REGIONS.map(([c, n]) => el('option', { value: c, selected: c === watchRegion() }, n)));
  wrap.append(el('section', { class: 'card' }, el('h2', {}, 'Region'),
    el('label', { class: 'inline' }, 'Show what streams in ', regionSel),
    el('p', { class: 'muted small' }, 'One region for the whole list. Changing it clears your services and makes stored results out of date.')));

  // My services
  const svcBox = el('div', { class: 'chips svc-picker' }, el('p', { class: 'muted small' }, 'Loading services…'));
  const svcFind = el('input', { type: 'search', placeholder: 'Find a service', 'aria-label': 'Find a service', class: 'find-input' });
  let all = [];
  let showAll = false;
  const drawServices = () => {
    const mine = myServices();
    const q = svcFind.value.trim().toLowerCase();
    let list = all.filter((p) => !q || p.name.toLowerCase().includes(q));
    const top = showAll || q ? list : list.filter((p, i) => i < 40 || mine.includes(p.name));
    svcBox.replaceChildren(...top.map((p) => {
      const on = mine.includes(p.name);
      return el('button', { class: `chip watch-chip pick-${on ? 'inc' : 'off'}`, 'aria-pressed': String(on), onclick: () => {
        if (!canEdit()) return;
        state.myServices = on ? mine.filter((n) => n !== p.name) : uniq([...mine, p.name]);
        save({ quiet: true });
        drawServices();
        countLine.textContent = summary();
      } }, p.logo ? el('img', { src: `${IMG}w92${p.logo}`, alt: '', loading: 'lazy' }) : null, el('span', {}, p.name), on ? el('span', { class: 'mine-mark' }, '✓') : null);
    }));
    if (top.length < list.length) svcBox.append(el('button', { class: 'btn small', onclick: () => { showAll = true; drawServices(); } }, `All ${list.length} services`));
    if (!list.length) svcBox.append(el('p', { class: 'muted small' }, 'No match.'));
  };
  const summary = () => (myServices().length ? `Yours: ${myServices().join(', ')}.` : 'None picked yet.');
  const countLine = el('p', { class: 'small' }, summary());
  svcFind.addEventListener('input', drawServices);
  getProviderList(watchRegion()).then((list) => {
    // One chip per service: plans and channels fold into it (Netflix Standard with Ads → Netflix).
    all = foldProviders(list).filter((p) => !p.via).sort((a, b) => a.order - b.order);
    drawServices();
  }).catch((e) => svcBox.replaceChildren(el('p', { class: 'muted small' }, e.message)));
  wrap.append(el('section', { class: 'card' }, el('h2', {}, 'My services'),
    el('p', { class: 'small' }, 'Tap the services you subscribe to. They’re highlighted on show pages, and “On my services” on Browse uses them.'),
    countLine, el('div', { class: 'row' }, svcFind), svcBox));

  // Bulk check
  const status = el('div', { class: 'card check-status' });
  let includeRecent = false;
  function drawStatus() {
    if (!wrap.isConnected && checker && checker.onProgress !== drawStatus) return;
    const list = linked();
    const todo = includeRecent ? list : list.filter((s) => snapshotAge(s) > MONTH);
    const last = list.map((s) => s.watch && s.watch.at).filter(Boolean).sort().pop();
    const checked = list.filter((s) => s.watch && s.watch.region === watchRegion()).length;
    status.replaceChildren(...[
      el('h2', {}, 'Check where to watch'),
      el('p', { class: 'small' }, `Looks up every linked title and saves where it streams, so you can browse by `,
        el('a', { href: listHash([{ cat: 'onmine', value: 'On my services' }]) }, 'On my services'), ' and ',
        el('a', { href: '#/' }, 'Where to watch'), '. Titles checked in the last 30 days are skipped unless you ask.'),
      el('p', { class: 'muted small' }, `${checked} of ${list.length} linked titles checked${last ? `, last on ${fmtDate(last)}` : ''}.`),
      checker && checker.running
        ? el('div', {}, el('progress', { max: checker.total, value: checker.done }),
          el('p', { class: 'small' }, `${checker.done} of ${checker.total} checked`),
          el('button', { class: 'btn', onclick: () => { checker.running = false; } }, 'Stop'))
        : el('div', { class: 'row' },
          el('button', { class: 'btn', disabled: !todo.length, onclick: () => checkAll(todo.slice(0, 10)) }, 'Try 10 first'),
          el('button', { class: 'btn primary', disabled: !todo.length, onclick: () => checkAll(todo) }, `Check ${todo.length} titles`),
          el('label', { class: 'inline small' }, el('input', { type: 'checkbox', checked: includeRecent, onchange: (e) => { includeRecent = e.target.checked; drawStatus(); } }),
            ' Include titles checked recently')),
      checker && !checker.running && checker.done
        ? el('p', { class: 'small' }, `Checked ${checker.done}${checker.missing ? `, ${checker.missing} no longer on TMDB` : ''}. `,
          el('a', { href: listHash([{ cat: 'status', value: 'Want to Watch' }, { cat: 'onmine', value: 'On my services' }]) }, 'Want to Watch on your services'))
        : null,
    ].filter(Boolean));
  }
  if (checker) checker.onProgress = drawStatus; else checker = { running: false, done: 0, onProgress: drawStatus };
  drawStatus();
  wrap.append(status);
  return wrap;
}
