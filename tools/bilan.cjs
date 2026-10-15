// Bilan de la semaine (04_journal_template.md) : pour les agents et les trois stratégies suivies, sur les 7 derniers jours :
// nombre de trades, taux de réussite, gain moyen, perte moyenne, espérance = réussite × gain moyen − échec × perte moyenne,
// les 3 causes de perte les plus fréquentes et une action corrective proposée (jamais appliquée automatiquement).
// Sources : journal.jsonl (agents) et familles-resume.json (trades des stratégies, avec frais et démo sans frais).
//   node tools/bilan.cjs <dossier>     (MAINTENANT : heure simulée, pour les tests)
const fs=require('fs'),path=require('path');
const DIR=process.argv[2]||'forward',now=+process.env.MAINTENANT||Date.now(),J7=7*864e5,lire=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){return d}};
const F_OUT=path.join(DIR,'bilan-semaine.json'),old=lire(F_OUT,null);
if(old&&now-old.maj<36e5&&!process.env.FORCER){console.log('Bilan déjà calculé il y a moins d’une heure.');process.exit(0)}
const ACTIONS={
  'stop touché':'Stop trop serré par rapport aux mouvements normaux : vérifier qu’il est au moins à 2 × la variation moyenne (ATR).',
  'sortie sur signal inversé':'Sorties trop rapides : laisser courir les gains avec un stop suiveur plutôt que sortir à la première inversion (comme la version 2).',
  'faux signal (tendance retournée juste après l’entrée)':'Entrées trop tôt : demander une confirmation de plus avant d’entrer (liste de contrôle 3 sur 4).',
  'hausse trop faible pour couvrir les frais':'Trop de petits trades : décider moins souvent (bougies plus longues) pour que les frais pèsent moins.',
  'sortie trop rapide sur un signal inversé':'Sorties trop rapides : laisser courir les gains avec un stop suiveur plutôt que sortir à la première inversion (comme la version 2).',
  'frais plus grands que le gain':'Trop de petits trades : décider moins souvent (bougies plus longues) pour que les frais pèsent moins.',
  'mauvaise entrée':'Entrées trop tôt : demander une confirmation de plus avant d’entrer (liste de contrôle 3 sur 4).',
  'autre':'Pas de cause dominante : continuer à observer.'};
function resume(nom,T,note){const G=T.filter(x=>x.pnl>0),P=T.filter(x=>x.pnl<=0),m=a=>a.length?a.reduce((s,x)=>s+x.pnl,0)/a.length:0,wr=T.length?G.length/T.length:null;
  const causes={};for(const x of P)causes[x.cause]=(causes[x.cause]||0)+1;const top=Object.entries(causes).sort((a,b)=>b[1]-a[1]).slice(0,3);
  return{nom,note:note||'',n:T.length,gagnants:G.length,reussite:wr,gainMoy:m(G),perteMoy:m(P),esperance:wr===null?null:wr*m(G)+(1-wr)*m(P),total:T.reduce((s,x)=>s+x.pnl,0),
    erreurs:top.map(([cause,n])=>({cause,n})),action:top.length?ACTIONS[top[0][0]]||ACTIONS.autre:null}}
const causeFam=t=>/faux signal|faux départ/.test(t)?'faux signal (tendance retournée juste après l’entrée)':/frais/.test(t)?'hausse trop faible pour couvrir les frais':/stop/.test(t)?'stop touché':'autre';
// Agents : une entrée (décision « entrée ») et son résultat « trade clos » ; frais et glissement inclus dans le net.
const ag=[],ent=new Map();
try{for(const l of fs.readFileSync(path.join(DIR,'journal.jsonl'),'utf8').split('\n')){if(!l)continue;let r;try{r=JSON.parse(l)}catch(e){continue}
    if(r.k==='decision'&&r.type==='entrée')ent.set(r.id,r);
    else if(r.k==='resultat'&&r.resultat&&r.resultat.statut==='trade clos'&&ent.has(r.cible)&&r.ts>=now-J7){const e=ent.get(r.cible),why=String(r.resultat.raison||'');
      ag.push({pnl:r.resultat.net,paire:e.paire,sens:e.sens,cause:r.resultat.cause||(why==='stop'||/stop/.test(why)?'stop touché':/invers/.test(why)?'sortie sur signal inversé':'autre')})}}}catch(e){}
const fam=lire(path.join(DIR,'familles-resume.json'),{lignes:[]}),strat=[];
for(const id of['A2','prudente','regime']){const L=fam.lignes.find(x=>x.id===id);if(!L)continue;const conv=a=>(a||[]).filter(x=>x.fin>=now-J7).map(x=>({pnl:x.pnl,paire:x.paire,cause:causeFam(x.pourquoi||'')}));
  strat.push({id,...resume(L.nom,conv(L.trades),'avec frais'),demo:L.demo?resume(L.nom,conv(L.demo.trades),'démo sans frais'):null})}
fs.writeFileSync(F_OUT,JSON.stringify({maj:now,du:now-J7,au:now,agents:resume('Agents actuels',ag,'avec frais'),strategies:strat},null,1));
console.log('Bilan de la semaine :',`agents ${ag.length} trades`,strat.map(x=>`${x.id} ${x.n}`).join(' | '));
