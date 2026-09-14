"""Check the Git index for local datasets and known credential shapes before publishing."""
from pathlib import Path
import re
import subprocess

paths = subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
patterns = [r'-----BEGIN .*PRIVATE KEY-----', r'\bgh[pousr]_[A-Za-z0-9]{20,}', r'\b\d{8,12}:[A-Za-z0-9_-]{30,}']
hits = []
for name in filter(None, paths):
    if name.startswith(('.local/','.playwright-cli/','output/playwright/','design/screenshots/')) or name.endswith(('.sqlite3','.dump','.env')):
        hits.append((name, 'private path'))
    if name.endswith(('.py','.js','.ts','.tsx','.md','.json','.yaml','.yml','.example','.sh')) and name != 'scripts/check_public_files.py':
        text = subprocess.check_output(['git','show', ':'+name]).decode('utf-8')
        for pattern in patterns:
            if re.search(pattern,text): hits.append((name,'credential shape'))
print('Checked',len(paths)-1,'staged files; sensitive matches:',hits)
if hits: raise SystemExit(1)
