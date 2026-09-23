const EPS=1e-12;
function clean(v){const n=Number(v);return Number.isFinite(n)?n:0;}
export function analyzeMonoCompatibility(left,right){
 if(!left||!right||typeof left.length!=='number'||typeof right.length!=='number')return Object.freeze({available:false,reason:'Stereo channel samples are unavailable.'});
 const n=Math.min(left.length,right.length);if(n<32)return Object.freeze({available:false,reason:'Not enough stereo samples are available.'});
 let l2=0,r2=0,lr=0,mono2=0,side2=0;
 for(let i=0;i<n;i++){const l=clean(left[i]),r=clean(right[i]);l2+=l*l;r2+=r*r;lr+=l*r;const m=(l+r)*.5,s=(l-r)*.5;mono2+=m*m;side2+=s*s;}
 const denom=Math.sqrt(l2*r2),correlation=denom>EPS?Math.max(-1,Math.min(1,lr/denom)):null;
 const monoRms=Math.sqrt(mono2/n),sideRms=Math.sqrt(side2/n);
 const sideToMonoDb=monoRms>EPS?20*Math.log10(Math.max(sideRms,EPS)/monoRms):null;
 let risk='low',message='Stereo channels are cooperating well in this sample.';
 if(correlation===null){risk='unknown';message='The stereo relationship could not be measured reliably.';}
 else if(correlation<0){risk='high';message='Negative channel correlation can indicate cancellation when summed to mono. Check important elements in mono.';}
 else if(correlation<0.25){risk='elevated';message='Low channel correlation suggests a wide or decorrelated section. Check whether important elements thin out in mono.';}
 else if(sideToMonoDb!==null&&sideToMonoDb>-3){risk='elevated';message='Side energy is strong relative to the mono center. Check whether key elements keep their weight in mono.';}
 return Object.freeze({available:true,sampleCount:n,correlation,monoRms,sideRms,sideToMonoDb,risk,message});
}
