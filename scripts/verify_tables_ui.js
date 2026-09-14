async (page) => {
  await page.goto('http://127.0.0.1:8096/?date=2026-09-13');
  await page.setViewportSize({width:1800,height:1100});
  await page.getByRole('button',{name:'Закрытие',exact:true}).click();
  if(await page.getByRole('navigation',{name:'Основная навигация'}).getByRole('link',{name:'Замечания',exact:true}).count()) throw new Error('Old sidebar link remains');
  if(await page.getByRole('button',{name:'Развернуть панель',exact:true}).count()) await page.getByRole('button',{name:'Развернуть панель',exact:true}).click();
  await page.getByRole('button',{name:'Свернуть панель',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Развернуть панель',exact:true}).waitFor();
  await page.getByRole('button',{name:'Развернуть панель',exact:true}).click();
  await page.getByRole('button',{name:'Закрытие',exact:true}).click();
  const table=page.locator('[data-table="Отчёты магазинов"]');
  await table.getByRole('button',{name:'Поиск и сортировка: Магазин',exact:true}).click();
  await page.getByRole('textbox',{name:'Поиск: Магазин',exact:true}).fill('Лесной');
  await page.getByRole('button',{name:'Закрыть настройки столбца',exact:true}).click();
  if(await table.locator('tbody tr').count()!==1) throw new Error('Field filter failed');
  await table.getByRole('button',{name:'Поиск и сортировка: Чеки',exact:true}).click();
  await page.getByRole('textbox',{name:'Поиск: Чеки',exact:true}).fill('999');
  if(!(await table.innerText()).includes('Найдено 0 из 3')) throw new Error('Combined filters failed');
  await page.getByRole('button',{name:'Сбросить этот столбец',exact:true}).click();
  await table.getByRole('button',{name:'Экспорт',exact:true}).click();
  await page.getByRole('dialog',{name:'В каком формате выгрузить'}).waitFor();
  for(const [label,filename] of [['Excel (.xlsx)','table-filtered.xlsx'],['CSV (.csv)','table-filtered.csv']]) {
    const pending=page.waitForEvent('download');
    await page.getByRole('button',{name:label,exact:true}).click();
    await (await pending).saveAs('output/xlsx/'+filename);
    if(filename.endsWith('xlsx')) await table.getByRole('button',{name:'Экспорт',exact:true}).click();
  }
  await table.getByRole('button',{name:'Сбросить всё',exact:true}).click();
  await table.getByRole('button',{name:'Поиск и сортировка: Выручка · Закрытие',exact:true}).click();
  await page.getByRole('button',{name:'По убыванию / Я–А',exact:true}).click();
  const names=await table.locator('tbody tr td:first-child').allTextContents();
  if(!names[0].includes('Лесной') || !names.at(-1).includes('Центральный')) throw new Error('Numeric sorting or empty-last failed');
  await page.screenshot({path:'output/playwright/tables-desktop.png'});
  await page.getByRole('link',{name:'Управление',exact:true}).click();
  const checks=[];
  for(const [tab,label] of [['Магазины','Магазины'],['Сотрудники','Сотрудники'],['Планы','Дневные планы'],['Доступ и история','История действий']]) {
    await page.getByRole('button',{name:tab,exact:true}).click();
    const grid=page.locator(`[data-table="${label}"]`);
    await grid.waitFor();
    const heading=grid.locator('thead .st-heading').first();
    await heading.click();
    await page.locator('.st-menu input').fill('no-such-value-123');
    await page.getByRole('button',{name:'Закрыть настройки столбца',exact:true}).click();
    if(!(await grid.innerText()).includes('Найдено 0')) throw new Error('Filter failed in '+tab);
    await grid.getByRole('button',{name:'Сбросить всё',exact:true}).click();
    checks.push(label);
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Свернуть панель',exact:true}).click();
  await page.getByRole('button',{name:'Развернуть панель',exact:true}).click();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(overflow) throw new Error('Page overflows on mobile');
  return {sidebarPersistence:true,multipleFilters:true,numericSort:true,bothDownloads:true,tables:checks,mobile:true};
}
