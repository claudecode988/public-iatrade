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

## Forward test 24 h/24 et mesure longue (serveur)

- `tools/forward.cjs` : lancé par GitHub Actions toutes les 5 minutes avec la configuration gelée de `forward/config.json`
  (branche `forward-test`). Journal public `forward/journal.jsonl`, ajout seulement, chaîné par empreintes SHA-256.
- `tools/mesure-longue.cjs` : lancé chaque semaine, environ 12 mois de bougies (fichiers mensuels de data.binance.vision),
  résultat dans `forward/mesure-longue.json`.
- Changer `forward/config.json` archive le journal et fait repartir le forward test de zéro.

## Sources des pros et pistes de régularité

Ce que regardent les traders professionnels, en version gratuite, publique et sans clé :

- **Régime du bitcoin** : clôture journalière au-dessus ou au-dessous de sa moyenne 50 jours (marché haussier ou baissier).
- **Calendrier de la Fed (FOMC)** : dates des décisions de taux 2025-2026 inscrites dans le code (à compléter chaque année). Pause de 12 h avant à 6 h après l'annonce.
- **Taux de financement** des contrats perpétuels Binance (`fapi.binance.com`, lecture seule ; historique sur `data.binance.vision`). Au-dessus de 0,05 % par 8 h, il y a trop d'acheteurs à crédit.

Ces sources sont des **règles à essayer** (`regime`, `macro`, `fund`), désactivées dans la configuration gelée. La mesure longue les ajoute une par une aux agents (tableau « Pistes pour des résultats plus réguliers ») et compare aussi trois familles prudentes : tendance + régime, tendance + volatilité cible (2,5 % par jour, ne fait que réduire l'exposition), et la combinaison des deux avec la pause Fed. Rien n'est adopté automatiquement.

Version en ligne : https://claudecode988.github.io/public-iatrade/
