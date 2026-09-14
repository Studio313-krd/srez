"""Generate isolated local preview configuration, never overwrite existing secrets."""
from pathlib import Path
import secrets

target = Path(__file__).resolve().parent.parent / '.local' / 'preview.env'
target.parent.mkdir(exist_ok=True)
if target.exists():
    print('Existing local preview configuration preserved.')
else:
    target.write_text('\n'.join([
        'SREZ_DEBUG=true', 'SECRET_KEY=' + secrets.token_urlsafe(60),
        'ALLOWED_HOSTS=localhost,127.0.0.1',
        'CSRF_TRUSTED_ORIGINS=http://127.0.0.1:8087,http://localhost:8087',
        'PUBLIC_URL=http://localhost:8087', 'POSTGRES_DB=srez', 'POSTGRES_USER=srez',
        'POSTGRES_PASSWORD=' + secrets.token_urlsafe(30),
        'APP_IMAGE=srez:local', 'APP_PORT=8087', 'TELEGRAM_ENABLED=false',
    ]) + '\n', encoding='utf-8')
    print('Local preview configuration created in .local/preview.env.')
