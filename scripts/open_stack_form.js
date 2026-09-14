async (page) => {
  await page.getByRole('link', {name:'Add stack', exact:true}).click();
  return {url:page.url()};
}
