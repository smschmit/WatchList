# v0.8.0: things to test by hand

Everything below was run in a headless browser against real TMDB data and a copy of the seed list, but not on your real list, your phone, the live Netlify site, or two devices syncing. Those are what this list covers. Tick as you go.

## Before you start

- [ ] Netlify has deployed and the app shows **v0.8.0** (Account). If it still says 0.7.23, pull to refresh or reopen the app once.
- [ ] Sync every device first (open the app on each and let it say "Synced"), so the cloud copy is current.

## ✓ Seen it

- [ ] Add page: search a movie you've seen, tap **✓ Seen it**. It shows "On your list · Finished"; **Undo** in the toast removes it.
- [ ] Same for a TV show; open it and check **Show spoilers** is on.
- [ ] A title's own page (tap a search result): **✓ Seen it** adds it and opens the show page; Undo takes you back.
- [ ] Actor filmography on your phone: the + and ✓ icon buttons fit on each row without squashing the title.

## Actor page and Actors search

- [ ] On an actor you know well, **Seen** shows a count and filters to what you've seen; tap again to clear. Same for **Plan to see**.
- [ ] Turn on Seen, then **Use as default** in Filters: the next actor page opens on Seen. **Forget default** undoes it.
- [ ] Actors page: typing filters your favorites at once; actors not in favorites show under "On TMDB" with Known for (titles on your list in bold).
- [ ] Search, open an actor, press Back: the search and results are still there.
- [ ] Heart someone from the search results: they move up into Favorites.
- [ ] A long-running show with many hearted guest actors (e.g. Law & Order): the ♥ line is short with "+N more". (Each actor's page needs opening once after the update to learn their episode counts.)

## Episodes and where you are

- [ ] A show you're partway through: the header says **Start with S1 · E1**. Open the season you're on and tick the last episode you watched: everything before it is ticked, the header says **Up next**.
- [ ] Episodes past where you are show only "S2 · E6" and the date: no title, summary or still.
- [ ] **Watched it** in the header moves you on by one, rolling into the next season.
- [ ] Tap the ✓ on the episode you're on: it steps back one.
- [ ] Tick the last episode of a show that's ended: the toast offers **Set to Finished**. For one still airing it offers **Paused Between Seasons**.
- [ ] Show spoilers on: every episode's title, summary and still appears.
- [ ] Stills open full size and the arrows move through that season.
- [ ] Mark progress on your phone, then open the same show on the laptop after it syncs: same place. Edit the show's notes on one device and progress on the other before syncing: both survive.
- [ ] Read-only viewer: sees episodes and progress, no ✓ buttons.

## Where to watch

- [ ] Account → **Where to watch** → **Services and check**: region is United States; tick the services you pay for.
- [ ] A show page highlights your services ✓ and lists them first; the note says "On your services" or "Not on your services".
- [ ] **Try 10 first**, then **Check N titles** (about 1,200; takes a few minutes; you can leave the page and come back).
- [ ] Browse: **On my services** and **Where to watch** appear. Tap On my services, then add My status = Want to Watch: that's the watch-tonight list. Bookmark it.
- [ ] Look for oddities in service names (JustWatch's own "JustWatch TV" entries, live-TV services like YouTube TV / Philo showing under Stream).
- [ ] In a month or so: Updates shows **Now on your services** / **Left your services** when something moves.

## Updates

- [ ] **Check N shows** is noticeably smaller than before (finished, ended shows are skipped if checked in the last 30 days).
- [ ] A Waiting show with progress says "N new episodes since S3 · E8 · resume at S3 · E9". (Needs one check after the update: older checks didn't save episode counts.)
- [ ] **Check N favorite actors for new projects**: new titles appear under **New from your favorite actors**; **dismiss** one, **Dismiss all**, and they don't come back on the next check.

## Tag Mode

- [ ] Account → Tags → **Tag Mode**, pick a tag you use a lot. The reasons ("TMDB keyword…", "often goes with…") make sense and the first cards are good guesses.
- [ ] Swipe right / left on your phone; arrow keys on the laptop; **Undo**.
- [ ] Pick the same tag again later: shows you said no to don't come back. **Forget N no** brings them back.
- [ ] A list filtered by one tag has **Find more shows for …** under the filter bar.

## Collections

- [ ] Filter a list (e.g. Genre Comedy + Tone Light), tap **Save as collection**, name and describe it. It opens with the filter shown.
- [ ] Add a title by hand from the collection page; **Remove** one the filter found (then Undo).
- [ ] The home page shows Collections above the browse columns, with posters.
- [ ] A show page's **Collections** line: **+ Add to…** and the × to take it out.
- [ ] Change a list's filter and Save as collection → **Replace the filter of** an existing one.
- [ ] A viewer sees collections but can't edit them.

## Suggestions

- [ ] Browse → **Suggestions** → **Find suggestions** (first run takes a moment; up to 50 TMDB lookups, then cached two weeks).
- [ ] The top ones feel right and the "Because you liked…" reasons are believable.
- [ ] **+ Add** puts one on your list as Want to Watch; **Not interested** hides it for good (with Undo).
- [ ] **Copy taste profile**, paste into Claude, see whether the ideas are better.

## Export and storage

- [ ] **Update Google Sheet**: the "Watch list (app)" tab gains Progress, On My Services and Spoilers columns at the end.
- [ ] Download CSV: same columns.
- [ ] Account → **Storage on this device** on your phone and laptop: note the total and the TMDB-derived share (decides step 4 of the storage plan in TODO.md). Anything over ~3 MB means the IndexedDB move should come sooner.

## Live site only

- [ ] Suggestions work on the live site. They need the updated TMDB proxy (`/recommendations`), which only exists after the Netlify deploy; a "Lookup not allowed" error means the deploy hasn't happened.
- [ ] Images (posters, stills, backdrops, service logos) load. The test browser couldn't reach TMDB's image server, so they weren't checked.
