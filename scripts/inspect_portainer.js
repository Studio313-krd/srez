async (page) => {
  await page.goto('https://185.72.147.187:9443/#!/3/docker/stacks');
  return await page.evaluate(async () => {
    const response = await fetch('/api/stacks');
    if (!response.ok) return {status: response.status, storageKeys:Object.keys(localStorage)};
    const stacks = await response.json();
    const [info, containers, networks] = await Promise.all([
      fetch('/api/endpoints/3/docker/info').then(r=>r.json()),
      fetch('/api/endpoints/3/docker/containers/json?all=true').then(r=>r.json()),
      fetch('/api/endpoints/3/docker/networks').then(r=>r.json())
    ]);
    return {stacks:stacks.map(s=>({id:s.Id,name:s.Name,status:s.Status})),
      host:{cpu:info.NCPU,memory:info.MemTotal,arch:info.Architecture,swarm:info.Swarm?.LocalNodeState},
      containers:Array.isArray(containers)?containers.map(c=>({id:c.Id.slice(0,12),names:c.Names,image:c.Image,ports:c.Ports,state:c.State})):containers.message,
      networks:Array.isArray(networks)?networks.map(n=>({name:n.Name,id:n.Id.slice(0,12)})):networks.message};
  });
}
