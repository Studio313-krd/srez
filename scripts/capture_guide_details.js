async (page) => {
  await page.getByRole('dialog').locator('.m-form-grid').screenshot({path:'output/playwright/office-plan-fields.png'});
  await page.getByRole('dialog').getByRole('button',{name:'Отмена',exact:true}).click();
  await page.getByRole('button',{name:'Магазины',exact:true}).click();
  await page.getByRole('button',{name:'Изменить магазин УЧ-01',exact:true}).click();
  let dialog=page.getByRole('dialog');
  const seller=dialog.getByRole('combobox',{name:'Продавец 1',exact:true});
  await seller.scrollIntoViewIfNeeded();
  const label=await seller.locator('..').boundingBox();
  const grid=await dialog.locator('.m-form-grid').nth(1).boundingBox();
  await page.screenshot({path:'output/playwright/office-team-row.png',clip:{x:grid.x,y:label.y-3,width:grid.width,height:label.height+6}});
  await dialog.getByRole('button',{name:'Отмена',exact:true}).click();
  await page.getByRole('link',{name:'Рабочий стол',exact:true}).click();
  await page.getByRole('button',{name:'УЧ-03, 17:00: Проверить',exact:true}).waitFor();
  const snap=await page.getByRole('main').ariaSnapshot();
  if (!snap.includes('УЧ-03, 17:00: Проверить')) throw new Error('Expected report is not available');
  await page.getByRole('button',{name:'УЧ-03, 17:00: Проверить',exact:true}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:'Комментарий',exact:true}).fill('Проверьте сумму на 17:00: она меньше, чем на 13:00.');
  await dialog.locator('.w-findings').screenshot({path:'output/playwright/office-question.png'});
  return {captured:3};
}
