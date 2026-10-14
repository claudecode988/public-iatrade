// Mesure en ligne de commande, avec exactement le même moteur que l'appli (bloc MOTEUR de index.html).
//   node tools/mesure.cjs                 bougies 1 h publiques Binance (lecture seule), environ 12 mois
//   node tools/mesure.cjs --synthetique   prix inventés : vérifie seulement que le moteur tourne, résultats sans valeur
// Options : --duree 5|10|60 (minutes, 5 par défaut) --achats 3 --seuil 85 --taille 1000 --stop 2 --perte 5 --trades 50 --detention 6 --atr 2 --frais 0.1 --glissement 0.05 --pages N
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('/* MOTEUR-DEBUT'),html.indexOf('/* MOTEUR-FIN'));
const E=new Function(src+';return{WL,historique,aligner,prep,mesurer,CHANGES,setTF,agreger}')();
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?+process.argv[i+1]:d};
const TF=E.setTF(arg('duree',5));
const c={nb:arg('achats',3),thr:arg('seuil',85),size:arg('taille',1000),sl:arg('stop',2),maxLoss:arg('perte',5),maxTrades:arg('trades',50),hold:arg('detention',6),atrK:arg('atr',2),fee:arg('frais',.1),slip:arg('glissement',.05)};
const L=[...E.WL.CRYPTO,...E.WL.FOREX];
function synthetique(){const D={},t0=Date.UTC(2025,0,1);let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(const q of L){let b=100,a=[];for(let i=0;i<TF.pages*1000;i++){const o=b;b*=1+(rnd()-.5)*.016*Math.sqrt(TF.srcMs/36e5);a.push({t:t0+i*TF.srcMs,o,h:Math.max(o,b)*(1+rnd()*.004),l:Math.min(o,b)*(1-rnd()*.004),c:b,v:100+rnd()*100})}D[q]=E.agreger(a)}return D}
(async()=>{const syn=process.argv.includes('--synthetique');let D,bad=[];
  if(syn){D=synthetique();console.log('PRIX INVENTÉS (marche au hasard) : ces résultats ne mesurent rien, ils vérifient seulement le moteur.\n')}
  else{({D,bad}=await E.historique(fetch,'https://api.binance.com',L,arg('pages',TF.pages),m=>process.stderr.write('\r'+m.padEnd(90))));process.stderr.write('\n');
    if(!Object.keys(D).length){console.error('Binance injoignable : aucune mesure possible.');process.exit(1)}}
  const al=E.aligner(D),M=E.mesurer(E.prep(al.D),c),d=x=>new Date(x).toISOString().slice(0,16).replace('T',' ');
  const f=x=>(x<0?'-':' ')+Math.abs(x).toFixed(2).padStart(8),pc=x=>(x*100).toFixed(1).padStart(5)+' %';
  const row=(n,r)=>console.log(n.padEnd(18),f(r.pnl),String(r.n).padStart(6),(r.pf===null?'–':r.pf.toFixed(2)).padStart(6),f(r.bh),(r.dur.toFixed(1)+' h').padStart(8),(r.n?Math.round(r.wr*100)+' %':'–').padStart(8),f(r.gain),f(r.loss),f(r.fees),f(r.slip),pc(r.dd),r.n<30?'  trop peu de trades pour conclure':'');
  console.log(`${M.pairs} paires, bougies de ${TF.lab}. Calibrage ${d(M.du)} → ${d(M.coupe)} UTC, test → ${d(M.au)} UTC.${al.ecartees.length||bad.length?' Écartées : '+[...al.ecartees,...bad].join(', '):''}`);
  console.log(''.padEnd(18),'   Bilan','Trades','    PF',' Ach.&gard.','  Durée','Réussite','   Gagné','   Perdu','   Frais','  Gliss.','Pire baisse');
  row('Départ calibrage',M.base.cal);row('Départ test',M.base.test);row('Après calibrage',M.fin.cal);row('Après test',M.fin.test);
  console.log('\nChangements, un par un (bilan test avant → après | calibrage avant → après) :');
  for(const e of M.essais)console.log(` ${e.garde?'GARDÉ    ':'ABANDONNÉ'} ${e.nom.padEnd(28)} test ${f(e.avantTest.pnl)} → ${f(e.test.pnl)} (${e.test.n} tr.) | cal. ${f(e.avantCal.pnl)} → ${f(e.cal.pnl)} | ${e.pq}`);
  console.log('\nSeuils sur le calibrage :',M.seuils.map(x=>`${x.thr} % ${f(x.cal.pnl)} (${x.cal.n})`).join(' | '));
  console.log(`Meilleur : ${M.best} %. Test à ce seuil ${f(M.testBest.pnl)} contre ${f(M.avantSeuil)} à ${M.thr} %. ${M.seuilOk?'Confirmé.':'Pas confirmé.'}`);
})().catch(e=>{console.error(e);process.exit(1)});
