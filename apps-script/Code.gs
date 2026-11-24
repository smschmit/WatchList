// Watch List → Google Sheet. Paste into the sheet's Extensions → Apps Script, set SECRET, then
// Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone). Put the web app URL and
// the same SECRET into Netlify as SHEET_SCRIPT_URL and SHEET_SCRIPT_SECRET.
//
// Each export replaces the contents of the TAB below. Your original tab is never touched.

const SECRET = 'paste-the-same-long-random-string-as-in-netlify';
const TAB = 'Watch list (app)';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET.indexOf('paste-') === 0 || body.secret !== SECRET) return reply({ ok: false, error: 'Wrong secret' });
    const rows = body.rows;
    const width = rows[0].length;
    const grid = rows.map((r) => {
      const out = r.slice(0, width);
      while (out.length < width) out.push('');
      return out;
    });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TAB) || ss.insertSheet(TAB);
    sheet.clearContents();
    sheet.getRange(1, 1, grid.length, width).setValues(grid);
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
    sheet.getRange(1, 1, 1, width).setFontWeight('bold');
    return reply({ ok: true, rows: grid.length - 1, updated: new Date().toISOString() });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
