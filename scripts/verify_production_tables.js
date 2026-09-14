async (page) => {
  await page.goto('https://srez.studio313.ru/management?tab=employees');
  const employees=page.locator('[data-table="Сотрудники"]');
  await employees.waitFor();
  const name=await page.evaluate(async()=>{const m=await fetch('/api/manage/').then(r=>r.json());return m.employees[150].name;});
  const firstHeader=employees.locator('thead button').first();await firstHeader.click();
  await page.locator('.st-menu input').fill(name);
  await page.getByRole('button',{name:'Закрыть настройки столбца',exact:true}).click();
  if(await employees.locator('tbody tr').count()!==1 || !(await employees.innerText()).includes(name)) throw new Error('Employee beyond first page not found');
  await page.goto('https://srez.studio313.ru/management?tab=sources');
  const sheet=page.locator('[data-table="Исходный лист"]');await sheet.waitFor();
  await sheet.getByRole('button',{name:'Поиск и сортировка: №',exact:true}).click();
  await page.getByRole('textbox',{name:'Поиск: №',exact:true}).fill('70');
  await page.getByRole('button',{name:'Закрыть настройки столбца',exact:true}).click();
  if(!(await sheet.locator('tbody').innerText()).includes('70')) throw new Error('Source row beyond first page not found');
  await page.goto('https://srez.studio313.ru/management?tab=access');
  const accounts=page.locator('[data-table="Доступы магазинов"]');await accounts.waitFor();
  if(await accounts.locator('tbody tr').count()!==83) throw new Error('Store accesses are incomplete');
  return {employeeBeyondFirstPage:true,sourceBeyondFirstPage:true,storeAccounts:83};
}
