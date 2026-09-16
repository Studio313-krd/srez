async (page) => {
  const id=await page.evaluate(async()=>{const d=await fetch('/api/dashboard/').then(r=>r.json());return d.stores.find(s=>s.code==='TEST-MS').reports.find(r=>r.checkpoint==='13').id;});
  await page.goto('http://127.0.0.1:8097/?report='+id);
  await page.getByRole('button',{name:'Задать вопрос магазину',exact:true}).click();
  await page.getByLabel('Вопрос магазину',{exact:true}).fill('Учебная проверка: подтвердите показатели первого отчёта');
  await page.getByRole('button',{name:'Сохранить вопрос',exact:true}).click();
  await page.getByText('Вопрос сохранён. Продавец увидит его в этом отчёте; ответ появится здесь же.',{exact:true}).waitFor();
  return {questionCreated:true};
}
