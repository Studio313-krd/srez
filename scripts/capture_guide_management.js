async (page) => {
  await page.getByRole('button',{name:'Изменить магазин УЧ-01',exact:true}).click();
  const dialog=page.getByRole('dialog');
  const snapshot=await dialog.ariaSnapshot();
  if (!snapshot.includes('Продавец 1')) throw new Error('Unexpected store editor');
  const team=dialog.locator('.m-form-grid').nth(1);
  await team.screenshot({path:'output/playwright/office-team.png'});
  await dialog.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const h=await dialog.getByRole('heading',{name:'График и контроль сроков',exact:true}).boundingBox();
  const footer=await dialog.locator('form > footer').boundingBox();
  const box=await dialog.boundingBox();
  await page.screenshot({path:'output/playwright/office-schedule.png',clip:{x:box.x+16,y:h.y-8,width:box.width-32,height:footer.y+footer.height-h.y+8}});
  await dialog.getByRole('button',{name:'Отмена',exact:true}).click();
  await page.getByRole('button',{name:'Планы',exact:true}).click();
  await page.getByRole('button',{name:'Изменить план УЧ-01',exact:true}).waitFor();
  const planSnapshot=await page.getByRole('main').ariaSnapshot();
  if (!planSnapshot.includes('Изменить план УЧ-01')) throw new Error('No plan row');
  await page.getByRole('button',{name:'Изменить план УЧ-01',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Основание / причина изменения').fill('План на рабочий день');
  await page.getByRole('dialog').screenshot({path:'output/playwright/office-plan.png'});
  return {captured:['office-team','office-schedule','office-plan']};
}
