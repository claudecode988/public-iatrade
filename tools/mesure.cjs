// Mesure en ligne de commande, avec exactement le même moteur que l'appli (bloc MOTEUR de index.html).
//   node tools/mesure.cjs                 bougies 1 h publiques Binance (lecture seule), environ 12 mois
//   node tools/mesure.cjs --comparer       comparatif 5 min / 10 min / 1 h sur les mêmes 2 mois de bougies de 5 min
//   node tools/mesure.cjs --synthetique   prix inventés : vérifie seulement que le moteur tourne, résultats sans valeur
// Options : --duree 5|10|60 (minutes, 5 par défaut) --achats 3 --risque 0.5 --coupe 15 --seuil 85 --taille 1000 --stop 2 --perte 5 --trades 50 --detention 6 --atr 2 --frais 0.1 --glissement 0.05 --pages N
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('/* MOTEUR-DEBUT'),html.indexOf('/* MOTEUR-FIN'));
const E=new Function(src+';return{WL,historique,aligner,prep,mesurer,CHANGES,setTF,agreger,alertes,comparer,walkForward,dsr,fiabilite,sharpe,cleEssai,setEssai:f=>{ESSAI=f}}')();
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?+process.argv[i+1]:d};
const TF=E.setTF(arg('duree',5));
const c={riskPct:arg('risque',.5),ddMax:arg('coupe',15),nb:arg('achats',3),thr:arg('seuil',85),size:arg('taille',1000),sl:arg('stop',2),maxLoss:arg('perte',5),maxTrades:arg('trades',50),hold:arg('detention',6),atrK:arg('atr',2),fee:arg('frais',.1),slip:arg('glissement',.05)};
const L=[...E.WL.CRYPTO,...E.WL.FOREX];
function synthetique(){const D={},t0=Date.UTC(2025,0,1);let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(const q of L){let b=100,a=[];for(let i=0;i<TF.pages*1000;i++){const o=b;b*=1+(rnd()-.5)*.016*Math.sqrt(TF.srcMs/36e5);a.push({t:t0+i*TF.srcMs,o,h:Math.max(o,b)*(1+rnd()*.004),l:Math.min(o,b)*(1-rnd()*.004),c:b,v:100+rnd()*100})}D[q]=E.agreger(a)}return D}
(async()=>{const syn=process.argv.includes('--synthetique');let D,bad=[];
  if(process.argv.includes('--comparer')){E.setTF(5);let D5;
    if(syn){D5=synthetique();console.log('PRIX INVENTÉS : comparatif sans valeur, vérification du moteur seulement.\n')}else({D:D5}=await E.historique(fetch,'https://api.binance.com',L,18,m=>process.stderr.write('\r'+m.padEnd(90))));
    const f=x=>(x<0?'-':' ')+Math.abs(x).toFixed(2).padStart(8);
    for(const r of E.comparer(D5,c,{},5))for(const v of['base'])console.log(r.lab.padEnd(7),'départ  test',f(r[v].test.pnl),String(r[v].test.n).padStart(5),'trades | entraînement',f(r[v].cal.pnl),String(r[v].cal.n).padStart(5),'trades |',E.alertes(r[v].cal,r[v].test).length,'alerte(s)');
    return}
  if(syn){D=synthetique();console.log('PRIX INVENTÉS (marche au hasard) : ces résultats ne mesurent rien, ils vérifient seulement le moteur.\n')}
  else{({D,bad}=await E.historique(fetch,'https://api.binance.com',L,arg('pages',TF.pages),m=>process.stderr.write('\r'+m.padEnd(90))));process.stderr.write('\n');
    if(!Object.keys(D).length){console.error('Binance injoignable : aucune mesure possible.');process.exit(1)}}
  const ESS={};E.setEssai((cc,R,r)=>{const k=E.cleEssai(cc,R),v=E.sharpe(r.ret);if(!ESS[k]&&v!==null)ESS[k]=v});
  const al=E.aligner(D),FF=E.prep(al.D),M=E.mesurer(FF,c),wf=E.walkForward(FF,c),srs=Object.values(ESS),dd=wf?E.dsr(wf.test.ret,srs):null,fb=E.fiabilite(wf,dd,0),d=x=>new Date(x).toISOString().slice(0,16).replace('T',' ');
  const f=x=>(x<0?'-':' ')+Math.abs(x).toFixed(2).padStart(8),pc=x=>(x*100).toFixed(1).padStart(5)+' %';
  const row=(n,r)=>console.log(n.padEnd(18),f(r.pnl),String(r.n).padStart(6),(r.pf===null?'–':r.pf.toFixed(2)).padStart(6),f(r.bh),(r.dur.toFixed(1)+' h').padStart(8),(r.n?Math.round(r.wr*100)+' %':'–').padStart(8),f(r.gain),f(r.loss),f(r.fees),f(r.slip),pc(r.dd),r.n<30?'  trop peu de trades pour conclure':'');
  console.log(`${M.pairs} paires, bougies de ${TF.lab}. Entraînement (70 %) ${d(M.du)} → ${d(M.coupe)} UTC, test → ${d(M.au)} UTC.${al.ecartees.length||bad.length?' Écartées : '+[...al.ecartees,...bad].join(', '):''}`);
  console.log(''.padEnd(18),'   Bilan','Trades','    PF',' Ach.&gard.','  Durée','Réussite','   Gagné','   Perdu','   Frais','  Gliss.','Pire baisse');
  row('Départ entraîn.',M.base.cal);row('Départ test',M.base.test);row('Active entraîn.',M.fin.cal);row('Active test',M.fin.test);
  const alr=E.alertes(M.fin.cal,M.fin.test);console.log(alr.length?'\nAlertes :\n - '+alr.join('\n - '):'\nAucune alerte automatique.');
  console.log('\nChangements, un par un (bilan test avant → après | calibrage avant → après) :');
  for(const e of M.essais)console.log(` ${e.garde?'GARDÉ    ':'ABANDONNÉ'} ${e.nom.padEnd(28)} test ${f(e.avantTest.pnl)} → ${f(e.test.pnl)} (${e.test.n} tr.) | cal. ${f(e.avantCal.pnl)} → ${f(e.cal.pnl)} | ${e.pq}`);
  console.log('\nSeuils, entraînement → test :',M.seuils.map(x=>`${x.thr} % ${f(x.cal.pnl)} → ${f(x.test.pnl)}`).join(' | '));
  if(wf){console.log('\nWalk-forward (entraînement → hors échantillon) :');wf.fen.forEach((x,k)=>console.log(` ${k+1}. ${d(x.test.du)} ${f(x.ent.pnl)} → ${f(x.test.pnl)} (${x.test.n} trades, seuil ${x.thr} %, ${x.regles.length} règle(s))`));
    console.log(` Total hors échantillon ${f(wf.test.pnl)} sur ${wf.test.n} trades, ${wf.test.pos}/${wf.fen.length} fenêtres positives.`)}
  console.log(`${srs.length} configurations testées. DSR : ${dd?(dd.dsr*100).toFixed(1)+' % (SR '+dd.sr.toFixed(3)+', SR0 '+dd.sr0.toFixed(3)+')':'non calculable'}. Fiabilité : ${fb.niveau} — ${fb.raison}`);
  console.log(`Meilleur : ${M.best} %. Test à ce seuil ${f(M.testBest.pnl)} contre ${f(M.avantSeuil)} à ${M.thr} %. ${M.seuilOk?'Confirmé.':'Pas confirmé.'}`);
})().catch(e=>{console.error(e);process.exit(1)});
