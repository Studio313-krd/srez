async (page) => {
  await page.evaluate(() => {
    const old=document.getElementById('srez-transfer'); if(old) old.remove();
    const input=document.createElement('input'); input.type='file'; input.id='srez-transfer'; input.style.display='none'; document.body.append(input);
  });
  await page.locator('#srez-transfer').setInputFiles('C:/Proj/seller-analysis/.local/production-import.tar');
  return await page.evaluate(async () => {
    const base='/api/endpoints/3/docker';
    const session=await fetch('/api/stacks');
    const csrf=session.headers.get('X-CSRF-Token');
    if(!session.ok || !csrf) throw new Error('Portainer session unavailable');
    const headers={'X-CSRF-Token':csrf};
    const list=await fetch(base+'/containers/json?all=true').then(r=>r.json());
    const own=list.filter(c=>c.Labels?.['com.docker.compose.project']==='srez');
    const service=name=>own.find(c=>c.Labels['com.docker.compose.service']===name);
    const db=service('db'), web=service('web'), worker=service('worker');
    if(!db || !web || !worker) throw new Error('Expected isolated srez containers');
    async function exec(container,command) {
      const created=await fetch(base+'/containers/'+container.Id+'/exec',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({AttachStdout:true,AttachStderr:true,Cmd:command,Tty:false})});
      if(!created.ok) throw new Error('Exec creation failed: '+created.status);
      const job=await created.json();
      const response=await fetch(base+'/exec/'+job.Id+'/start',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"Detach":false,"Tty":false}'});
      const buffer=await response.arrayBuffer(); const bytes=new Uint8Array(buffer), view=new DataView(buffer); let output='';
      for(let i=0;i+8<=bytes.length;) {const size=view.getUint32(i+4); output+=new TextDecoder().decode(bytes.slice(i+8,i+8+size));i+=8+size;}
      const state=await fetch(base+'/exec/'+job.Id+'/json').then(r=>r.json());
      if(state.ExitCode!==0) throw new Error('Container command failed: '+output.slice(0,800));
      return output.trim();
    }
    const before=await exec(db,['psql','-U','srez','-d','srez','-At','-c','SELECT (SELECT count(*) FROM auth_user), (SELECT count(*) FROM reports_revision);']);
    if(before!=='0|0') throw new Error('Destination database is not empty; refusing to overwrite');
    for(const c of [web,worker]) {
      const response=await fetch(base+'/containers/'+c.Id+'/stop?t=10',{method:'POST',headers});
      if(!response.ok && response.status!==304) throw new Error('Could not pause srez service');
    }
    const file=document.getElementById('srez-transfer').files[0];
    const uploaded=await fetch(base+'/containers/'+db.Id+'/archive?path=/tmp',{method:'PUT',headers:{...headers,'Content-Type':'application/x-tar'},body:file});
    if(!uploaded.ok) throw new Error('Database upload failed');
    await exec(db,['pg_restore','-U','srez','-d','srez','--single-transaction','--exit-on-error','--clean','--if-exists','--no-owner','--no-privileges','/tmp/srez-import.dump']);
    const counts=await exec(db,['psql','-U','srez','-d','srez','-At','-c','SELECT (SELECT count(*) FROM reports_store WHERE archived=false), (SELECT count(*) FROM reports_employee), (SELECT count(*) FROM reports_revision), (SELECT count(*) FROM reports_sourcesheet);']);
    if(counts!=='83|200|1381|89') throw new Error('Unexpected imported counts: '+counts);
    for(const c of [web,worker]) {
      const response=await fetch(base+'/containers/'+c.Id+'/start',{method:'POST',headers});
      if(!response.ok && response.status!==304) throw new Error('Could not start srez service');
    }
    document.getElementById('srez-transfer').remove();
    return {databaseImported:true,counts,servicesStarted:true};
  });
}
