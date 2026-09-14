async (page) => {
  if (!page.url().startsWith('http://127.0.0.1:8096/')) throw new Error('Training server only');
  await page.getByRole('link', {name:'Управление', exact:true}).click();
  await page.getByRole('button', {name:'Сотрудники', exact:true}).click();
  await page.getByRole('button', {name:'Добавить сотрудника', exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox', {name:'ФИО', exact:true}).fill('Новикова Мария');
  await page.getByRole('dialog').getByRole('button', {name:'Сохранить', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button', {name:'Магазины', exact:true}).click();
  await page.getByRole('button', {name:'Изменить магазин УЧ-01', exact:true}).click();
  await page.getByRole('dialog').getByLabel('Продавец 2', {exact:true}).selectOption({label:'Новикова Мария'});
  await page.getByRole('dialog').getByRole('button', {name:'Сохранить', exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button', {name:'Изменить магазин УЧ-01', exact:true}).click();
  const selected=await page.getByRole('dialog').getByLabel('Продавец 2', {exact:true}).locator('option:checked').innerText();
  if (selected !== 'Новикова Мария') throw new Error('Assignment was not saved');
  const fields=page.getByRole('dialog').locator('label').filter({hasText:/^Продавец [12]/});
  await fields.first().scrollIntoViewIfNeeded();
  const a=await fields.first().boundingBox(), b=await fields.last().boundingBox();
  await page.screenshot({path:'output/playwright/office-team-row-v2.png', clip:{x:a.x,y:a.y,width:b.x+b.width-a.x,height:Math.max(a.height,b.height)}});
  await page.getByRole('dialog').getByRole('button', {name:'Отмена', exact:true}).click();
  return {employeeCreated:true, assignmentSaved:true, trainingOnly:true};
}
