"""Turn the Google Sheet export into the app's starting data (data/seed.json).

Usage: python3 tools/import_sheet.py data/sheet-export.json data/seed.json

The input is the Sheets API values response ({"values": [[...], ...]}) for the whole tab.
Cleanup done here:
- one Format and one Release Year (researched column first, provisional as fallback)
- the broken "#REF!" column is dropped (the app works out total hours itself)
- "Want to Watch?" becomes one of: Yes, Maybe, Once it's finished, A lot
- Genre, Tags and Source become lists; "Country / Language" splits into country and languages
"""
import json
import sys

LANGUAGES = {'English', 'Spanish', 'Japanese', 'Russian', 'Yoruba', 'Hindi', 'Yiddish', 'French',
             'German', 'Korean', 'Italian', 'Danish', 'Norwegian', 'Swedish', 'Dutch', 'Hebrew',
             'Ukrainian', 'Tibetan'}

WANT = {
    'yes': 'Yes',
    'maybe': 'Maybe',
    'a lot': 'A lot',
    'waiting until finished': "Once it's finished",
    'yes waiting finish': "Once it's finished",
    'yes waiting finihs': "Once it's finished",
}


def split(s, sep=','):
    return [x.strip() for x in (s or '').split(sep) if x.strip()]


def num(s):
    s = (s or '').strip()
    if not s:
        return None
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def main(src, dst):
    values = json.load(open(src))['values']
    head = values[0]
    col = {name: i for i, name in enumerate(head)}

    def get(row, name):
        i = col[name]
        return row[i].strip() if i < len(row) else ''

    shows = []
    unknown_want = set()
    for n, row in enumerate(values[1:], start=1):
        title = get(row, 'Title')
        if not title:
            continue
        cl = get(row, 'Country / Language')
        country, languages = '', []
        if ' / ' in cl:
            c, l = cl.split(' / ', 1)
            country, languages = c.strip(), split(l)
        elif cl in LANGUAGES:
            languages = [cl]
        elif cl:
            country = cl
        want_raw = get(row, 'Want to Watch?')
        want = WANT.get(want_raw.lower(), want_raw)
        if want_raw and want_raw.lower() not in WANT:
            unknown_want.add(want_raw)
        rec = get(row, 'Use to recommend similar shows')
        shows.append({
            'id': f's{n:04d}',
            'title': title,
            'format': get(row, 'Format') or get(row, 'Format (provisional)'),
            'year': num(get(row, 'Release Year')) or num(get(row, 'Release Year (if known)')),
            'endYear': num(get(row, 'End Year')),
            'seasons': num(get(row, 'Seasons')),
            'episodes': num(get(row, 'Episodes')),
            'epLength': num(get(row, 'Episode Length (min)')),
            'showStatus': get(row, 'Show Status'),
            'genres': split(get(row, 'Genre')),
            'structure': get(row, 'Structure'),
            'country': country,
            'languages': languages,
            'tags': split(get(row, 'Tags')),
            'network': get(row, 'Original Network/Platform'),
            'confidence': get(row, 'Confidence'),
            'researchNotes': get(row, 'Research Notes'),
            'status': get(row, 'My Status'),
            'want': want,
            'recommend': 'Yes' if rec.lower() == 'yes' else rec,
            'sources': split(get(row, 'Source')),
            'notes': get(row, 'Existing Notes'),
            'tmdb': None,
        })
    json.dump({'version': 1, 'shows': shows, 'actors': []}, open(dst, 'w'), ensure_ascii=False, indent=0)
    print(f'{len(shows)} shows written to {dst}')
    if unknown_want:
        print('Kept as typed (no mapping):', sorted(unknown_want))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
