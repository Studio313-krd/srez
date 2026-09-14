async (page) => {
  await page.getByRole('textbox',{name:'Repository URL *',exact:true}).fill('https://github.com/Studio313-krd/srez.git');
  await page.getByRole('textbox',{name:'Compose path *',exact:true}).fill('compose.prod.yaml');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Load variables from .env file',exact:true}).click();
  await (await chooser).setFiles('C:/Proj/seller-analysis/.local/production.env');
  return {prepared:true, inputs:await page.locator('input').evaluateAll(elements=>elements.map(e=>({name:e.name,placeholder:e.placeholder,type:e.type,aria:e.getAttribute('aria-label')})))};
}
