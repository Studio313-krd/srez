async (page) => page.evaluate(async () => {
  const response=await fetch('/api/stacks');
  const csrf=response.headers.get('X-CSRF-Token');
  if(csrf) window.srezCsrf=csrf;
  return {headers:[...response.headers.keys()],csrfAvailable:!!csrf,cookies:document.cookie.split(';').map(c=>c.split('=')[0].trim()),storageKeys:Object.keys(localStorage)};
})
