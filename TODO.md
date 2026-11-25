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

## Seasons, episodes and songs

A season → episode guide on TV show pages, where you are in each show, and the songs you noticed in an episode.

### Data sources

- **Seasons and episodes:** TMDB, already in use. `/tv/{id}` gives the season list and `/tv/{id}/season/{n}` gives every episode (number, title, overview, air date, runtime, still). The proxy already allows both, and `getDetails` / `getSeasonStills` already fetch them. Nothing new to set up.
- **Songs:** TMDB has no music data, and no free source maps songs to episodes. Tunefind and WhatSong have the data but no public API, and scraping them breaks their terms and stops working without warning. So songs are **entered by you**, with a song search to fill in the details:
  - **iTunes Search API** (free, no key): title, artist, album, artwork, a 30-second preview and an Apple Music link. Goes through a small Netlify function like `tmdb.mjs`. Not yet tested: this environment couldn't reach `itunes.apple.com`, so check it works from Netlify first.
  - Plain links built from title + artist (Spotify, YouTube, Apple Music search) need no API at all and are the fallback.
  - A **Tunefind** link per episode (`tunefind.com/show/<slug>/season-<n>/<episode-id>`) is useful for looking a song up by hand; the episode id isn't predictable, so link to the show's Tunefind page instead.

### Proposed design

- **Episodes come from TMDB live, not stored.** Cached on the device like stills (7 days; 1 day for the current season of a show that's still airing). Only your own data is saved.
- **Where you are:** `show.progress = { season, episode, at }`, the last episode you've watched. One field, not a per-episode checklist, which is what matters for spoilers and "what's next" and keeps the synced list small. A per-episode `watched` map can come later if wanted.
- **Songs:** a new top-level list `state.songs = [{ id, showId, season, episode, title, artist, note, scene, link, art, addedAt }]`. A top-level list of items with ids already merges item by item in `cloud.js` (`mergeUnknown`), so edits on two devices both survive with no sync changes. Keeping songs off the show record also keeps the show list itself unchanged. Rough size: ~200 bytes a song, so 2,000 songs ≈ 400 KB next to today's ~650 KB list; fine for one Supabase row and localStorage. If it ever grows far past that, move songs to their own table.
- **Spoilers:** episode titles, overviews and stills are spoilers. Show them for episodes up to `progress`, or for everything when **Show spoilers** is on. Later episodes show only "S2 · E5" and the air date. This also covers the "unlock stills up to the current episode" item under Show images.

### Screens

- **Show page → Episodes card** (TV shows linked to TMDB), replacing the "Episode stills" part of Images: one collapsed row per season ("Season 2 · 10 episodes · 3 watched"), loaded when opened, the season after your progress open by default. Each episode row: S·E, title (if unlocked), air date, runtime, a ✓ to mark watched up to here, and a ♪ count when it has songs. Unaired episodes say "Airs Mar 4".
- **Episode page** (`#/episode/<showId>/<season>/<episode>`): still, title, overview (if unlocked), Mark watched, and the **Songs** list with **+ Add song**. Add song: search box (iTunes) with results as you type, or type title and artist by hand; optional scene note ("end credits", "the dance at the wedding"). Each song: artwork, title, artist, preview ▶ if there is one, links to listen.
- **Show header:** "Up next: S2 · E5" with **Watched it** (moves progress on, rolls to the next season). On Want to Watch / not started shows: "Start with S1 · E1".
- **Songs page** (`#/songs`, Account → Songs or a top-bar link): every song you've saved, newest first, searchable, grouped by show; tap goes to the episode. Shows with songs get a **Has songs** browse filter.
- **Read-only viewers** see episodes and songs but can't change progress or add songs (same `canEdit()` checks as today).

### Interactions with what's there

- **Status:** marking the last aired episode watched offers to set My status to Finished (or Paused Between Seasons if the show is still running). Setting Finished doesn't touch progress.
- **Updates page:** with progress known, "new season out" becomes "N new episodes since S3 · E8", and Waiting shows can say exactly where to resume.
- **Backups / CSV / sheet export:** songs go in the JSON backup automatically (they're in `state`). CSV and the Google Sheet get a "Progress" column; songs stay out of the sheet unless you want a second tab.

### Build order

1. [ ] Episodes card with seasons and episode rows from TMDB, spoiler rules, replaces the stills section (`images.js` → new `episodes.js`).
2. [ ] `show.progress`, the ✓ per episode, "Up next" in the show header, the Finished prompt.
3. [ ] Episode page and route.
4. [ ] `state.songs` with manual add / edit / delete on the episode page.
5. [ ] Netlify function for iTunes search, song search in Add song, previews and links.
6. [ ] Songs page and Has songs filter; Updates page uses progress.
7. [ ] README, `ASSETS` in `sw.js`, bump `CACHE` and `APP_VERSION`.

### Open decisions

- [ ] **Progress model:** last-watched episode (recommended) or a full per-episode watched checklist (handles skipping around and rewatches, more taps, bigger data).
- [ ] **Songs: just ones you noticed, or full soundtracks?** Full soundtracks would need Tunefind data, which means scraping or paying for access; recommended to start with your own.
- [ ] **Movies:** allow songs on movies too (no seasons; one song list per movie)? Cheap to add with `season`/`episode` left empty.
- [ ] **Song search source:** iTunes (no key, has previews) or Spotify (needs a developer app and key, better links if you use Spotify).

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
