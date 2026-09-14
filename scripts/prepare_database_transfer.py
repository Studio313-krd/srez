from pathlib import Path
import tarfile

root = Path(__file__).resolve().parents[1]
backup = max((root / '.local/backups').glob('srez-*.dump'), key=lambda p:p.stat().st_mtime)
with tarfile.open(root / '.local/production-import.tar', 'w') as archive:
    info = archive.gettarinfo(str(backup), arcname='srez-import.dump')
    info.mode = 0o600
    info.uid = 0
    info.gid = 0
    with backup.open('rb') as source: archive.addfile(info, source)
print('Database transfer archive ready:', backup.name)
