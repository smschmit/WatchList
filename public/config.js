// Cloud sync settings. The publishable key is designed to be public; access to data
// is enforced by the database rules in supabase/setup.sql.
window.WATCHLIST_CONFIG = {
  supabaseUrl: 'https://ptbuvhlkfimbodftdkze.supabase.co',
  supabaseKey: 'sb_publishable_7gCTBqy7QoDinaUu5lx7_g_JTg6Ptk1',
  // The only account that can edit. Everyone else is view-only (also enforced in the database).
  ownerEmail: 'stephanie@bostonprivatetutors.com',
  // Local testing only: a TMDB "API Read Access Token" used directly when the app runs on localhost.
  // Never commit a real token here; on Netlify the token lives in the TMDB_TOKEN environment variable.
  tmdbDevToken: '',
};
