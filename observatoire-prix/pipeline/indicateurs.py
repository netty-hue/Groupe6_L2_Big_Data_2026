"""Étape 3 — Indicateurs : séries nationales et régionales, indice des prix
alimentaires, inflation sur 12 mois, indicateur d'alerte et situation par marché.

Méthode des séries agrégées : on enchaîne les variations de prix d'un mois sur
l'autre calculées sur les mêmes marchés (moyenne géométrique). Cela évite les sauts
artificiels quand le nombre de marchés suivis change. Le niveau est ensuite calé sur
la médiane des prix observés le dernier mois.
"""
import math
import statistics
from collections import defaultdict

import config

BORNE_VARIATION = 2.5   # variation mensuelle d'un marché ignorée au-delà de x2,5 ou en deçà de /2,5


def chainer(prix_par_marche):
    """prix_par_marche : {marché: {mois: prix}}. Retourne {mois: (valeur, nb_marchés)}
    sur la dernière période continue (sans trou de plus de TROU_MAX_MOIS mois)."""
    mois = sorted({m for s in prix_par_marche.values() for m in s})
    if not mois:
        return {}
    indice = {}
    segment_debut = mois[0]
    for t in mois:
        if not indice:
            indice[t] = 0.0
            continue
        precedents = [p for p in range(t - 1, t - 1 - config.TROU_MAX_MOIS, -1) if p in indice]
        if not precedents:        # plus de TROU_MAX_MOIS mois sans relevé : nouvelle série
            indice = {t: 0.0}
            segment_debut = t
            continue
        lien = None
        for p in precedents:      # le mois précédent le plus proche qui partage des marchés
            rel = [math.log(s[t] / s[p]) for s in prix_par_marche.values()
                   if t in s and p in s and 1 / BORNE_VARIATION <= s[t] / s[p] <= BORNE_VARIATION]
            if rel:
                lien = indice[p] + sum(rel) / len(rel)
                break
        if lien is None:          # aucun marché commun (panel tournant) : raccord par les médianes
            p = precedents[0]
            med_t = statistics.median(s[t] for s in prix_par_marche.values() if t in s)
            med_p = statistics.median(s[p] for s in prix_par_marche.values() if p in s)
            lien = indice[p] + math.log(med_t / med_p)
        indice[t] = lien
    dernier = max(indice)
    niveau = statistics.median(s[dernier] for s in prix_par_marche.values() if dernier in s)
    decalage = math.log(niveau) - indice[dernier]
    resultat = {}
    for t in range(segment_debut, dernier + 1):
        n = sum(1 for s in prix_par_marche.values() if t in s)
        if t in indice:
            resultat[t] = (math.exp(indice[t] + decalage), n)
    # petits trous internes : interpolation géométrique (n = 0 pour les signaler)
    connus = sorted(resultat)
    for a, b in zip(connus, connus[1:]):
        for t in range(a + 1, b):
            w = (t - a) / (b - a)
            resultat[t] = (math.exp((1 - w) * math.log(resultat[a][0]) + w * math.log(resultat[b][0])), 0)
    return dict(sorted(resultat.items()))


def alerte(valeurs_log, mois_debut):
    """Indicateur d'alerte pour le dernier point de `valeurs_log` (liste continue).

    Prix attendu = tendance linéaire + effet saisonnier moyen du mois calendaire,
    estimés sur la fenêtre. Indicateur = (log prix observé - log prix attendu) / écart
    type des résidus. Retourne None si la fenêtre est trop courte."""
    n = len(valeurs_log)
    if n < 36:
        return None
    xs = list(range(n))
    mx, my = (n - 1) / 2, sum(valeurs_log) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    pente = sum((x - mx) * (y - my) for x, y in zip(xs, valeurs_log)) / sxx
    tendance = [my + pente * (x - mx) for x in xs]
    ecarts = [y - t for y, t in zip(valeurs_log, tendance)]
    par_mois = defaultdict(list)
    for x, e in zip(xs, ecarts):
        par_mois[(mois_debut + x) % 12].append(e)
    saison = {c: sum(v) / len(v) for c, v in par_mois.items()}
    residus = [e - saison[(mois_debut + x) % 12] for x, e in zip(xs, ecarts)]
    ddl = max(n - 13, 1)
    sigma = math.sqrt(sum(r * r for r in residus) / ddl)
    if sigma == 0:
        return 0.0
    return residus[-1] / sigma


def niveau_alerte(valeur):
    if valeur is None:
        return ""
    for seuil, libelle in config.SEUILS_ALERTE:
        if valeur >= seuil:
            return libelle
    return "Normal"


def serie_alertes(serie):
    """{mois: valeur} continue -> {mois: indicateur d'alerte} (fenêtre glissante)."""
    mois = sorted(serie)
    logs = [math.log(serie[m]) for m in mois]
    sortie = {}
    for i, m in enumerate(mois):
        debut = max(0, i + 1 - config.FENETRE_ALERTE)
        sortie[m] = alerte(logs[debut:i + 1], mois[debut])
    return sortie


def variation(serie, m, ecart):
    if m in serie and (m - ecart) in serie and serie[m - ecart]:
        return serie[m] / serie[m - ecart] - 1
    return None


def series_agregees(prix_marches, cle, debut):
    """Regroupe les prix mensuels par `cle(ligne)` et enchaîne chaque groupe."""
    groupes = defaultdict(lambda: defaultdict(dict))
    for r in prix_marches:
        if r["mois"] >= debut:
            groupes[cle(r)][r["marche_id"]][r["mois"]] = r["prix"]
    return {k: chainer(v) for k, v in groupes.items()}


def indice_alimentaire(series_nat, produits_du_pays):
    """Indice de Jevons pondéré et chaîné (base 100 = moyenne de l'année de base)."""
    groupes = defaultdict(list)
    for pid in produits_du_pays:
        groupes[config.PRODUITS[pid]["groupe"]].append(pid)
    tous_mois = sorted({m for pid in produits_du_pays for m in series_nat[pid]})
    niveau = {}
    for t in tous_mois:
        if not niveau:
            niveau[t] = (0.0, 0)
            continue
        p = t - 1
        if p not in niveau:
            niveau[t] = (0.0, 0)   # ne se produit pas : séries nationales continues
            continue
        num, poids_total, nb = 0.0, 0.0, 0
        for groupe, pids in groupes.items():
            presents = [pid for pid in pids if t in series_nat[pid] and p in series_nat[pid]]
            if not presents:
                continue
            w = config.POIDS_GROUPES[groupe] / len(presents)
            for pid in presents:
                num += w * math.log(series_nat[pid][t][0] / series_nat[pid][p][0])
                poids_total += w
                nb += 1
        niveau[t] = (niveau[p][0] + (num / poids_total if poids_total else 0.0), nb)
    base = [v for m, (v, _) in niveau.items() if str(m // 12) == config.ANNEE_BASE]
    if not base:
        return {}
    ref = sum(base) / len(base)
    return {m: (100 * math.exp(v - ref), nb) for m, (v, nb) in niveau.items()}


def situation_marches(prix_marches, dernier_mois_pays):
    """Dernier prix connu de chaque marché et produit, ses variations et son alerte."""
    groupes = defaultdict(dict)
    infos = {}
    for r in prix_marches:
        k = (r["iso3"], r["marche_id"], r["produit_id"])
        groupes[k][r["mois"]] = r["prix"]
        infos[k] = r
    lignes = []
    for k, serie in groupes.items():
        iso = k[0]
        dernier = max(serie)
        if dernier < dernier_mois_pays[iso] - 5:      # marché qui ne publie plus
            continue
        r = infos[k]
        fenetre = [m for m in sorted(serie) if m > dernier - config.FENETRE_ALERTE]
        continu = len(fenetre) >= 36
        val_alerte = None
        if continu:
            # trous comblés par interpolation géométrique pour l'estimation
            plein = {}
            for a, b in zip(fenetre, fenetre[1:]):
                for t in range(a, b):
                    w = (t - a) / (b - a)
                    plein[t] = math.exp((1 - w) * math.log(serie[a]) + w * math.log(serie[b]))
            plein[dernier] = serie[dernier]
            val_alerte = alerte([math.log(plein[m]) for m in sorted(plein)], min(plein))
        a_un_an = serie.get(dernier - 12) or serie.get(dernier - 13) or serie.get(dernier - 11)
        lignes.append({"iso3": iso, "region": r["region"], "marche": r["marche"], "lat": r["lat"], "lon": r["lon"],
                       "produit_id": k[2], "variete": r["variete"], "mois": dernier, "prix": serie[dernier],
                       "var_1m": variation(serie, dernier, 1),
                       "var_12m": (serie[dernier] / a_un_an - 1) if a_un_an else None,
                       "alerte": val_alerte, "niveau": niveau_alerte(val_alerte)})
    return lignes
