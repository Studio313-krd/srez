async (page) => {
  await page.goto('http://127.0.0.1:8087/?date=2026-09-13');
  await page.getByRole('textbox',{name:'Поиск магазина',exact:true}).waitFor();
  const data=await page.evaluate(async()=> (await fetch('/api/dashboard/?date=2026-09-13')).json());
  const results=[];
  for (const [stage,label] of [['13','13:00'],['17','17:00'],['close','Закрытие']]) {
    await page.getByRole('button',{name:label,exact:true}).click();
    await page.getByRole('textbox',{name:'Поиск магазина',exact:true}).fill('');
    await page.getByRole('button',{name:'Нет отчёта',exact:true}).click();
    const expected = data.stores.filter(s=>['unfilled','missing'].includes(s.reports.find(r=>r.checkpoint===stage)?.status||s.checkpoint_status[stage])).length;
    const found = await page.locator('.w-table-scroll tbody tr').count();
    if(found!==expected) throw new Error(`Coverage ${stage}: ${found} != ${expected}`);
    results.push({stage, stores:data.stores.length, received:data.stores.filter(s=>s.reports.find(r=>r.checkpoint===stage)?.current).length, missing:found});
    await page.getByRole('button',{name:'Требуют внимания',exact:true}).click();
    if(await page.locator('.w-table-scroll tbody tr').count() < expected) throw new Error('Empty stores disappeared from attention');
    await page.getByRole('textbox',{name:'Поиск магазина',exact:true}).fill('MS-041');
    const report=data.stores.find(s=>s.code==='MS-041').reports.find(r=>r.checkpoint===stage);
    for(let i=0;i<3;i++) {
      const button=page.getByRole('button',{name:`MS-041, ${label}: Не полностью`,exact:true});
      if(await page.locator('.w-report-cell').count()!==1) throw new Error('More than selected checkpoint visible');
      await button.click();
      const title=await page.getByRole('dialog').getByRole('heading',{level:2}).innerText();
      if(!title.startsWith(label)) throw new Error(`Wrong checkpoint: ${title}`);
      const values=await page.getByRole('dialog').locator('.w-values').innerText();
      const rendered=Number(report.current.revenue).toLocaleString('ru-RU',{maximumFractionDigits:2});
      if(!values.replace(/\s/g,'').includes(rendered.replace(/\s/g,''))) throw new Error('Wrong revenue');
      if(!(await page.getByRole('dialog').innerText()).includes('не заполнены алкогольные единицы')) throw new Error('No partial explanation');
      await page.getByRole('button',{name:'Закрыть отчёт',exact:true}).click();
    }
  }
  await page.getByRole('textbox',{name:'Поиск магазина',exact:true}).fill('');
  await page.getByRole('button',{name:'Требуют внимания',exact:true}).click();
  await page.setViewportSize({width:2400,height:1350});
  await page.screenshot({path:'output/playwright/review-real-desktop.png'});
  const sizes=await page.evaluate(()=>Object.fromEntries(['.w-app','.w-table-scroll td','.w-status','.w-table-scroll td small'].map(s=>[s,getComputedStyle(document.querySelector(s)).fontSize])));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/review-real-mobile.png'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(overflow) throw new Error('Page overflow on mobile');
  return {coverage:results, sizes, checkpointClicks:9, mobileOverflow:overflow};
}
