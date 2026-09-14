async (page) => page.evaluate(async()=>{
  const session=await fetch('/api/stacks');const csrf=session.headers.get('X-CSRF-Token');
  const base='/api/endpoints/3/docker',headers={'X-CSRF-Token':csrf,'Content-Type':'application/json'};
  const list=await fetch(base+'/containers/json?all=true').then(r=>r.json());
  const web=list.find(c=>c.Labels?.['com.docker.compose.project']==='srez' && c.Labels?.['com.docker.compose.service']==='web');
  const script="import os,re,json,urllib.request,urllib.error\ntoken=os.environ.get('TELEGRAM_BOT_TOKEN','');result={'has_token':bool(token),'surrounding_spaces':token!=token.strip(),'token_shape_ok':bool(re.fullmatch(r'[0-9]+:[A-Za-z0-9_-]+',token))}\ntry:\n data=json.load(urllib.request.urlopen('https://api.telegram.org/bot'+token+'/getMe',timeout=15));result['valid']=data.get('ok',False);result['username']=data.get('result',{}).get('username')\nexcept urllib.error.HTTPError as e: result['http_status']=e.code\nexcept Exception as e: result['error_type']=type(e).__name__\nprint(json.dumps(result))";
  const diagnostic=script.replace("result['error_type']=type(e).__name__", "result['error_type']=type(e).__name__;result['reason_type']=type(getattr(e,'reason',None)).__name__;result['errno']=getattr(getattr(e,'reason',None),'errno',None);result['certificate_error']=getattr(getattr(e,'reason',None),'verify_message',None)");
  const job=await fetch(base+'/containers/'+web.Id+'/exec',{method:'POST',headers,body:JSON.stringify({AttachStdout:true,AttachStderr:true,Cmd:['python','-c',diagnostic],Tty:false})}).then(r=>r.json());
  const r=await fetch(base+'/exec/'+job.Id+'/start',{method:'POST',headers,body:'{"Detach":false,"Tty":false}'});
  const buffer=await r.arrayBuffer(),bytes=new Uint8Array(buffer),view=new DataView(buffer);let out='';
  for(let i=0;i+8<=bytes.length;){const size=view.getUint32(i+4);out+=new TextDecoder().decode(bytes.slice(i+8,i+8+size));i+=8+size;}
  return JSON.parse(out);
})
