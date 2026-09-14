"""Normalize captured sources without changing any original workbook.

The HR master supplies permanent IDs; camera codes identify rows only in MM.
Every mapped address and its original spelling remains in the import manifest.
"""
import hashlib
import json
import re
from collections import Counter
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / '.local/import'
BOOKS = {key: json.loads((ROOT / 'sources' / name).read_text('utf-8')) for key, name in
         [('mm', 'mm-complete.json'), ('kk', 'kk-complete.json'), ('hr', 'hr.json')]}
CAMERA_TO_HR = dict(zip(
    [20,19,18,16,17,15,21,10,11,12,31,30,29,32,33,34,22,61,63,42,43,44,13,36,37,35,80,38,39,64,73,74,75,53,52,54,55,56,41,40,23,66,65,67,68,69,71,72,70,62,14,24,26,79,27,25,28,45,47,46,48,51,49,50,76,77,58,59,57,60],
    [3,9,8,7,4,5,6,2,1,10,14,12,13,11,69,15,16,17,18,19,20,68,21,24,25,22,23,26,27,28,29,31,30,34,33,32,35,36,38,37,39,40,41,42,43,46,47,45,44,48,49,51,50,72,53,52,54,55,56,57,61,60,59,58,62,63,66,64,67,65]))

def clean(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()

def name_key(v):
    return clean(v).casefold().replace('ё', 'е')

stores, employees, reports, plans, issues, legal = {}, {}, [], [], {}, []

def issue(key, kind, message, code=None, **details):
    issues[key] = {'key': key, 'kind': kind, 'message': message, 'code': code, 'details': details}

def employee(name, source, position='Продавец'):
    name = clean(name)
    if not name or name_key(name) in ['вакансия', 'вакант', '-', 'нет', 'фио', 'продавец', 'офис']:
        return None
    key = hashlib.sha256(name_key(name).encode()).hexdigest()
    record = employees.setdefault(key, {'key': key, 'name': name, 'position': position, 'sources': []})
    if position == 'Куратор': record['position'] = position
    if source not in record['sources']: record['sources'].append(source)
    return key

def numeric(v, location, integer=False):
    if v is None or v == '': return None
    try:
        number = Decimal(str(v).replace('\xa0', '').replace(' ', '').replace(',', '.'))
        if not number.is_finite() or (integer and (number != number.to_integral_value() or number < 0)):
            raise ValueError()
        return int(number) if integer else str(number.quantize(Decimal('.01')))
    except (ValueError, InvalidOperation):
        issue('value:' + location, 'invalid_value', 'Некорректное число в источнике; оригинал сохранён.', location=location, value=v)
        return None

for sheet in BOOKS['hr']['sheets']:
    if sheet['title'] == 'Юридические лица':
        headers = sheet['values'][2]
        legal = [{'name': clean(r[1]), 'data': dict(zip(headers[1:], r[1:]))} for r in sheet['values'][3:] if len(r) > 1 and r[1]]
    if sheet['title'] != 'Кадровый реестр сети': continue
    for row_number, row in enumerate(sheet['values'], 1):
        if len(row) < 14 or not re.fullmatch(r'(?:MS|KK)-\d+', str(row[1])): continue
        _, code, ordinal, entity, brand, region, city, address, curator, seller1, seller2, vacancies, situation, wage = row[:14]
        city = re.sub(r'^г\.\s*', '', clean(city))
        zone = 'Asia/Omsk' if 'Омск' in city else 'Asia/Yekaterinburg' if 'Тюмень' in city else 'Europe/Samara' if any(c in city for c in ['Самара','Ульяновск','Димитровград']) else 'Europe/Moscow'
        source = f'Кадровый реестр сети!{row_number}'
        stores[code] = {'code': code, 'name': clean(address), 'city': city, 'network': 'KK' if code.startswith('KK') else 'MM', 'timezone': zone,
            'profile': {'legal_entity': clean(entity), 'region': clean(region), 'curator': clean(curator),
                        'vacancies': vacancies, 'staffing': clean(situation), 'shift_rate': wage, 'hr_source': source,
                        'source_addresses': [], 'schedule_confirmed': False},
            'staff': {slot: key for slot, key in [('curator', employee(curator, source, 'Куратор')),
                ('seller1', employee(seller1, source)), ('seller2', employee(seller2, source))] if key}}

def mapped(row, network):
    if network == 'kk':
        code = clean(row[1])
    elif row[1] is not None:
        code = f'MS-{CAMERA_TO_HR[int(row[1])]:03}'
    else:
        city = clean(row[0])
        code = {'Белгород': 'MS-074', 'Брянск': 'MS-071', 'Пенза': 'MS-070'}[city]
    if code not in stores: raise ValueError(f'No master store for {network}: {row[:3]}')
    return code

for key in ['mm', 'kk']:
    for sheet in BOOKS[key]['sheets']:
        rows = sheet['values']
        if not re.fullmatch(r'\d{2}\.\d{2}', sheet['title']): continue
        if len(rows) < 6 or rows[4][:3] != ['Город', 'Код', 'Винотека']:
            raise ValueError(f'Unexpected template: {key} {sheet["title"]}')
        year_match = re.search(r'\d{2}\.\d{2}\.(\d{4})', str(rows[0][0]))
        year = int(re.search(r'20\d{2}', BOOKS[key]['title'])[0])
        day = date(year, int(sheet['title'][3:]), int(sheet['title'][:2])).isoformat()
        if not year_match or sheet['title'] not in str(rows[0][0]):
            issue(f'header:{key}:{sheet["title"]}', 'header_date', 'Заголовок листа повреждён или отличается от имени вкладки. Дата взята из вкладки и года книги.', sheet=sheet['title'], header=rows[0][0], imported_date=day)
        headers, groups = rows[4], rows[3]
        has_employee = 'Сотрудник' in headers
        plan_index = next(i for i, v in enumerate(groups) if v and 'ПЛАН' in str(v))
        stage_indices = {stage: groups.index(label) for stage, label in [('13', '13:00'), ('17', '17:00')]}
        close_index = groups.index('ЗАКРЫТИЕ') if 'ЗАКРЫТИЕ' in groups else stage_indices['17'] + 4
        if headers[close_index+1:close_index+4] != ['Чеки', 'Алк. ед.', 'Ед./чек']:
            raise ValueError(f'Cannot identify closing columns: {key} {sheet["title"]}')
        stage_indices['close'] = close_index
        if 'ЗАКРЫТИЕ' not in groups:
            issue(f'template:{key}:{sheet["title"]}', 'header_missing', 'Заголовок закрытия стёрт. Столбцы определены по соседнему срезу и заголовкам чеков/единиц.', sheet=sheet['title'])
        seen = set()
        for n, raw in enumerate(rows[5:], 6):
            if len(raw) < 3 or not raw[0] or not raw[2] or 'ИТОГО' in str(raw[2]).upper(): continue
            row = list(raw) + [None] * (31 - len(raw))
            code = mapped(row, key)
            if code in seen: raise ValueError(f'Duplicate {code} in {sheet["title"]}')
            seen.add(code)
            location = f'{key}:{sheet["title"]}:{n}'
            provenance = {'document': key, 'sheet': sheet['title'], 'row': n, 'url': BOOKS[key]['url'] + '?gid=' + str(sheet['sheet_id']), 'original_address': row[2]}
            store = stores[code]
            alias = {'city': row[0], 'address': row[2], 'camera_code': row[1] if key == 'mm' else None}
            if alias not in store['profile']['source_addresses']: store['profile']['source_addresses'].append(alias)
            actual_employee = clean(row[3]) if has_employee else ''
            employee(actual_employee, f'{key.upper()} · дневные отчёты')
            extra = {'employee': actual_employee, 'priority': row[4 if has_employee else 3]}
            for label, field in [('Контакты','contacts'),('Резервы','reserves'),('Вернувшиеся','returning'),('Потери, ₽','losses'),('Действие / комментарий','action'),('Ответственный','responsible')]:
                if label in headers: extra[field] = row[headers.index(label)]
            source_data = {**provenance, **extra, 'raw_values': raw}
            plans.append({'code': code, 'date': day, 'revenue': numeric(row[plan_index], location+':plan_revenue'),
                'receipts': numeric(row[plan_index+1], location+':plan_receipts', True), 'units': numeric(row[plan_index+2], location+':plan_units', True),
                'units_per_receipt': numeric(row[plan_index+3], location+':plan_ratio'), 'source_data': provenance})
            for checkpoint, index in stage_indices.items():
                values = {'revenue': numeric(row[index], location+':'+checkpoint+':revenue'),
                          'receipts': numeric(row[index+1], location+':'+checkpoint+':receipts', True),
                          'units': numeric(row[index+2], location+':'+checkpoint+':units', True)}
                reports.append({'code': code, 'date': day, 'checkpoint': checkpoint, 'values': values, 'source_data': source_data,
                                'has_values': any(row[index+j] is not None and row[index+j] != '' for j in range(3))})
        expected = 73 if key == 'mm' else 9
        if len(seen) != expected: raise ValueError(f'{key} {sheet["title"]}: {len(seen)} stores, expected {expected}')

# Supplementary tabs remain complete in SourceSheet. Extract staff from plans,
# but do not silently replace current staff from the HR master with older lists.
for sheet in BOOKS['mm']['sheets']:
    if sheet['title'] == 'Планы':
        for n, row in enumerate(sheet['values'][6:], 7):
            if len(row) < 3 or not row[0] or not row[2]: continue
            code = mapped(row, 'mm')
            stores[code]['profile']['monthly_plan'] = {'row': n, 'values': row}
            for name in row[8:10]: employee(name, 'ММ · Планы')
for sheet in BOOKS['hr']['sheets']:
    if sheet['title'] in ['Культура крепкого', 'Мильстрим', 'Вакансии']:
        for n, row in enumerate(sheet['values'][3:], 4):
            if not row or row[0] not in stores: continue
            code = row[0]
            for name in row[8:10]: employee(name, 'Кадровый файл · ' + sheet['title'])
            current = stores[code]
            master_staff = [employees[current['staff'][slot]]['name'] if slot in current['staff'] else 'Вакансия' for slot in ['seller1','seller2']]
            if [name_key(x) for x in row[8:10]] != [name_key(x) for x in master_staff] or row[10] != current['profile']['vacancies']:
                issue(f'hr:{sheet["title"]}:{code}', 'hr_conflict', 'Состав сотрудников или вакансии отличаются от основного кадрового реестра.', code,
                      sheet=sheet['title'], row=n, secondary_staff=row[8:10], current_staff=master_staff)

for code, store in stores.items():
    if not store['profile']['source_addresses']:
        issue('no-reports:'+code, 'missing_source', 'Магазин есть в кадровом реестре, но отсутствует в двух Google-отчётах.', code)
    for alias in store['profile']['source_addresses']:
        # Compare house identifiers separately from harmless street abbreviations.
        digits1, digits2 = re.findall(r'\d+[а-яa-z]?(?:/\d+)?', name_key(alias['address'])), re.findall(r'\d+[а-яa-z]?(?:/\d+)?', name_key(store['name']))
        if digits1 != digits2:
            issue('address:'+code, 'address_mapping', 'Варианты адреса в отчёте и кадровом реестре требуют сверки; оба сохранены.', code,
                  report_address=alias['address'], registry_address=store['name'])
issue('source-totals', 'source_summary', 'Сводные листы кадрового файла содержат устаревшие итоги. В основном реестре 83 уникальных магазина, в Google-отчётах 82.',
      master=83, google=82, extra_store='MS-073')
future_count = sum(r['has_values'] and r['date'] > date.today().isoformat() for r in reports)
if future_count: issue('future-values', 'future_values', 'В исходной книге есть показатели на будущие даты. Они сохранены как данные источника.', count=future_count)
result = {'stores': list(stores.values()), 'employees': list(employees.values()), 'reports': reports, 'plans': plans,
          'issues': list(issues.values()), 'legal_entities': legal,
          'stats': {'stores': len(stores), 'by_network': dict(Counter(s['network'] for s in stores.values())), 'employees': len(employees),
                    'source_tabs': sum(len(b['sheets']) for b in BOOKS.values()), 'reports_with_values': sum(r['has_values'] for r in reports),
                    'report_slots': len(reports), 'plans': len(plans), 'issues': len(issues), 'legal_entities': len(legal),
                    'from': min(r['date'] for r in reports), 'to': max(r['date'] for r in reports)}}
(ROOT / 'prepared.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result['stats'], ensure_ascii=False))
