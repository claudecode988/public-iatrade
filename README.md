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

## Autres familles et forward test des familles

- **Élan sur 4 semaines** (momentum « série temporelle », l'effet le plus solide dans les études sur les cryptos) et **cassures de Donchian** 10/20/40 jours (méthode des « tortues »), toutes deux avec volatilité cible et revue quotidienne. Le momentum « en coupe » (acheter les meilleures paires du moment) n'est pas testé : les études le trouvent fragile une fois les frais comptés.
- **Familles sur 3 ans** (bougies d'1 h, `MOIS3=36`) dans la mesure longue, pour voir plusieurs phases de marché.
- **`tools/familles-fw.cjs`** : forward test 24 h/24 de toutes les familles, 10 000 $ fictifs chacune, une décision par heure fermée, journal `familles.jsonl` chaîné par SHA-256.

## Habitudes des traders professionnels

- **Liste de contrôle** (`conf`) : entrée seulement avec au moins 3 confirmations indépendantes sur 4 (tendance longue, cassure, régime du RSI, régime du bitcoin).
- **Pause après 3 pertes de suite** (`serie`) : 12 h sans entrée, comme les coupe-circuit des sociétés de trading.
- **Heures creuses évitées** (`heures`) : pas d'entrée le week-end ni entre 0 h et 6 h UTC (résultats d'études mitigés).
- **Mesure de la qualité** : espérance par trade en multiples du risque (R), SQN de Van Tharp, et Monte-Carlo par blocs de 5 jours (1000 trajectoires) pour la chance de finir en perte et la pire baisse probable à 95 %.

Ces règles sont à essayer : elles ne sont pas actives dans la configuration gelée et sont mesurées dans le tableau « Pistes ».

## Dossier « bot-trading » (docs/bot-trading)

Les cinq stratégies S1 à S5 du dossier sont codées telles qu'écrites (bougies journalières, décision après la clôture du jour, stops vérifiés sur la clôture), avec la gestion du risque du dossier : 1 % risqué par trade, 5 % au total, au plus 2 positions corrélées, pause après 2 % de perte du jour ou 6 % du mois, arrêt total à 15 % de baisse. Elles sont mesurées sur 5 ans (`MOIS3=60`) et suivies en forward test ; leur statut (À TESTER, VALIDÉE, SUSPENDUE) suit `05_backtest_protocole.md`.

## Proposition du jour (une crypto, une paire forex)

`tools/proposition.cjs` applique la stratégie gelée (`config.json` → `proposition`) séparément à chaque actif choisi, sur bougies journalières : bitcoin (données Binance) et euro-dollar (données Stooq, taux de la BCE en secours), avec un contrôle sur l'ethereum. Il publie `proposition.json` : action du jour (ACHETER, VENDRE, GARDER, RIEN), entrée, stop, objectif, taille et risque, au format de la liste de contrôle, plus un test de chaque stratégie journalière actif par actif. Le site l'affiche ; l'utilisateur décide et passe l'ordre lui-même. Aucun ordre, aucune clé.

## Onglets des trois stratégies suivies

« Version 2 », « Prudente » et « Tendance » : portefeuille fictif de 100 € (forward test du serveur), gains, pertes, nombre de trades, réussite, pire baisse, frais, positions ouvertes, puis chaque trade (sens, résultat, dates, variation du prix) avec une petite analyse de la raison du gain ou de la perte, et le même journal sur la longue période (test sur le passé).

## Bilan de la semaine

`tools/bilan.cjs` (lancé par le serveur, au plus une fois par heure) publie `bilan-semaine.json` : pour les agents et les trois stratégies suivies, sur 7 jours, trades, réussite, gain et perte moyens, espérance, 3 causes de perte les plus fréquentes et une action corrective proposée (jamais appliquée sans accord), comme dans `04_journal_template.md`.

## Agents version 3 (hausse et baisse)

La version 2 dans les deux sens : achat quand la tendance de fond monte, vente à découvert (pari sur la baisse) quand elle baisse, déclencheurs en miroir. Sortie seulement quand l'analyse le confirme (deux clôtures de suite de l'autre côté de la MM50) ou sur le stop suiveur. En argent réel, parier sur la baisse demande un compte à terme ou sur marge (Binance Futures sans levier, ou un CFD chez un courtier forex). Mesurée sur 5 ans et suivie en forward test ; la proposition du jour reste sur la version 2 tant que l'utilisateur n'a pas choisi.

Version en ligne : https://claudecode988.github.io/public-iatrade/
