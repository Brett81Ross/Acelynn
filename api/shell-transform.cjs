const VERSION='1.2.0';
const LOGO_SRC='/acelynnpro.png';

const HOTFIX_CSS=`
.acelynn-logo{background:transparent!important;box-shadow:none!important;overflow:hidden;padding:0!important}
.acelynn-logo img{display:block;width:100%;height:100%;object-fit:contain}
#acelynnSplash{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:radial-gradient(circle at 50% 38%,#302653 0,transparent 19rem),#080814;opacity:1;transition:opacity .28s ease}
#acelynnSplash.splash-out{opacity:0;pointer-events:none}
.acelynn-splash-inner{text-align:center;padding:24px}
.acelynn-splash-logo{display:block;width:min(210px,48vw);height:min(210px,48vw);object-fit:contain;margin:0 auto 16px}
.acelynn-splash-title{font-size:1.35rem;font-weight:950;letter-spacing:-.035em;color:#f7f6ff}
.acelynn-splash-meta{margin-top:7px;color:#aaa9bb;font-size:.74rem;font-weight:800;letter-spacing:.06em}
@media(prefers-reduced-motion:reduce){#acelynnSplash{transition:none}}
`;

const SPLASH_HTML=`<div id="acelynnSplash" role="status" aria-label="Opening Acelynn Pro"><div class="acelynn-splash-inner"><img class="acelynn-splash-logo" src="${LOGO_SRC}" alt="Acelynn Pro logo"><div class="acelynn-splash-title">Acelynn Pro™</div><div class="acelynn-splash-meta">v${VERSION} · Cactus🌵Byte Studios™</div></div></div>`;

const SPLASH_SCRIPT=`<script>(function(){var splash=document.getElementById('acelynnSplash');if(!splash)return;var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;setTimeout(function(){splash.classList.add('splash-out');setTimeout(function(){splash.remove()},reduce?0:320)},reduce?180:900)})();</script>`;

function replaceOnceOrThrow(html,needle,replacement,label){
  if(html.includes(replacement))return html;
  if(!html.includes(needle))throw new Error(`Acelynn shell transform missing ${label}`);
  return html.replace(needle,replacement);
}

function transformShell(input){
  let html=String(input||'');
  if(!html.includes('Acelynn Pro'))throw new Error('Acelynn shell transform received the wrong document');

  html=html.replace(/<div>© 2026 Acelynn Pro™(?: · v[0-9.]+(?: · Demo & Help)?)?<\/div>/,'<div>© 2026 Acelynn Pro™ · v1.2.0</div>');

  if(!html.includes('class="mark acelynn-logo"')){
    html=replaceOnceOrThrow(html,'<div class="mark">A</div>',`<div class="mark acelynn-logo"><img src="${LOGO_SRC}" alt="Acelynn Pro logo"></div>`,'header logo anchor');
  }

  if(!html.includes('.acelynn-logo{')){
    html=replaceOnceOrThrow(html,'</style>',`${HOTFIX_CSS}\n</style>`,'style anchor');
  }

  if(!html.includes('id="acelynnSplash"')){
    html=replaceOnceOrThrow(html,'<body>','<body>'+SPLASH_HTML,'body anchor');
  }

  const oldCoach='function coach(result,vals,avg){if(avg<8){';
  const newCoach="function coach(result,vals,avg,rmsDb){const signalDb=Number.isFinite(rmsDb)?rmsDb:Number.parseFloat($('rmsValue').textContent);if(!Number.isFinite(signalDb)||signalDb<-72){";
  if(!html.includes(newCoach)){
    html=replaceOnceOrThrow(html,oldCoach,newCoach,'analysis signal gate');
  }

  const oldLoopCall='coach(result,vals,vals.reduce((a,b)=>a+b,0)/5);';
  const newLoopCall='coach(result,vals,vals.reduce((a,b)=>a+b,0)/5,rmsDb);';
  if(!html.includes(newLoopCall)){
    html=replaceOnceOrThrow(html,oldLoopCall,newLoopCall,'analysis RMS handoff');
  }

  if(!html.includes('id="acelynnSplash"')||!html.includes(SPLASH_SCRIPT)){
    html=replaceOnceOrThrow(html,'</body>',SPLASH_SCRIPT+'\n</body>','splash script anchor');
  }

  return html;
}

module.exports={VERSION,LOGO_SRC,transformShell};
