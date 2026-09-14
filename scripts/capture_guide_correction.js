async (page) => {
  const dialog=page.getByRole('dialog');
  const reason=dialog.getByRole('textbox',{name:'Причина исправления',exact:true});
  await reason.scrollIntoViewIfNeeded();
  const label=await reason.locator('..').boundingBox();
  const button=await dialog.getByRole('button',{name:'Сохранить исправление',exact:true}).boundingBox();
  await page.screenshot({path:'output/playwright/seller-correction.png',clip:{x:label.x-2,y:label.y-5,width:label.width+4,height:button.y+button.height-label.y+10}});
  return {reasonVisible:await reason.isVisible()};
}
