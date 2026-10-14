# TradeInsight

Simulateur de trading avec argent fictif, en un seul fichier : `index.html` (ouvrir dans un navigateur).

- Prix : flux WebSocket public de Binance (lecture seule, aucune clé). REST seulement pour l'historique et pour combler les trous après une coupure.
- Si plus aucun prix n'arrive depuis 5 s, les agents se mettent en pause : aucun prix ni résultat n'est jamais inventé.
- Ordres : portefeuille interne, et testnet Binance seulement si tu le demandes (confirmation avant chaque ordre, clés gardées en mémoire, jamais dans le code).

## Mesurer la stratégie

- Dans l'appli : onglet Agents, « Mesurer sur l'historique réel » (environ 12 mois de bougies 1 h, 2/3 calibrage, 1/3 test).
- En ligne de commande, avec le même moteur : `node tools/mesure.cjs` (Node 18 ou plus, accès à api.binance.com).
  `node tools/mesure.cjs --synthetique` utilise des prix inventés pour vérifier le code ; ses résultats ne valent rien.

## Tester l'appli

`node tools/test-navigateur.cjs` (Playwright 1.48 ou plus). Binance (REST et WebSocket) et alternative.me y sont remplacés par de fausses réponses.

Version en ligne : https://claudecode988.github.io/public-iatrade/
