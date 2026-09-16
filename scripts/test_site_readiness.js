async (page) => {
  return page.evaluate(async()=>{
    const response=await fetch('/api/dashboard/');
    if(!response.ok)throw new Error('Dashboard not available');
    const d=await response.json();
    return d.stores.map(s=>({code:s.code,reports:s.reports.map(r=>({id:r.id,checkpoint:r.checkpoint,status:r.status,late:r.late,current:r.current,findings:r.findings}))}));
  });
}
