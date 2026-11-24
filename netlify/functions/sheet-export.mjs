// Writes the list to the Google Sheet through the Apps Script in apps-script/Code.gs.
// POST /.netlify/functions/sheet-export  { rows: [[header...], [row...], ...] }   (owner only)
import { userFromRequest, json } from '../lib/auth.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let user;
  try { user = await userFromRequest(req); } catch (e) { return json({ error: e.message }, 500); }
  const owner = (process.env.OWNER_EMAIL || '').toLowerCase();
  if (!user || !owner || user.email !== owner) return json({ error: 'Only the owner can update the sheet' }, 403);
  const scriptUrl = process.env.SHEET_SCRIPT_URL;
  const secret = process.env.SHEET_SCRIPT_SECRET;
  if (!scriptUrl || !secret) return json({ error: 'SHEET_SCRIPT_URL and SHEET_SCRIPT_SECRET are not set in Netlify' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const rows = body && body.rows;
  if (!Array.isArray(rows) || !rows.length || !rows.every(Array.isArray)) return json({ error: 'No rows' }, 400);

  // Apps Script answers POSTs with a redirect to the result; fetch follows it.
  const res = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret, rows }),
    redirect: 'follow',
  });
  const text = await res.text();
  let out;
  try { out = JSON.parse(text); } catch { return json({ error: `Unexpected reply from Apps Script (${res.status}). Is it deployed with access "Anyone"?` }, 502); }
  return json(out, out.ok ? 200 : 502);
};
