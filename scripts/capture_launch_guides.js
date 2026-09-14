async (page) => {
  await page.setViewportSize({width:1380,height:1500});
  await page.goto('http://127.0.0.1:8096/?date=2026-09-13');
  await page.getByRole('button',{name:'Закрытие',exact:true}).click();
  await page.getByRole('button',{name:'Требуют внимания',exact:true}).click();
  const table=page.locator('[data-table="Отчёты магазинов"]');
  const header=await page.locator('.w-page-head').boundingBox();
  const stats=await page.locator('.w-stats').boundingBox();
  await page.screenshot({path:'output/playwright/office-summary-v2.png',clip:{x:header.x,y:header.y,width:stats.width,height:stats.y+stats.height-header.y}});
  const panel=await page.locator('.w-table-panel').boundingBox();
  const row=await table.locator('tbody tr').first().boundingBox();
  await page.screenshot({path:'output/playwright/office-table-v2.png',clip:{x:panel.x,y:panel.y,width:panel.width,height:row.y+row.height-panel.y}});
  await table.getByRole('button',{name:'Поиск и сортировка: Магазин',exact:true}).click();
  await page.getByRole('textbox',{name:'Поиск: Магазин',exact:true}).fill('Лесной');
  await page.locator('.st-menu').screenshot({path:'output/playwright/office-column-menu.png'});
  await page.getByRole('button',{name:'Закрыть настройки столбца',exact:true}).click();
  await table.getByRole('button',{name:'Экспорт',exact:true}).click();
  await page.locator('.st-export-dialog').screenshot({path:'output/playwright/office-export-choice.png'});
  await page.getByRole('button',{name:'Закрыть экспорт',exact:true}).click();
  await page.locator('.w-sidebar-top').screenshot({path:'output/playwright/office-collapse.png'});
  return {screenshots:5};
}
