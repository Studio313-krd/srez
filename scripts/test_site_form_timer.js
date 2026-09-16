async (page) => {
  const report=await page.evaluate(async()=>{const d=await fetch('/api/dashboard/').then(r=>r.json());return d.stores.find(s=>s.code==='TEST-MS').reports.find(r=>r.checkpoint==='close');});
  await page.clock.install({time:new Date(Date.parse(report.available_at)-5000)});
  try {
    await page.goto('http://127.0.0.1:8097/?report='+report.id);
    const field=page.getByRole('dialog').getByLabel('Выручка, ₽',{exact:true});
    await field.waitFor({state:'visible'});
    if(await field.isEnabled())throw new Error('Early form should be disabled');
    await page.clock.fastForward(6000);
    if(!(await field.isEnabled()))throw new Error('Open form did not unlock when time arrived');
    return {formLockedBeforeOpening:true,automaticallyUnlocked:true,submitted:false};
  } finally {await page.clock.setSystemTime(new Date());}
}
