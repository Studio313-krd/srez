async (page) => {
  await page.goto('http://127.0.0.1:8096/?date=2026-09-12');
  await page.getByRole('heading',{name:'17:00',exact:true}).waitFor();
  const out='output/playwright/';
  const start=await page.locator('.w-page-head').boundingBox();
  const end=await page.locator('.w-store-checkpoints').boundingBox();
  await page.screenshot({path:out+'seller-start-v2.png',clip:{x:8,y:start.y,width:624,height:end.y+end.height-start.y}});
  await page.getByRole('button').filter({has:page.getByRole('heading',{name:'17:00',exact:true})}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('combobox',{name:'Сотрудник магазина',exact:true}).fill('Иванова Анна');
  await dialog.getByRole('textbox',{name:'Выручка, ₽',exact:true}).fill('12000');
  await dialog.getByRole('textbox',{name:'Количество чеков',exact:true}).fill('12');
  await dialog.getByRole('textbox',{name:'Алкогольные единицы',exact:true}).fill('18');
  await dialog.locator('.w-report-form').screenshot({path:out+'seller-form-v2.png'});
  await dialog.getByRole('button',{name:'Отправить отчёт',exact:true}).click();
  await dialog.getByText(/Сохранено в/).waitFor();
  await dialog.locator('.w-notice').filter({hasText:/Сохранено в/}).screenshot({path:out+'seller-saved-v2.png'});
  await dialog.getByRole('textbox',{name:'Выручка, ₽',exact:true}).fill('13000');
  await dialog.getByRole('textbox',{name:'Причина исправления',exact:true}).fill('Уточнили выручку по кассе');
  const reason=dialog.getByRole('textbox',{name:'Причина исправления',exact:true}).locator('..');
  await dialog.getByRole('button',{name:'Сохранить исправление',exact:true}).scrollIntoViewIfNeeded();
  const a=await reason.boundingBox(), b=await dialog.getByRole('button',{name:'Сохранить исправление',exact:true}).boundingBox();
  await page.screenshot({path:out+'seller-correction-v2.png',clip:{x:a.x,y:a.y,width:a.width,height:b.y+b.height-a.y}});
  await dialog.getByRole('textbox',{name:'Ответ видеоконтролю',exact:true}).fill('Не было интернета. Передали отчёт после восстановления связи.');
  await dialog.locator('.w-finding').screenshot({path:out+'seller-reply-v2.png'});
  return {submitted:true, screenshots:5};
}
