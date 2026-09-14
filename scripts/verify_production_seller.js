async (page) => {
  await page.goto('https://srez.studio313.ru/?date=2026-09-13');
  await page.getByRole('heading',{name:'Отчёт за смену',exact:true}).waitFor();
  const result=await page.evaluate(async()=>{
    const session=await fetch('/api/session/').then(r=>r.json());
    const data=await fetch('/api/dashboard/?date=2026-09-13').then(r=>r.json());
    const management=await fetch('/api/manage/');
    // Report 1 belongs to an archived demonstration store and is outside this account.
    const foreign=await fetch('/api/reports/1/');
    const exportResponse=await fetch('/api/table-export/',{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':session.csrf},body:JSON.stringify({format:'xlsx',columns:['Test'],rows:[]})});
    return {role:session.user.role,stores:data.stores.length,management:management.status,foreignReport:foreign.status,export:exportResponse.status};
  });
  if(result.role!=='store'||result.stores!==1||result.management!==403||result.foreignReport!==404||result.export!==403) throw new Error('Seller access boundary failed '+JSON.stringify(result));
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw new Error('Seller mobile overflow');
  await page.screenshot({path:'output/playwright/production-seller-mobile.png'});
  return {...result,mobileOverflow:false};
}
