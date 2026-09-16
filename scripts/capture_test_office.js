async (page) => {
  const base='http://127.0.0.1:8097';
  await page.setViewportSize({width:1500,height:1100});
  await page.goto(base+'/management');
  await page.getByRole('heading',{name:'Первый тест за 9 минут',exact:true}).waitFor();
  const accounts=await page.evaluate(async()=>{const d=await fetch('/api/manage/').then(r=>r.json());return {stores:d.stores.length,networks:d.stores.map(s=>s.network),employees:d.employees.length};});
  if(accounts.stores!==2||accounts.employees!==1||!accounts.networks.includes('MM')||!accounts.networks.includes('KK'))throw new Error('Invalid test fixture');
  await page.locator('.w-test-banner').screenshot({path:'output/playwright/start-test-banner.png'});
  await page.locator('.t-controls').screenshot({path:'output/playwright/start-test-controls-before.png'});
  await page.getByRole('button',{name:'Изменить магазин TEST-MS',exact:true}).click();
  await page.getByRole('dialog').screenshot({path:'output/playwright/start-store-settings.png'});
  await page.getByRole('button',{name:'Отмена',exact:true}).click();
  await page.getByRole('button',{name:'Планы',exact:true}).click();
  await page.locator('[data-table="Дневные планы"]').screenshot({path:'output/playwright/start-test-plans.png'});
  await page.getByRole('button',{name:'Начать тест сейчас',exact:true}).click();
  await page.getByRole('button',{name:'Начать заново',exact:true}).waitFor();
  await page.locator('.t-controls').screenshot({path:'output/playwright/start-test-controls.png'});
  await page.getByRole('button',{name:'Начать заново',exact:true}).click();
  await page.getByRole('dialog',{name:'Начать тест заново'}).waitFor();
  await page.getByRole('button',{name:'Отмена',exact:true}).click();
  await page.goto(base+'/');
  await page.getByRole('heading',{name:'Рабочий стол',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/start-test-office.png'});
  return {...accounts,runStarted:true,restartCancelChecked:true};
}
