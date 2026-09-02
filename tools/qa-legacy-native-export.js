const fs=require('fs');
const path=require('path');
const assert=require('assert');
const handler=require('../api/native-backup-download.js');

function base64Url(text){
  return Buffer.from(text,'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function response(){
  return {
    statusCode:200,
    headers:{},
    body:null,
    setHeader(name,value){this.headers[name.toLowerCase()]=String(value)},
    end(value=''){this.body=value;return this}
  };
}

function invoke(method,payload){
  const res=response();
  const req={method,query:{d:typeof payload==='string'?payload:base64Url(JSON.stringify(payload))}};
  handler(req,res);
  return res;
}

const snapshots=[{
  time:'Sep 2, 11:00 AM',
  profile:'Balanced mix',
  score:64,
  focus:'Mids',
  bands:[18,34,52,40,21]
}];
const valid={app:'Acelynn Pro',created:'2026-09-02T16:00:00.000Z',snapshots};

const ok=invoke('GET',valid);
assert.equal(ok.statusCode,200);
assert.equal(ok.headers['content-type'],'application/json; charset=utf-8');
assert.equal(ok.headers['content-disposition'],'attachment; filename="acelynn-session-report.json"');
assert.match(ok.headers['cache-control'],/no-store/);
assert.equal(ok.headers['referrer-policy'],'no-referrer');
assert.deepEqual(JSON.parse(ok.body),valid);
assert.equal(Number(ok.headers['content-length']),Buffer.byteLength(ok.body));

const head=invoke('HEAD',valid);
assert.equal(head.statusCode,200);
assert.equal(head.body,'');
assert.equal(head.headers['content-disposition'],'attachment; filename="acelynn-session-report.json"');

for(const bad of [
  {app:'Wrong App',created:valid.created,snapshots},
  {app:'Acelynn Pro',created:valid.created,snapshots:[]},
  {app:'Acelynn Pro',created:valid.created,snapshots:Array.from({length:13},()=>snapshots[0])},
  '%%%not-base64url%%%'
]){
  const rejected=invoke('GET',bad);
  assert.equal(rejected.statusCode,400);
}

const post=invoke('POST',valid);
assert.equal(post.statusCode,405);
assert.equal(post.headers.allow,'GET, HEAD');

const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'legacy-native-export.js'),'utf8');
assert.match(client,/CactusByteNative\/1\.0/);
assert.match(client,/\/api\/native-backup-download/);
assert.match(client,/stopImmediatePropagation\(\)/);
assert.doesNotMatch(client,/createObjectURL/);
assert.match(client,/acelynn-snapshots/);

const shell=fs.readFileSync(path.join(root,'api','demo-shell.js'),'utf8');
assert.match(shell,/legacy-native-export\.js\?v=phase7-migration1/);

const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const bypass=sw.indexOf("url.pathname === '/api/native-backup-download'");
const genericCachePut=sw.indexOf('cache.put(request, copy)');
assert.ok(bypass>=0,'service worker must special-case the migration download endpoint');
assert.ok(genericCachePut>0&&bypass<genericCachePut,'network-only migration bypass must run before generic cache writes');
assert.match(sw,/fetch\(request, \{ cache: 'no-store' \}\)/);

const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
assert.equal(vercel.git.deploymentEnabled,false,'staging branch must not auto-deploy');

console.log('Acelynn legacy native export QA GREEN');
console.log('- native CactusByte UA is intercepted before the legacy blob handler');
console.log('- HTTPS backup endpoint returns a validated no-store JSON attachment');
console.log('- malformed/wrong-app/empty/oversized snapshot payloads are rejected');
console.log('- migration download endpoint is network-only and excluded from legacy Cache Storage');
console.log('- browser blob export source is not replaced globally');
console.log('- Vercel Git deployment is disabled on this staging branch');
