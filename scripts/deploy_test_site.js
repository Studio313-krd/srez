async (page) => page.evaluate(async()=>{
  const session=await fetch('/api/stacks');
  if(!session.ok)throw new Error('Please sign in to Portainer');
  const csrf=session.headers.get('X-CSRF-Token'),stacks=await session.json();
  if(stacks.some(s=>s.Name==='srez-test'))throw new Error('Test stack already exists; inspect it before updating');
  const production=stacks.find(s=>s.Name==='srez'&&s.EndpointId===3);
  if(!production)throw new Error('Expected server environment not found');
  const containers=await fetch('/api/endpoints/3/docker/containers/json?all=true').then(r=>r.json());
  if(containers.some(c=>c.Ports?.some(p=>p.PublicPort===9992)))throw new Error('Port 9992 is occupied');
  const detail=await fetch('/api/stacks/'+production.Id).then(r=>r.json());
  const token=detail.Env.find(e=>e.name==='TELEGRAM_BOT_TOKEN')?.value||'';
  const random=length=>Array.from(crypto.getRandomValues(new Uint8Array(length))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const Env=[{name:'SECRET_KEY',value:random(48)},{name:'POSTGRES_PASSWORD',value:random(32)},
    {name:'TELEGRAM_ENABLED',value:'false'},{name:'TELEGRAM_BOT_TOKEN',value:token},{name:'TELEGRAM_CHAT_ID',value:''},
    {name:'TRUSTED_PROXY_CIDRS',value:'127.0.0.1/32'}];
  const response=await fetch('/api/stacks/create/standalone/repository?endpointId=3',{method:'POST',
    headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({Name:'srez-test',
      RepositoryURL:'https://github.com/Studio313-krd/srez.git',RepositoryReferenceName:'refs/heads/test',ComposeFile:'compose.test.yaml',Env})});
  if(!response.ok)throw new Error('Test deployment failed: HTTP '+response.status);
  const result=await response.json();
  return {id:result.Id,name:result.Name,port:9992,branch:'test',telegramEnabled:false};
})
