// Preserve the isolated test stack's environment and volumes during updates.
async page => page.evaluate(async () => {
  const response = await fetch('/api/stacks');
  if (!response.ok) throw new Error('Portainer login required');
  const csrf = response.headers.get('X-CSRF-Token');
  const stacks = await response.json();
  const stack = stacks.find(s => s.Name === 'srez-test' && s.Id === 103 && s.EndpointId === 3);
  if (!stack || !csrf) throw new Error('Unexpected test stack');
  const detail = await fetch('/api/stacks/103').then(r => r.json());
  const file = await fetch('/api/stacks/103/file').then(r => r.json());
  if (!file.StackFileContent.includes('9992:8000') || !file.StackFileContent.includes('srez_test')) throw new Error('Unexpected database or port');
  const result = await fetch('/api/stacks/103/git/redeploy?endpointId=3', {
    method:'PUT', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
    body:JSON.stringify({RepositoryReferenceName:'refs/heads/test',Env:detail.Env,
      Prune:false,PullImage:false,RepullImageAndRedeploy:false})
  });
  if (!result.ok) throw new Error('Test stack update failed: HTTP '+result.status);
  const updated = await result.json();
  return {id:updated.Id,name:updated.Name,branch:'test',port:9992,environmentPreserved:true};
})
