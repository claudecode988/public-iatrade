// Test de l'appli dans Chromium (Playwright ≥ 1.48 requis : npm i -D playwright, ou installation globale).
// Binance (REST et WebSocket) et alternative.me sont remplacés par de FAUSSES réponses calculées : ce test vérifie
// le fonctionnement de l'appli (flux, coupure, reconnexion, stop au tick…), pas les résultats de la stratégie.
//   Usage : node tools/test-navigateur.cjs      (CHROMIUM=/chemin/chromium et SORTIE=dossier facultatifs)
const { chromium } = require('playwright'),path=require('path');
const H=36e5,BAD=['GBPUSDT','AUDUSDT'],ok=(c,m)=>{console.log((c?'OK   ':'ÉCHEC ')+m);if(!c)process.exitCode=1};
const px=(s,t)=>{const k=s.charCodeAt(0)+s.charCodeAt(1)*3,b=s.startsWith('BTC')?60000:s.startsWith('ETH')?3000:10+k%50;return b*(1+.06*Math.sin(t/H/60+k)+.02*Math.sin(t/H/9+k*2)+.004*Math.sin(t/H*1.7+k))};
const bar=(s,t)=>{const o=px(s,t),c=px(s,t+H);return[t,String(o),String(Math.max(o,c)*1.004),String(Math.min(o,c)*.996),String(c),String(100+60*Math.abs(Math.sin(t/H/5))),t+H-1]};
(async()=>{
  const b=await chromium.launch(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{});
  const p=await b.newPage({viewport:{width:400,height:900}}),errs=[],net=[];
  p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>m.type()==='error'&&(/Failed to load resource/.test(m.text())?net:errs).push(m.text()));
  const now=Math.floor(Date.now()/H)*H;let restCalls=0;
  await p.route('https://api.binance.com/**',r=>{restCalls++;const u=new URL(r.request().url()),s=u.searchParams.get('symbol');
    if(BAD.includes(s))return r.fulfill({status:400,body:'{"code":-1121,"msg":"Invalid symbol."}'});
    const lim=+u.searchParams.get('limit')||500,st=u.searchParams.get('startTime'),en=u.searchParams.get('endTime');let a=[];
    if(st){for(let t=+st;t<=now&&a.length<lim;t+=H)a.push(bar(s,t))}else{const e=en?Math.floor(+en/H)*H:now,t0=now-9000*H;for(let t=e;t>=Math.max(t0,e-(lim-1)*H);t-=H)a.unshift(bar(s,t))}
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(a)})});
  await p.route('https://api.alternative.me/**',r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({data:[{value:'55',value_classification:'Greed',timestamp:String(Math.floor((Date.now()-H)/1000))}]})}));
  // Faux flux WebSocket : bookTicker toutes les 100 ms par paire, miniTicker et kline toutes les secondes.
  let mode='live',conns=0,cur=null,shift={},sent=0;const SY=[];
  await p.routeWebSocket(/stream\.binance\.com/,ws=>{conns++;if(mode==='refuse'){ws.close();return}cur=ws;
    const ss=[...new Set(new URL(ws.url()).searchParams.get('streams').split('/').map(x=>x.split('@')[0].toUpperCase()))];SY.splice(0,SY.length,...ss);
    let i=0;const iv=setInterval(()=>{if(mode!=='live'||cur!==ws)return;i++;const t=Date.now();
      for(const s of ss){const c=px(s,t)*(1+(shift[s]||0));ws.send(JSON.stringify({stream:s.toLowerCase()+'@bookTicker',data:{u:i,s,b:String(c*.9999),B:'1',a:String(c*1.0001),A:'1'}}));sent++;
        if(i%10===0){ws.send(JSON.stringify({stream:s.toLowerCase()+'@miniTicker',data:{e:'24hrMiniTicker',E:t-40,s,c:String(c),o:'1',h:'1',l:'1',v:'1',q:'1'}}));
          ws.send(JSON.stringify({stream:s.toLowerCase()+'@kline_1h',data:{e:'kline',E:t-40,s,k:{t:now,T:now+H-1,s,i:'1h',o:String(c),c:String(c),h:String(c),l:String(c),v:'10',x:false}}}));sent+=2}}},100);
    ws.onClose(()=>clearInterval(iv))});
  await p.goto('file://'+path.join(__dirname,'..','index.html'));
  for(const t of ['1','2','0']){await p.click(`nav button[data-t="${t}"]`);ok(await p.isVisible(`#t${t}`),`onglet ${t} visible`)}
  await p.waitForFunction(()=>document.getElementById('cst').textContent==='EN DIRECT',null,{timeout:20000});ok(true,'prix en continu : état « EN DIRECT »');
  await p.waitForTimeout(2500);const rate=parseInt(await p.textContent('#crate')),lag=await p.textContent('#clag');
  console.log(`     ${rate} messages/s affichés, ${lag}`);ok(rate>100&&/délai \d+ ms/.test(lag),'débit et délai affichés');
  ok(!(await p.content()).includes('Prix simulés'),'aucun prix simulé affiché');
  // Évaluation manuelle avec un seuil bas pour forcer une entrée, puis stop déclenché au tick
  await p.click('nav button[data-t="2"]');await p.fill('#thr','50');await p.click('#save');await p.click('nav button[data-t="0"]');
  await p.click('#go');await p.waitForFunction(()=>/Évaluation terminée|Historique|figées/.test(document.getElementById('msg').textContent),null,{timeout:15000});
  const pos=await p.evaluate(()=>S.pos&&{q:S.pos.q,side:S.pos.side,stop:S.pos.stop,px:S.pos.px});ok(!!pos,'entrée fictive à l’évaluation manuelle'+(pos?` (${pos.q} en ${pos.side==='long'?'hausse':'baisse'}, stop ${pos.stop.toFixed(4)})`:''));
  if(pos){const t0=Date.now();shift[pos.q]=pos.side==='long'?-.05:.05;
    await p.waitForFunction(()=>!S.pos,null,{timeout:5000}).catch(()=>{});const dt=Date.now()-t0,lg=await p.textContent('#log');
    ok(/stop touché au tick/.test(lg),`stop déclenché au tick (sortie ${dt} ms après le saut de prix)`);shift={}}
  // Démarrage, fermeture de bougie 1 h reçue par le flux, puis arrêt d'urgence
  await p.click('#auto');ok(/Agents en service/.test(await p.textContent('#auto-st')),'démarrage des agents');
  for(const s of SY){const c=px(s,Date.now());cur.send(JSON.stringify({stream:s.toLowerCase()+'@kline_1h',data:{e:'kline',E:Date.now(),s,k:{t:now,T:now+H-1,s,i:'1h',o:String(c),c:String(c),h:String(c*1.001),l:String(c*.999),v:'150',x:true}}}))}
  await p.waitForFunction(()=>/Décision prise à la fermeture/.test(document.getElementById('msg').textContent),null,{timeout:10000}).then(()=>ok(true,'décision prise à la fermeture d’une bougie 1 h du flux')).catch(()=>ok(false,'décision à la fermeture de bougie'));
  await p.click('#kill');ok(/Arrêt d'urgence actif/.test(await p.textContent('#auto-st')),'arrêt d’urgence stoppe les agents');await p.click('#kill');
  // Coupure : plus aucun message -> données figées ; puis connexion fermée et refusée -> reconnexion avec délai croissant
  mode='silent';await p.waitForFunction(()=>document.getElementById('cst').textContent==='DONNÉES FIGÉES',null,{timeout:9000}).then(()=>ok(true,'silence de plus de 5 s : « DONNÉES FIGÉES »')).catch(()=>ok(false,'données figées'));
  ok(await p.evaluate(()=>!fresh()),'aucun trade possible pendant les données figées');
  const c0=conns;mode='refuse';cur.close();await p.waitForFunction(()=>document.getElementById('cst').textContent==='RECONNEXION…',null,{timeout:5000}).then(()=>ok(true,'coupure : « RECONNEXION… »')).catch(()=>ok(false,'état reconnexion'));
  await p.waitForTimeout(4500);console.log(`     ${conns-c0} tentatives refusées en 4,5 s (attendu : délais 1 s, 2 s…)`);ok(conns-c0>=2&&conns-c0<=4,'délai de reconnexion croissant');
  mode='live';await p.waitForFunction(()=>document.getElementById('cst').textContent==='EN DIRECT',null,{timeout:20000}).then(()=>ok(true,'retour du réseau : reconnexion puis « EN DIRECT »')).catch(()=>ok(false,'reconnexion'));
  // Mesure sur l'historique (pagination sur 9 pages par paire)
  await p.click('nav button[data-t="1"]');const r0=restCalls;await p.click('#simgo');
  await p.waitForFunction(()=>/Mesure terminée|Erreur|injoignable/.test(document.getElementById('simst').textContent),null,{timeout:120000});
  console.log('     ',await p.textContent('#simst'),`(${restCalls-r0} requêtes REST)`);ok(/Mesure terminée/.test(await p.textContent('#simst')),'mesure terminée');
  await p.click('nav button[data-t="0"]');const sr=await p.textContent('#simres');
  ok(/Départ · test/.test(sr)&&/Durée moy/.test(sr)&&/Glissement/.test(sr)&&/actualité neutre/.test(sr),'résultats départ/après, calibrage/test, durée, frais, glissement');
  await p.screenshot({path:path.join(process.env.SORTIE||'.','accueil.png'),fullPage:true});await p.click('nav button[data-t="1"]');await p.screenshot({path:path.join(process.env.SORTIE||'.','agents.png'),fullPage:true});
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'pas de défilement horizontal à 400 px');
  console.log(`     ${net.length} requêtes refusées par les fausses réponses (paires inexistantes) : attendu.`);
  ok(!errs.length,'aucune erreur JavaScript dans la console'+(errs.length?' : '+errs.slice(0,5).join(' | '):''));
  await b.close();process.exit(process.exitCode||0)})();
