# Tableau de bord d'analyse et de prédiction des prix des denrées alimentaires au Sénégal

Pipeline de données et tableau de bord du projet de groupe (DIT, L2 Big Data, groupe 6) « Tableau de bord d'analyse et de prédiction des prix des denrées alimentaires ».

- Tableau de bord en ligne : https://claude.ai/artifact/EdyVro5P4Keutaf2LsnLRz
- Dossier Scrum du projet : https://claude.ai/artifact/27bQ7kVkm6AHEKJjYA8p3Z

Le pipeline télécharge les prix de détail relevés par le Programme alimentaire mondial (PAM) sur les marchés du Sénégal, les nettoie, calcule un indice des prix alimentaires, l'inflation sur 12 mois et un niveau d'alerte, prévoit les prix à 6 mois, puis écrit les fichiers que le tableau de bord affiche.

Denrées suivies : riz importé, riz local, maïs, mil, sorgho, niébé, arachide décortiquée (relevées par le PAM depuis plus de quatre ans). Une cinquantaine de marchés dans les 14 régions.

## Lancer le pipeline

Seul Python 3.10 ou plus récent est nécessaire (aucune bibliothèque à installer). Depuis ce dossier :

```
python -I pipeline/run_pipeline.py
```

- Première exécution : environ 2 minutes (téléchargement d'environ 50 Mo, dont 40 Mo de contours de régions).
- Exécutions suivantes : environ 40 secondes, les sources déjà téléchargées sont réutilisées.
- `--forcer` retélécharge toutes les sources (à faire chaque mois, quand le PAM publie de nouveaux prix).

## Lancer les tests

```
python -I tests/test_pipeline.py
```

18 tests vérifient les dates, le chaînage des prix, l'indice et ses pondérations, le niveau d'alerte, les prévisions et les outils de carte.

## Organisation

| Chemin | Contenu |
|---|---|
| `pipeline/config.py` | Décisions métier : pays, produits, pondérations, seuils d'alerte, paramètres des prévisions |
| `pipeline/collecte.py` | Téléchargement des sources (PAM via HDX, Natural Earth) et journal `data/raw/sources.json` |
| `pipeline/nettoyage.py` | Prix de détail, une variété par produit, relevés aberrants écartés, régions |
| `pipeline/indicateurs.py` | Prix nationaux et régionaux enchaînés, indice base 2019, inflation, niveau d'alerte, situation des marchés |
| `pipeline/previsions.py` | 6 méthodes de prévision rejouées sur 18 mois, intervalles à 80 et 95 % |
| `pipeline/geographie.py` | Noms de régions harmonisés, rattachement des marchés, contours simplifiés |
| `pipeline/run_pipeline.py` | Enchaîne toutes les étapes et écrit `data/processed/` et le rapport qualité |
| `tests/test_pipeline.py` | Tests unitaires |
| `data/raw/` | Fichiers bruts téléchargés (non modifiés) |
| `data/processed/` | 11 fichiers lus par le tableau de bord et `rapport_qualite.md` |
| `tableau-de-bord/` | Code de la page du tableau de bord (`index.html`, `app.js`) ; il ne fonctionne qu'à l'intérieur du tableau de bord publié |

Les dossiers `data/processed_ancien_zone_franc/` et `tableau-de-bord_ancien_zone_franc/` gardent la première version du projet (12 pays de la zone franc), abandonnée pour se concentrer sur le Sénégal.

## Fichiers produits

| Fichier | Contenu |
|---|---|
| `series_nationales.csv` | Prix médian national mensuel par produit depuis 2015, avec niveau d'alerte |
| `indice_alimentaire.csv` | Indice des prix alimentaires (base 100 = 2019) et inflation sur 12 mois |
| `synthese_produits.csv` | Dernier prix, variations, alerte et prévision à 3 mois de chaque produit |
| `previsions.csv` | Prévisions à 6 mois et intervalles |
| `evaluation_modeles.csv` | Erreurs des 6 méthodes de prévision |
| `tests_previsions.csv` | Prévisions passées à 1 et 3 mois face aux prix observés |
| `series_regionales.csv`, `synthese_regions.csv` | Prix par région depuis 2022 |
| `marches.csv` | Dernier prix et alerte de chaque marché suivi |
| `carte_regions.json`, `carte_pays.json` | Contours simplifiés des régions du Sénégal et des pays voisins |

Pour mettre à jour le tableau de bord après une nouvelle exécution, il suffit de recharger ces fichiers dans ses sources.

## Méthode en bref

- **Prix national ou régional :** variations mensuelles calculées sur les marchés relevés les deux mois, enchaînées, puis calées sur la médiane du dernier mois. Les mois sans relevé (6 au plus) sont interpolés.
- **Indice :** moyenne géométrique pondérée des variations des produits (céréales 75 %, légumineuses 25 %). Ces pondérations sont une hypothèse à valider avec l'ANSD.
- **Niveau d'alerte :** inspiré de l'indicateur ALPS du PAM. Écart entre le prix observé et le prix attendu (tendance et saison sur 5 ans), en écarts types : Normal sous 0,25, Tension de 0,25 à 1, Alerte de 1 à 2, Crise à partir de 2.
- **Prévisions :** dernier prix, même mois de l'an dernier, dernier prix corrigé de la saison, Holt amorti, Holt-Winters amorti et la moyenne des trois derniers ; la méthode la plus juste sur les 18 derniers mois est retenue.

## Sources

- Prix de détail : Programme alimentaire mondial, jeu « Senegal - Food Prices » publié sur HDX (https://data.humdata.org). Vérifiez la licence sur sa page HDX avant toute réutilisation publique.
- Limites administratives : Natural Earth 5.1.2, domaine public.

## Limites

Les prévisions prolongent le passé et ignorent les chocs annoncés (décision sur les prix, sécheresse, mesure douanière). Un niveau « Crise » est un signal à vérifier sur le terrain. L'huile et le sucre ne sont pas relevés par le PAM au Sénégal ; les légumes ne le sont que depuis mai 2026. L'indice du projet ne remplace pas l'indice officiel des prix à la consommation de l'ANSD.
