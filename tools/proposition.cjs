// Proposition du jour : la stratégie gelée (config.json → proposition.strategie) appliquée séparément à chaque actif choisi
// (une crypto chez Binance, une paire forex chez un courtier), sur bougies journalières, au format de 03_checklist_trade.md.
// Le site affiche la proposition ; c'est l'utilisateur qui décide et passe l'ordre lui-même. Aucun ordre, aucune clé.
// Données publiques en lecture seule : Binance (data-api.binance.vision) pour les cryptos, Stooq (CSV journalier) pour le forex,
// et les taux de référence de la BCE (api.frankfurter.app, clôture seule) en secours. Une donnée absente est signalée, jamais inventée.
// Publie aussi un test sur environ 5 ans de chaque stratégie journalière, actif par actif, avec les mêmes règles (aucun réglage changé).
//   node tools/proposition.cjs <dossier>     (FAUX_PRIX=1 : prix inventés pour tester le programme ; MAINTENANT : heure simulée)
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.slice(html.indexOf('/* MOTEUR-DEBUT'),html.indexOf('/* MOTEUR-FIN'))+';return{setTF,Fjour,proposition,portefeuille,FAMILLES,kl,rendementsJours,sharpe,monteCarlo}')();
const DIR=process.argv[2]||'forward',J1=864e5,now=+process.env.MAINTENANT||Date.now(),lire=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){return d}};
const BASES=['https://data-api.binance.vision','https://api.binance.com'];
async function binance(q){let all=[],end='';for(let k=0;k<2;k++){let j=null;for(const B of BASES){try{const r=await fetch(`${B}/api/v3/klines?symbol=${q}&interval=1d&limit=1000${end}`);if(r.ok){j=await r.json();break}}catch(e){}}
    if(!j||!j.length)break;all=j.concat(all);end=`&endTime=${j[0][0]-1}`;if(j.length<1000)break}
  return all.map(E.kl).filter(x=>x.t+J1<=now)}
async function forex(sym){const src=[];
  try{const r=await fetch(`https://stooq.com/q/d/l/?s=${sym.toLowerCase()}&i=d`),t=await r.text();const L=t.trim().split('\n').slice(1).map(l=>l.split(',')).filter(v=>v.length>=5&&/^\d{4}-/.test(v[0]));
    if(L.length>100)return{src:'Stooq (journalier)',J:L.map(v=>({t:Date.parse(v[0]+'T00:00:00Z'),o:+v[1],h:+v[2],l:+v[3],c:+v[4],v:0})).filter(x=>isFinite(x.c)&&x.t+J1<=now)};src.push('Stooq : réponse inutilisable')}catch(e){src.push('Stooq injoignable')}
  try{const d0=new Date(now-6*365*J1).toISOString().slice(0,10),r=await fetch(`https://api.frankfurter.app/${d0}..?from=${sym.slice(0,3)}&to=${sym.slice(3)}`),j=await r.json();
    const L=Object.entries(j.rates||{}).map(([d,v])=>({t:Date.parse(d+'T00:00:00Z'),c:v[sym.slice(3)]})).filter(x=>isFinite(x.c)).map(x=>({...x,o:x.c,h:x.c,l:x.c,v:0}));
    if(L.length>100)return{src:'BCE via frankfurter.app (clôture seule : plus haut et plus bas inconnus)',J:L.filter(x=>x.t+J1<=now)}}catch(e){}src.push('BCE injoignable');return{src:src.join(' ; '),J:[]}}
function faux(q,n=1900){const k=q.charCodeAt(0)+q.charCodeAt(3)*3,f=t=>(q.includes('USDT')?100:1.1)*(1+.3*Math.sin(t/J1/60+k)+.05*Math.sin(t/J1/7+k*2)),t0=Math.floor(now/J1)*J1-n*J1,a=[];
  for(let i=0;i<n;i++){const t=t0+i*J1,o=f(t),c=f(t+J1);a.push({t,o,h:Math.max(o,c)*1.01,l:Math.min(o,c)*.99,c,v:100+50*Math.sin(i/5)})}return a}
(async()=>{
  const G=lire(path.join(DIR,'config.json'),null),PR=G&&G.proposition;if(!PR){console.error('config.json : pas de section « proposition » : rien à faire.');return}
  const F_OUT=path.join(DIR,'proposition.json'),old=lire(F_OUT,null),jour=Math.floor(now/J1)*J1-J1;
  if(old&&old.jourCalcul===jour&&old.strategie===PR.strategie&&!process.env.FORCER){console.log('Proposition déjà calculée pour cette journée.');return}
  const actifs=[...PR.actifs,...(PR.controle||[])],D={},sources={};
  for(const q of[...new Set(['BTCUSDT',...actifs])]){if(process.env.FAUX_PRIX){D[q]=faux(q);sources[q]='prix inventés (test)';continue}
    if(/USDT$/.test(q)){D[q]=await binance(q);sources[q]='Binance (journalier)'}else{const r=await forex(q);D[q]=r.J;sources[q]=r.src}console.log(q,D[q].length,'journées,',sources[q])}
  const cout=q=>({...G.cfg,...((PR.couts||{})[q]||{})}),btcJ=D.BTCUSDT||[],sorties={},tests={};
  for(const q of actifs){if(!D[q]||D[q].length<260){sorties[q]={paire:q,erreur:`données insuffisantes (${(D[q]||[]).length} journées) : aucune proposition`,source:sources[q]};continue}
    const F=E.Fjour({[q]:D[q]},/USDT$/.test(q)?btcJ:null),c=cout(q),p=E.proposition(F,PR.strategie,Date.parse(PR.depuis),c);
    sorties[q]={...(p&&p.L?{...p,...p.L[0]}:{erreur:`première proposition après la clôture du ${new Date(Date.parse(PR.depuis)).toISOString().slice(0,10)} (journée UTC)`}),L:undefined,source:sources[q],couts:{fee:c.fee,slip:c.slip},controle:(PR.controle||[]).includes(q)};
    // test sur toute la période disponible (au plus environ 5 ans), mêmes règles pour chaque actif, partie de vérification = 30 % finaux
    const W=Math.max(0,F.N-5*365),cut=W+Math.floor((F.N-W)*.7);tests[q]={du:F.T[W],au:F.T[F.N-1],lignes:Object.keys(E.FAMILLES).filter(id=>E.FAMILLES[id].pro).map(id=>{
      const r=E.portefeuille(F,W,F.N,c,E.FAMILLES[id].regle),rj=E.rendementsJours(r.jrs),mc=E.monteCarlo(rj);
      return{id,nom:E.FAMILLES[id].nom,pnl:r.pnl,dd:r.dd,nT:r.nT,expR:r.expR,wrT:r.wrT,arret:r.arret,ent:E.portefeuille(F,W,cut,c,E.FAMILLES[id].regle).pnl,test:E.portefeuille(F,cut,F.N,c,E.FAMILLES[id].regle).pnl,
        cout2:E.portefeuille(F,W,F.N,{...c,fee:c.fee*2,slip:c.slip*2},E.FAMILLES[id].regle).pnl,sansFrais:E.portefeuille(F,W,F.N,{...c,fee:0,slip:0},E.FAMILLES[id].regle).pnl,sharpe:E.sharpe(rj),chanceGain:mc?1-mc.pPerte:null,dd95:mc?mc.dd95:null}})}}
  fs.writeFileSync(F_OUT,JSON.stringify({maj:now,jourCalcul:jour,strategie:PR.strategie,nom:E.FAMILLES[PR.strategie]&&E.FAMILLES[PR.strategie].nom,depuis:PR.depuis,actifs:PR.actifs,controle:PR.controle||[],
    propositions:sorties,tests,faux:!!process.env.FAUX_PRIX},null,1));
  console.log('Proposition du jour :',Object.values(sorties).map(x=>`${x.paire} ${x.action||x.erreur}`).join(' | '))
})().catch(e=>{console.error(e);process.exit(1)});
