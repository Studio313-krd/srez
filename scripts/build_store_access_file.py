"""Create an owner-only workbook from the private production credential transfer."""
import json
import tarfile
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

ROOT = Path(__file__).resolve().parents[1]
with tarfile.open(ROOT/'.local/srez-store-access.tar') as archive:
    member = archive.getmember('srez-store-access.json')
    assert member.isfile() and member.size < 1000000
    raw = archive.extractfile(member).read()
records = json.loads(raw)
assert len(records) == 83 and len({r['username'] for r in records}) == 83
(ROOT/'.local/production-store-access.json').write_bytes(raw)
book = Workbook()
sheet = book.active
sheet.title = 'Доступы магазинов'
sheet.append(['Срез - доступы магазинов'])
sheet.merge_cells('A1:F1')
sheet.append(['Вход: https://srez.studio313.ru/'])
sheet.merge_cells('A2:F2')
sheet.append(['Для офиса: передайте каждому магазину только его строку. Полный файл содержит пароли всей сети.'])
sheet.merge_cells('A3:F3')
sheet.append(['Созданы на рабочем сервере 14.09.2026. Это готовые доступы; изменение ячеек не меняет пароль на сайте.'])
sheet.merge_cells('A4:F4')
sheet.append(['Код', 'Город', 'Магазин', 'Логин', 'Пароль', 'Адрес входа'])
for record in sorted(records, key=lambda r:r['code']):
    sheet.append([record['code'],record['city'],record['store'],record['username'],record['password'],'https://srez.studio313.ru/'])
for row in sheet:
    for cell in row:
        cell.font = Font(name='Arial',size=11,color='162D4D')
        cell.alignment = Alignment(vertical='center',wrap_text=True)
        if cell.value is not None: cell.data_type = 's'
for cell in sheet[5]:
    cell.fill=PatternFill('solid',fgColor='162D4D')
    cell.font=Font(name='Arial',size=11,bold=True,color='FFFFFF')
sheet['A1'].font=Font(name='Arial',size=18,bold=True,color='162D4D')
for key,width in zip('ABCDEF',[14,24,60,23,25,35]): sheet.column_dimensions[key].width=width
for row in range(1,sheet.max_row+1): sheet.row_dimensions[row].height=32 if row<6 else 36
sheet.freeze_panes='D6'
sheet.auto_filter.ref=f'A5:F{sheet.max_row}'
sheet.print_title_rows='1:5'
sheet.sheet_properties.pageSetUpPr.fitToPage=True
sheet.page_setup.orientation='landscape'
sheet.page_setup.paperSize=sheet.PAPERSIZE_A4
sheet.page_setup.fitToWidth=1
sheet.page_setup.fitToHeight=0
target=ROOT/'.local/Srez_store_access.xlsx'
book.save(target)
check=load_workbook(target)
assert check.active.max_row == 88
assert all(check.active.cell(i,5).value for i in range(6,89))
assert not any(c.data_type=='f' for row in check.active for c in row)
print('Private workbook saved and checked: 83 store accounts; passwords not printed.')
