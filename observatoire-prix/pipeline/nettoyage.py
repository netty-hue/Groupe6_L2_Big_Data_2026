"""Étape 2 — Nettoyage : des fichiers bruts du PAM aux prix mensuels par marché.

Règles appliquées (et comptées dans le rapport qualité) :
1. prix de détail uniquement, relevés réels ou agrégés (pas d'estimations) ;
2. une variété par produit et par pays (la mieux couverte parmi les candidates) ;
3. unité homogène (kg ou litre) ;
4. relevés aberrants écartés (plus de 3x au-dessus ou en dessous de la médiane du
   marché sur +/- 12 mois) ;
5. plusieurs relevés le même mois sur un marché : on garde la médiane ;
6. chaque marché est rattaché à une région affichée (par son nom, sinon par sa position).
"""
import bisect
import csv
import os
import statistics
from collections import Counter, defaultdict

import config


def indice_mois(texte):
    """'2024-03' -> nombre de mois depuis l'an 0 (pour faire des calculs de dates)."""
    return int(texte[:4]) * 12 + int(texte[5:7]) - 1


def texte_mois(indice):
    return f"{indice // 12:04d}-{indice % 12 + 1:02d}"


def _choisir_varietes(lignes_retail):
    """Pour chaque produit, première variété candidate suffisamment couverte."""
    couverture = defaultdict(set)   # (commodity, unit) -> {(marché, mois)}
    for r in lignes_retail:
        if r["date"] >= "2019-01":
            couverture[(r["commodity"], r["unit"])].add((r["market_id"], r["date"][:7]))
    dernier_pays = max((r["date"][:7] for r in lignes_retail), default="0000-01")
    choix = {}
    for pid, prod in config.PRODUITS.items():
        unite_wfp = "KG" if prod["unite"] == "kg" else "L"
        for cand in prod["candidats"]:
            obs = couverture.get((cand, unite_wfp), set())
            mois = {m for _, m in obs}
            vivante = bool(mois) and indice_mois(dernier_pays) - indice_mois(max(mois)) <= config.FRAICHEUR_MAX_MOIS
            if (len(obs) >= config.MIN_RELEVES_DEPUIS_2019 and len(mois) >= config.MIN_MOIS_DEPUIS_2019
                    and vivante):
                choix[pid] = (cand, unite_wfp)
                break
    return choix


def nettoyer_pays(iso, chemin_csv, regions):
    rapport = Counter()
    lignes = []
    with open(chemin_csv, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r["date"].startswith("#"):
                continue
            rapport["lus"] += 1
            if r["pricetype"] != "Retail":
                rapport["ecartes_gros_ou_producteur"] += 1
                continue
            if r["priceflag"] not in config.FLAGS_ACCEPTES:
                rapport["ecartes_estimation"] += 1
                continue
            if "average" in r["market"].lower():
                rapport["ecartes_moyenne_nationale"] += 1
                continue
            lignes.append(r)

    varietes = _choisir_varietes(lignes)
    par_variete = {v: pid for pid, v in varietes.items()}

    # relevés retenus, regroupés par (marché, produit)
    series = defaultdict(lambda: defaultdict(list))
    infos_marche = {}
    for r in lignes:
        pid = par_variete.get((r["commodity"], r["unit"]))
        if pid is None:
            continue
        try:
            prix = float(r["price"])
        except ValueError:
            rapport["ecartes_prix_illisible"] += 1
            continue
        if prix <= 0:
            rapport["ecartes_prix_nul"] += 1
            continue
        mid = r["market_id"]
        series[(mid, pid)][indice_mois(r["date"])].append(prix)
        if mid not in infos_marche:
            lat = float(r["latitude"]) if r["latitude"] else None
            lon = float(r["longitude"]) if r["longitude"] else None
            region, methode = regions.region_du_marche(iso, r["admin1"], lat, lon, r["market"])
            rapport[f"region_par_{methode}"] += 1
            infos_marche[mid] = {"marche": r["market"], "admin1": r["admin1"], "region": region,
                                 "lat": lat, "lon": lon}

    sortie = []
    for (mid, pid), par_mois in series.items():
        mensuel = {m: statistics.median(v) for m, v in par_mois.items()}
        if any(len(v) > 1 for v in par_mois.values()):
            rapport["mois_avec_plusieurs_releves"] += sum(1 for v in par_mois.values() if len(v) > 1)
        mois_tries = sorted(mensuel)
        for m in mois_tries:
            debut, fin = bisect.bisect_left(mois_tries, m - 12), bisect.bisect_right(mois_tries, m + 12)
            voisins = [mensuel[k] for k in mois_tries[debut:fin]]
            ref = statistics.median(voisins)
            p = mensuel[m]
            if len(voisins) >= 5 and (p > ref * config.RATIO_ABERRANT or p < ref / config.RATIO_ABERRANT):
                rapport["ecartes_aberrants"] += 1
                continue
            info = infos_marche[mid]
            sortie.append({"iso3": iso, "region": info["region"], "marche_id": mid, "marche": info["marche"],
                           "lat": info["lat"], "lon": info["lon"], "produit_id": pid,
                           "variete": config.VARIETES_FR.get(varietes[pid][0], varietes[pid][0]),
                           "mois": m, "prix": p})
    rapport["prix_mensuels_retenus"] = len(sortie)
    rapport["marches"] = len({r["marche_id"] for r in sortie})
    return sortie, varietes, rapport


def nettoyer(dossier_raw, regions):
    tous, varietes, rapports = [], {}, {}
    for iso in config.PAYS:
        chemin = os.path.join(dossier_raw, f"wfp_{iso}.csv")
        lignes, var, rapport = nettoyer_pays(iso, chemin, regions)
        tous.extend(lignes)
        varietes[iso] = var
        rapports[iso] = rapport
    return tous, varietes, rapports
