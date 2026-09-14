async (page) => page.evaluate(async()=>{
  const session=await fetch('/api/stacks'),csrf=session.headers.get('X-CSRF-Token');
  const base='/api/endpoints/3/docker',headers={'X-CSRF-Token':csrf,'Content-Type':'application/json'};
  const list=await fetch(base+'/containers/json?all=true').then(r=>r.json());
  const web=list.find(c=>c.Labels?.['com.docker.compose.project']==='srez' && c.Labels?.['com.docker.compose.service']==='web');
  const script="import socket,json\nresult=[]\nfor host in ['api.telegram.org','github.com','platform-api2.max.ru']:\n try:\n  addresses=socket.getaddrinfo(host,443,socket.AF_INET,socket.SOCK_STREAM)\n  address=addresses[0][4][0];s=socket.socket();s.settimeout(4)\n  try: s.connect((address,443));result.append({'host':host,'ip':address,'connected':True})\n  except Exception as e: result.append({'host':host,'ip':address,'error':type(e).__name__,'errno':getattr(e,'errno',None)})\n  finally: s.close()\n except Exception as e: result.append({'host':host,'error':type(e).__name__})\nprint(json.dumps(result))";
  const job=await fetch(base+'/containers/'+web.Id+'/exec',{method:'POST',headers,body:JSON.stringify({AttachStdout:true,AttachStderr:true,Cmd:['python','-c',script],Tty:false})}).then(r=>r.json());
  const r=await fetch(base+'/exec/'+job.Id+'/start',{method:'POST',headers,body:'{"Detach":false,"Tty":false}'});
  const buffer=await r.arrayBuffer(),bytes=new Uint8Array(buffer),view=new DataView(buffer);let out='';
  for(let i=0;i+8<=bytes.length;){const size=view.getUint32(i+4);out+=new TextDecoder().decode(bytes.slice(i+8,i+8+size));i+=8+size;}
  return JSON.parse(out);
})
