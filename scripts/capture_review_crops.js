async (page) => {
  await page.setViewportSize({width:1180,height:1450});
  await page.goto('http://127.0.0.1:8096/?date=2026-09-13');
  await page.getByRole('button',{name:'Закрытие',exact:true}).click();
  await page.getByRole('button',{name:'Требуют внимания',exact:true}).click();
  const head=await page.locator('.w-page-head').boundingBox();
  const stats=await page.locator('.w-stats').boundingBox();
  await page.screenshot({path:'output/playwright/office-summary-v2.png',clip:{x:head.x,y:head.y,width:head.width,height:stats.y+stats.height-head.y}});
  await page.locator('.w-table-panel').screenshot({path:'output/playwright/office-table-v2.png'});
  await page.getByRole('button',{name:'УЧ-03, Закрытие: Проверить',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Задать вопрос магазину',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Вопрос магазину',exact:true}).fill('Уточните количество алкогольных единиц на закрытие');
  const question=await dialog.locator('.w-question').boundingBox();
  const reason=await dialog.locator('.w-notice').first().boundingBox();
  await page.screenshot({path:'output/playwright/office-question-fields-v2.png',clip:{x:reason.x,y:reason.y,width:reason.width,height:question.y+question.height-reason.y}});
  await dialog.getByRole('button',{name:'Закрыть отчёт',exact:true}).click();
  return {captured:['summary','table','question-fields']};
}
