async (page) => page.evaluate(async()=>{
  const session=await fetch('/api/stacks');
  const csrf=session.headers.get('X-CSRF-Token'), stacks=await session.json();
  const stack=stacks.find(s=>s.Name==='srez' && s.EndpointId===3);
  if(!stack || stack.Id!==102 || !csrf) throw new Error('Unexpected production stack');
  const detail=await fetch('/api/stacks/'+stack.Id).then(r=>r.json());
  const env=detail.Env;
  const proxy=env.find(e=>e.name==='TRUSTED_PROXY_CIDRS');
  const value='127.0.0.1/32,172.26.0.1/32';
  if(proxy) proxy.value=value; else env.push({name:'TRUSTED_PROXY_CIDRS',value});
  if(env.find(e=>e.name==='TELEGRAM_ENABLED')?.value!=='false') throw new Error('Keep Telegram disabled until group is configured');
  const response=await fetch('/api/stacks/'+stack.Id+'/git/redeploy?endpointId=3',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({RepositoryReferenceName:'refs/heads/main',Env:env,Prune:false,PullImage:false,RepullImageAndRedeploy:false})});
  if(!response.ok) throw new Error('Stack redeploy failed: '+response.status);
  const result=await response.json();
  return {id:result.Id,name:result.Name,updated:true,telegramEnabled:false};
})
