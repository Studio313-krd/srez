import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.getenv('SREZ_DEBUG', 'false').lower() == 'true'
SECRET_KEY = os.getenv('SECRET_KEY', '')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('Set SECRET_KEY. Local development: SREZ_DEBUG=true.')
    SECRET_KEY = 'local-development-only-do-not-deploy-this-key-keep-production-separate'
if not DEBUG and (len(SECRET_KEY) < 50 or SECRET_KEY.startswith('replace-')):
    raise ImproperlyConfigured('Use a unique production SECRET_KEY of at least 50 characters.')
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
CSRF_TRUSTED_ORIGINS = list(filter(None, os.getenv('CSRF_TRUSTED_ORIGINS',
    'http://127.0.0.1:4317,http://localhost:4317' if DEBUG else '').split(',')))
INSTALLED_APPS = ['django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
                  'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles', 'reports']
MIDDLEWARE = ['reports.proxy.TrustedProxyMiddleware', 'django.middleware.security.SecurityMiddleware', 'whitenoise.middleware.WhiteNoiseMiddleware',
              'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware',
              'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware',
              'django.contrib.messages.middleware.MessageMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware']
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates',
              'DIRS': [BASE_DIR.parent / 'dist'], 'APP_DIRS': True,
              'OPTIONS': {'context_processors': ['django.template.context_processors.request',
                  'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
if os.getenv('POSTGRES_HOST'):
    DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql', 'HOST': os.environ['POSTGRES_HOST'],
        'NAME': os.getenv('POSTGRES_DB', 'srez'), 'USER': os.getenv('POSTGRES_USER', 'srez'),
        'PASSWORD': os.environ['POSTGRES_PASSWORD'], 'PORT': os.getenv('POSTGRES_PORT', '5432'), 'CONN_MAX_AGE': 60}}
elif DEBUG or 'test' in __import__('sys').argv:
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3', 'OPTIONS': {'timeout': 20}}}
else:
    raise ImproperlyConfigured('Production requires PostgreSQL.')
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.' + name} for name in
    ['UserAttributeSimilarityValidator', 'MinimumLengthValidator', 'CommonPasswordValidator', 'NumericPasswordValidator']]
LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'Europe/Moscow'
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
WHITENOISE_ROOT = BASE_DIR.parent / 'dist'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_AGE = 12 * 60 * 60
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = not DEBUG
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
TRUSTED_PROXY_CIDRS = os.getenv('TRUSTED_PROXY_CIDRS', '127.0.0.1/32,::1/128')
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
CSRF_FAILURE_VIEW = 'reports.views.csrf_failure'
TELEGRAM_ENABLED = os.getenv('TELEGRAM_ENABLED', 'false').lower() == 'true'
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')
MAX_ENABLED = os.getenv('MAX_ENABLED', 'false').lower() == 'true'
MAX_BOT_TOKEN = os.getenv('MAX_BOT_TOKEN', '')
MAX_CHAT_ID = os.getenv('MAX_CHAT_ID', '')
MAX_API_URL = os.getenv('MAX_API_URL', 'https://platform-api2.max.ru')
# Optional server-mounted CA bundle for MAX. TLS verification remains enabled.
MAX_CA_BUNDLE = os.getenv('MAX_CA_BUNDLE', '')
PUBLIC_URL = os.getenv('PUBLIC_URL', '')
