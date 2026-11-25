# To do

## Show and cast images (spoiler-safe)

Pull more images from TMDB, which the app already uses, without spoiling unwatched episodes.

- [ ] Backdrop gallery on the show page from `/tv/{id}/images` and `/movie/{id}/images`, with `include_image_language=en,null`. Use `append_to_response=images` on the existing details call to save a request.
- [ ] Episode stills (`/tv/{id}/season/{n}/episode/{e}/images`) only for titles marked Finished or Rewatching. Everything else gets backdrops only.
- [ ] Extra actor headshots from `/person/{id}/images`.
- [ ] Add each new endpoint to the allowlist in `netlify/functions/tmdb.mjs`.
- [ ] Add the TMDB credit line ("This product uses the TMDB API but is not endorsed or certified by TMDB").

Spoiler notes:
- Late-season promo backdrops can still give things away. Consider preferring older or lower-numbered images.
- `aggregate_credits` includes actors who only appear in later seasons, and the episode counts the app shows can hint at who sticks around. Consider limiting cast to season 1 for titles you haven't finished.
- Episode titles and summaries leak more than pictures do. Don't show them for unwatched episodes.
- Later option: track a current episode per show and show stills only up to that point. Needs a new field.
- Fallback option: blurred stills with tap to reveal.

Other image sources if TMDB falls short: TVmaze (free, no key, character photos, CC BY-SA attribution) and Fanart.tv (free key, logos and art).
