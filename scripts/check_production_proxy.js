async (page) => page.evaluate(async()=>{
  const base='/api/endpoints/3/docker';
  const list=await fetch(base+'/containers/json?all=true').then(r=>r.json());
  const web=list.find(c=>c.Labels?.['com.docker.compose.project']==='srez' && c.Labels?.['com.docker.compose.service']==='web');
  const inspect=await fetch(base+'/containers/'+web.Id+'/json').then(r=>r.json());
  const response=await fetch(base+'/containers/'+web.Id+'/logs?stdout=true&stderr=true&tail=12');
  const buffer=await response.arrayBuffer(),bytes=new Uint8Array(buffer),view=new DataView(buffer);let output='';
  for(let i=0;i+8<=bytes.length;){const size=view.getUint32(i+4);output+=new TextDecoder().decode(bytes.slice(i+8,i+8+size));i+=8+size;}
  return {networks:inspect.NetworkSettings.Networks,proxy:inspect.Config.Env.filter(v=>v.startsWith('TRUSTED_PROXY_CIDRS=')),logs:output};
})
