"""Publish each complete first-parent main commit alongside the latest suite."""
import html
import io
import json
import pathlib
import subprocess
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / '_site'
APPS = {'cloud', 'wave', 'tetrapod-mould', 'two-piece', 'tetrapod-volume', 'texture-generator', 'bump-cylinder'}

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def snapshot(sha, dest, latest=False):
    meta = git('show', '-s', '--format=%H%n%cI%n%s', sha).decode().strip().split('\n', 2)
    record = dict(zip(('sha', 'date', 'message'), meta))
    short = sha[:7]
    with tarfile.open(fileobj=io.BytesIO(git('archive', sha))) as archive:
        for member in archive:
            path = pathlib.PurePosixPath(member.name)
            if not member.isfile() or '..' in path.parts or path.is_absolute():
                continue
            if not (path.parts[0] in (APPS | {'bump-cylinder'}) or (len(path.parts) == 1 and path.suffix in {'.html', '.css', '.js', '.json'})):
                continue
            content = archive.extractfile(member).read()
            target = dest.joinpath(*path.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            if path.suffix == '.html':
                up = '../' * (len(path.parts) - 1)
                home = up if latest else up + '../../'
                versions = home + 'versions/'
                badge = ('<aside style="padding:12px;font:12px monospace;background:#111;color:#eee;position:relative;z-index:1000">'
                         + ('LATEST' if latest else 'SAVED VERSION') + ' / '
                         + '<a style="color:inherit" href="https://github.com/666falopi/TETRAPODS/commit/' + sha + '">' + short + '</a> / '
                         + html.escape(record['date']) + ' / <a style="color:inherit" href="' + versions + '">VERSIONS</a>'
                         + ('' if latest else ' / <a style="color:inherit" href="' + home + '">LATEST</a>') + '</aside>')
                content = content.decode('utf-8-sig').replace('</body>', badge + '</body>').encode()
            target.write_bytes(content)
    record['url'] = '../commit/' + short + '/'
    return record

def main():
    if OUT.exists():
        raise SystemExit('_site already exists; choose a clean checkout before building.')
    commits = git('rev-list', '--first-parent', 'HEAD').decode().splitlines()
    records = []
    for sha in commits:
        files = set(git('ls-tree', '--name-only', sha).decode().splitlines())
        if 'index.html' not in files or not APPS.issubset(files):
            continue
        if any(r['sha'][:7] == sha[:7] for r in records):
            raise SystemExit('Short commit ID collision; increase the URL ID length.')
        records.append(snapshot(sha, OUT / 'commit' / sha[:7]))
    if not records:
        raise SystemExit('No complete suite found.')
    snapshot(records[0]['sha'], OUT, latest=True)
    versiondir = OUT / 'versions'
    versiondir.mkdir()
    rows = ''.join('<li><a href="' + r['url'] + '">' + r['sha'][:7] + '</a> — ' + html.escape(r['message']) + '<br><small>' + html.escape(r['date']) + '</small></li>' for r in records)
    (versiondir / 'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hard Matter / Versions</title><style>body{background:#111;color:#eee;font:15px monospace;max-width:900px;margin:50px auto;padding:20px}a{color:inherit}li{margin:24px 0}</style><a href="../">← LATEST DASHBOARD</a><h1>Hard Matter / Versions</h1><p>Complete snapshots from the main branch. Open a commit to use that version of every tool.</p><ul>' + rows + '</ul></html>', encoding='utf-8')
    (versiondir / 'index.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
    (OUT / '.nojekyll').touch()
    total = sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file())
    if total > 800_000_000:
        raise SystemExit('Version archive exceeds 800 MB; move old snapshots to separate hosting before publishing.')
    print(f'Built {len(records)} complete versions; {total / 1_000_000:.1f} MB')

if __name__ == '__main__':
    main()
