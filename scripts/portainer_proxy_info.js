async (page) => page.evaluate(async () => {
  const response = await fetch('/api/endpoints/3/docker/containers/nginx-proxy-manager/json');
  if (!response.ok) return {status:response.status};
  const data = await response.json();
  return {networks:Object.entries(data.NetworkSettings.Networks).map(([name,n])=>({name,ip:n.IPAddress,gateway:n.Gateway}))};
})
