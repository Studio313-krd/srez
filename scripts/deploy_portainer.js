async (page) => {
  const state = await page.evaluate(() => {
    const names = [...document.querySelectorAll('input[placeholder="e.g. FOO"]')];
    const values = [...document.querySelectorAll('input[placeholder="e.g. bar"]')];
    const env=Object.fromEntries(names.map((n,i)=>[n.value,values[i]?.value || '']));
    return {secretReady:(env.SECRET_KEY || '').length>=50, databaseReady:(env.POSTGRES_PASSWORD || '').length>=30,
      tokenSet:!!env.TELEGRAM_BOT_TOKEN, sendingDisabled:env.TELEGRAM_ENABLED==='false'};
  });
  if(!state.secretReady || !state.databaseReady || !state.sendingDisabled) throw new Error('Incomplete or unsafe production configuration');
  const responsePromise=page.waitForResponse(r=>r.url().includes('/api/stacks/create/standalone/repository') && r.request().method()==='POST', {timeout:600000});
  await page.getByRole('button',{name:'Deploy the stack',exact:true}).click();
  const response=await responsePromise;
  const result=await response.json();
  return {httpStatus:response.status(), stackId:result.Id, name:result.Name, tokenSet:state.tokenSet, sendingDisabled:state.sendingDisabled,
    failed: !response.ok()};
}
