async (page) => {
  const result=await page.evaluate(async () => {
    const session=await fetch('/api/stacks');
    const csrf=session.headers.get('X-CSRF-Token');
    if(!session.ok || !csrf) throw new Error('Portainer session unavailable');
    const base='/api/endpoints/3/docker', headers={'X-CSRF-Token':csrf,'Content-Type':'application/json'};
    const list=await fetch(base+'/containers/json?all=true').then(r=>r.json());
    const web=list.find(c=>c.Labels?.['com.docker.compose.project']==='srez' && c.Labels?.['com.docker.compose.service']==='web');
    if(!web) throw new Error('Srez web unavailable');
    const jobResponse=await fetch(base+'/containers/'+web.Id+'/exec',{method:'POST',headers,body:JSON.stringify({AttachStdout:true,AttachStderr:true,Cmd:['python','manage.py','issue_store_access','--output','/tmp/srez-store-access.json'],Tty:false})});
    if(!jobResponse.ok) throw new Error('Exec creation failed');
    const job=await jobResponse.json();
    const response=await fetch(base+'/exec/'+job.Id+'/start',{method:'POST',headers,body:'{"Detach":false,"Tty":false}'});
    const buffer=await response.arrayBuffer(), bytes=new Uint8Array(buffer), view=new DataView(buffer); let output='';
    for(let i=0;i+8<=bytes.length;) {const size=view.getUint32(i+4);output+=new TextDecoder().decode(bytes.slice(i+8,i+8+size));i+=8+size;}
    const state=await fetch(base+'/exec/'+job.Id+'/json').then(r=>r.json());
    if(state.ExitCode!==0) throw new Error('Account issuance failed: '+output.slice(0,300));
    const archive=await fetch(base+'/containers/'+web.Id+'/archive?path=/tmp/srez-store-access.json');
    if(!archive.ok) throw new Error('Private credential download failed');
    const url=URL.createObjectURL(await archive.blob());
    const link=document.createElement('a');link.id='srez-private-download';link.href=url;link.download='srez-store-access.tar';link.style.display='none';document.body.append(link);
    return {issued:output.trim()};
  });
  const downloadEvent=page.waitForEvent('download');
  await page.locator('#srez-private-download').evaluate(a=>a.click());
  const download=await downloadEvent;
  await download.saveAs('C:/Proj/seller-analysis/.local/srez-store-access.tar');
  await page.locator('#srez-private-download').evaluate(a=>{URL.revokeObjectURL(a.href);a.remove();});
  return {...result,privateFileSaved:true};
}
