async (page) => {
  const result = await page.locator('input').evaluateAll(elements => elements.map((e,i) => ({i,name:e.name,placeholder:e.placeholder,type:e.type,field:e.value === 'TELEGRAM_BOT_TOKEN' ? 'TOKEN_NAME' : e.value === 'TELEGRAM_CHAT_ID' ? 'CHAT_NAME' : ''})));
  const tokenIndex = result.find(e=>e.field==='TOKEN_NAME')?.i;
  if(tokenIndex !== undefined) {
    const input=page.locator('input').nth(tokenIndex+1);
    await input.scrollIntoViewIfNeeded(); await input.focus();
  }
  return {inputs:result, tokenFocused:tokenIndex !== undefined};
}
