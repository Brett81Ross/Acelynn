module.exports=async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.setHeader('Allow','GET, HEAD');return res.end('Method Not Allowed')}
  try{
    const proto=req.headers['x-forwarded-proto']||'https';
    const host=req.headers.host;
    const source=await fetch(`${proto}://${host}/app-base.html`,{headers:{'Cache-Control':'no-cache'}});
    if(!source.ok)throw new Error(`app-base.html request failed (${source.status})`);
    let html=await source.text();
    html=html.replace('<div>© 2026 Acelynn Pro™</div>','<div>© 2026 Acelynn Pro™ · v1.1.2 · Demo & Help</div>');
    if(!html.includes('/demo-help.js'))html=html.replace('</body>','<script src="/demo-help.js?v=1.1.2"></script>\n</body>');
    if(!html.includes('/legacy-native-export.js'))html=html.replace('</body>','<script src="/legacy-native-export.js?v=phase7-migration1"></script>\n</body>');
    res.statusCode=200;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');
    if(req.method==='HEAD')return res.end();
    return res.end(html);
  }catch(error){console.error('Acelynn Pro shell failed:',error);res.statusCode=502;res.setHeader('Content-Type','text/plain; charset=utf-8');return res.end('Acelynn Pro is temporarily unavailable. Please try again.')}
};
