// Forward test 24 h/24, lancé par GitHub Actions toutes les 5 minutes (voir .github/workflows/forward-test.yml).
// Même moteur que le site (bloc MOTEUR de index.html), configuration GELÉE lue dans <dossier>/config.json.
// À chaque passage : bougies fermées de Binance (REST public, lecture seule), stops vérifiés sur les bougies écoulées
// depuis le passage précédent, puis UNE décision sur la dernière bougie fermée. Les bougies manquées pendant un retard
// ne donnent jamais de décision après coup (on ne décide pas en connaissant la suite).
// Journal : <dossier>/journal.jsonl, une ligne JSON par décision ou par résultat, ajout seulement, chaque ligne
// contient l'empreinte SHA-256 de la précédente. Argent fictif uniquement, aucun ordre, aucune clé.
//   node tools/forward.cjs <dossier>            (FAUX_PRIX=1 : prix inventés, pour tester le programme seulement)
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.slice(html.indexOf('/* MOTEUR-DEBUT'),html.indexOf('/* MOTEUR-FIN'))+
  ';return{WL,H1,setTF,agreger,aligner,prep,choisir,ouvrir,stopTick,sortieCloture,fermer,risque,distanceStop,fngNews,sigAt,rt,kl,analyse,refusEntree}')();
const DIR=process.argv[2]||'forward',F_ETAT=path.join(DIR,'etat.json'),F_CFG=path.join(DIR,'config.json'),F_J=path.join(DIR,'journal.jsonl'),F_RES=path.join(DIR,'resume.json');
const sha=t=>crypto.createHash('sha256').update(t).digest('hex'),lire=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){return d}};
const PUB='https://api.binance.com',FNG='https://api.alternative.me/fng/?limit=1',now=+process.env.MAINTENANT||Date.now(); // MAINTENANT : pour les tests seulement
(async()=>{
  const G=lire(F_CFG,null);if(!G){console.error('config.json absent : rien à faire.');return}
  const TF=E.setTF(G.tf),c={...G.cfg,tf:G.tf},R=Object.fromEntries((G.regles||[]).map(k=>[k,1]));
  const vReglages=sha(JSON.stringify({tf:G.tf,cfg:G.cfg,regles:(G.regles||[]).slice().sort()})).slice(0,16);
  const vAgents=sha([E.analyse,E.prep,E.sigAt,E.refusEntree,E.choisir,E.ouvrir,E.stopTick,E.sortieCloture,E.fermer].map(f=>f.toString()).join('\n')).slice(0,16);
  let S=lire(F_ETAT,null);
  // Configuration changée : l'ancien journal est archivé et un nouveau forward test commence (la preuve repart de zéro).
  if(S&&S.vReglages!==vReglages){const a=path.join(DIR,'archives');fs.mkdirSync(a,{recursive:true});const d=new Date(now).toISOString().replace(/[:.]/g,'-');
    for(const f of[F_J,F_ETAT,F_RES])if(fs.existsSync(f))fs.renameSync(f,path.join(a,d+'-'+path.basename(f)));S=null}
  S=S||{v:1,debut:now,cash:1e4,start:1e4,pk:1e4,pos:null,lastBar:0,day:'',nToday:0,lossToday:0,lastX:-1e15,seq:0,prev:'',trades:[],passages:0,retards:[],vReglages};
  // --- prix ---
  const L=[...E.WL.CRYPTO,...E.WL.FOREX],D={};let pas=0;
  if(process.env.FAUX_PRIX){const t1=Math.floor(now/TF.srcMs)*TF.srcMs,f=(q,t)=>{const k=q.charCodeAt(0)+q.charCodeAt(1)*3;return 100*(1+.04*Math.sin(t/36e5/9+k)+.012*Math.sin(t/36e5/1.7+k*2)+.004*Math.sin(t/3e5/1.3+k))};
    for(const q of L){const a=[];for(let i=999;i>=1;i--){const t=t1-i*TF.srcMs,o=f(q,t),cl=f(q,t+TF.srcMs);a.push({t,o,h:Math.max(o,cl)*1.0015,l:Math.min(o,cl)*.9985,c:cl,v:100+50*Math.abs(Math.sin(t/36e5))})}D[q]=E.agreger(a)}}
  else{for(const q of L){try{const r=await fetch(`${PUB}/api/v3/klines?symbol=${q}&interval=${TF.src}&limit=1000`);if(r.status===429||r.status===418){console.error('Binance limite les requêtes : passage annulé.');return}
      if(!r.ok)continue;D[q]=E.agreger((await r.json()).map(E.kl).filter(x=>x.t+TF.srcMs<=now))}catch(e){}pas++}}
  const al=E.aligner(D);if(!al||!Object.keys(al.D).length){console.error('Binance injoignable : aucune décision, aucun prix inventé.');return}
  let news='neutre',radar='pas d’information';
  if(c.rsrc!=='manuel'&&!process.env.FAUX_PRIX){try{const x=(await (await fetch(FNG)).json()).data[0],f=E.fngNews({value:+x.value,cls:x.value_classification,ts:+x.timestamp*1000},now);if(f.ok){news=f.news;radar=`${x.value}/100 (${x.value_classification})`}}catch(e){}}
  const F=E.prep(al.D,q=>E.WL.FOREX.includes(q)?'neutre':news),i=F.N-1,tb=F.T[i];
  if(tb<=S.lastBar){console.log('Pas de nouvelle bougie fermée.');return}
  S.passages++;S.retards=[...S.retards,Math.round((now-(tb+TF.bar))/1e3)].slice(-288);
  const J=[],ajout=l=>{const r={...l,id:++S.seq,ts:now,vAgents,vReglages,prev:S.prev};r.h=sha(JSON.stringify(r));S.prev=r.h;J.push(r);return r.id};
  const resultat=(cible,res)=>ajout({k:'resultat',cible,resultat:res});
  const d0=new Date(now).toISOString().slice(0,10);if(S.day!==d0){S.day=d0;S.nToday=0;S.lossToday=0}
  const cloturer=(price,raison,jid,t)=>{const P=S.pos,r=E.fermer(P,price,c);S.cash+=P.size+r.g-r.xf;S.trades.push(+r.pnl.toFixed(4));S.lossToday+=r.pnl;S.nToday+=P.nb;S.lastX=t;
    const res={statut:'trade clos',net:+r.pnl.toFixed(4),frais:+(P.fe+r.xf).toFixed(4),glissement:+r.slip.toFixed(4),prixSortie:r.fx,raison};resultat(P.jid,res);resultat(jid,res);S.pos=null};
  // 1. Stops sur chaque bougie écoulée depuis le passage précédent (plus bas / plus haut), dans l'ordre.
  if(S.pos){const k0=F.T.findIndex(t=>t>Math.max(S.lastBar,S.pos.t0));for(let k=k0<0?i+1:k0;k<=i&&S.pos;k++){const x=F.p[S.pos.q]&&F.p[S.pos.q].C[k];if(!x)continue;
      const hit=E.stopTick(S.pos,x.l,x.h,R,x.o);if(hit!==null){const jid=ajout({k:'decision',agent:'Bouclier',type:'sortie',paire:S.pos.q,sens:S.pos.side,raison:`stop touché dans la bougie de ${new Date(F.T[k]).toISOString().slice(11,16)} UTC (vérifié au passage suivant)`,confiance:null,prix:{stop:S.pos.stop},trade:S.pos.jid});cloturer(hit,'stop',jid,F.T[k])}}}
  // 2. Une décision sur la dernière bougie fermée.
  const ord=F.Q.slice().sort((x,y)=>Math.abs(E.sigAt(F.p[y],i,R).sc)-Math.abs(E.sigAt(F.p[x],i,R).sc)),P=S.pos,{b}=E.choisir(F,i,c,R),q=P?P.q:b?b.q:ord[0],Pq=F.p[q],s=E.sigAt(Pq,i,R);
  const entrees=qq=>{const X=F.p[qq],z=E.sigAt(X,i,R);return{bougie:new Date(tb+TF.bar).toISOString(),prisme:{note:+z.sc.toFixed(4),tendance:X.tr4[i],cassure:X.brk[i],regimeRSI:X.rr[i],volume:+X.vr[i].toFixed(3),atr:+X.atrP[i].toFixed(5)},radar:{actualite:news,valeur:radar},bouclier:{tradesJour:S.nToday,solde:+S.cash.toFixed(2)}}};
  if(P){const r=E.sortieCloture(F,P,i,c,R);if(r){const jid=ajout({k:'decision',agent:'Boussole',type:'sortie',paire:q,sens:P.side,raison:r,confiance:Math.round(s.pr*100),prix:{cloture:Pq.c[i]},entrees:entrees(q),trade:P.jid});cloturer(Pq.c[i],r,jid,tb)}
    else ajout({k:'decision',agent:'Boussole',type:'abstention',paire:q,sens:P.side,raison:'position ouverte, rien à changer',confiance:Math.round(s.pr*100),prix:{cloture:Pq.c[i]},entrees:entrees(q)})}
  else if(!b)ajout({k:'decision',agent:'Boussole',type:'abstention',paire:q,sens:s.dir,raison:`indice ${Math.round(s.pr*100)} % : aucune paire au-dessus du seuil de ${c.thr} % qui passe les règles`,confiance:Math.round(s.pr*100),prix:{cloture:Pq.c[i]},entrees:entrees(q)});
  else{const v=S.cash,pk=Math.max(S.pk,v),rk=E.risque(c,v,pk,E.distanceStop(F,b.q,i,c,R));
    let veto=R.cool&&(tb-S.lastX)/TF.bar<4?'repos après la dernière sortie':S.nToday+c.nb>c.maxTrades?'maximum de trades par jour':-S.lossToday>=S.start*c.maxLoss/100?'perte maximale du jour':!rk.ok?rk.regle:S.cash<rk.taille*(1+c.fee/100)?'solde fictif insuffisant':'';
    const jid=ajout({k:'decision',agent:'Boussole',type:'entrée',paire:b.q,sens:b.dir,raison:`indice ${Math.round(b.pr*100)} %, au-dessus du seuil de ${c.thr} %`,confiance:Math.round(b.pr*100),prix:{cloture:F.p[b.q].c[i]},entrees:entrees(b.q)});
    if(veto){ajout({k:'decision',agent:'Bouclier',type:'abstention',paire:b.q,sens:b.dir,raison:'veto : '+veto,confiance:Math.round(b.pr*100),prix:{cloture:F.p[b.q].c[i]}});resultat(jid,{statut:'non exécutée : veto'})}
    else{const N=E.ouvrir(F,b.q,i,b.dir,b.pr,c,R,F.p[b.q].c[i],rk.taille);N.jid=jid;S.pos=N;S.cash-=N.size+N.fe;S.nToday+=N.nb}}
  S.lastBar=tb;const val=S.cash+(S.pos?S.pos.size+(S.pos.side==='long'?1:-1)*S.pos.n*(F.p[S.pos.q].c[i]-S.pos.fill):0);S.pk=Math.max(S.pk,val);
  fs.mkdirSync(DIR,{recursive:true});fs.appendFileSync(F_J,J.map(x=>JSON.stringify(x)).join('\n')+'\n');fs.writeFileSync(F_ETAT,JSON.stringify(S));
  const T=S.trades,gs=T.filter(x=>x>0).reduce((a,b)=>a+b,0),ls=T.filter(x=>x<=0).reduce((a,b)=>a+b,0),rs=S.retards.slice().sort((a,b)=>a-b);
  fs.writeFileSync(F_RES,JSON.stringify({maj:now,debut:S.debut,geleeLe:G.geleeLe,tf:TF.lab,vAgents,vReglages,regles:G.regles||[],decisions:S.seq-0,passages:S.passages,
    trades:T.length,gagnants:T.filter(x=>x>0).length,bilan:+(gs+ls).toFixed(2),gagne:+gs.toFixed(2),perdu:+ls.toFixed(2),pf:ls<0?+(gs/-ls).toFixed(3):null,valeur:+val.toFixed(2),
    plusHaut:+S.pk.toFixed(2),baisse:+((S.pk-val)/S.pk).toFixed(4),position:S.pos?{paire:S.pos.q,sens:S.pos.side,taille:+S.pos.size.toFixed(2),entree:S.pos.fill,stop:S.pos.stop}:null,
    retardMedianS:rs.length?rs[Math.floor(rs.length/2)]:null,retardMaxS:rs.length?rs[rs.length-1]:null,dernierHash:S.prev,faux:!!process.env.FAUX_PRIX},null,1));
  console.log(`${J.length} ligne(s) ajoutée(s) au journal, bougie ${new Date(tb).toISOString()}, valeur ${val.toFixed(2)} $.`)
})().catch(e=>{console.error(e);process.exit(1)});
