# Watch List: to do

Remaining plan for future features. Done so far: module split (`public/js/`), TMDB facts kept apart from your Show status, and the Updates page with a manual check button.

## Next up

- [ ] **Try the Updates page on real data.** Merge the branch, let Netlify deploy, run one check, and look over the results. So far it has only been tested against made-up TMDB answers.
- [ ] **Link the remaining TV shows to TMDB** (☰ → TMDB → Link titles). Unlinked shows can't be checked or recommended from.
- [ ] **Work through the first "Show status to review" list.** Expect a long list: 214 shows had no Show status.

## Show images (spoiler-safe)

Pull more images from TMDB, which the app already uses, without spoiling unwatched episodes.

### Decisions

- **Unlock rule:** a per-title **Show spoilers** switch (`spoilers: true/false`), separate from status. Statuses stay as they are. When on, all episode stills for every season are shown.
- **Auto-on:** setting the status to **Finished**, **Rewatching** or **Dropped** turns the switch on. The app never turns it off; you can flip it either way by hand at any time, whatever the status.
- **Where the switch lives:** on the show page, next to the Stills section (TV only, since movies have no stills).
- **Movies:** always show backdrops, same top ~6 filter. No locking (movies have no episode stills).
- **Before unlock:** poster plus a small set of show-level backdrops. TMDB doesn't date backdrops or tie them to seasons, so "early only" can't be enforced. Use the top ~6 by vote with no text (`iso_639_1` null), which tend to be main key art. If that still spoils something, fall back to poster only.
- **Cast list:** leave as is. It keeps the full cast and the episode counts.
- **Stills layout:** a collapsed "Stills" section on the show page, one row per season. A season's stills load only when you open that row, so nothing is fetched for locked shows or for seasons you don't open.
- **Episode text:** show only "S2 · E4" next to each still, no titles or summaries.

### Build steps

- [ ] Allowlist `/tv/{id}/images` and `/tv/{id}/season/{n}/episode/{e}/images` (or `/tv/{id}/season/{n}` with `append_to_response=images`) in `netlify/functions/tmdb.mjs`.
- [ ] Backdrop strip on the show page (TMDB calls live in `public/js/tmdb.js`). Fetch with `append_to_response=images&include_image_language=en,null` on the existing details call, then filter and cap as above.
- [ ] Backdrop strip on movie pages too (`/movie/{id}` details with the same `append_to_response=images`).
- [ ] Add `spoilers` (boolean, default false) to the show model in `public/js/state.js` (`normShow` and `SHOW_KEYS`). Data is stored as JSON in Supabase, so no migration.
- [ ] Keep the auto-on statuses in one list (e.g. `SPOILER_STATUSES`) and set `spoilers = true` wherever status is changed (status menu, show editor). Status names are editable now (`public/js/categories.js`), so a renamed Finished/Rewatching/Dropped would stop triggering it: either update the list on rename or let each status option carry a "turns on spoilers" flag.
- [ ] Show spoilers switch on TV show pages.
- [ ] Stills section, rendered only when `spoilers` is true, with lazy per-season loading and caching in the existing TMDB cache. Re-render when the switch or status changes.
- [ ] Decide whether the sheet export (`apps-script/`) should include the new column.
- [ ] List any new files under `public/js/` in `ASSETS` in `public/sw.js` and bump the version (see Housekeeping).
- [ ] TMDB credit line ("This product uses the TMDB API but is not endorsed or certified by TMDB").

### Maybe later

- A "Spoilers on" filter in the browse view.
- Extra actor headshots from `/person/{id}/images`.
- Track a current episode per show and unlock stills up to that point.

Other image sources if TMDB falls short: TVmaze (free, no key, character photos, CC BY-SA attribution) and Fanart.tv (free key, logos and art).

## Collections ("my type of sitcoms", "my favorite crime thrillers")

- [ ] Each collection has a name, a plain-language description, an optional saved filter, and titles pinned in or left out by hand.
- [ ] Collections show on the home page above the browse columns.
- [ ] **Clean up tags at the same time.** There are 912 distinct tags, with synonyms and overlap with genres (for example, "Dark Comedy" is both). Rule-based collections will miss shows until this is done.
- [ ] Later: use the description to sort existing shows into a collection, and to drive "more like this" recommendations.

## Recommendations

- [ ] **Add a quick rating** (loved / liked / meh) so recommendations have more to go on than Top 50 and Finished vs Dropped.
- [ ] **Add a Suggestions queue, kept separate from the main list.** Each suggestion has **Add** and **Not interested**, and dismissals are remembered so they don't come back.
- [ ] **Find candidates using TMDB data only:** TMDB's recommended and similar titles for your Top 50, favorite actors' credits, and discovery by genre or keyword. Drop anything already on the list or dismissed. The TMDB proxy (`netlify/functions/tmdb.mjs`) needs these lookups added to its allowed list.
- [ ] **Rank candidates:** start with simple overlap scoring against your Top 50 titles. Optionally have Claude rank them with a reason for each (see the open decisions).

## New titles

- [ ] **Favorite actors' new projects.** Compare each actor's saved credits with TMDB's current ones and add new ones to Updates.
- [ ] Optional: list new and trending titles that fit your collections.

## Open decisions

- [ ] **Where suggestions go:** a separate queue (recommended) or straight onto the list as "Recommended", as now.
- [ ] **Claude in the app:** do you want it? It needs an Anthropic API key and costs per use. The cheaper alternative is an "export my taste profile" button to paste into Claude, then importing the results.
- [ ] **Viewers:** should people you share with see collections and suggestions, or only the list?
- [ ] **Automatic checks:** later, optionally, a nightly check plus phone notifications. That needs a Supabase admin key stored as a secret in Netlify, and machine-generated data would then move to its own tables so a background job can't overwrite your edits. For now, the manual button.

## Housekeeping

- [ ] When you add files under `public/js/`, list them in `ASSETS` in `public/sw.js`, and bump `CACHE` together with `APP_VERSION` in `public/js/version.js`.
