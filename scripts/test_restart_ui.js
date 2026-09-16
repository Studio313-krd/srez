async (page)=>{
  await page.goto('http://127.0.0.1:8097/management');
  await page.getByRole('button',{name:'Начать заново',exact:true}).click();
  await page.getByRole('button',{name:'Удалить учебные отчёты и начать',exact:true}).click();
  await page.getByText('Прогон начат: три среза за 9 минут. Откройте сегодняшний день.',{exact:true}).waitFor();
  const d=await page.evaluate(async()=>fetch('/api/dashboard/').then(r=>r.json()));
  if(d.stores.some(s=>s.reports.some(r=>r.current)))throw new Error('Restart did not clear today');
  return {reports:d.stores.flatMap(s=>s.reports).length,started:true};
}
