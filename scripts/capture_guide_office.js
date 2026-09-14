async (page) => {
  await page.getByRole('button', {name:'Требуют внимания',exact:true}).click();
  await page.locator('.w-table-scroll tbody tr').first().waitFor();
  const snapshot = await page.getByRole('main').ariaSnapshot();
  if (!snapshot.includes('Требуют внимания')) throw new Error('Unexpected office page');
  await page.evaluate(() => window.scrollTo(0,0));
  const main = await page.locator('.w-main').boundingBox();
  const table = await page.locator('.w-table-scroll').boundingBox();
  const clip = {x:main.x+12,y:20,width:main.width-24,height:table.y+table.height-8};
  await page.screenshot({path:'output/playwright/office-daily.png',clip});
  const points = [];
  for (const [number, locator] of [[1,page.getByLabel('Рабочая дата',{exact:true})],[2,page.getByRole('button',{name:'17:00',exact:true})],[3,page.getByRole('button',{name:'Требуют внимания',exact:true})],[4,page.getByRole('button',{name:'УЧ-03, 17:00: Проверить',exact:true})]]) {
    const b=await locator.boundingBox(); points.push({number,x:b.x-clip.x+6,y:b.y-clip.y+4});
  }
  return {clip,points};
}
