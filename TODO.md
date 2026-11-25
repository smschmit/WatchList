# Watch List: to do

Remaining plan for future features. Done so far: module split (`public/js/`), TMDB facts kept apart from your Show status, the Updates page with a manual check button, the Fiction / Tone / Era / Setting fields with Fill from TMDB, Tag cleanup, the Tag Deck, and spoiler-safe show images.

## Next up

- [x] **Try the Updates page on real data.** Done.
- [x] **Link the remaining TV shows to TMDB.** Almost all done; a few left (Account → TMDB → Link titles).
- [x] **Work through the first "Show status to review" list.** Done.

- [ ] **Plan: make Updates checks faster.** Finished shows are now always checked (about 310 more shows per run), so a full check is slow. Ideas to weigh, not decided:
  - Check ended/canceled Finished shows less often (e.g. once a month) instead of every run.
  - Use TMDB's `/tv/changes` feed to check only shows that changed since the last run.
  - Run more checks at once than the current 4.
  - Run checks in the background on a schedule (Netlify scheduled function) so the page shows results instead of waiting.

## Fields and tags (next steps)

- [ ] **Fill from TMDB: fill the rest.** Try 10 looked fine; next, run **Fill N shows** (Account → TMDB → Fill from TMDB). Tested on 99 of your shows: Setting came from Wikidata for 42%, TMDB keywords 16%, nothing 43%; Era from Wikidata 8%, keywords 19%, a Present day guess 60%, nothing 13%; Tone from keywords 13%, genres 12%, nothing 74%.
- [ ] **Tag cleanup in this order:** merge spellings → remove genre repeats → move Fiction/Tone tags → answer the ambiguous ones → remove setting, era and origin tags (after the fill) → one-offs.
- [x] **Tag Deck felt like too much (v0.6.1):** shows now come in random order (unreviewed first), and Fiction / Tone / Era / Setting etc. are folded into a closed **Fields** section, so a card is mostly tags. Check whether that's enough, or whether Tag Mode replaces it.
- [ ] **Tag Mode (next).** Pick one tag and swipe through shows that might fit it; right adds the tag, left skips. Likely closer to what you want than the deck. To decide: how candidates are found (TMDB keywords, shows similar to ones already tagged, genre), and whether "no" is remembered.

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

- [x] **Try it on real data.** Images look good.
- [ ] Decide whether the sheet export (`apps-script/`) should include a Spoilers column. Left out for now.
- [ ] Stills use one image per episode (what the season lookup returns). More per episode would need `/tv/{id}/season/{n}/episode/{e}/images`, one call per episode.

### Maybe later

- A "Spoilers on" filter in the browse view.
- Extra actor headshots from `/person/{id}/images`.
- Track a current episode per show and unlock stills up to that point.

Other image sources if TMDB falls short: TVmaze (free, no key, character photos, CC BY-SA attribution) and Fanart.tv (free key, logos and art).

## Where to watch

Show where each title is streaming, renting or for sale, and answer the main question it raises: what on my Want to Watch list can I watch tonight on services I already pay for?

### Data source

- TMDB's `/{tv|movie}/{id}/watch/providers`, which the app's TMDB token already covers. Checked live: Breaking Bad returns US → Netflix (subscription), plus Amazon Video, Apple TV Store, Google Play, Fandango At Home (buy). Results are per country, split into `flatrate` (subscription), `free`, `ads`, `rent` and `buy`, each with provider id, name, logo and display priority.
- The data comes from JustWatch. TMDB's terms require crediting JustWatch wherever it's shown.
- Limits: no per-provider deep links (only one TMDB "watch" page per title, which links onward), no "leaving on" dates, no per-season detail. Unlinked titles get nothing, so linking the rest to TMDB matters more.
- `/watch/providers/{tv|movie}?watch_region=US` lists every provider in a region, for the "My services" picker.

### Proposed design

- **Kept apart from Network / platform.** `network` stays your original-network field and is never overwritten. Where to watch is TMDB data, stored like `facts`: `show.watch = { region, checkedAt, flatrate: [ids], free: [ids], ads: [ids], rent: [ids], buy: [ids] }`, never edited by hand. Provider names and logos live once in `state.providers` (id → name, logo), not on every show.
- **Region:** one setting, default US. Stored with the list, so every device and viewer sees the same region.
- **My services:** Account → Where to watch → pick the services you subscribe to from TMDB's provider list (logos). Saved in `state.myServices`.
- **Fold duplicate plans:** "Netflix Standard with Ads" → Netflix, "Amazon Prime Video with Ads" → Prime Video; Amazon/Apple/Roku "channels" (e.g. "HBO Max Amazon Channel") count as the parent service, labeled "via Amazon". A small hand-kept map, falling back to TMDB's name.
- **Show page:** a "Where to watch" line under the meta line: subscription services as logo chips (yours highlighted and listed first), then free/with ads, then a collapsed "Rent or buy from N stores". Each links to the TMDB watch page. "Data from JustWatch · checked 12 Nov". Opening the page refreshes the stored snapshot if it's over 7 days old.
- **Browse:** a **Where to watch** category (multi-value, subscription + free only, so rent/buy don't make every title count under Apple TV Store) and an **On my services** category (Yes / Rent or buy only / Not available / Not checked). Combined with My status = Want to Watch, that's the "watch tonight" list, and it's a bookmarkable link.
- **Bulk check:** Account → TMDB → **Check where to watch** for all linked titles, using the same few-at-a-time approach as the Updates check, with **Try 10 first**. Skips titles checked in the last 30 days unless asked. About 1,200 calls on a full run.
- **Updates page:** a "Now on your services" section for Want to Watch / Waiting titles that weren't on any of your services at the last check and now are. "Left your services" for titles that dropped off, since TMDB gives no warning before they go.
- **Proxy:** add `/^\/(tv|movie)\/\d+\/watch\/providers$/` and `/^\/watch\/providers\/(tv|movie)$/` to `ALLOWED` in `netlify/functions/tmdb.mjs`. Needs a deploy before anything works on the live site.
- **Credit:** add "Where to watch data from JustWatch" to the Account credit line and the README.

### Build order

- [x] **1. Show page line, live only (v0.7.6).** Proxy allows `/{tv|movie}/{id}/watch/providers` and `/watch/providers/{tv|movie}`; `public/js/watch.js` shows Stream / Free / Rent or buy on show and title pages (US), cached on the device for a day; plans and Amazon/Apple/Roku channels folded into one service; JustWatch credit on the block, Account page and README. A service in both Free and Stream is listed under Free only.
  - [ ] Try it on real shows after deploy; check the folding (live-TV services like YouTube TV, TBS, Spectrum also show under Stream, which step 2's My services highlighting should make less noisy).
- [ ] **2. Region and My services.** Account section with the provider picker; show page highlights yours.
- [ ] **3. Stored snapshot, bulk check, browse categories.** `show.watch`, `state.providers`, Check where to watch, Where to watch and On my services categories.
- [ ] **4. Updates integration.** Now on / left your services.

### Open decisions

- [ ] **Region:** US only, or should a second region be checkable (e.g. UK, for the BBC / Channel 4 / ITV titles)? Adds a picker and doubles bulk calls.
- [ ] **Rent and buy:** show them at all? They're on almost every title and add noise. Proposed: collapsed on the show page, left out of browse.
- [ ] **Stored on each show (synced) or on this device only?** Stored is needed for browse and Updates; device-only keeps the synced list smaller. Proposed: stored, ids only (a few bytes per show).
- [ ] **Sheet export:** add a "Where to watch" column with your services' names?
- [x] **Auto-fill Network from it?** Decided no: the original network and today's streamers are separate facts (The Office: NBC, now Peacock). Network stays your field.
- [ ] Later: use My services to filter recommendations (TMDB `/discover` takes `with_watch_providers` and `watch_region`).

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
