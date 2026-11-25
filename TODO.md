# To do

## Show and cast images (spoiler-safe)

Pull more images from TMDB, which the app already uses, without spoiling unwatched episodes.

### Decisions

- **Unlock rule:** episode stills unlock when the status is **Finished**, **Rewatching** or **Dropped**. No separate button, and changing the status back locks them again.
- **Movies:** always show backdrops, same top ~6 filter. No locking (movies have no episode stills).
- **Before unlock:** poster plus a small set of show-level backdrops. TMDB doesn't date backdrops or tie them to seasons, so "early only" can't be enforced. Use the top ~6 by vote with no text (`iso_639_1` null), which tend to be main key art. If that still spoils something, fall back to poster only.
- **Cast list:** leave as is. It keeps the full cast and the episode counts.
- **Stills layout:** a collapsed "Stills" section on the show page, one row per season. A season's stills load only when you open that row, so nothing is fetched for locked shows or for seasons you don't open.
- **Episode text:** show only "S2 · E4" next to each still, no titles or summaries.

### Build steps

- [ ] Allowlist `/tv/{id}/images` and `/tv/{id}/season/{n}/episode/{e}/images` (or `/tv/{id}/season/{n}` with `append_to_response=images`) in `netlify/functions/tmdb.mjs`.
- [ ] Backdrop strip on the show page. Fetch with `append_to_response=images&include_image_language=en,null` on the existing details call, then filter and cap as above.
- [ ] Backdrop strip on movie pages too (`/movie/{id}` details with the same `append_to_response=images`).
- [ ] Stills section, rendered only when status is Finished, Rewatching or Dropped, with lazy per-season loading and caching in the existing TMDB cache.
- [ ] Re-render the section when the status changes from the status menu.
- [ ] TMDB credit line ("This product uses the TMDB API but is not endorsed or certified by TMDB").

### Maybe later

- Extra actor headshots from `/person/{id}/images`.
- Track a current episode per show and unlock stills up to that point.

Other image sources if TMDB falls short: TVmaze (free, no key, character photos, CC BY-SA attribution) and Fanart.tv (free key, logos and art).
