"""Read-only acceptance; run through manage.py shell in the imported database.

Get-Content -Raw -Encoding utf8 scripts/verify_import.py | docker compose --env-file .local/preview.env -p srez-preview exec -T web python manage.py shell
"""
import json
from decimal import Decimal
from pathlib import Path
from django.contrib.auth import get_user_model
from reports.models import Store, Employee, StoreStaff, Plan, Report, Revision, SourceSheet, SourceDocument, LegalEntity, ImportIssue

directory = Path('/tmp/srez-import')
manifest = json.loads((directory/'prepared.json').read_text('utf-8'))
stores = {s.code:s for s in Store.objects.filter(archived=False)}
assert len(stores) == manifest['stats']['stores']
assert Employee.objects.count() == len(manifest['employees'])
assert LegalEntity.objects.count() == len(manifest['legal_entities'])
assert list(get_user_model().objects.filter(is_active=True).values_list('username', flat=True)) == ['demo.admin']
for record in manifest['stores']:
    store = stores[record['code']]
    assert (store.name,store.city,store.network) == (record['name'],record['city'],record['network'])
    assert {a.slot:a.employee.key for a in store.staff.select_related('employee')} == record['staff']
sheet_count = 0
for key, filename in [('mm','mm-complete.json'),('kk','kk-complete.json'),('hr','hr.json')]:
    source = json.loads((directory/'sources'/filename).read_text('utf-8'))
    document = SourceDocument.objects.get(key=key)
    assert document.sheets.count() == len(source['sheets'])
    for original in source['sheets']:
        saved = document.sheets.get(title=original['title'])
        assert saved.values == original['values']
        assert saved.formulas == original.get('formulas', [])
        sheet_count += 1
plans = {(p.store_id,str(p.date)):p for p in Plan.objects.filter(store__archived=False).order_by('pk')}
reports = {(r.store_id,str(r.date),r.checkpoint):r for r in Report.objects.filter(store__archived=False).prefetch_related('revisions')}
def dec(v): return Decimal(v) if v is not None else None
for p in manifest['plans']:
    saved = plans[(stores[p['code']].pk,p['date'])]
    assert (saved.revenue,saved.receipts,saved.units,saved.units_per_receipt) == (dec(p['revenue']),p['receipts'],p['units'],dec(p['units_per_receipt']))
filled, partial = 0, 0
for r in manifest['reports']:
    saved = reports[(stores[r['code']].pk,r['date'],r['checkpoint'])]
    assert saved.source_data == r['source_data']
    assert saved.first_received_at is None and saved.deadline is None
    versions = list(saved.revisions.all())
    if not r['has_values']:
        assert not versions
        continue
    assert len(versions) == 1
    current = versions[0]
    assert (current.revenue,current.receipts,current.units) == (dec(r['values']['revenue']),r['values']['receipts'],r['values']['units'])
    assert current.origin == 'sheets' and current.received_at is None
    assert current.employee == r['source_data']['employee']
    assert not saved.findings.exists()
    filled += 1
    partial += any(v is None for v in r['values'].values())
print(json.dumps({'verified':True,'stores':len(stores),'employees':Employee.objects.count(),'source_sheets':sheet_count,'plans':len(plans),'report_slots':len(reports),'filled_checkpoints':filled,'partial_checkpoints':partial,'issues':ImportIssue.objects.count()}, ensure_ascii=False))
