const fs=require('fs');
const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const u=d.users; console.log('keys top:',Object.keys(d),'n=',u.length);
const keys=new Set(); u.forEach(x=>Object.keys(x).forEach(k=>keys.add(k))); console.log([...keys]);
const cnt=(f)=>{const m={};u.forEach(x=>{const v=f(x);m[v]=(m[v]||0)+1});return m};
console.log(cnt(x=>x['Status [READ ONLY]']));
console.log(cnt(x=>(x['Email Address [Required]']||'').split('@')[1]));
console.log(cnt(x=>{const s=x['Last Sign In [READ ONLY]'];if(!s||s==='Never logged in')return s||'empty';return s.slice(0,4)}));
console.log(u.filter(x=>!/^\d{4}\//.test(x['Last Sign In [READ ONLY]']||'')).slice(0,3));
