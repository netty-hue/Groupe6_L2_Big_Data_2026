"""Paramètres du pipeline du tableau de bord des prix des denrées alimentaires au Sénégal.

Tout ce qui est « décision métier » (pays, produits, pondérations, seuils) est
regroupé ici pour que le Product Owner puisse le relire sans lire le code.
"""

# Pays suivi : ISO3 -> (nom affiché, union monétaire, identifiant du jeu HDX du PAM)
PAYS = {
    "SEN": ("Sénégal", "UEMOA", "senegal"),
}

# Pays voisins dessinés en fond de carte (contexte géographique uniquement)
VOISINS = ["GMB", "MRT", "MLI", "GIN", "GNB"]

# Produits suivis : les denrées de base relevées par le PAM au Sénégal depuis plus de
# 4 ans. On retient la première variété candidate suffisamment couverte depuis 2019.
PRODUITS = {
    "riz_importe": {"libelle": "Riz importé", "groupe": "Céréales", "unite": "kg",
                    "candidats": ["Rice (imported)"]},
    "riz_local": {"libelle": "Riz local", "groupe": "Céréales", "unite": "kg",
                  "candidats": ["Rice (local)"]},
    "mais": {"libelle": "Maïs", "groupe": "Céréales", "unite": "kg",
             "candidats": ["Maize (local)", "Maize (imported)"]},
    "mil": {"libelle": "Mil", "groupe": "Céréales", "unite": "kg", "candidats": ["Millet"]},
    "sorgho": {"libelle": "Sorgho", "groupe": "Céréales", "unite": "kg", "candidats": ["Sorghum"]},
    "niebe": {"libelle": "Niébé", "groupe": "Légumineuses", "unite": "kg", "candidats": ["Beans (niebe)"]},
    "arachide": {"libelle": "Arachide décortiquée", "groupe": "Légumineuses", "unite": "kg",
                 "candidats": ["Groundnuts (shelled)"]},
}

# Libellés français des variétés du PAM
VARIETES_FR = {
    "Rice (imported)": "Riz importé", "Rice (local)": "Riz local", "Maize (local)": "Maïs local",
    "Maize (imported)": "Maïs importé", "Millet": "Mil", "Sorghum": "Sorgho", "Beans (niebe)": "Niébé",
    "Groundnuts (shelled)": "Arachide décortiquée",
}

# Pondération des groupes dans l'indice des prix alimentaires (hypothèse du projet,
# à valider avec l'ANSD) : les céréales pèsent les trois quarts du panier suivi.
POIDS_GROUPES = {"Céréales": 0.75, "Légumineuses": 0.25}

# Période d'analyse
DEBUT_SERIES = "2015-01"        # séries nationales et modèles
DEBUT_REGIONS = "2022-01"       # séries régionales (allège le tableau de bord)
ANNEE_BASE = "2019"             # indice = 100 en moyenne sur 2019 (avant Covid-19)
MIN_RELEVES_DEPUIS_2019 = 150   # relevés marché-mois minimum pour retenir une variété
MIN_MOIS_DEPUIS_2019 = 36       # et nombre minimum de mois couverts

# Nettoyage
FLAGS_ACCEPTES = {"actual", "aggregate", "actual,aggregate"}
RATIO_ABERRANT = 3.0            # relevé écarté s'il est 3x au-dessus/en dessous de la médiane du marché
TROU_MAX_MOIS = 6               # mois manquants comblés au plus ; au-delà, la série est coupée
FRAICHEUR_MAX_MOIS = 12         # variété écartée si son dernier relevé a plus de 12 mois de retard

# Prévisions
HORIZON = 6                     # mois prévus
FENETRE_TEST = 18               # origines de prévision glissantes pour l'évaluation
MIN_POINTS_MODELE = 48          # longueur minimale d'une série pour la prévoir

# Indicateur d'alerte (inspiré de l'ALPS du PAM) : écart au prix attendu (tendance +
# saisonnalité), divisé par l'écart type des résidus, sur une fenêtre glissante.
FENETRE_ALERTE = 60
SEUILS_ALERTE = [(2.0, "Crise"), (1.0, "Alerte"), (0.25, "Tension"), (float("-inf"), "Normal")]

# Correspondances de noms de régions (PAM -> nom affiché) et polygones de la carte
# (Natural Earth -> nom affiché) quand les deux sources divergent. Au Sénégal, les noms
# ne diffèrent que par les accents et les tirets (« Thies », « Saint Louis »), ce que la
# comparaison sans accents de geographie.normaliser règle déjà.
REGION_HARMONISEE = {}
# Marchés publiés sans région ni coordonnées par le PAM
REGION_DU_MARCHE = {}
POLYGONE_VERS_REGION = {}

# Sources
URL_HDX = "https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-{}"
URL_NE_ADMIN1 = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/"
                 "geojson/ne_10m_admin_1_states_provinces.geojson")
URL_NE_ADMIN0 = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/"
                 "geojson/ne_50m_admin_0_countries.geojson")
