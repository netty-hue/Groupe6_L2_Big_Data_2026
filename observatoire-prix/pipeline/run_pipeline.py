"""Lance tout le pipeline : collecte -> nettoyage -> indicateurs -> prévisions -> exports.

    python -I pipeline/run_pipeline.py            (depuis le dossier observatoire-prix)
    python -I pipeline/run_pipeline.py --forcer   (retélécharge les sources)

Les fichiers produits dans data/processed/ alimentent le tableau de bord du Sénégal.
Le code garde un identifiant de pays en interne, mais les fichiers exportés n'ont pas
de colonne pays : un seul pays est suivi.
"""
import csv
import datetime as dt
import json
import math
import os
import sys
import time
from collections import Counter, defaultdict

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import collecte      # noqa: E402
import config        # noqa: E402
import geographie    # noqa: E402
import indicateurs   # noqa: E402
import nettoyage     # noqa: E402
import previsions    # noqa: E402
from nettoyage import indice_mois, texte_mois  # noqa: E402

RACINE = os.path.dirname(ICI)
RAW = os.path.join(RACINE, "data", "raw")
SORTIE = os.path.join(RACINE, "data", "processed")


def arrondi(x, d=0):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    return round(x, d) if d else int(round(x))


def pct(x):
    return "" if x is None else round(100 * x, 1)


def ecrire_csv(nom, lignes, colonnes):
    with open(os.path.join(SORTIE, nom), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=colonnes, extrasaction="ignore")
        w.writeheader()
        w.writerows(lignes)
    print(f"  {nom:28s} {len(lignes):6d} lignes")


def main():
    t0 = time.time()
    sys.stdout.reconfigure(errors="replace")
    os.makedirs(SORTIE, exist_ok=True)
    forcer = "--forcer" in sys.argv

    print("1. Collecte des sources")
    journal = collecte.collecter(RAW, forcer)

    print("2. Nettoyage")
    regions = geographie.Regions(os.path.join(RAW, "ne_admin1.geojson"))
    prix_marches, varietes, rapports = nettoyage.nettoyer(RAW, regions)
    print(f"  {len(prix_marches)} prix mensuels marché-produit retenus")
    dernier_mois_pays = defaultdict(int)
    for r in prix_marches:
        dernier_mois_pays[r["iso3"]] = max(dernier_mois_pays[r["iso3"]], r["mois"])

    print("3. Indicateurs")
    debut = indice_mois(config.DEBUT_SERIES)
    nat = indicateurs.series_agregees(prix_marches, lambda r: (r["iso3"], r["produit_id"]), debut)
    var_par_cle = {(r["iso3"], r["produit_id"]): r["variete"] for r in prix_marches}
    lignes_nat, synthese, lignes_indice = [], [], []
    for (iso, pid), serie in sorted(nat.items()):
        if not serie:
            continue
        valeurs = {m: v for m, (v, _) in serie.items()}
        alertes = indicateurs.serie_alertes(valeurs)
        for m, (v, n) in serie.items():
            lignes_nat.append({"iso3": iso, "pays": config.PAYS[iso][0], "produit_id": pid,
                               "produit": config.PRODUITS[pid]["libelle"], "variete": var_par_cle[(iso, pid)],
                               "unite": config.PRODUITS[pid]["unite"], "mois": texte_mois(m), "prix": arrondi(v),
                               "nb_marches": n, "alerte": arrondi(alertes[m], 2),
                               "niveau": indicateurs.niveau_alerte(alertes[m])})
    for iso in config.PAYS:
        pids = [pid for (i, pid) in nat if i == iso and nat[(i, pid)]]
        indice = indicateurs.indice_alimentaire({pid: nat[(iso, pid)] for pid in pids}, pids)
        for m, (v, nb) in indice.items():
            infl = indice[m][0] / indice[m - 12][0] - 1 if (m - 12) in indice else None
            lignes_indice.append({"iso3": iso, "pays": config.PAYS[iso][0], "zone": config.PAYS[iso][1],
                                  "mois": texte_mois(m), "indice": arrondi(v, 1), "inflation_12m_pct": pct(infl),
                                  "nb_produits": nb})

    print("4. Prévisions")
    lignes_prev, lignes_eval, lignes_tests = [], [], []
    for (iso, pid), serie in sorted(nat.items()):
        valeurs = {m: v for m, (v, _) in serie.items()}
        dernier = max(valeurs) if valeurs else 0
        resultat = None
        if valeurs and dernier >= dernier_mois_pays[iso] - 3:
            resultat = previsions.evaluer_et_prevoir(valeurs)
        alerte_derniere = indicateurs.serie_alertes(valeurs).get(dernier) if valeurs else None
        ligne = {"iso3": iso, "pays": config.PAYS[iso][0], "zone": config.PAYS[iso][1], "produit_id": pid,
                 "produit": config.PRODUITS[pid]["libelle"], "variete": var_par_cle[(iso, pid)],
                 "unite": config.PRODUITS[pid]["unite"], "mois": texte_mois(dernier) if valeurs else "",
                 "prix": arrondi(valeurs.get(dernier)), "nb_marches": serie[dernier][1] if valeurs else 0,
                 "var_1m_pct": pct(indicateurs.variation(valeurs, dernier, 1)),
                 "var_3m_pct": pct(indicateurs.variation(valeurs, dernier, 3)),
                 "var_12m_pct": pct(indicateurs.variation(valeurs, dernier, 12)),
                 "alerte": arrondi(alerte_derniere, 2), "niveau": indicateurs.niveau_alerte(alerte_derniere)}
        if resultat:
            evaluation, prevs, tests = resultat
            retenu = next(e for e in evaluation if e["retenu"])
            p3 = prevs[2]["prevision"]
            ligne.update({"modele": retenu["modele"], "mape_pct": pct(retenu["mape"]),
                          "prevision_3m": arrondi(p3), "var_prevue_3m_pct": pct(p3 / valeurs[dernier] - 1)})
            for p in prevs:
                lignes_prev.append({"iso3": iso, "produit_id": pid, "mois": texte_mois(p["mois"]),
                                    "prevision": arrondi(p["prevision"]), "bas80": arrondi(p["bas80"]),
                                    "haut80": arrondi(p["haut80"]), "bas95": arrondi(p["bas95"]),
                                    "haut95": arrondi(p["haut95"]), "modele": p["modele"]})
            for e in evaluation:
                lignes_eval.append({"iso3": iso, "produit_id": pid, "modele": e["modele"], "mape_pct": pct(e["mape"]),
                                    "mae": arrondi(e["mae"]), "rmse": arrondi(e["rmse"]), "nb_tests": e["nb_tests"],
                                    "retenu": "oui" if e["retenu"] else "non"})
            for t in tests:
                lignes_tests.append({"iso3": iso, "produit_id": pid, "horizon": t["horizon"],
                                     "origine": texte_mois(t["origine"]), "mois": texte_mois(t["mois"]),
                                     "reel": arrondi(t["reel"]), "prevu": arrondi(t["prevu"])})
        synthese.append(ligne)

    print("5. Régions et marchés")
    reg = indicateurs.series_agregees(prix_marches, lambda r: (r["iso3"], r["region"], r["produit_id"]),
                                      indice_mois(config.DEBUT_REGIONS))
    lignes_reg, lignes_reg_synth = [], []
    for (iso, region, pid), serie in sorted(reg.items()):
        if not serie:
            continue
        for m, (v, n) in serie.items():
            lignes_reg.append({"iso3": iso, "region": region, "produit_id": pid, "mois": texte_mois(m),
                               "prix": arrondi(v), "nb_marches": n})
        dernier = max(serie)
        if dernier >= dernier_mois_pays[iso] - 5:
            valeurs = {m: v for m, (v, _) in serie.items()}
            lignes_reg_synth.append({"iso3": iso, "region": region, "produit_id": pid, "mois": texte_mois(dernier),
                                     "prix": arrondi(valeurs[dernier]), "nb_marches": serie[dernier][1],
                                     "var_12m_pct": pct(indicateurs.variation(valeurs, dernier, 12))})
    lignes_marches = indicateurs.situation_marches(prix_marches, dernier_mois_pays)
    for l in lignes_marches:
        l.update({"mois": texte_mois(l["mois"]), "prix": arrondi(l["prix"]), "var_1m_pct": pct(l["var_1m"]),
                  "var_12m_pct": pct(l["var_12m"]), "alerte": arrondi(l["alerte"], 2),
                  "lat": arrondi(l["lat"], 3), "lon": arrondi(l["lon"], 3)})

    print("6. Exports")
    ecrire_csv("series_nationales.csv", lignes_nat,
               ["produit_id", "produit", "variete", "unite", "mois", "prix", "nb_marches", "alerte", "niveau"])
    ecrire_csv("indice_alimentaire.csv", lignes_indice, ["mois", "indice", "inflation_12m_pct", "nb_produits"])
    ecrire_csv("synthese_produits.csv", synthese,
               ["produit_id", "produit", "variete", "unite", "mois", "prix", "nb_marches", "var_1m_pct",
                "var_3m_pct", "var_12m_pct", "alerte", "niveau", "modele", "mape_pct", "prevision_3m",
                "var_prevue_3m_pct"])
    ecrire_csv("previsions.csv", lignes_prev,
               ["produit_id", "mois", "prevision", "bas80", "haut80", "bas95", "haut95", "modele"])
    ecrire_csv("evaluation_modeles.csv", lignes_eval,
               ["produit_id", "modele", "mape_pct", "mae", "rmse", "nb_tests", "retenu"])
    ecrire_csv("tests_previsions.csv", lignes_tests, ["produit_id", "horizon", "origine", "mois", "reel", "prevu"])
    ecrire_csv("series_regionales.csv", lignes_reg, ["region", "produit_id", "mois", "prix", "nb_marches"])
    ecrire_csv("synthese_regions.csv", lignes_reg_synth,
               ["region", "produit_id", "mois", "prix", "nb_marches", "var_12m_pct"])
    ecrire_csv("marches.csv", lignes_marches,
               ["region", "marche", "lat", "lon", "produit_id", "variete", "mois", "prix", "var_1m_pct",
                "var_12m_pct", "alerte", "niveau"])
    with open(os.path.join(SORTIE, "carte_regions.json"), "w", encoding="utf-8") as f:
        json.dump(regions.lignes_carte(tolerance=0.01), f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(SORTIE, "carte_pays.json"), "w", encoding="utf-8") as f:
        json.dump(geographie.lignes_pays(os.path.join(RAW, "ne_admin0.geojson")), f, ensure_ascii=False,
                  separators=(",", ":"))

    ecrire_rapport(rapports, varietes, synthese, journal, prix_marches, time.time() - t0)
    print(f"Terminé en {time.time() - t0:.0f} s")


def ecrire_rapport(rapports, varietes, synthese, journal, prix_marches, duree):
    """Rapport qualité lisible par l'équipe (preuve pour la Definition of Done)."""
    l = [f"# Rapport qualité du pipeline — {dt.date.today().isoformat()}", "",
         f"Durée d'exécution : {duree:.0f} s", "",
         "## Relevés", "",
         "| Pays | Lus | Retenus (marché-mois) | Marchés | Aberrants écartés | Gros/producteur écartés | Régions par position |",
         "|---|---:|---:|---:|---:|---:|---:|"]
    for iso, r in rapports.items():
        l.append(f"| {config.PAYS[iso][0]} | {r['lus']} | {r['prix_mensuels_retenus']} | {r['marches']} | "
                 f"{r['ecartes_aberrants']} | {r['ecartes_gros_ou_producteur']} | {r['region_par_position']} |")
    l += ["", "## Variétés retenues", "", "| Produit | Variété PAM |", "|---|---|"]
    for iso, var in varietes.items():
        for pid, (cand, unite) in var.items():
            l.append(f"| {config.PRODUITS[pid]['libelle']} | {cand} ({unite}) |")
    sans = [s for s in synthese if not s.get("modele")]
    l += ["", "## Séries sans prévision", "",
          "Séries trop courtes ou qui ne sont plus mises à jour :", ""]
    l += [f"- {s['produit']} (dernier mois : {s['mois']})" for s in sans] or ["- aucune"]
    modeles = Counter(s["modele"] for s in synthese if s.get("modele"))
    l += ["", "## Modèles retenus", ""] + [f"- {m} : {n} séries" for m, n in modeles.most_common()]
    l += ["", "## Sources", ""]
    for cle, s in journal.items():
        l.append(f"- {s['source']} — téléchargé le {s['telecharge_le']} — {s['url']}")
    with open(os.path.join(SORTIE, "rapport_qualite.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(l) + "\n")


if __name__ == "__main__":
    main()
