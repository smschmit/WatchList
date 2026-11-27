// Watch List: browse a TV/movie watch list by any column, mark favorite actors, add their shows.
// Entry point: loads the list, wires up the pages and the search box, then starts cloud sync.
import { APP_VERSION } from './version.js';
import { setState, loadState, setRenderer } from './state.js';
import { route, go, listHash, filtersFrom, render, setViews, syncLastHash, goBack, goForward } from './router.js';
import { viewBrowse } from './views/browse.js';
import { viewList } from './views/list.js';
import { viewShow } from './views/show.js';
import { viewTitle } from './views/title.js';
import { viewActor, viewActors } from './views/actors.js';
import { viewAdd } from './views/add.js';
import { viewLink } from './views/link.js';
import { viewAccount } from './views/account.js';
import { viewUpdates } from './views/updates.js';
import { viewStatuses } from './views/statuses.js';
import { viewFill } from './views/fill.js';
import { viewTags } from './views/tags.js';
import { viewRecent } from './views/recent.js';
import { viewWatch } from './views/watch.js';
import { viewCollection } from './views/collections.js';
import { viewSuggestions } from './views/suggestions.js';
import { startCloud } from './cloud.js';
import { startFastScroll } from './fastscroll.js';
import { initPageTitle } from './pagetitle.js';

setViews({ browse: viewBrowse, list: viewList, show: viewShow, title: viewTitle, actor: viewActor, actors: viewActors,
  add: viewAdd, account: viewAccount, link: viewLink, updates: viewUpdates, statuses: viewStatuses, fill: viewFill, tags: viewTags,
  recent: viewRecent, watch: viewWatch, collection: viewCollection, suggestions: viewSuggestions });
setRenderer(render);
setState(loadState());

document.getElementById('app-version').textContent = `v${APP_VERSION}`;
document.getElementById('back-btn').addEventListener('click', goBack);
initPageTitle();
document.getElementById('fwd-btn').addEventListener('click', goForward);
document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = route();
  const filters = r.name === 'list' ? filtersFrom(r.params) : [];
  go(listHash(filters, document.getElementById('search').value.trim(), r.name === 'list' ? r.params.get('sort') : ''));
});
let searchTimer;
document.getElementById('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const r = route();
    const filters = r.name === 'list' ? filtersFrom(r.params) : [];
    const h = listHash(filters, e.target.value.trim(), r.name === 'list' ? r.params.get('sort') : '');
    if (r.name === 'list') history.replaceState(history.state, '', h); else history.pushState(null, '', h);
    syncLastHash();
    render();
  }, 250);
});
render();
startFastScroll();
startCloud();
