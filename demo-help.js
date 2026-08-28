/* CactusByte optional live-screen 60-second demo */
(()=>{
  if(document.querySelector('script[data-cactusbyte-demo="acelynn-pro"]'))return;
  const script=document.createElement('script');
  script.src='https://cactusbyte-studios.vercel.app/demo-embed.js';
  script.dataset.cactusbyteDemo='acelynn-pro';
  script.defer=true;
  document.body.appendChild(script);
})();
