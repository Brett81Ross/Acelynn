const fs=require('node:fs');
const {transformShell}=require('../api/shell-transform.cjs');

for(const file of ['index.html','app-base.html']){
  const before=fs.readFileSync(file,'utf8');
  const after=transformShell(before);
  fs.writeFileSync(file,after,'utf8');
  console.log(`${file}: Acelynn v1.2 production hotfix applied`);
}
