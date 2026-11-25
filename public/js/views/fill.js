// Fill from TMDB: fill Fiction, Tone, Setting and Era (and blank Country / Language) for linked shows, with progress.
import { el } from '../util.js';
import { state, readOnly } from '../state.js';
import { listHash } from '../router.js';
import { fmtDate } from '../facts.js';
import { linkedShows, runFill, stopFill, filler } from '../fill.js';

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '0%');

export function viewFill() {
  const wrap = el('div', { class: 'fill-page' }, el('h1', {}, 'Fill from TMDB'));
  if (readOnly) return wrap.append(el('p', { class: 'muted' }, 'View only.')), wrap;
  let refill = false;
  const box = el('div', { class: 'card check-status' });
  const report = el('div');

  function render() {
    if (!wrap.isConnected && filler && filler.onProgress !== render) return;
    const all = linkedShows();
    const todo = refill ? all : all.filter((s) => !s.sourced);
    const last = all.map((s) => s.sourced && s.sourced.at).filter(Boolean).sort().pop();
    const unlinked = state.shows.length - all.length;
    box.replaceChildren(...[
      el('p', { class: 'small' }, 'Asks TMDB and Wikidata about your linked shows and fills in ',
        el('b', {}, 'Fiction, Tone, Setting and Era'), ', plus Country and Language where they are blank. ',
        'What the sources say is kept apart from your own values: anything you set yourself is never overwritten, and a later fill only updates the sourced part.'),
      el('p', { class: 'muted small' }, `${all.length - all.filter((s) => !s.sourced).length} of ${all.length} linked shows filled. `,
        last ? `Last fill ${fmtDate(last)}. ` : '',
        unlinked ? el('span', {}, `${unlinked} titles aren't linked to TMDB and can't be filled (`, el('a', { href: '#/link' }, 'link them'), ').') : null),
      filler && filler.running
        ? el('div', {}, el('progress', { max: filler.total, value: filler.done }),
          el('p', { class: 'small' }, `${filler.done} of ${filler.total} filled`),
          el('button', { class: 'btn', onclick: stopFill }, 'Stop'))
        : el('div', { class: 'row' },
          el('button', { class: 'btn', disabled: !todo.length, onclick: () => runFill(todo.slice(0, 10), render) }, 'Try 10 first'),
          el('button', { class: 'btn primary', disabled: !todo.length, onclick: () => runFill(todo, render) }, `Fill ${todo.length} shows`),
          el('label', { class: 'inline small' }, el('input', { type: 'checkbox', checked: refill, onchange: (e) => { refill = e.target.checked; render(); } }),
            ' Fill again shows already filled')),
      filler && filler.error ? el('p', { class: 'small error' }, filler.error) : null,
    ].filter(Boolean));
    report.replaceChildren();
    if (filler && filler.done && !filler.running) {
      const t = filler.tally, n = filler.done - filler.missing;
      const row = (label, counts) => el('tr', {}, el('th', {}, label), ...Object.entries(counts).map(([k, v]) => el('td', {}, `${k}: ${v} (${pct(v, n)})`)));
      report.append(el('section', { class: 'card' }, el('h2', {}, 'Where the answers came from'),
        el('p', { class: 'small' }, `${n} shows filled${filler.missing ? `, ${filler.missing} no longer on TMDB` : ''}. Wikidata knew ${t.wikidataFound} of them.`),
        el('table', { class: 'small tally' }, row('Setting', t.setting), row('Era', t.era), row('Tone', t.tone)),
        el('p', { class: 'muted small' }, '“guess” means Present day was assumed because nothing said otherwise. Check those in the Tag Deck.')));
    }
    // Shortcuts to the gaps.
    const blank = (k) => listHash([{ cat: k, value: '(not set)' }]);
    report.append(el('section', { class: 'card' }, el('h2', {}, 'Review'),
      el('div', { class: 'btn-row' },
        el('a', { class: 'btn small', href: blank('setting') }, 'No setting'),
        el('a', { class: 'btn small', href: blank('era') }, 'No era'),
        el('a', { class: 'btn small', href: blank('tone') }, 'No tone'),
        el('a', { class: 'btn small', href: '#/tags/deck' }, 'Open the Tag Deck'))));
  }
  if (filler) filler.onProgress = render;
  wrap.append(box, report);
  render();
  return wrap;
}
