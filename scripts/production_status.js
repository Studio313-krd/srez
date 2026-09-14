async (page) => page.evaluate(async () => {
  const stacks=await fetch('/api/stacks').then(r=>r.json());
  const list=await fetch('/api/endpoints/3/docker/containers/json?all=true').then(r=>r.json());
  const own=list.filter(c=>c.Labels?.['com.docker.compose.project']==='srez');
  return {stack:stacks.filter(s=>s.Name==='srez').map(s=>({id:s.Id,name:s.Name,status:s.Status})),
    containers:own.map(c=>({id:c.Id,name:c.Names[0],state:c.State,status:c.Status}))};
})
