import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / '.local/production.env'
if not target.exists():
    target.write_text('SECRET_KEY=' + secrets.token_urlsafe(64) + '\nPOSTGRES_PASSWORD=' + secrets.token_urlsafe(36) +
        '\nTELEGRAM_ENABLED=false\nTELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\nMAX_ENABLED=false\n', encoding='utf-8')
print('Production environment file ready; values not printed.')
