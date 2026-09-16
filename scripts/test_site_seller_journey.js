async (page) => {
  const base='http://127.0.0.1:8097';
  const stores=await page.evaluate(async()=>fetch('/api/dashboard/').then(r=>r.json()).then(d=>d.stores));
  const id=(store,checkpoint)=>stores.find(s=>s.code===store).reports.find(r=>r.checkpoint===checkpoint).id;
  async function submit(store,checkpoint,revenue,receipts,units,comment='',edit=false){
    if(!edit&&stores.find(s=>s.code===store).reports.find(r=>r.checkpoint===checkpoint).current)return;
    await page.goto(base+'/?report='+id(store,checkpoint));
    const dialog=page.getByRole('dialog');
    await dialog.getByLabel('Сотрудник магазина',{exact:true}).fill('Программист (тестовый сотрудник)');
    await dialog.getByLabel('Выручка, ₽',{exact:true}).fill(String(revenue));
    await dialog.getByLabel('Количество чеков',{exact:true}).fill(String(receipts));
    await dialog.getByLabel('Алкогольные единицы',{exact:true}).fill(String(units));
    if(comment)await dialog.getByLabel(edit?'Причина исправления':'Пояснение, если нужно',{exact:true}).fill(comment);
    await dialog.getByRole('button',{name:edit?'Сохранить исправление':'Отправить отчёт',exact:true}).click();
    await dialog.getByText(/Сохранено в/).waitFor();
  }
  await submit('TEST-KK','13',4000,4,6);
  if(!stores.find(s=>s.code==='TEST-MS').reports.find(r=>r.checkpoint==='13').findings.some(f=>f.actions.some(a=>a.comment==='Проверили, учебные цифры верны'))){
    await page.goto(base+'/?report='+id('TEST-MS','13'));
    await page.getByLabel('Ответ видеоконтролю',{exact:true}).fill('Проверили, учебные цифры верны');
    await page.getByRole('button',{name:'Отправить пояснение',exact:true}).click();
    await page.getByText('Проверили, учебные цифры верны',{exact:true}).waitFor();
  }
  await submit('TEST-MS','17',3000,6,9,'Учебная ошибка');
  await submit('TEST-MS','17',12000,12,18,'Исправлена учебная ошибка',true);
  await page.getByRole('button',{name:/История отчёта/}).click();
  await page.getByText('Исправлена учебная ошибка',{exact:true}).waitFor();
  await page.getByRole('dialog').screenshot({path:'output/playwright/start-test-history.png'});
  await submit('TEST-KK','17',9000,9,13);
  await submit('TEST-MS','close',20000,20,30);
  await submit('TEST-KK','close',18000,18,26);
  const result=await page.evaluate(async()=>{const d=await fetch('/api/dashboard/').then(r=>r.json());return d.stores.map(s=>({code:s.code,reports:s.reports.map(r=>({checkpoint:r.checkpoint,revenue:r.current?.revenue,version:r.current?.version,late:r.late,findings:r.findings.map(f=>({kind:f.kind,state:f.state,actions:f.actions}))}))}));});
  if(result.some(s=>s.reports.some(r=>!r.revenue)))throw new Error('Not all six reports saved');
  if(result.find(s=>s.code==='TEST-MS').reports.find(r=>r.checkpoint==='17').version!==2)throw new Error('Correction did not create version 2');
  return result;
}
