"""One-off setup: inspect recent bot events, print chat IDs only, send nothing."""
import json
import ssl
from urllib.request import Request, urlopen
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


def recent_chat_ids(channel):
    token = getattr(settings, channel.upper() + '_BOT_TOKEN')
    if not token:
        raise ValueError('token missing')
    if channel == 'telegram':
        request = Request(f'https://api.telegram.org/bot{token}/getUpdates?limit=100&timeout=0')
        connection = urlopen(request, timeout=10)
    else:
        if not settings.MAX_API_URL.startswith('https://'):
            raise ValueError('HTTPS API required')
        request = Request(settings.MAX_API_URL.rstrip('/') + '/updates?limit=100&timeout=0', headers={'Authorization':token})
        connection = urlopen(request, timeout=10, context=ssl.create_default_context(cafile=settings.MAX_CA_BUNDLE or None))
    with connection as response:
        data = json.load(response)
    if channel == 'telegram' and not data.get('ok'):
        raise ValueError('provider rejected request')
    chats = {}
    for event in data.get('result' if channel == 'telegram' else 'updates', []):
        if channel == 'telegram':
            for key in ['message','channel_post','my_chat_member']:
                chat = event.get(key, {}).get('chat', {})
                if 'id' in chat:
                    chats[str(chat['id'])] = chat.get('title', chat.get('first_name', ''))
        else:
            recipient = event.get('message', {}).get('recipient', {})
            chat_id = event.get('chat_id', recipient.get('chat_id'))
            if chat_id is not None:
                chats[str(chat_id)] = event.get('update_type', '')
    return chats


class Command(BaseCommand):
    help = 'One-off bot setup: read recent events and print chat IDs without sending messages or consuming offsets.'

    def add_arguments(self, parser):
        parser.add_argument('channel', choices=['telegram','max'])

    def handle(self, *args, **options):
        try:
            chats = recent_chat_ids(options['channel'])
        except Exception as error:
            raise CommandError('Не удалось прочитать события бота: ' + type(error).__name__ + '. Проверьте токен, доступ к API и сертификаты.') from None
        for chat_id, title in chats.items():
            self.stdout.write(f'{chat_id}\t{title}')
        if not chats:
            self.stdout.write('Новых событий нет. Добавьте бота в нужный чат и повторите команду. Это разовая проверка при настройке, не постоянный опрос.')
