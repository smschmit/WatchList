// Cloud sync settings. The publishable key is designed to be public; access to data
// is enforced by the database rules in supabase/setup.sql.
window.WATCHLIST_CONFIG = {
  supabaseUrl: '', // e.g. 'https://abcdefgh.supabase.co'
  supabaseKey: '', // the project's publishable key (sb_publishable_...)
  // The only account that can edit. Everyone else is view-only (also enforced in the database).
  ownerEmail: 'smschmit@gmail.com',
  // Local testing only: a TMDB "API Read Access Token" used directly when the app runs on localhost.
  // Never commit a real token here; on Netlify the token lives in the TMDB_TOKEN environment variable.
  tmdbDevToken: '',
};
