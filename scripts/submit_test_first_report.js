async (page) => {
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Сотрудник магазина',{exact:true}).fill('Программист (тестовый сотрудник)');
  await dialog.getByLabel('Выручка, ₽',{exact:true}).fill('5000');
  await dialog.getByLabel('Количество чеков',{exact:true}).fill('5');
  await dialog.getByLabel('Алкогольные единицы',{exact:true}).fill('8');
  await dialog.screenshot({path:'output/playwright/start-seller-filled.png'});
  await dialog.getByRole('button',{name:'Отправить отчёт',exact:true}).click();
  await dialog.getByText(/Сохранено в/).waitFor();
  await dialog.getByText(/Сохранено в/).screenshot({path:'output/playwright/start-seller-saved.png'});
  await page.getByRole('button',{name:'Закрыть отчёт',exact:true}).click();
  const result=await page.evaluate(async()=>{
    const d=await fetch('/api/dashboard/').then(r=>r.json());
    const s=d.stores.find(s=>s.code==='TEST-MS'),r=s.reports.find(r=>r.checkpoint==='13');
    return {stores:d.stores.length,revenue:r.current.revenue,receipts:r.current.receipts,units:r.current.units,late:r.late};
  });
  if(result.revenue!=='5000.00'||result.receipts!==5||result.units!==8)throw new Error('Report was not saved correctly');
  return result;
}
