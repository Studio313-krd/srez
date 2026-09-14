async (page) => {
  await page.getByRole('textbox', {name: 'Поиск магазина', exact: true}).fill('MS-041');
  const data = await page.evaluate(async () => (await fetch('/api/dashboard/?date=2026-09-13')).json());
  const store = data.stores.find(s => s.code === 'MS-041');
  const results = [store.reports.map(r => ({id:r.id, checkpoint:r.checkpoint, revenue:r.current?.revenue}))];
  for (const stage of ['Закрытие', '13:00', '17:00', 'Закрытие']) {
    const button = page.getByRole('button', {name: `MS-041, ${stage}: Не полностью`, exact:true});
    await button.scrollIntoViewIfNeeded();
    const hit = await button.evaluate(el => {
      const b = el.getBoundingClientRect();
      const target = document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      return {width:b.width, label:el.getAttribute('aria-label'), hit:target.closest('button')?.getAttribute('aria-label')};
    });
    await button.click();
    results.push({stage, hit, title:await page.getByRole('dialog').getByRole('heading', {level:2}).innerText()});
    await page.getByRole('button',{name:'Закрыть отчёт',exact:true}).click();
  }
  return results;
}
