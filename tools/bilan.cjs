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
  'sortie sur signal inversé':'Le vrai problème est l’entrée : le prix part du mauvais côté juste après. « Sortir moins vite » a été mesuré sur 12 mois et sur 5 ans et aggrave les pertes ; la piste utile est de filtrer les entrées (liste de contrôle, heures creuses, frais : déjà appliqués le 16/10).',
  'faux signal (tendance retournée juste après l’entrée)':'Entrées trop tôt : demander une confirmation de plus avant d’entrer (liste de contrôle 3 sur 4).',
  'hausse trop faible pour couvrir les frais':'Trop de petits trades : décider moins souvent (bougies plus longues) pour que les frais pèsent moins.',
  'sortie trop rapide sur un signal inversé':'Garder la position plus longtemps a été mesuré et aggrave les pertes ; mieux vaut moins d’entrées, mieux confirmées (filtres appliqués le 16/10).',
  'frais plus grands que le gain':'Trop de petits trades : décider moins souvent (bougies plus longues) pour que les frais pèsent moins.',
  'mauvaise entrée':'Entrées trop tôt : demander une confirmation de plus avant d’entrer (liste de contrôle 3 sur 4).',
  'autre':'Pas de cause dominante : continuer à observer.'};
function resume(nom,T,note){const G=T.filter(x=>x.pnl>0),P=T.filter(x=>x.pnl<=0),m=a=>a.length?a.reduce((s,x)=>s+x.pnl,0)/a.length:0,wr=T.length?G.length/T.length:null;
  const causes={};for(const x of P)causes[x.cause]=(causes[x.cause]||0)+1;const top=Object.entries(causes).sort((a,b)=>b[1]-a[1]).slice(0,3);
  return{nom,note:note||'',n:T.length,gagnants:G.length,reussite:wr,gainMoy:m(G),perteMoy:m(P),esperance:wr===null?null:wr*m(G)+(1-wr)*m(P),total:T.reduce((s,x)=>s+x.pnl,0),
    erreurs:top.map(([cause,n])=>({cause,n})),action:top.length?ACTIONS[top[0][0]]||ACTIONS.autre:null}}
const causeFam=t=>/faux signal|faux départ/.test(t)?'faux signal (tendance retournée juste après l’entrée)':/frais/.test(t)?'hausse trop faible pour couvrir les frais':/stop/.test(t)?'stop touché':'autre';
// Agents : une entrée (décision « entrée ») et son résultat « trade clos » ; frais et glissement inclus dans le net.
// Les journaux archivés (réglages changés) dans la semaine comptent aussi : on ne perd pas les trades de la semaine à chaque nouveau test.
const AR=path.join(DIR,'archives'),jrn=[...(fs.existsSync(AR)?fs.readdirSync(AR).filter(f=>/-journal\.jsonl$/.test(f)).sort().map(f=>path.join(AR,f)):[]),path.join(DIR,'journal.jsonl')];
const ag=[];
for(const fj of jrn){const ent=new Map();
try{for(const l of fs.readFileSync(fj,'utf8').split('\n')){if(!l)continue;let r;try{r=JSON.parse(l)}catch(e){continue}
    if(r.k==='decision'&&r.type==='entrée')ent.set(r.id,r);
    else if(r.k==='resultat'&&r.resultat&&r.resultat.statut==='trade clos'&&ent.has(r.cible)&&r.ts>=now-J7){const e=ent.get(r.cible),why=String(r.resultat.raison||'');
      ag.push({pnl:r.resultat.net,paire:e.paire,sens:e.sens,cause:r.resultat.cause||(why==='stop'||/stop/.test(why)?'stop touché':/invers/.test(why)?'sortie sur signal inversé':'autre')})}}}catch(e){}}
// Vérification complète des chaînes d'empreintes (chaque ligne contient l'empreinte SHA-256 de la précédente).
const sha=t=>require('crypto').createHash('sha256').update(t).digest('hex');
function verifier(f){if(!fs.existsSync(f))return{ok:true,n:0};let prev='',n=0;for(const l of fs.readFileSync(f,'utf8').split('\n')){if(!l.trim())continue;n++;let r;try{r=JSON.parse(l)}catch(e){return{ok:false,n,erreur:`ligne ${n} illisible`}}
    const{h,...x}=r;if(r.prev!==prev)return{ok:false,n,erreur:`ligne ${n} : lien rompu`};if(sha(JSON.stringify(x))!==h)return{ok:false,n,erreur:`ligne ${n} : empreinte fausse`};prev=h}return{ok:true,n}}
const verif={agents:verifier(path.join(DIR,'journal.jsonl')),familles:verifier(path.join(DIR,'familles.jsonl'))};
const fam=lire(path.join(DIR,'familles-resume.json'),{lignes:[]}),strat=[];
for(const id of['A2','prudente','regime']){const L=fam.lignes.find(x=>x.id===id);if(!L)continue;const conv=a=>(a||[]).filter(x=>x.fin>=now-J7).map(x=>({pnl:x.pnl,paire:x.paire,cause:causeFam(x.pourquoi||'')}));
  const A=L.focus||L;strat.push({id,...resume(L.nom,conv(A.trades),L.focus?'bitcoin + euro-dollar, avec frais':'avec frais'),demo:L.demo?resume(L.nom,conv(L.demo.trades),'démo sans frais'):null})}
// Prudente et Tendance + Bitcoin ne tradent que 2 actifs et prennent souvent exactement les mêmes trades : on le signale pour ne pas compter deux fois la même perte.
const sig=x=>JSON.stringify([x.n,Math.round(x.total*100)]);for(let a=0;a<strat.length;a++)for(let b=0;b<a;b++)if(strat[a].n&&sig(strat[a])===sig(strat[b]))strat[a].note=(strat[a].note?strat[a].note+' ; ':'')+`mêmes trades que « ${strat[b].nom} »`;
fs.writeFileSync(F_OUT,JSON.stringify({maj:now,du:now-J7,au:now,verif,agents:resume('Agents actuels',ag,'avec frais'),strategies:strat},null,1));
console.log('Bilan de la semaine :',`journaux ${Object.entries(verif).map(([k,v])=>k+' '+(v.ok?'intact':v.erreur)).join(', ')} |`,`agents ${ag.length} trades`,strat.map(x=>`${x.id} ${x.n}`).join(' | '));
