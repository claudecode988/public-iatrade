// Mesure longue (environ 12 mois), lancée chaque semaine par GitHub Actions (voir .github/workflows/mesure-longue.yml).
// Données : fichiers mensuels publics de Binance (data.binance.vision, bougies de 5 min ou 1 h selon config.json),
// lus sans bibliothèque (lecteur ZIP minimal + zlib). Même moteur que le site, configuration GELÉE de config.json.
// Résultat : <dossier>/mesure-longue.json (walk-forward, partie test 30 %, robustesse aux coûts, valeur des agents, DSR).
//   node tools/mesure-longue.cjs <dossier>     (MOIS=12 par défaut ; FAUX_PRIX=1 : prix inventés, test du programme seulement)
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.slice(html.indexOf('/* MOTEUR-DEBUT'),html.indexOf('/* MOTEUR-FIN'))+
  ';return{WL,setTF,agreger,aligner,prep,mesurer,walkForward,robustesse,valeurAgents,familles,dsr,fiabilite,sharpe,cleEssai,setEssai:f=>{ESSAI=f}}')();
const DIR=process.argv[2]||'forward',G=JSON.parse(fs.readFileSync(path.join(DIR,'config.json'),'utf8')),MOIS=+process.env.MOIS||12;
const TF=E.setTF(G.tf),c={...G.cfg,tf:G.tf},R=Object.fromEntries((G.regles||[]).map(k=>[k,1]));
// Lecteur ZIP minimal : premier fichier de l'archive, méthode « deflate » (celle des fichiers Binance).
function dezip(buf){let e=buf.length-22;while(e>=0&&buf.readUInt32LE(e)!==0x06054b50)e--;if(e<0)throw new Error('ZIP illisible');
  const cd=buf.readUInt32LE(e+16),meth=buf.readUInt16LE(cd+10),csz=buf.readUInt32LE(cd+20),loc=buf.readUInt32LE(cd+42),deb=loc+30+buf.readUInt16LE(loc+26)+buf.readUInt16LE(loc+28),d=buf.subarray(deb,deb+csz);
  return(meth===8?zlib.inflateRawSync(d):d).toString('utf8')}
// Les fichiers récents de Binance donnent l'heure en microsecondes : on ramène tout en millisecondes.
const ms=t=>t>1e14?Math.floor(t/1e3):t;
async function charger(q){const out=[],d=new Date();for(let m=MOIS;m>=1;m--){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-m,1)),ym=`${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}`;
    try{const r=await fetch(`https://data.binance.vision/data/spot/monthly/klines/${q}/${TF.src}/${q}-${TF.src}-${ym}.zip`);if(!r.ok)continue;
      for(const l of dezip(Buffer.from(await r.arrayBuffer())).split('\n')){const v=l.split(',');if(v.length<6||!/^\d/.test(v[0]))continue;out.push({t:ms(+v[0]),o:+v[1],h:+v[2],l:+v[3],c:+v[4],v:+v[5]})}}catch(e){}}
  return E.agreger(out)}
(async()=>{const L=[...E.WL.CRYPTO,...E.WL.FOREX],D={},t0=Date.now();
  if(process.env.FAUX_PRIX){const n=Math.round(MOIS*30*864e5/TF.srcMs),t1=Math.floor(t0/TF.srcMs)*TF.srcMs-n*TF.srcMs;
    for(const q of L){const k=q.charCodeAt(0)+q.charCodeAt(1)*3,f=t=>100*(1+.05*Math.sin(t/36e5/40+k)+.02*Math.sin(t/36e5/6+k*2)+.004*Math.sin(t/3e5/1.3+k)),a=[];
      for(let i=0;i<n;i++){const t=t1+i*TF.srcMs,o=f(t),cl=f(t+TF.srcMs);a.push({t,o,h:Math.max(o,cl)*1.0015,l:Math.min(o,cl)*.9985,c:cl,v:100+50*Math.abs(Math.sin(t/36e5))})}D[q]=E.agreger(a)}}
  else for(const q of L){const a=await charger(q);if(a.length)D[q]=a;console.log(q,a.length,'bougies')}
  const al=E.aligner(D);if(!al||!Object.keys(al.D).length){console.error('Données introuvables : aucune mesure, aucun chiffre inventé.');process.exit(1)}
  const ESS={};E.setEssai((cc,r,res)=>{const k=E.cleEssai(cc,r),v=E.sharpe(res.ret);if(!ESS[k]&&v!==null)ESS[k]=v});
  const F=E.prep(al.D);console.log('Indicateurs prêts',((Date.now()-t0)/1e3).toFixed(0),'s');
  const M=E.mesurer(F,c),wf=E.walkForward(F,c),rob=E.robustesse(F,c,R),va=E.valeurAgents(F,c,R),srs=Object.values(ESS),d=wf?E.dsr(wf.test.ret,srs):null;
  const fam=E.familles(F,c,R);console.log('Familles :',fam.lignes.map(x=>`${x.nom} ${x.pnl.toFixed(0)} $`).join(' | '));
  const net=o=>JSON.parse(JSON.stringify(o,(k,v)=>k==='ret'||k==='eqs'?undefined:v));
  fs.writeFileSync(path.join(DIR,'mesure-longue.json'),JSON.stringify({maj:Date.now(),tf:TF.lab,mois:MOIS,pairs:F.Q.length,ecartees:al.ecartees,du:F.T[0],au:F.T[F.N-1],config:G,
    simple:{base:net(M.base),active:net(M.fin),regles:Object.keys(M.R)},wf:net(wf),robustesse:net(rob),agents:net(va),familles:net(fam),nEssais:srs.length,dsr:d,fiabilite:E.fiabilite(wf,d,(G.regles||[]).length),faux:!!process.env.FAUX_PRIX},null,1));
  console.log('Mesure longue terminée en',((Date.now()-t0)/1e3).toFixed(0),'s :',wf?`${wf.test.n} trades hors échantillon, bilan ${wf.test.pnl.toFixed(2)} $`:'walk-forward impossible')
})().catch(e=>{console.error(e);process.exit(1)});
