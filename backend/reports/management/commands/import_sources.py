import hashlib
import json
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from reports.models import (Access, Store, Employee, StoreStaff, LegalEntity, SourceDocument, SourceSheet,
    ImportIssue, ManagementEvent, Plan, Report, Revision)


class Command(BaseCommand):
    help = 'Import captured source snapshots. Repeatable; original timestamps remain unknown.'

    def add_arguments(self, parser):
        parser.add_argument('directory')
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        directory = Path(options['directory'])
        manifest = json.loads((directory / 'prepared.json').read_text('utf-8'))
        self.stdout.write(json.dumps(manifest['stats'], ensure_ascii=False))
        if not options['apply']:
            return
        with transaction.atomic():
            self.apply(directory, manifest)

    def apply(self, directory, manifest):
        User = get_user_model()
        admin = User.objects.filter(is_active=True, is_superuser=True).first()
        if not admin: raise CommandError('Create an administrator before importing.')
        now = timezone.now()
        # Keep referenced history while removing obsolete demo logins from use.
        User.objects.filter(username__in=['demo.office', 'demo.store']).update(is_active=False)
        Access.objects.filter(role='office').update(role='manager')
        Access.objects.update_or_create(user=admin, defaults={'role': 'manager'})
        admin.first_name = 'Администратор'
        admin.save(update_fields=['first_name'])
        Store.objects.filter(code__startswith='ДЕМО-').update(archived=True, monitoring_enabled=False)
        for key, filename in [('mm', 'mm-complete.json'), ('kk', 'kk-complete.json'), ('hr', 'hr.json')]:
            content = (directory / 'sources' / filename).read_bytes()
            book = json.loads(content)
            document, _ = SourceDocument.objects.update_or_create(key=key, defaults={'title': book['title'],
                'url': book.get('url', ''), 'checksum': hashlib.sha256(content).hexdigest(), 'imported_at': now,
                'stats': {'tabs': len(book['sheets']), 'rows': sum(len(s['values']) for s in book['sheets']), **manifest['stats']}})
            for sheet in book['sheets']:
                SourceSheet.objects.update_or_create(document=document, title=sheet['title'],
                    defaults={'values': sheet['values'], 'formulas': sheet.get('formulas', [])})
        employee_map = {}
        for record in manifest['employees']:
            person, created = Employee.objects.get_or_create(key=record['key'], defaults={'name': record['name'], 'position': record['position'], 'source_data': {'sources': record['sources']}})
            employee_map[record['key']] = person
        for record in manifest['legal_entities']:
            LegalEntity.objects.get_or_create(name=record['name'], defaults={'data': record['data']})
        store_map = {}
        for record in manifest['stores']:
            store, created = Store.objects.get_or_create(code=record['code'], defaults={'name': record['name'], 'city': record['city'],
                'network': record['network'], 'timezone': record['timezone'], 'profile': record['profile'],
                'active_from': date.fromisoformat(manifest['stats']['from']), 'monitoring_enabled': False})
            store_map[record['code']] = store
            if created:
                for slot, person_key in record['staff'].items():
                    StoreStaff.objects.create(store=store, slot=slot, employee=employee_map[person_key])
        for record in manifest['issues']:
            ImportIssue.objects.get_or_create(key=record['key'], defaults={'store': store_map.get(record['code']),
                'kind': record['kind'], 'message': record['message'], 'details': record['details']})
        existing_plans = {(p.store_id, p.date.isoformat()): p for p in Plan.objects.filter(store__in=store_map.values(), origin='sheets').order_by('pk')}
        plan_additions = []
        for record in manifest['plans']:
            store = store_map[record['code']]
            old = existing_plans.get((store.pk, record['date']))
            if old and old.revenue == (Decimal(record['revenue']) if record['revenue'] is not None else None) and old.receipts == record['receipts'] and old.units == record['units'] and old.units_per_receipt == (Decimal(record['units_per_receipt']) if record['units_per_receipt'] is not None else None):
                continue
            if Plan.objects.filter(store=store, date=record['date'], origin='manual').exists():
                ImportIssue.objects.get_or_create(key=f'manual-plan:{store.pk}:{record["date"]}', defaults={'store': store,
                    'kind': 'manual_preserved', 'message': 'Ручной план сохранён; повторный импорт его не перезаписал.'})
                continue
            plan_additions.append(Plan(store=store, date=record['date'], revenue=record['revenue'], receipts=record['receipts'],
                units=record['units'], units_per_receipt=record['units_per_receipt'], approved_by=admin,
                reason='Перенесено из Google-таблицы', origin='sheets', source_data=record['source_data']))
        Plan.objects.bulk_create(plan_additions, batch_size=500)
        existing = {(r.store_id, r.date.isoformat(), r.checkpoint): r for r in Report.objects.filter(store__in=store_map.values())}
        additions = [Report(store=store_map[r['code']], date=r['date'], checkpoint=r['checkpoint'], imported=True,
            available_at=None, deadline=None, source_data=r['source_data']) for r in manifest['reports']
            if (store_map[r['code']].pk, r['date'], r['checkpoint']) not in existing]
        Report.objects.bulk_create(additions, batch_size=500)
        existing = {(r.store_id, r.date.isoformat(), r.checkpoint): r for r in Report.objects.filter(store__in=store_map.values())}
        revision_map = {r.report_id: r for r in Revision.objects.filter(report__store__in=store_map.values()).order_by('version')}
        new_revisions, changed_reports = [], []
        for record in manifest['reports']:
            report = existing[(store_map[record['code']].pk, record['date'], record['checkpoint'])]
            old = revision_map.get(report.pk)
            if not record['has_values'] and not old: continue
            canonical = json.dumps(record, sort_keys=True, ensure_ascii=False)
            digest = hashlib.sha256(canonical.encode()).hexdigest()
            if old and old.payload_hash == digest: continue
            if old and old.origin != 'sheets':
                ImportIssue.objects.get_or_create(key='manual-preserved:'+str(report.pk), defaults={'store': report.store,
                    'kind': 'manual_preserved', 'message': 'Ручное исправление сохранено; повторный импорт его не перезаписал.'})
                continue
            report.current_version += 1
            report.source_data = record['source_data']
            new_revisions.append(Revision(report=report, version=report.current_version, author=admin, received_at=None,
                origin='sheets', imported_at=now, employee=record['source_data']['employee'], source_data=record['source_data'],
                comment=record['source_data'].get('action') or '', request_id=uuid5(NAMESPACE_URL, canonical + ':' + str(report.current_version)), payload_hash=digest, **record['values']))
            changed_reports.append(report)
        Revision.objects.bulk_create(new_revisions, batch_size=500)
        Report.objects.bulk_update(changed_reports, ['current_version', 'source_data'], batch_size=500)
        ManagementEvent.objects.create(author=admin, action='Импорт источников', entity='Две Google-таблицы и кадровый реестр',
            after={**manifest['stats'], 'new_revisions': len(new_revisions), 'new_plans': len(plan_additions), 'shared_admin': admin.username})
        self.stdout.write(f'Imported {len(store_map)} stores; new revisions {len(new_revisions)}; new plans {len(plan_additions)}.')
