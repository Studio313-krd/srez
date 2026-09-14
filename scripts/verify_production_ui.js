async (page) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://srez.studio313.ru/?date=2026-09-13');
  await page.getByRole('heading',{name:'Рабочий стол',exact:true}).waitFor();
  const data=await page.evaluate(async()=>{
    const d=await fetch('/api/dashboard/?date=2026-09-13').then(r=>r.json());
    const m=await fetch('/api/manage/').then(r=>r.json());
    window.srezCheckData=d;
    return {stores:d.stores.length,employees:m.employees.length,users:m.users.length,role:(await fetch('/api/session/').then(r=>r.json())).user.role};
  });
  if(data.stores!==83 || data.employees!==200 || data.role!=='manager') throw new Error('Production data mismatch '+JSON.stringify(data));
  await page.getByRole('button',{name:'Закрытие',exact:true}).click();
  await page.getByRole('button',{name:'Требуют внимания',exact:true}).click();
  const table=page.locator('[data-table="Отчёты магазинов"]');
  if(await table.locator('tbody tr').count()!==43) throw new Error('Missing reports are not visible');
  await table.getByRole('button',{name:'Поиск и сортировка: Магазин',exact:true}).click();
  await page.getByRole('textbox',{name:'Поиск: Магазин',exact:true}).fill('MS-041');
  await page.getByRole('button',{name:'Закрыть настройки столбца',exact:true}).click();
  if(await table.locator('tbody tr').count()!==1) throw new Error('Column search failed');
  await table.getByRole('button',{name:'Экспорт',exact:true}).click();
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Excel (.xlsx)',exact:true}).click();
  await (await pending).saveAs('C:/Proj/seller-analysis/.local/production-export.xlsx');
  await page.getByRole('dialog',{name:'В каком формате выгрузить'}).waitFor({state:'hidden'});
  await page.setViewportSize({width:1800,height:1100});
  await page.screenshot({path:'output/playwright/production-workspace.png'});
  const cookies=await page.context().cookies();
  const session=cookies.find(c=>c.name==='sessionid');
  if(!session?.secure || !session?.httpOnly) throw new Error('Session cookie flags incorrect');
  if(errors.length) throw new Error('Browser errors: '+errors.join(';'));
  return {...data,missingAttention:43,filteredExport:true,httpsSession:true,browserErrors:errors.length};
}
