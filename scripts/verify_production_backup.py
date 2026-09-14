"""Restore the downloaded production snapshot into an isolated local PostgreSQL database."""
import subprocess
import tarfile
from pathlib import Path
from uuid import uuid4
root=Path(__file__).resolve().parents[1]
target=root/'.local/backups/srez-production-launch-20260914.dump'
with tarfile.open(root/'.local/srez-production-backup.tar') as archive:
    member=archive.getmember('srez-launch-20260914.dump')
    assert member.isfile() and member.size<100000000
    target.write_bytes(archive.extractfile(member).read())
compose=['docker','compose','--env-file',str(root/'.local/preview.env'),'-p','srez-preview','-f',str(root/'compose.yaml'),'exec','-T','db']
probe='srez_restore_'+uuid4().hex
created=False
try:
    subprocess.run(compose+['createdb','-U','srez',probe],check=True);created=True
    with target.open('rb') as source:
        subprocess.run(compose+['pg_restore','--exit-on-error','--no-owner','-U','srez','-d',probe],stdin=source,check=True)
    query='SELECT (SELECT count(*) FROM auth_user WHERE is_active=true), (SELECT count(*) FROM reports_store WHERE archived=false), (SELECT count(*) FROM reports_revision);'
    result=subprocess.run(compose+['psql','-U','srez','-d',probe,'-At','-c',query],capture_output=True,text=True,check=True)
    assert result.stdout.strip()=='84|83|1381',result.stdout
    print('Production backup restored and checked: 84 active accounts, 83 stores, 1381 revisions. Bytes:',target.stat().st_size)
finally:
    if created: subprocess.run(compose+['dropdb','-U','srez',probe],check=True)
