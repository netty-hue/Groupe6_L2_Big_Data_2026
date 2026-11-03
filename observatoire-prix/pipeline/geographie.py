"""Outils géographiques : noms de régions harmonisés, appartenance d'un marché à une
région, simplification des contours pour la carte du tableau de bord."""
import json
import re
import unicodedata

import config


def normaliser(texte):
    """Clé de comparaison : sans accents, minuscules, lettres seulement."""
    texte = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", texte.lower())


class Regions:
    """Polygones régionaux Natural Earth des pays suivis, avec leur nom affiché."""

    def __init__(self, chemin_admin1):
        with open(chemin_admin1, encoding="utf-8") as f:
            features = json.load(f)["features"]
        self.polygones = []
        for feat in features:
            p = feat["properties"]
            iso = p.get("adm0_a3")
            if iso not in config.PAYS or not feat.get("geometry"):
                continue
            nom = p.get("name") or ""
            affiche = config.POLYGONE_VERS_REGION.get((iso, nom), nom)
            self.polygones.append({"iso": iso, "nom": nom, "region": affiche,
                                   "geometry": feat["geometry"], "bbox": _bbox(feat["geometry"])})
        self.par_cle = {}
        for poly in self.polygones:
            self.par_cle.setdefault((poly["iso"], normaliser(poly["region"])), poly["region"])
            self.par_cle.setdefault((poly["iso"], normaliser(poly["nom"])), poly["region"])

    def region_du_marche(self, iso, admin1, lat, lon, marche=""):
        """Nom de région affiché pour un marché : par le nom, sinon par sa position."""
        if not admin1 and (iso, marche) in config.REGION_DU_MARCHE:
            return config.REGION_DU_MARCHE[(iso, marche)], "alias"
        if (iso, admin1) in config.REGION_HARMONISEE:
            return config.REGION_HARMONISEE[(iso, admin1)], "alias"
        trouve = self.par_cle.get((iso, normaliser(admin1)))
        if trouve:
            return trouve, "nom"
        if lat is not None and lon is not None:
            for poly in self.polygones:
                if poly["iso"] == iso and _dans_bbox(lon, lat, poly["bbox"]) and point_dans(lon, lat, poly["geometry"]):
                    return poly["region"], "position"
        if admin1:
            return (admin1.title() if admin1.isupper() else admin1), "pam"
        return "Non renseignée", "aucune"

    def lignes_carte(self, tolerance=0.02):
        """Polygones simplifiés, une ligne par polygone (géométrie en GeoJSON)."""
        lignes = []
        for poly in self.polygones:
            geom = simplifier(poly["geometry"], tolerance)
            if geom:
                lignes.append({"region": poly["region"], "geometrie": json.dumps(geom, separators=(",", ":"))})
        return lignes


def lignes_pays(chemin_admin0, tolerance=0.01):
    """Contour du pays suivi et de ses voisins (fond de carte)."""
    with open(chemin_admin0, encoding="utf-8") as f:
        features = json.load(f)["features"]
    lignes = []
    for feat in features:
        p = feat["properties"]
        iso = p.get("ADM0_A3") or p.get("adm0_a3")
        if iso in config.PAYS:
            nom, statut = config.PAYS[iso][0], "suivi"
        elif iso in config.VOISINS:
            nom, statut = p.get("NAME_FR") or p.get("NAME"), "voisin"
        else:
            continue
        geom = simplifier(feat["geometry"], tolerance)
        if geom:
            lignes.append({"iso3": iso, "pays": nom, "statut": statut,
                           "geometrie": json.dumps(geom, separators=(",", ":"))})
    return lignes


# --- géométrie -------------------------------------------------------------

def _anneaux(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def _bbox(geom):
    xs, ys = [], []
    for poly in _anneaux(geom):
        for x, y in poly[0]:
            xs.append(x)
            ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys))


def _dans_bbox(x, y, b):
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def _dans_anneau(x, y, anneau):
    dedans = False
    j = len(anneau) - 1
    for i in range(len(anneau)):
        xi, yi = anneau[i][0], anneau[i][1]
        xj, yj = anneau[j][0], anneau[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            dedans = not dedans
        j = i
    return dedans


def point_dans(x, y, geom):
    for poly in _anneaux(geom):
        if _dans_anneau(x, y, poly[0]) and not any(_dans_anneau(x, y, trou) for trou in poly[1:]):
            return True
    return False


def _douglas_peucker(points, tol):
    if len(points) < 3:
        return points
    garder = [False] * len(points)
    garder[0] = garder[-1] = True
    pile = [(0, len(points) - 1)]
    while pile:
        debut, fin = pile.pop()
        (x1, y1), (x2, y2) = points[debut][:2], points[fin][:2]
        dx, dy = x2 - x1, y2 - y1
        norme = (dx * dx + dy * dy) ** 0.5
        dmax, imax = 0.0, None
        for i in range(debut + 1, fin):
            px, py = points[i][0], points[i][1]
            if norme == 0:
                d = ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
            else:
                d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norme
            if d > dmax:
                dmax, imax = d, i
        if imax is not None and dmax > tol:
            garder[imax] = True
            pile.append((debut, imax))
            pile.append((imax, fin))
    return [p for p, g in zip(points, garder) if g]


def _aire(anneau):
    return abs(sum(anneau[i][0] * anneau[i - 1][1] - anneau[i - 1][0] * anneau[i][1]
                   for i in range(len(anneau)))) / 2


def simplifier(geom, tol):
    """Simplifie un (Multi)Polygon, arrondit à 3 décimales et supprime les îlots minuscules."""
    polygones = []
    for poly in _anneaux(geom):
        anneaux = []
        for k, anneau in enumerate(poly):
            simple = _douglas_peucker(anneau, tol)
            simple = [[round(x, 3), round(y, 3)] for x, y in (p[:2] for p in simple)]
            if len(simple) >= 4 and _aire(simple) > tol * tol:
                anneaux.append(simple)
            elif k == 0:
                break
        if anneaux:
            polygones.append(anneaux)
    if not polygones:
        return None
    if len(polygones) == 1:
        return {"type": "Polygon", "coordinates": polygones[0]}
    return {"type": "MultiPolygon", "coordinates": polygones}
