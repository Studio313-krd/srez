import json
import ssl
from datetime import timedelta
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .models import Store, Report, Notification, NotificationChannel, WorkerHealth, LoginAttempt
from .services import ACTIVE_STATES, business_date, ensure_reports, make_finding


def tick(now=None):
    now = now or timezone.now()
    for store_id in Store.objects.filter(archived=False, monitoring_enabled=True).values_list('pk', flat=True):
        with transaction.atomic():
            store = Store.objects.select_for_update().get(pk=store_id)
            day = business_date(store, now)
            cursor = max(store.active_from, store.expected_through + timedelta(days=1) if store.expected_through else store.active_from)
            # A persisted per-store cursor catches gaps after downtime and newly
            # onboarded stores; bounded batches prevent an old start date from
            # blocking current-day reporting for the whole network.
            end = min(day, cursor + timedelta(days=29))
            while cursor <= end:
                ensure_reports(store, cursor)
                store.expected_through = cursor
                cursor += timedelta(days=1)
            store.save(update_fields=['expected_through'])
            ensure_reports(store, day)
    for report_id in Report.objects.filter(first_received_at__isnull=True, deadline__lt=now, store__archived=False, store__monitoring_enabled=True).exclude(findings__kind='missing').values_list('pk', flat=True):
        with transaction.atomic():
            report = Report.objects.select_for_update().get(pk=report_id)
            if not report.first_received_at:
                make_finding(report, 0, 'missing', 'Отчёт не получен к установленному сроку.')
    LoginAttempt.objects.filter(window_start__lt=now - timedelta(days=1)).delete()
    WorkerHealth.objects.update_or_create(name='scheduler', defaults={'last_success': now})


def notification_config(channel):
    prefix = channel.upper()
    public = urlsplit(settings.PUBLIC_URL)
    public_ready = public.scheme == 'https' and bool(public.hostname) and public.hostname not in ['localhost', '127.0.0.1', '::1']
    return {'enabled': getattr(settings, prefix + '_ENABLED'),
        'token': getattr(settings, prefix + '_BOT_TOKEN'), 'chat': getattr(settings, prefix + '_CHAT_ID'),
        'public_ready': public_ready}


def pending_notifications(channel):
    return Notification.objects.filter(channel=channel, sent_at__isnull=True,
        finding__state__in=ACTIVE_STATES, finding__report__store__archived=False)


def notification_status():
    result = []
    for channel in ['telegram', 'max']:
        config = notification_config(channel)
        pending = pending_notifications(channel)
        latest = Notification.objects.filter(channel=channel, sent_at__isnull=False).order_by('-sent_at').first()
        failure = pending.exclude(last_error='').order_by('-pk').first()
        result.append({'channel': channel, 'enabled': config['enabled'],
            'token_set': bool(config['token']), 'chat_set': bool(config['chat']), 'public_url_ready': config['public_ready'],
            'ready': all([config['enabled'], config['token'], config['chat'], config['public_ready']]),
            'pending': pending.count(), 'last_sent_at': latest.sent_at if latest else None,
            'last_error': failure.last_error if failure else ''})
    return result


def deliver_notifications():
    """Independent durable deliveries; one request per channel per pass.

    The channel lock also limits parallel workers. A provider timeout can mean a
    message was accepted: retries are at-least-once, not exactly-once delivery.
    """
    delivered = 0
    for channel in ['telegram', 'max']:
        config = notification_config(channel)
        if not all([config['enabled'], config['token'], config['chat'], config['public_ready']]):
            continue
        NotificationChannel.objects.get_or_create(channel=channel)
        with transaction.atomic():
            gate = NotificationChannel.objects.select_for_update(skip_locked=True).filter(channel=channel).first()
            now = timezone.now()
            if not gate or gate.next_send_at > now:
                continue
            item = pending_notifications(channel).select_for_update(skip_locked=True, of=('self',)).filter(
                next_attempt_at__lte=now).select_related('finding__report__store', 'action').order_by('pk').first()
            if not item:
                continue
            finding, report = item.finding, item.finding.report
            message = ('Ответ магазина: ' + item.action.comment) if item.action_id else finding.message
            link = f'{settings.PUBLIC_URL.rstrip("/")}/?date={report.date}&report={report.pk}'
            text = (f'{report.store.code} · {report.store.name}\n{report.date:%d.%m.%Y} · {report.get_checkpoint_display()}\n'
                    f'{message}\n{link}')[:3900]
            if settings.SREZ_TEST_MODE:
                text = '[ТЕСТ СРЕЗА]\n' + text
            gate.next_send_at = now + timedelta(seconds=3.1 if channel == 'telegram' else 0.6)
            retry_after = 0
            try:
                if channel == 'telegram':
                    payload = {'chat_id': config['chat'], 'text': text, 'link_preview_options': {'is_disabled': True},
                        'reply_markup': {'inline_keyboard': [[{'text': 'Открыть отчёт', 'url': link}]]}}
                    req = Request(f'https://api.telegram.org/bot{config["token"]}/sendMessage',
                        data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
                    connection = urlopen(req, timeout=8)
                else:
                    if urlsplit(settings.MAX_API_URL).scheme != 'https':
                        raise ValueError('MAX requires HTTPS')
                    payload = {'text': text, 'attachments': [{'type': 'inline_keyboard', 'payload': {
                        'buttons': [[{'type': 'link', 'text': 'Открыть отчёт', 'url': link}]]}}]}
                    req = Request(settings.MAX_API_URL.rstrip('/') + '/messages?' + urlencode({'chat_id': config['chat'], 'disable_link_preview': 'true'}),
                        data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'Authorization': config['token']})
                    context = ssl.create_default_context(cafile=settings.MAX_CA_BUNDLE or None)
                    connection = urlopen(req, timeout=8, context=context)
                with connection as response:
                    result = json.load(response)
                if (channel == 'telegram' and not result.get('ok')) or (channel == 'max' and not result.get('message')):
                    retry_after = int(result.get('parameters', {}).get('retry_after', 0))
                    raise RuntimeError('Provider rejected request')
                item.sent_at, item.last_error = timezone.now(), ''
                delivered += 1
            except Exception as error:
                # Never persist exception URLs, tokens or provider response text.
                item.last_error = type(error).__name__
                if isinstance(error, HTTPError):
                    item.last_error = f'HTTP {error.code}'
                    try:
                        retry_after = int(error.headers.get('Retry-After', 0))
                        if channel == 'telegram' and error.code == 429:
                            retry_after = max(retry_after, int(json.load(error).get('parameters', {}).get('retry_after', 0)))
                    except (ValueError, TypeError, AttributeError):
                        pass
                delay = max(retry_after, min(3600, 30 * 2 ** min(item.attempts, 7)))
                item.next_attempt_at = timezone.now() + timedelta(seconds=delay)
                if retry_after:
                    gate.next_send_at = item.next_attempt_at
            item.attempts += 1
            item.save()
            gate.save(update_fields=['next_send_at'])
    return delivered
