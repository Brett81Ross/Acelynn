'use strict';

const MAX_ENCODED_BYTES=16384;
const MAX_SNAPSHOTS=12;

function fail(res,status,message){
  res.statusCode=status;
  res.setHeader('Content-Type','text/plain; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  return res.end(message);
}

function decodeBase64Url(value){
  if(typeof value!=='string'||!value||value.length>MAX_ENCODED_BYTES)throw new Error('invalid payload length');
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('invalid payload alphabet');
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  return Buffer.from(padded,'base64').toString('utf8');
}

function validatePayload(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return false;
  if(payload.app!=='Acelynn Pro')return false;
  if(typeof payload.created!=='string'||payload.created.length<10||payload.created.length>80)return false;
  if(!Array.isArray(payload.snapshots)||payload.snapshots.length<1||payload.snapshots.length>MAX_SNAPSHOTS)return false;
  return payload.snapshots.every(snapshot=>snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot));
}

module.exports=function handler(req,res){
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.setHeader('Allow','GET, HEAD');
    return fail(res,405,'Method Not Allowed');
  }

  let payload;
  try{
    const encoded=Array.isArray(req.query&&req.query.d)?null:req.query&&req.query.d;
    payload=JSON.parse(decodeBase64Url(encoded));
  }catch(_){
    return fail(res,400,'Invalid Acelynn Pro backup payload');
  }

  if(!validatePayload(payload))return fail(res,400,'Invalid Acelynn Pro backup payload');

  const body=JSON.stringify({
    app:'Acelynn Pro',
    created:payload.created,
    snapshots:payload.snapshots
  },null,2)+'\n';

  res.statusCode=200;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="acelynn-session-report.json"');
  res.setHeader('Cache-Control','no-store, private, max-age=0');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Length',Buffer.byteLength(body));
  if(req.method==='HEAD')return res.end();
  return res.end(body);
};

module.exports._test={decodeBase64Url,validatePayload,MAX_ENCODED_BYTES,MAX_SNAPSHOTS};
