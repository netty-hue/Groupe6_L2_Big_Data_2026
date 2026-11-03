"""Tests unitaires du pipeline (lancés à chaque sprint, condition de la Definition of Done).

    python -I tests/test_pipeline.py
"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pipeline"))

import config        # noqa: E402
import geographie    # noqa: E402
import indicateurs   # noqa: E402
import previsions    # noqa: E402
from nettoyage import indice_mois, texte_mois  # noqa: E402

JAN_2019 = indice_mois("2019-01")


def serie_saisonniere(n, debut=JAN_2019, niveau=300.0, croissance=0.003, amplitude=0.08):
    """Prix fictif : tendance + soudure (pic de prix en août), sans bruit."""
    return {debut + t: niveau * math.exp(croissance * t + amplitude * math.cos(2 * math.pi * ((debut + t) % 12 - 7) / 12))
            for t in range(n)}


class TestDates(unittest.TestCase):
    def test_aller_retour(self):
        self.assertEqual(texte_mois(indice_mois("2024-03")), "2024-03")
        self.assertEqual(indice_mois("2025-01") - indice_mois("2024-12"), 1)


class TestChainage(unittest.TestCase):
    def test_variation_commune_et_calage_sur_la_mediane(self):
        marches = {"A": {1: 100, 2: 110}, "B": {1: 200, 2: 220}}
        serie = indicateurs.chainer(marches)
        self.assertAlmostEqual(serie[2][0], 165.0)          # médiane des prix du dernier mois
        self.assertAlmostEqual(serie[1][0], 150.0)          # +10 % sur les deux marchés
        self.assertEqual(serie[2][1], 2)

    def test_entree_d_un_marche_cher_ne_cree_pas_de_saut(self):
        marches = {"A": {1: 100, 2: 100, 3: 100}, "B": {3: 500}}
        serie = indicateurs.chainer(marches)
        self.assertAlmostEqual(serie[2][0], serie[3][0])

    def test_panel_tournant_raccorde_par_les_medianes(self):
        marches = {"A": {1: 100}, "B": {2: 120}}
        serie = indicateurs.chainer(marches)
        self.assertEqual(sorted(serie), [1, 2])
        self.assertAlmostEqual(serie[2][0] / serie[1][0], 1.2)

    def test_trou_trop_long_coupe_la_serie(self):
        marches = {"A": {1: 100, 1 + config.TROU_MAX_MOIS + 2: 130}}
        serie = indicateurs.chainer(marches)
        self.assertEqual(list(serie), [1 + config.TROU_MAX_MOIS + 2])

    def test_petit_trou_interpole(self):
        marches = {"A": {1: 100, 3: 121}}
        serie = indicateurs.chainer(marches)
        self.assertAlmostEqual(serie[2][0], 110.0)
        self.assertEqual(serie[2][1], 0)


class TestIndiceAlimentaire(unittest.TestCase):
    def test_base_100_en_2019(self):
        nat = {"mil": {m: (v, 5) for m, v in serie_saisonniere(48).items()},
               "niebe": {m: (v * 3, 5) for m, v in serie_saisonniere(48).items()}}
        indice = indicateurs.indice_alimentaire(nat, ["mil", "niebe"])
        moyenne_2019 = sum(v for m, (v, _) in indice.items() if texte_mois(m).startswith("2019")) / 12
        self.assertAlmostEqual(moyenne_2019, 100.0, delta=0.5)


class TestAlerte(unittest.TestCase):
    def test_flambee_detectee(self):
        serie = serie_saisonniere(60)
        dernier = max(serie)
        bruit = {m: v * (1 + 0.02 * math.sin(7 * m)) for m, v in serie.items()}
        bruit[dernier] *= 1.4
        valeur = indicateurs.serie_alertes(bruit)[dernier]
        self.assertEqual(indicateurs.niveau_alerte(valeur), "Crise")

    def test_saisonnalite_normale_non_signalee(self):
        serie = {m: v * (1 + 0.02 * math.sin(7 * m)) for m, v in serie_saisonniere(60).items()}
        valeur = indicateurs.serie_alertes(serie)[max(serie)]
        self.assertLess(valeur, 1.0)

    def test_seuils(self):
        self.assertEqual(indicateurs.niveau_alerte(0.1), "Normal")
        self.assertEqual(indicateurs.niveau_alerte(0.5), "Tension")
        self.assertEqual(indicateurs.niveau_alerte(1.5), "Alerte")
        self.assertEqual(indicateurs.niveau_alerte(2.5), "Crise")
        self.assertEqual(indicateurs.niveau_alerte(None), "")


class TestPrevisions(unittest.TestCase):
    def test_naif_saisonnier_repete_l_an_dernier(self):
        y = [math.log(v) for v in serie_saisonniere(36).values()]
        prev = previsions.prevoir("Naïf saisonnier", y, JAN_2019, 6)
        self.assertEqual(prev, y[24:30])

    def test_holt_winters_suit_une_serie_reguliere(self):
        serie = serie_saisonniere(84)
        evaluation, prevs, _ = previsions.evaluer_et_prevoir(serie)
        hw = next(e for e in evaluation if e["modele"] == "Holt-Winters amorti")
        self.assertLess(hw["mape"], 0.03)
        attendu = serie_saisonniere(90)
        for p in prevs:
            self.assertLess(abs(p["prevision"] / attendu[p["mois"]] - 1), 0.05)

    def test_intervalles_ordonnes_et_croissants(self):
        serie = {m: v * (1 + 0.03 * math.sin(5 * m)) for m, v in serie_saisonniere(84).items()}
        _, prevs, _ = previsions.evaluer_et_prevoir(serie)
        for p in prevs:
            self.assertLessEqual(p["bas95"], p["bas80"])
            self.assertLessEqual(p["bas80"], p["prevision"])
            self.assertLessEqual(p["prevision"], p["haut80"])
            self.assertLessEqual(p["haut80"], p["haut95"])
        largeurs = [p["haut95"] / p["bas95"] for p in prevs]
        self.assertEqual(largeurs, sorted(largeurs))

    def test_serie_trop_courte_refusee(self):
        self.assertIsNone(previsions.evaluer_et_prevoir(serie_saisonniere(config.MIN_POINTS_MODELE - 1)))


class TestGeographie(unittest.TestCase):
    CARRE = {"type": "Polygon", "coordinates": [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]}

    def test_point_dans_polygone(self):
        self.assertTrue(geographie.point_dans(1, 1, self.CARRE))
        self.assertFalse(geographie.point_dans(3, 1, self.CARRE))

    def test_simplification_garde_les_coins(self):
        anneau = [[x / 10, 0] for x in range(21)] + [[2, 2], [0, 2], [0, 0]]
        simple = geographie.simplifier({"type": "Polygon", "coordinates": [anneau]}, 0.01)
        self.assertLessEqual(len(simple["coordinates"][0]), 6)

    def test_normalisation_des_noms(self):
        # noms du PAM sans accents ni tirets face aux noms de la carte
        self.assertEqual(geographie.normaliser("Thiès"), geographie.normaliser("Thies"))
        self.assertEqual(geographie.normaliser("Saint-Louis"), geographie.normaliser("Saint Louis"))
        self.assertEqual(geographie.normaliser("Kédougou"), geographie.normaliser("KEDOUGOU"))

    def test_poids_de_l_indice(self):
        self.assertAlmostEqual(sum(config.POIDS_GROUPES.values()), 1.0)
        for produit in config.PRODUITS.values():
            self.assertIn(produit["groupe"], config.POIDS_GROUPES)


if __name__ == "__main__":
    unittest.main(verbosity=2)
