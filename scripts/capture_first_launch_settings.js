async (page) => {
  const base='http://127.0.0.1:8097';
  await page.setViewportSize({width:1380,height:1300});
  await page.goto(base+'/management');
  await page.getByRole('button',{name:'Изменить магазин TEST-MS',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.locator('.m-form-grid').nth(1).screenshot({path:'output/playwright/start-office-staff.png'});
  await dialog.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await dialog.locator('.m-form-grid').last().screenshot({path:'output/playwright/start-office-schedule.png'});
  await dialog.getByRole('button',{name:'Отмена',exact:true}).click();
  await page.getByRole('button',{name:'Планы',exact:true}).click();
  await page.getByRole('button',{name:'Изменить план TEST-MS',exact:true}).click();
  await page.getByRole('dialog').screenshot({path:'output/playwright/start-office-plan.png'});
  await page.getByRole('button',{name:'Отмена',exact:true}).click();
  await page.getByRole('button',{name:'Уведомления',exact:true}).click();
  await page.locator('.m-notification-grid').screenshot({path:'output/playwright/start-office-notifications.png'});
  return {screenshots:4};
}
