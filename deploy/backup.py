"""Back up PostgreSQL through Compose; optionally restore to a disposable database."""
import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--env-file', default='.env')
parser.add_argument('--project', default='srez')
parser.add_argument('--destination', default='.local/backups')
parser.add_argument('--restore-check', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
compose = ['docker', 'compose', '--env-file', str(Path(args.env_file).resolve()), '-p', args.project,
           '-f', str(root / 'compose.yaml'), 'exec', '-T', 'db']
directory = Path(args.destination).resolve()
directory.mkdir(parents=True, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
target = directory / f'srez-{stamp}.dump'
temporary = target.with_suffix('.partial')
try:
    with temporary.open('xb') as output:
        subprocess.run(compose + ['sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], stdout=output, check=True)
    temporary.replace(target)
except Exception:
    temporary.unlink(missing_ok=True)
    raise
print(f'Backup: {target} ({target.stat().st_size} bytes)')
if args.restore_check:
    # Only this locally generated name can be a restoration/deletion target.
    probe = 'srez_restore_' + uuid4().hex
    created = False
    try:
        subprocess.run(compose + ['sh', '-c', 'createdb -U "$POSTGRES_USER" "$1"', '_', probe], check=True)
        created = True
        with target.open('rb') as source:
            subprocess.run(compose + ['sh', '-c', 'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$1"', '_', probe], stdin=source, check=True)
        query = 'SELECT json_build_object(\'users\', (SELECT count(*) FROM auth_user), \'stores\', (SELECT count(*) FROM reports_store), \'revisions\', (SELECT count(*) FROM reports_revision));'
        result = subprocess.run(compose + ['sh', '-c', 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -At -c "$2"', '_', probe, query], capture_output=True, text=True, check=True)
        print('Restored and read: ' + json.dumps(json.loads(result.stdout)))
    finally:
        if created:
            subprocess.run(compose + ['sh', '-c', 'dropdb -U "$POSTGRES_USER" "$1"', '_', probe], check=True)
