async (page) => {
  const result=await page.evaluate(async()=>{
    const session=await fetch('/api/stacks');const csrf=session.headers.get('X-CSRF-Token');
    if(!csrf) throw new Error('Portainer session unavailable');
    const base='/api/endpoints/3/docker',headers={'X-CSRF-Token':csrf,'Content-Type':'application/json'};
    const list=await fetch(base+'/containers/json?all=true').then(r=>r.json());
    const own=list.filter(c=>c.Labels?.['com.docker.compose.project']==='srez');
    const service=name=>own.find(c=>c.Labels['com.docker.compose.service']===name);
    async function exec(container,Cmd){
      const created=await fetch(base+'/containers/'+container.Id+'/exec',{method:'POST',headers,body:JSON.stringify({AttachStdout:true,AttachStderr:true,Cmd,Tty:false})});
      if(!created.ok) throw new Error('Exec creation failed');const job=await created.json();
      const response=await fetch(base+'/exec/'+job.Id+'/start',{method:'POST',headers,body:'{"Detach":false,"Tty":false}'});
      const buffer=await response.arrayBuffer(),bytes=new Uint8Array(buffer),view=new DataView(buffer);let output='';
      for(let i=0;i+8<=bytes.length;){const size=view.getUint32(i+4);output+=new TextDecoder().decode(bytes.slice(i+8,i+8+size));i+=8+size;}
      const state=await fetch(base+'/exec/'+job.Id+'/json').then(r=>r.json());
      if(state.ExitCode!==0) throw new Error('Command failed: '+output.slice(0,200));return output.trim();
    }
    const counts=await exec(service('db'),['psql','-U','srez','-d','srez','-At','-c',"SELECT (SELECT count(*) FROM reports_store WHERE archived=false), (SELECT count(*) FROM reports_employee), (SELECT count(*) FROM reports_revision), (SELECT count(*) FROM auth_user WHERE is_active=true), (SELECT count(*) FROM reports_plan);"]);
    if(counts!=='83|200|1381|84|2603') throw new Error('Production counts unexpected: '+counts);
    const bot=await exec(service('web'),['python','-c',"import os,json,urllib.request; token=os.environ.get('TELEGRAM_BOT_TOKEN',''); result={'configured':bool(token),'enabled':os.environ.get('TELEGRAM_ENABLED')};\ntry:\n data=json.load(urllib.request.urlopen('https://api.telegram.org/bot'+token+'/getMe',timeout=15)); result['valid']=data.get('ok',False);result['username']=data.get('result',{}).get('username')\nexcept Exception: result['valid']=False\nprint(json.dumps(result))"]);
    await exec(service('backup'),['pg_dump','-Fc','--file=/backups/srez-launch-20260914.dump']);
    const listing=await exec(service('backup'),['pg_restore','--list','/backups/srez-launch-20260914.dump']);
    if(!listing.includes('reports_revision')) throw new Error('Backup is incomplete');
    const response=await fetch(base+'/containers/'+service('backup').Id+'/archive?path=/backups/srez-launch-20260914.dump');
    if(!response.ok) throw new Error('Backup download failed');
    const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.id='srez-backup-download';link.href=url;link.download='srez-production-backup.tar';link.style.display='none';document.body.append(link);
    return {counts,telegram:JSON.parse(bot),backupCreated:true};
  });
  const pending=page.waitForEvent('download');await page.locator('#srez-backup-download').evaluate(a=>a.click());
  await (await pending).saveAs('C:/Proj/seller-analysis/.local/srez-production-backup.tar');
  await page.locator('#srez-backup-download').evaluate(a=>{URL.revokeObjectURL(a.href);a.remove();});
  return {...result,privateBackupDownloaded:true};
}
