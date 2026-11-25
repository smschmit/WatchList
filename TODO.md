# Watch List: to do

Remaining plan for future features. Done so far: module split (`public/js/`), TMDB facts kept apart from your Show status, the Updates page with a manual check button, the Fiction / Tone / Era / Setting fields with Fill from TMDB, Tag cleanup, the Tag Deck, and spoiler-safe show images.

## Next up

- [ ] **Try the Updates page on real data.** Merge the branch, let Netlify deploy, run one check, and look over the results. So far it has only been tested against made-up TMDB answers.
- [ ] **Link the remaining TV shows to TMDB** (☰ → TMDB → Link titles). Unlinked shows can't be checked or recommended from.
- [ ] **Work through the first "Show status to review" list.** Expect a long list: 214 shows had no Show status.

- [ ] **Plan: make Updates checks faster.** Finished shows are now always checked (about 310 more shows per run), so a full check is slow. Ideas to weigh, not decided:
  - Check ended/canceled Finished shows less often (e.g. once a month) instead of every run.
  - Use TMDB's `/tv/changes` feed to check only shows that changed since the last run.
  - Run more checks at once than the current 4.
  - Run checks in the background on a schedule (Netlify scheduled function) so the page shows results instead of waiting.

## Fields and tags (next steps)

- [ ] **Deploy, then run Fill from TMDB:** **Try 10 first**, look at a few show pages, then fill the rest. Needs the Netlify deploy (the TMDB proxy now allows keyword lookups). Tested on 99 of your shows: Setting came from Wikidata for 42%, TMDB keywords 16%, nothing 43%; Era from Wikidata 8%, keywords 19%, a Present day guess 60%, nothing 13%; Tone from keywords 13%, genres 12%, nothing 74%.
- [ ] **Tag cleanup in this order:** merge spellings → remove genre repeats → move Fiction/Tone tags → answer the ambiguous ones → remove setting, era and origin tags (after the fill) → one-offs.
- [ ] **Tag Deck:** work through the shows with no or one-off tags first. Check Era where it says "guess", and fill Tone (TMDB rarely has it).
- [ ] Later: **Tag Mode**. Pick one tag and swipe through shows that might fit it; right adds the tag, left skips.

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

### Built (v0.6.0)

- [x] Proxy allows `/{tv|movie}/{id}/images` and `/tv/{id}/season/{n}`.
- [x] Backdrop strip on show, movie and title pages (top 6 text-free backdrops by vote, from a separate `/images` call so the cached details stay small). Tap one for a full-size viewer.
- [x] `spoilers` on the show model; each status option carries a "Turns on spoilers" flag (Account → Status options), so renaming keeps it. Finished, Rewatching and Dropped have it by default.
- [x] Show spoilers switch and per-season Stills rows on TV show pages; a season loads only when opened (one still per episode from the season details, labeled "S2 · E4" only).
- [x] TMDB credit line (Account page and README).

### Still open

- [ ] **Try it on real data** after deploy, and check whether the top-6 backdrops spoil anything on shows you're mid-way through. If they do, the fallback is poster only before unlock.
- [ ] Decide whether the sheet export (`apps-script/`) should include a Spoilers column. Left out for now.
- [ ] Stills use one image per episode (what the season lookup returns). More per episode would need `/tv/{id}/season/{n}/episode/{e}/images`, one call per episode.

### Maybe later

- A "Spoilers on" filter in the browse view.
- Extra actor headshots from `/person/{id}/images`.
- Track a current episode per show and unlock stills up to that point.

Other image sources if TMDB falls short: TVmaze (free, no key, character photos, CC BY-SA attribution) and Fanart.tv (free key, logos and art).

## Collections ("my type of sitcoms", "my favorite crime thrillers")

- [ ] Each collection has a name, a plain-language description, an optional saved filter, and titles pinned in or left out by hand.
- [ ] Collections show on the home page above the browse columns.
- [x] **Clean up tags at the same time.** Tag cleanup and the Tag Deck are built (see above); collections can use Fiction, Tone, Era and Setting as well as tags.
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
