module.exports=async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.setHeader('Allow','GET, HEAD');return res.end('Method Not Allowed')}
  try{
    const proto=req.headers['x-forwarded-proto']||'https';
    const host=req.headers.host;
    const base=`${proto}://${host}`;
    const [source,metaSource]=await Promise.all([
      fetch(`${base}/app-base.html`,{headers:{'Cache-Control':'no-cache'}}),
      fetch(`${base}/js/meta.js`,{headers:{'Cache-Control':'no-cache'}})
    ]);
    if(!source.ok)throw new Error(`app-base.html request failed (${source.status})`);
    let html=await source.text();
    let version='1.2.0';
    if(metaSource.ok){
      const metaText=await metaSource.text();
      const match=metaText.match(/version:\s*['\"]([^'\"]+)/);
      if(match)version=match[1];
    }
    html=html.replace("if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{})",'void 0');
    html=html.replace('<div>© 2026 Acelynn Pro™</div>',`<div>© 2026 Acelynn Pro™ · v${version} · Demo & Help</div>`);
    if(!html.includes('/demo-help.js'))html=html.replace('</body>',`<script src="/demo-help.js?v=${version}"></script>\n</body>`);
    if(!html.includes('/js/app.js'))html=html.replace('</body>',`<script type="module" src="/js/app.js?v=${version}"></script>\n</body>`);
    res.statusCode=200;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');
    if(req.method==='HEAD')return res.end();
    return res.end(html);
  }catch(error){console.error('Acelynn Pro shell failed:',error);res.statusCode=502;res.setHeader('Content-Type','text/plain; charset=utf-8');return res.end('Acelynn Pro is temporarily unavailable. Please try again.')}
};
