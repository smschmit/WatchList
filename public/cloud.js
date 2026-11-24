'use strict';
// Cloud sync with Supabase (see supabase/setup.sql and config.js). Adapted from MedsApp.
//
// Owner: data lives on the device first and syncs in the background. Each sync does a
// three-way merge between the last synced copy ("base"), this device and the cloud, item
// by item (shows, favorite actors, and any lists a newer version added), so changes made on two devices both
// survive and deletions stick. When both sides changed the same item, this device wins.
//
// Viewer: someone the owner shared with by email. They see the owner's list read-only.

(function () {
  const cfg = window.WATCHLIST_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const BASE_KEY = 'watchlist:base';
  const VIEW_KEY = 'watchlist:view';
  const TABLE = 'watchlist_state';
  const VIEWERS = 'watchlist_viewers';

  let client = null;
  let session = null;
  let mode = 'signed-out'; // 'signed-out' | 'owner' | 'viewer'
  let viewing = null; // { email, updatedAt } when in viewer mode
  let viewers = [];
  let status = { text: '', error: false };
  let lastSync = null;
  let syncing = false;
  let again = false;
  let timer = null;

  // ---- Merge ----
  // Stable JSON (sorted keys), so the same data compares equal regardless of key order.
  function canon(v) {
    if (v === undefined) return 'undefined';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  function pick(b, l, r) {
    const bc = canon(b), lc = canon(l), rc = canon(r);
    if (lc === rc || rc === bc) return l; // same, or only this device changed it
    if (lc === bc) return r; // only the cloud changed it
    // Both changed: keep an edit over a deletion, otherwise prefer this device.
    if (l === undefined) return r;
    return l;
  }
  function mergeList(base, local, remote) {
    const index = (arr) => new Map((arr || []).map((x) => [x.id, x]));
    const b = index(base), l = index(local), r = index(remote);
    const ids = [...new Set([...l.keys(), ...r.keys()])];
    // Ids only in base were deleted on both sides.
    return ids.map((id) => pick(b.get(id), l.get(id), r.get(id))).filter((x) => x !== undefined);
  }
  function mergeKeyed(base, local, remote) {
    base = base || {}; local = local || {}; remote = remote || {};
    const out = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const v = pick(base[k], local[k], remote[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  function merge(base, local, remote) {
    base = base || {};
    return {
      ...mergeUnknown(base, local, remote),
      shows: mergeList(base.shows, local.shows, remote.shows),
      actors: mergeList(base.actors, local.actors, remote.actors),
      version: 1,
    };
  }
  // Parts a newer version of the app added: lists of items with ids merge item by item, anything else as a whole.
  const KNOWN = ['shows', 'actors', 'version'];
  const isIdList = (v) => Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'id' in x);
  const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function mergeUnknown(base, local, remote) {
    const out = {};
    for (const k of new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])) {
      if (KNOWN.includes(k)) continue;
      const b = base[k], l = local[k], r = remote[k] === undefined ? b : remote[k];
      const v = [b, l, r].filter((x) => x !== undefined);
      const merged = v.every(isIdList) ? mergeList(b, l, r) : v.every(isMap) ? mergeKeyed(b, l, r) : pick(b, l, r);
      if (merged !== undefined) out[k] = merged;
    }
    return out;
  }
  window.watchMerge = merge; // exposed for testing

  const plain = (s) => JSON.parse(JSON.stringify(s));
  const readBase = () => { try { return JSON.parse(localStorage.getItem(BASE_KEY) || 'null'); } catch { return null; } };
  const writeBase = (v, at) => { try { localStorage.setItem(BASE_KEY, JSON.stringify(v)); localStorage.setItem(BASE_KEY + ':at', String(at || 0)); } catch {} };
  const readBaseAt = () => { try { return Number(localStorage.getItem(BASE_KEY + ':at') || 0); } catch { return 0; } };

  const errText = (e) => (e && (e.message || e.error_description || e.hint)) || String(e);

  // ---- Status ----
  function setStatus(text, error = false) {
    status = { text, error };
    renderStatus();
  }
  function ago(d) {
    if (!d) return '';
    const mins = Math.round((Date.now() - d) / 60000);
    return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
  }
  function renderStatus() {
    const top = document.getElementById('sync-status');
    if (top) {
      top.hidden = !session;
      top.textContent = status.error ? '⚠ Not synced' : mode === 'viewer' ? 'View only' : lastSync ? `Synced ${ago(lastSync)}` : status.text;
      top.classList.toggle('error', status.error);
    }
    const line = document.getElementById('account-status');
    if (line) {
      line.textContent = status.error ? status.text : mode === 'viewer' ? '' : lastSync ? `Last synced ${ago(lastSync)}` : status.text;
      line.classList.toggle('error', status.error);
    }
    const banner = document.getElementById('viewer-banner');
    if (banner) {
      banner.hidden = mode !== 'viewer';
      banner.textContent = viewing
        ? `Watch list shared by ${viewing.email || 'the owner'} · view only · updated ${ago(viewing.updatedAt)}`
        : 'Nothing is shared with this account.';
    }
  }

  // ---- Owner sync ----
  async function syncOwner() {
    if (syncing) { again = true; return; }
    syncing = true;
    try {
      setStatus('Syncing…');
      const uid = session.user.id;
      // The list is large, so first check whether anything changed on either side.
      const { data: meta, error: metaErr } = await client.from(TABLE).select('updated_at').eq('user_id', uid).maybeSingle();
      if (metaErr) throw metaErr;
      const base = readBase();
      if (meta && base && readBaseAt() === new Date(meta.updated_at).getTime() && canon(plain(state)) === canon(base)) {
        lastSync = Date.now();
        setStatus('Synced');
        return;
      }
      const { data: row, error } = await client.from(TABLE).select('data, updated_at').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      const local = plain(state);
      const merged = row && row.data ? merge(readBase(), local, row.data) : local;
      if (canon(merged) !== canon(local)) {
        state = normalizeState(merged);
        writeLocal();
        render();
      }
      const finalData = plain(state);
      let at = row ? new Date(row.updated_at).getTime() : 0;
      if (!row || canon(finalData) !== canon(row.data)) {
        const now = new Date();
        const { error: upErr } = await client.from(TABLE).upsert(
          { user_id: uid, owner_email: session.user.email, data: finalData, updated_at: now.toISOString() },
          { onConflict: 'user_id' });
        if (upErr) throw upErr;
        at = now.getTime();
      }
      writeBase(finalData, at);
      lastSync = Date.now();
      setStatus('Synced');
    } catch (e) {
      console.error('Sync failed', e);
      setStatus(navigator.onLine === false ? 'Offline, will sync later' : `Sync failed: ${errText(e)}`, true);
    } finally {
      syncing = false;
      if (again) { again = false; schedule(500); }
    }
  }

  // ---- Viewer ----
  async function loadShared() {
    const { data, error } = await client.from(TABLE)
      .select('user_id, owner_email, data, updated_at')
      .neq('user_id', session.user.id)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data[0];
  }
  async function syncViewer() {
    try {
      const row = await loadShared();
      if (!row) {
        // Not shared (or no longer shared): drop any copy we were showing.
        viewing = null;
        state = normalizeState(null);
        try { localStorage.removeItem(VIEW_KEY); } catch {}
        setStatus('Nothing is shared with this account', true);
        render();
        return;
      }
      viewing = { email: row.owner_email, updatedAt: new Date(row.updated_at).getTime() };
      state = normalizeState(row.data);
      try { localStorage.setItem(VIEW_KEY, JSON.stringify({ viewing, data: row.data })); } catch {}
      lastSync = Date.now();
      setStatus('');
      render();
    } catch (e) {
      console.error('Refresh failed', e);
      setStatus('Could not refresh, showing last copy', true);
    }
  }

  // ---- Mode ----
  async function decideMode() {
    if (cfg.ownerEmail) {
      return (session.user.email || '').toLowerCase() === cfg.ownerEmail.toLowerCase() ? 'owner' : 'viewer';
    }
    const uid = session.user.id;
    const { data: own, error } = await client.from(TABLE).select('user_id').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    if (own) return 'owner';
    const shared = await loadShared();
    return shared ? 'viewer' : 'owner';
  }
  async function enter(newMode) {
    mode = newMode;
    readOnly = mode === 'viewer';
    document.body.classList.toggle('read-only', readOnly);
    if (mode === 'viewer') {
      try {
        const cached = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
        if (cached) { viewing = cached.viewing; state = normalizeState(cached.data); }
      } catch {}
      await syncViewer();
    } else if (mode === 'owner') {
      await loadViewers();
      await syncOwner();
    } else {
      viewing = null;
      state = loadState();
    }
    render();
    renderAccount();
  }

  function schedule(ms = 1500) {
    clearTimeout(timer);
    if (!session) return;
    timer = setTimeout(() => (mode === 'owner' ? syncOwner() : mode === 'viewer' ? syncViewer() : connect()), ms);
  }

  // Work out whether this account is the owner or a viewer, then sync. Retried by
  // "Sync now" if the first attempt failed (e.g. offline or the database isn't set up).
  async function connect() {
    try {
      setStatus('Connecting…');
      await enter(await decideMode());
    } catch (e) {
      console.error(e);
      setStatus(`Could not connect: ${errText(e)}`, true);
      renderAccount();
    }
  }

  // ---- Sharing ----
  async function loadViewers() {
    const { data, error } = await client.from(VIEWERS).select('viewer_email').eq('owner_id', session.user.id).order('created_at');
    viewers = error ? [] : data.map((v) => v.viewer_email);
  }
  async function addViewer(email) {
    email = email.trim().toLowerCase();
    if (!email || !email.includes('@')) return toast('Enter an email address.');
    if (email === (session.user.email || '').toLowerCase()) return toast('That is your own account.');
    const { error } = await client.from(VIEWERS).insert({ owner_id: session.user.id, viewer_email: email });
    if (error && !/duplicate/i.test(error.message)) return toast(`Could not share: ${error.message}`);
    await syncOwner(); // make sure there is data to see
    await loadViewers();
    renderAccount();
    toast(`Shared with ${email}`);
  }
  async function removeViewer(email) {
    if (!confirm(`Stop sharing with ${email}?`)) return;
    const { error } = await client.from(VIEWERS).delete().eq('owner_id', session.user.id).eq('viewer_email', email);
    if (error) return toast(`Could not remove: ${error.message}`);
    await loadViewers();
    renderAccount();
  }

  // ---- Account UI (Account page) ----
  function renderAccount() {
    const box = document.getElementById('account');
    if (!box) return;
    box.replaceChildren();
    if (!configured) {
      box.append(el('p', { class: 'muted small' }, 'Cloud sync is not set up yet. Your data is saved on this device only.'));
      return;
    }
    if (!session) {
      const form = el('form', { class: 'account-form', onsubmit: async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        btn.disabled = true;
        const { error } = await client.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
        btn.disabled = false;
        if (error) toast(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
      } },
        el('p', { class: 'muted small' }, 'Sign in to load your list and sync it between devices.'),
        el('label', {}, 'Email', el('input', { name: 'email', type: 'email', autocomplete: 'username', required: true })),
        el('label', {}, 'Password', el('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
        el('button', { type: 'submit', class: 'btn primary' }, 'Sign in'));
      box.append(form);
      return;
    }
    box.append(
      el('p', {}, 'Signed in as ', el('b', {}, session.user.email), mode === 'viewer' ? el('span', { class: 'tag' }, 'view only') : null),
      el('p', { id: 'account-status', class: 'account-status' }),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn', onclick: () => schedule(0) }, mode === 'viewer' ? 'Refresh' : 'Sync now'),
        el('button', { class: 'btn', onclick: () => { showPassword = !showPassword; renderAccount(); } }, 'Change password'),
        el('button', { class: 'btn', onclick: signOut }, 'Sign out')),
      showPassword ? passwordForm() : null,
    );
    renderStatus();
    if (mode === 'owner') {
      const input = el('input', { type: 'email', placeholder: 'their email', 'aria-label': 'Email to share with', autocomplete: 'off' });
      box.append(
        el('h3', { class: 'section' }, 'Shared with (view only)'),
        viewers.length
          ? el('div', { class: 'viewer-list' }, viewers.map((v) => el('div', { class: 'viewer-row' },
              el('span', {}, v), el('button', { class: 'btn small', onclick: () => removeViewer(v) }, 'Remove'))))
          : el('p', { class: 'muted small' }, 'No one yet.'),
        el('form', { class: 'viewer-add', onsubmit: (e) => { e.preventDefault(); addViewer(input.value).then(() => { input.value = ''; }); } },
          input, el('button', { type: 'submit', class: 'btn' }, 'Share')),
        el('p', { class: 'muted small' }, 'Each person also needs an account: create it in Supabase → Authentication → Users → Add user, then give them the email and password.'),
      );
    }
  }

  // Lets anyone signed in (owner or viewer) replace a temporary password with their own.
  let showPassword = false;
  function passwordForm() {
    const form = el('form', { class: 'account-form password-form', onsubmit: async (e) => {
      e.preventDefault();
      const pw = form.pw.value;
      if (pw.length < 8) return toast('Use at least 8 characters.');
      if (pw !== form.pw2.value) return toast('The two passwords do not match.');
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      const { error } = await client.auth.updateUser({ password: pw });
      btn.disabled = false;
      if (error) return toast(`Could not change password: ${errText(error)}`);
      showPassword = false;
      renderAccount();
      toast('Password changed. Use it next time you sign in.');
    } },
      el('label', {}, 'New password', el('input', { name: 'pw', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 })),
      el('label', {}, 'Type it again', el('input', { name: 'pw2', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 })),
      el('div', { class: 'btn-row' },
        el('button', { type: 'submit', class: 'btn primary' }, 'Save password'),
        el('button', { type: 'button', class: 'btn', onclick: () => { showPassword = false; renderAccount(); } }, 'Cancel')));
    return form;
  }

  async function signOut() {
    if (!confirm(mode === 'owner' ? 'Sign out? Your data stays on this device.' : 'Sign out?')) return;
    if (mode === 'owner') await syncOwner();
    await client.auth.signOut();
  }

  // ---- Boot ----
  window.cloud = {
    configured,
    onLocalSave: () => { if (mode === 'owner') schedule(); },
    renderAccount: () => renderAccount(),
    // Access token for the Netlify functions (TMDB lookups, sheet export).
    token: async () => {
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return data && data.session ? data.session.access_token : null;
    },
  };

  if (!configured) { renderAccount(); return; }
  client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'watchlist-auth' },
  });

  let current = null;
  client.auth.onAuthStateChange((event, s) => {
    session = s;
    const uid = s ? s.user.id : null;
    if (uid === current) { renderAccount(); return; }
    current = uid;
    // Defer: Supabase recommends not awaiting other calls inside this callback.
    setTimeout(async () => {
      if (!s) {
        try { localStorage.removeItem(BASE_KEY); localStorage.removeItem(BASE_KEY + ':at'); localStorage.removeItem(VIEW_KEY); } catch {}
        readOnly = false;
        document.body.classList.remove('read-only');
        await enter('signed-out');
        return;
      }
      await connect();
    }, 0);
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(300); });
  window.addEventListener('online', () => schedule(300));
  setInterval(() => { if (!document.hidden) schedule(0); }, 2 * 60 * 1000);
  setInterval(renderStatus, 30 * 1000);
  renderAccount();
})();
