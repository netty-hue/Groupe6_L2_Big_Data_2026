"""Étape 4 — Prévisions des prix à 6 mois.

Les modèles travaillent sur le logarithme du prix (les variations de prix sont
proportionnelles). Chaque série nationale est prévue par six méthodes ; on retient
celle qui s'est le mieux comportée sur les 18 derniers mois (évaluation « à origine
glissante » : on se replace à chaque mois passé, on prévoit les 6 mois suivants et on
compare à ce qui s'est réellement passé). Les intervalles de confiance viennent des
erreurs observées pendant cette évaluation.
"""
import math
from collections import defaultdict

import config

Z80, Z95 = 1.2816, 1.96
GRILLE_ALPHA = [0.1, 0.2, 0.3, 0.5, 0.7, 0.9]
GRILLE_BETA = [0.01, 0.05, 0.1, 0.2]
GRILLE_GAMMA = [0.05, 0.1, 0.2, 0.3]
GRILLE_PHI = [0.8, 0.9, 0.98]


# --- lissage exponentiel -----------------------------------------------------

def _filtre(y, alpha, beta, gamma, phi, saisonnier, m=12):
    """Fait passer le filtre de lissage sur y. Retourne (somme des carrés des
    erreurs à 1 pas, état final)."""
    if saisonnier:
        niveau = sum(y[:m]) / m
        tendance = (sum(y[m:2 * m]) - sum(y[:m])) / (m * m)
        saisons = [y[i] - niveau for i in range(m)]
        debut = m
    else:
        niveau, tendance, saisons, debut = y[0], 0.0, None, 1
    sse = 0.0
    for t in range(debut, len(y)):
        s = saisons[t % m] if saisonnier else 0.0
        prevu = niveau + phi * tendance + s
        e = y[t] - prevu
        sse += e * e
        nouveau = alpha * (y[t] - s) + (1 - alpha) * (niveau + phi * tendance)
        tendance = beta * (nouveau - niveau) + (1 - beta) * phi * tendance
        niveau = nouveau
        if saisonnier:
            saisons[t % m] = gamma * (y[t] - niveau) + (1 - gamma) * s
    return sse, (niveau, tendance, saisons, len(y) - 1)


def _prevoir_lissage(etat, phi, h, m=12):
    niveau, tendance, saisons, dernier = etat
    sortie, cumul = [], 0.0
    for k in range(1, h + 1):
        cumul += phi ** k
        s = saisons[(dernier + k) % m] if saisons else 0.0
        sortie.append(niveau + cumul * tendance + s)
    return sortie


def ajuster_lissage(y, saisonnier):
    """Recherche sur grille des paramètres minimisant l'erreur à 1 pas."""
    meilleur = None
    gammas = GRILLE_GAMMA if saisonnier else [0.0]
    for a in GRILLE_ALPHA:
        for b in GRILLE_BETA:
            for g in gammas:
                for phi in GRILLE_PHI:
                    sse = _filtre(y, a, b, g, phi, saisonnier)[0]
                    if meilleur is None or sse < meilleur[0]:
                        meilleur = (sse, (a, b, g, phi))
    return meilleur[1]


# --- méthodes simples ----------------------------------------------------------

def indices_saisonniers(y, mois_debut):
    """Effet moyen de chaque mois calendaire (décomposition classique additive)."""
    n = len(y)
    ecarts = defaultdict(list)
    for t in range(6, n - 6):
        moyenne_mobile = (0.5 * y[t - 6] + sum(y[t - 5:t + 6]) + 0.5 * y[t + 6]) / 12
        ecarts[(mois_debut + t) % 12].append(y[t] - moyenne_mobile)
    s = {c: (sum(v) / len(v) if v else 0.0) for c, v in ((c, ecarts.get(c, [])) for c in range(12))}
    moyenne = sum(s.values()) / 12
    return {c: v - moyenne for c, v in s.items()}


def prevoir(nom, y, mois_debut, h, params=None):
    """Prévision (en log) des h prochains mois par la méthode `nom`."""
    n = len(y)
    if nom == "Naïf (dernier prix)":
        return [y[-1]] * h
    if nom == "Naïf saisonnier":
        return [y[n - 12 + (k - 1) % 12] for k in range(1, h + 1)]
    if nom == "Naïf désaisonnalisé":
        s = indices_saisonniers(y, mois_debut)
        dernier = (mois_debut + n - 1) % 12
        return [y[-1] - s[dernier] + s[(dernier + k) % 12] for k in range(1, h + 1)]
    if nom in ("Holt amorti", "Holt-Winters amorti"):
        saisonnier = nom == "Holt-Winters amorti"
        a, b, g, phi = params or ajuster_lissage(y, saisonnier)
        etat = _filtre(y, a, b, g, phi, saisonnier)[1]
        return _prevoir_lissage(etat, phi, h)
    if nom == "Combinaison":
        membres = [prevoir(x, y, mois_debut, h, (params or {}).get(x))
                   for x in ("Naïf désaisonnalisé", "Holt amorti", "Holt-Winters amorti")]
        return [sum(v) / len(v) for v in zip(*membres)]
    raise ValueError(nom)


MODELES = ["Naïf (dernier prix)", "Naïf saisonnier", "Naïf désaisonnalisé",
           "Holt amorti", "Holt-Winters amorti", "Combinaison"]


def evaluer_et_prevoir(serie):
    """serie : {mois: prix} continue. Retourne (évaluation par modèle, prévisions,
    tests du modèle retenu)."""
    mois = sorted(serie)
    y = [math.log(serie[m]) for m in mois]
    n, debut, h = len(y), mois[0], config.HORIZON
    test = config.FENETRE_TEST
    if n < config.MIN_POINTS_MODELE:
        return None

    # paramètres estimés une fois sur la partie antérieure à la période de test
    apprentissage = y[:n - test]
    params = {"Holt amorti": ajuster_lissage(apprentissage, False),
              "Holt-Winters amorti": ajuster_lissage(apprentissage, True)}
    params["Combinaison"] = dict(params)

    erreurs = {nom: [] for nom in MODELES}     # (horizon, erreur log, prix réel, prix prévu, origine)
    for origine in range(n - test - 1, n - 1):
        historique = y[:origine + 1]
        for nom in MODELES:
            prev = prevoir(nom, historique, debut, h, params.get(nom))
            for k in range(1, h + 1):
                if origine + k < n:
                    reel = y[origine + k]
                    erreurs[nom].append((k, prev[k - 1] - reel, math.exp(reel), math.exp(prev[k - 1]), origine))

    evaluation = []
    for nom in MODELES:
        e = erreurs[nom]
        mape = sum(abs(p - r) / r for _, _, r, p, _ in e) / len(e)
        mae = sum(abs(p - r) for _, _, r, p, _ in e) / len(e)
        rmse = math.sqrt(sum((p - r) ** 2 for _, _, r, p, _ in e) / len(e))
        evaluation.append({"modele": nom, "mape": mape, "mae": mae, "rmse": rmse, "nb_tests": len(e)})
    retenu = min(evaluation, key=lambda x: x["mape"])["modele"]
    for ev in evaluation:
        ev["retenu"] = ev["modele"] == retenu

    # écart type des erreurs (log) par horizon, non décroissant
    sigmas = []
    for k in range(1, h + 1):
        ek = [err for hh, err, _, _, _ in erreurs[retenu] if hh == k]
        sigma = math.sqrt(sum(x * x for x in ek) / len(ek)) if len(ek) >= 5 else sigmas[0] * math.sqrt(k)
        sigmas.append(max(sigma, sigmas[-1] if sigmas else 0.0))

    params_final = {"Holt amorti": ajuster_lissage(y, False), "Holt-Winters amorti": ajuster_lissage(y, True)}
    params_final["Combinaison"] = dict(params_final)
    centrale = prevoir(retenu, y, debut, h, params_final.get(retenu))
    previsions = []
    for k in range(1, h + 1):
        c, s = centrale[k - 1], sigmas[k - 1]
        previsions.append({"mois": mois[-1] + k, "prevision": math.exp(c),
                           "bas80": math.exp(c - Z80 * s), "haut80": math.exp(c + Z80 * s),
                           "bas95": math.exp(c - Z95 * s), "haut95": math.exp(c + Z95 * s),
                           "modele": retenu})

    tests = [{"origine": mois[o], "mois": mois[o] + k, "horizon": k, "reel": r, "prevu": p}
             for k, _, r, p, o in erreurs[retenu] if k in (1, 3)]
    return evaluation, previsions, tests
