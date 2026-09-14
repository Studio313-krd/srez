async (page) => {
  await page.evaluate(() => window.scrollTo(0,0));
  const top=await page.locator('.w-page-head').boundingBox();
  const bottom=await page.locator('.w-store-checkpoints').boundingBox();
  const clip={x:8,y:top.y-5,width:624,height:bottom.y+bottom.height-top.y+10};
  await page.screenshot({path:'output/playwright/seller-start.png',clip});
  const points=[];
  for (const [number,locator] of [[1,page.getByLabel('Рабочая дата',{exact:true})],[2,page.getByRole('combobox',{name:'Магазин',exact:true})],[3,page.getByRole('button',{name:/2 17:00/})]]) {
    const b=await locator.boundingBox(); points.push({number,x:b.x-clip.x+4,y:b.y-clip.y+4});
  }
  return {clip,points};
}
