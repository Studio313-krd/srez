async (page) => {
  await page.setViewportSize({width:1100,height:1100});
  await page.getByRole('combobox',{name:'Магазин',exact:true}).selectOption({label:'TEST-MS · Тестовый Мильстрим'});
  await page.screenshot({path:'output/playwright/start-seller-select.png'});
  await page.getByRole('button',{name:/^1 13:00/}).click();
  return {form:await page.getByRole('dialog').innerText()};
}
