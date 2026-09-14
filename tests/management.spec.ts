import {test, expect} from '@playwright/test';
import {readFileSync, mkdirSync} from 'node:fs';

// Read-only browser acceptance against the imported local preview.
// Mutations, permission boundaries and import replay are tested in isolated Django databases.
const credentials = Object.fromEntries(readFileSync('.local/docker-credentials.txt', 'utf8').trim().split(/\r?\n/).map(line => line.split(': ',2)));
test('administrator sees the complete network, source archive and management forms', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?date=2026-09-13');
  await page.getByLabel('Логин', {exact:true}).fill('demo.admin');
  await page.getByLabel('Пароль', {exact:true}).fill(credentials['demo.admin']);
  await page.getByRole('button', {name:'Войти', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Рабочий стол', exact:true})).toBeVisible();
  await expect(page.locator('.w-table-scroll tbody tr')).toHaveCount(83);
  await expect(page.locator('.w-account')).toContainText('Администратор');
  mkdirSync('design/screenshots', {recursive:true});
  await page.screenshot({path:'design/screenshots/imported-workspace.png'});

  await page.getByLabel('Поиск магазина').fill('KK-001');
  await page.getByRole('button', {name:/KK-001, 13:00/}).click();
  const report = page.getByRole('dialog');
  await expect(report).toContainText('Время сдачи в источнике не указано');
  await report.getByRole('button', {name:'Исправить показатели'}).click();
  await expect(report.getByLabel('Сотрудник магазина')).toBeVisible();
  await expect(report.getByLabel('Выручка, ₽', {exact:true})).toBeEditable();
  await expect(report.getByRole('button', {name:'Сохранить исправление'})).toBeEnabled();
  await report.getByRole('button', {name:'Закрыть отчёт'}).click();

  await page.getByRole('link', {name:'Управление', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Управление', exact:true})).toBeVisible();
  await expect(page.locator('.m-shops tbody tr')).toHaveCount(83);
  await page.screenshot({path:'design/screenshots/management-stores.png'});
  await page.getByRole('button', {name:'Изменить магазин MS-001', exact:true}).click();
  const card = page.getByRole('dialog');
  await expect(card.getByLabel('Постоянный код')).toHaveValue('MS-001');
  await expect(card.getByLabel('Продавец 1', {exact:true})).toBeVisible();
  await expect(card.getByLabel('График проверен, включить контроль сроков')).not.toBeChecked();
  await page.screenshot({path:'design/screenshots/management-store-card.png'});
  await card.getByRole('button', {name:'Отмена', exact:true}).click();
  await page.getByLabel('Поиск в справочнике').fill('Купавна');
  await expect(page.locator('.m-shops tbody tr')).toHaveCount(1);
  await expect(page.locator('.m-shops')).toContainText('MS-073');

  const nav = page.getByRole('navigation', {name:'Разделы управления'});
  await nav.getByRole('button', {name:'Сотрудники', exact:true}).click();
  await expect(page.locator('.m-table tbody tr')).toHaveCount(200);
  await expect(page.getByRole('heading', {name:'Сотрудники 200'})).toBeVisible();
  await nav.getByRole('button', {name:'Планы', exact:true}).click();
  await page.getByLabel('Рабочая дата', {exact:true}).fill('2026-09-13');
  await expect(page.locator('.m-table tbody tr')).toHaveCount(83);
  await page.getByRole('button', {name:'Изменить план KK-001', exact:true}).click();
  await expect(page.getByRole('dialog').getByLabel('План выручки, ₽')).not.toHaveValue('');
  await page.getByRole('dialog').getByRole('button', {name:'Отмена', exact:true}).click();
  await nav.getByRole('button', {name:'Графики', exact:true}).click();
  await expect(page.locator('.m-schedule-summary')).toContainText('0 из 83');
  await nav.getByRole('button', {name:'Юрлица', exact:true}).click();
  await expect(page.locator('.m-legal-list article')).toHaveCount(7);
  await nav.getByRole('button', {name:'Источники', exact:true}).click();
  await expect(page.locator('.m-section-heading')).toContainText('89 листов');
  await expect(page.locator('.m-source-list button')).toHaveCount(3);
  await expect(page.locator('.m-source-grid')).toBeVisible();
  await page.getByLabel('Показать формулы').check();
  await page.screenshot({path:'design/screenshots/management-sources.png'});

  await nav.getByRole('button', {name:/Сверка данных/}).click();
  await expect(page.locator('.m-issues article')).toHaveCount(68);
  await page.getByLabel('Вид расхождения').selectOption('missing_source');
  await expect(page.locator('.m-issues article')).toHaveCount(1);
  await expect(page.locator('.m-issues')).toContainText('MS-073');
  await page.getByRole('button', {name:'Зафиксировать результат'}).click();
  await expect(page.getByRole('dialog').getByLabel('Что проверили и какое значение принято')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {name:'Отмена', exact:true}).click();
  await nav.getByRole('button', {name:'Доступ и история', exact:true}).click();
  await expect(page.locator('.m-access')).toContainText('demo.admin');
  await expect(page.locator('.m-access')).not.toContainText('demo.office');
  await page.getByRole('button', {name:'Изменить пароль', exact:true}).click();
  await expect(page.getByRole('dialog').getByLabel('Текущий пароль')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {name:'Отмена', exact:true}).click();

  await page.setViewportSize({width:390,height:900});
  await nav.getByRole('button', {name:'Магазины', exact:true}).click();
  await expect(page.locator('.m-shops tbody tr')).toHaveCount(83);
  await page.screenshot({path:'design/screenshots/management-mobile.png'});
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth && !el.closest('.m-table-wrap')).map(el => ({name:el.tagName+'.'+el.className,width:el.getBoundingClientRect().width, left:el.getBoundingClientRect().left, overflow:getComputedStyle(el).overflow})).slice(0,20) }));
  expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
  expect(errors).toEqual([]);
});
