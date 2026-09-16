"""Run the isolated acceptance site locally for browser checks and illustrated guides."""
import os
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'backend'))
os.environ['SREZ_DEBUG']='true'
os.environ['SREZ_TEST_MODE']='true'
os.environ['DJANGO_SETTINGS_MODULE']='config.settings'
from django.conf import settings
settings.DATABASES={'default':{'ENGINE':'django.db.backends.sqlite3','NAME':root/'.local/acceptance-site.sqlite3','OPTIONS':{'timeout':20}}}
settings.ALLOWED_HOSTS=['127.0.0.1','localhost','testserver']
settings.CSRF_TRUSTED_ORIGINS=['http://127.0.0.1:8097']
settings.PUBLIC_URL='https://srez-test.studio313.ru'
settings.TELEGRAM_ENABLED=False
settings.MAX_ENABLED=False
import django
django.setup()
from django.core.management import call_command
from django.contrib.auth import get_user_model

if '--worker' in sys.argv:
    call_command('run_worker')
else:
    call_command('migrate',verbosity=0)
    if not get_user_model().objects.exists():
        call_command('seed_test_site',output=str(root/'.local/test-site-local-access.json'))
    if '--check' in sys.argv:
        print('Local isolated test site initialized.')
    else:
        print('Isolated test site: http://127.0.0.1:8097/',flush=True)
        call_command('runserver','127.0.0.1:8097',use_reloader=False)
