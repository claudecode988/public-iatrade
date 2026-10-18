// Forward test 24 h/24 des familles de stratégies (lancé dans la même boucle GitHub Actions que tools/forward.cjs).
// Chaque famille gère 10 000 $ fictifs avec ses règles écrites à l'avance (FAMILLES dans le bloc MOTEUR de index.html).
// À chaque nouvelle heure fermée : bougies d'1 h publiques de Binance (lecture seule), valeur des positions mise à jour,
// puis nouvelles parts demandées par chaque famille, avec frais et glissement de config.json. Aucune décision après coup :
// si des heures ont été manquées, seule la dernière heure fermée décide.
// Journal : <dossier>/familles.jsonl (ajout seulement, chaque ligne contient l'empreinte SHA-256 de la précédente).
//   node tools/familles-fw.cjs <dossier>     (FAUX_PRIX=1 : prix inventés, test du programme seulement ; MAINTENANT : heure simulée)
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.slice(html.indexOf('/* MOTEUR-DEBUT'),html.indexOf('/* MOTEUR-FIN'))+';return{WL,setTF,aligner,prep,kl,FAMILLES,plafondRisque,noteEchange,TROIS,bornerCfg,EMPRUNT_J,attenteStrat,RETIREES}')();
const DIR=process.argv[2]||'forward',F_ETAT=path.join(DIR,'familles-etat.json'),F_J=path.join(DIR,'familles.jsonl'),F_RES=path.join(DIR,'familles-resume.json');
const sha=t=>crypto.createHash('sha256').update(t).digest('hex'),lire=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){return d}};
// État présent mais illisible : arrêt en erreur sans rien écrire (jamais de remise à zéro silencieuse). Écritures atomiques.
const lireEtat=f=>{if(!fs.existsSync(f))return null;try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){console.error(`${f} illisible : arrêt sans rien écrire (aucune remise à zéro).`);process.exit(2)}};
const ecrire=(f,t)=>{fs.writeFileSync(f+'.tmp',t);fs.renameSync(f+'.tmp',f)};
const BASES=['https://data-api.binance.vision','https://api.binance.com'],H=36e5,J1=864e5,now=+process.env.MAINTENANT||Date.now();
async function get(u){for(const B of BASES){try{const r=await fetch(B+u,{signal:AbortSignal.timeout(10000)});if(r.status===429||r.status===418)throw new Error('Binance limite les requêtes');if(r.ok)return r.json()}catch(e){if(/limite/.test(e.message))throw e}}return null}
// Résumé d'un compte (démo sans frais) pour le site.
const resumeCompte=P=>P?{valeur:+(P.val??1e4).toFixed(2),dd:+(P.dd||0).toFixed(4),frais:+(P.fees||0).toFixed(2),hist:P.hist||[],nTrades:P.tr?P.tr.clos.length:0,trades:(P.tr?P.tr.clos:[]).slice(-60).reverse(),
  ouvertes:Object.keys(P.pos||{}).map(q=>({paire:q,valeur:+P.pos[q].toFixed(2),entree:P.tr&&P.tr.ouv[q]?P.tr.ouv[q].prixEntree:null,depuis:P.tr&&P.tr.ouv[q]?P.tr.ouv[q].debut:null}))}:null;
(async()=>{
  const G=lire(path.join(DIR,'config.json'),null);if(!G){console.error('config.json absent : rien à faire.');return}
  // Version 2 des règles du forward test des familles : même risque pour toutes (plafondRisque). Un ancien état est archivé et
  // toutes les familles repartent le même jour avec les mêmes règles (sinon les comparaisons seraient faussées).
  // Version 3 : risque par trade passé à 1 % (accord de l'utilisateur), tout le monde repart du même jour.
  // Version 4 : plus de levier dans les stratégies journalières (somme des positions ≤ capital) ; tout le monde repart du même jour.
  const VERSION=4;{const a=lireEtat(F_ETAT);if(a&&a.version!==VERSION){const d=path.join(DIR,'archives'),tag=new Date(now).toISOString().replace(/[:.]/g,'-');fs.mkdirSync(d,{recursive:true});
    for(const f of[F_ETAT,F_J,F_RES])if(fs.existsSync(f))fs.renameSync(f,path.join(d,tag+'-'+path.basename(f)));console.log('Familles : ancien forward test archivé (règles de risque changées).')}}
  E.setTF(60);const c=E.bornerCfg({...G.cfg,risqueEgal:true}),f=(c.fee+c.slip)/100,S0=lireEtat(F_ETAT),hNow=Math.floor(now/H)*H-H; // dernière heure FERMÉE (ouverture)
  if(S0&&S0.lastBar>=hNow){console.log('Familles : pas de nouvelle heure fermée.');return}
  const L=[...E.WL.CRYPTO,...E.WL.FOREX],D={},ext={btcJ:[],jours:{}};
  if(process.env.FAUX_PRIX){const px=(q,t)=>{const k=q.charCodeAt(0)+q.charCodeAt(1)*3;return 100*(1+.2*Math.sin(t/J1/30+k)+.05*Math.sin(t/H/9+k*2))};
    for(const q of L){const a=[];for(let i=999;i>=0;i--){const t=hNow-i*H,o=px(q,t),cl=px(q,t+H);a.push({t,o,h:Math.max(o,cl),l:Math.min(o,cl),c:cl,v:1})}D[q]=a;
      const j=[];for(let i=120;i>=1;i--){const t=Math.floor(now/J1)*J1-i*J1;j.push({t,c:px(q,t+J1)})}ext.jours[q]=j}ext.btcJ=ext.jours.BTCUSDT}
  else{for(const q of L){const a=await get(`/api/v3/klines?symbol=${q}&interval=1h&limit=1000`),j=await get(`/api/v3/klines?symbol=${q}&interval=1d&limit=300`);
      if(a)D[q]=a.map(E.kl).filter(x=>x.t+H<=now);if(j)ext.jours[q]=j.map(E.kl).filter(x=>x.t+J1<=now)}ext.btcJ=ext.jours.BTCUSDT||[]}
  const al=E.aligner(D);if(!al||!Object.keys(al.D).length){console.error('Familles : Binance injoignable, aucune décision, aucun prix inventé.');return}
  // Une paire détenue par une stratégie manque dans les données de cette heure (requête échouée) : on attend l'heure suivante
  // plutôt que de la vendre à un prix périmé (ventes et rachats fictifs qui fausseraient les résultats).
  if(S0){const manque=[...new Set(Object.values(S0.fams).flatMap(P=>Object.keys(P.pos||{})))].filter(q=>!al.D[q]);
    if(manque.length&&(now-S0.lastBar)<6*H){console.error(`Familles : ${manque.join(', ')} absente(s) des données alors qu'une position est ouverte : heure ignorée, nouvel essai plus tard.`);return}}
  const F=E.prep(al.D,null,ext),i=F.N-1,tb=F.T[i];if(!(tb>((S0&&S0.lastBar)||0))){console.log('Familles : pas de nouvelle heure fermée.');return}
  const S=S0||{v:1,version:VERSION,debut:now,lastBar:0,h:0,seq:0,prev:'',fams:{}},J=[],ajout=l=>{const r={...l,id:++S.seq,ts:now,prev:S.prev};r.h=sha(JSON.stringify(r));S.prev=r.h;J.push(r)};
  if(S0)S.h+=Math.max(1,Math.round((tb-S.lastBar)/H));
  // Démo sans frais demandée par l'utilisateur : les trois stratégies suivies ont aussi un compte où frais et glissement valent zéro.
  // Le compte avec frais continue en parallèle (c'est lui qui compte pour un passage en argent réel).
  // Onglets recentrés (accord de l'utilisateur) : les trois stratégies suivies ont leur propre compte sur le bitcoin et l'euro-dollar seulement,
  // avec frais (id~focus) et en démo sans frais (id~focus~sansfrais). Les lignes des familles restent sur toutes les paires, pour comparaison.
  const FOCUS=['BTCUSDT','EURUSDT'].filter(q=>al.D[q]),F2=FOCUS.length===2?E.prep(Object.fromEntries(FOCUS.map(q=>[q,al.D[q]])),null,ext):null;
  for(const k of Object.keys(S.fams))if(/~sansfrais$/.test(k)&&!/~focus~/.test(k))delete S.fams[k]; // anciens comptes démo sur 16 paires
  // Stratégies retirées du suivi (accord de l'utilisateur) : leur compte est supprimé. S5 repart de zéro avec 1 % risqué par position (avant : 50 % du capital par crypto).
  for(const k of E.RETIREES)delete S.fams[k];if(S.fams.S5&&!S.fams.S5.v1pc){delete S.fams.S5}
  const IDS=Object.keys(E.FAMILLES).filter(id=>!E.RETIREES.includes(id));
  const comptes=[...IDS.map(id=>[id,id,f,c,F]),...(F2?E.TROIS.flatMap(id=>[[id+'~focus',id,f,c,F2],[id+'~focus~sansfrais',id,0,{...c,fee:0,slip:0},F2]]):[])];
  if(!F2)console.error('Familles : bitcoin ou euro-dollar absent de cette heure : comptes recentrés non mis à jour.');
  for(const[key,id,f,c,F]of comptes){const i=F.N-1;const fm=E.FAMILLES[id],P=S.fams[key]=S.fams[key]||{v1pc:1,debut:now,cash:1e4,pos:{},px:{},st:{},pk:1e4,dd:0,fees:0,n:0};
    // positions : valeur mise à jour au prix de clôture ; une paire disparue des données est vendue à son dernier prix connu
    for(const q in P.pos){if(F.p[q]){P.pos[q]*=F.p[q].c[i]/P.px[q];if(P.pos[q]<0&&f>0){const e=-P.pos[q]*E.EMPRUNT_J/24*(S0?Math.max(1,Math.round((tb-S0.lastBar)/H)):1);P.cash-=e;P.fees+=e}}else{const co=Math.abs(P.pos[q])*f;P.cash+=P.pos[q]-co;P.fees+=co;P.n++;ajout({famille:key,paire:q,montant:-P.pos[q],raison:'paire absente des données : vendue au dernier prix connu'});delete P.pos[q]}}
    const v=P.cash+Object.values(P.pos).reduce((a,b)=>a+b,0);P.st._v=v;P.st._f=f;P.st._risque=c.riskPct/100;const w0=P.arret?null:fm.regle(F,i,P.st,F.Q.length,S.h),w=!w0?null:fm.regle.pro||fm.regle.reference?w0:E.plafondRisque(F,i,w0,c,P.pos,v);
    if(w)for(const q in w){const d=v*w[q]-(P.pos[q]||0);if(Math.abs(d)>v*1e-4){const co=Math.abs(d)*f,av=P.pos[q]||0;P.cash-=d+co;P.pos[q]=av+d;P.fees+=co;P.n++;P.tr=P.tr||{ouv:{},clos:[]};E.noteEchange(P.tr,F,id,i,q,d,co,av,P.pos[q],P.st);P.tr.clos=P.tr.clos.slice(-200);
      ajout({famille:key,paire:q,montant:+d.toFixed(2),part:+w[q].toFixed(4),prix:F.p[q].c[i],bougie:new Date(tb).toISOString()});if(Math.abs(P.pos[q])<1e-6)delete P.pos[q]}}
    for(const q in P.pos)P.px[q]=F.p[q].c[i];const v2=P.cash+Object.values(P.pos).reduce((a,b)=>a+b,0);P.pk=Math.max(P.pk,v2);P.dd=Math.max(P.dd,(P.pk-v2)/P.pk);P.val=v2;
    // Baisse de 15 % depuis le plus haut (dossier) : tout est vendu et la stratégie s'arrête (sauf la référence « acheter et garder »).
    if(!P.arret&&!fm.regle.reference&&(P.pk-v2)/P.pk>=.15){P.arret=new Date(tb).toISOString();for(const q in P.pos){const d=-P.pos[q],co=Math.abs(d)*f,av=P.pos[q];P.cash-=d+co;P.fees+=co;P.n++;P.tr=P.tr||{ouv:{},clos:[]};E.noteEchange(P.tr,F,id,i,q,d,co,av,0,P.st,true);
        ajout({famille:key,paire:q,montant:+d.toFixed(2),raison:'baisse de 15 % : tout est vendu, stratégie arrêtée (règle du dossier)'});delete P.pos[q]}P.val=P.cash}
    {const jr=new Date(tb).toISOString().slice(0,10);P.hist=P.hist||[];if(!P.hist.length||P.hist[P.hist.length-1][0]!==jr)P.hist.push([jr,+v2.toFixed(2)]);else P.hist[P.hist.length-1][1]=+v2.toFixed(2);P.hist=P.hist.slice(-400)}}
  S.lastBar=tb;fs.mkdirSync(DIR,{recursive:true});if(J.length)fs.appendFileSync(F_J,J.map(x=>JSON.stringify(x)).join('\n')+'\n');ecrire(F_ETAT,JSON.stringify(S));
  ecrire(F_RES,JSON.stringify({maj:now,debut:S.debut,heure:new Date(tb).toISOString(),pairs:F.Q.length,dernierHash:S.prev,faux:!!process.env.FAUX_PRIX,
    lignes:IDS.map(id=>{const P=S.fams[id],inv=Object.values(P.pos).reduce((a,b)=>a+Math.abs(b),0);const T=(P.st._T||[]).slice(-30);return{id,nom:E.FAMILLES[id].nom,valeur:+P.val.toFixed(2),dd:+P.dd.toFixed(4),investi:P.val>0?+(inv/P.val).toFixed(3):0,n:P.n,frais:+P.fees.toFixed(2),debut:P.debut||S.debut,jours:+((now-(P.debut||S.debut))/864e5).toFixed(2),nT:(P.st._T||[]).length,n30:T.length,esp30:T.length?+(T.reduce((a,x)=>a+x.r,0)/T.length).toFixed(4):null,arret:P.arret||P.st._arret||null,...(E.TROIS.includes(id)?{actifsOnglet:['BTCUSDT','EURUSDT'],attente:F2?FOCUS.map(q=>E.attenteStrat(F2,F2.N-1,id,q)):null,focus:S.fams[id+'~focus']?{...resumeCompte(S.fams[id+'~focus']),debut:S.fams[id+'~focus'].debut,jours:+((now-S.fams[id+'~focus'].debut)/864e5).toFixed(2),arret:S.fams[id+'~focus'].arret||null}:null,demo:resumeCompte(S.fams[id+'~focus~sansfrais'])}:{})}})},null,1));
  console.log(`Familles : heure ${new Date(tb).toISOString()}, ${J.length} échange(s), ${IDS.map(id=>id+' '+S.fams[id].val.toFixed(0)).join(' | ')}`)
})().catch(e=>{console.error(e);process.exit(1)});
