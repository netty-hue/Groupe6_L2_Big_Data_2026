"""Étape 1 — Collecte : télécharge les sources brutes dans data/raw/.

- prix de détail par marché du PAM (Programme alimentaire mondial) au Sénégal, via l'API de HDX ;
- limites administratives Natural Earth (domaine public) pour la carte.

Chaque téléchargement est tracé dans data/raw/sources.json (URL, date, taille).
"""
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.request

import config

AGENT = {"User-Agent": "observatoire-prix-alimentaires/1.0 (projet pedagogique)"}


def _lire(url, timeout, essais=4):
    """Lit une URL en réessayant (les serveurs coupent parfois la connexion)."""
    for essai in range(1, essais + 1):
        try:
            req = urllib.request.Request(url, headers=AGENT)
            with urllib.request.urlopen(req, timeout=timeout) as rep:
                return rep.read()
        except (urllib.error.URLError, ConnectionError, TimeoutError) as err:
            if essai == essais:
                raise
            print(f"  nouvel essai dans {5 * essai} s ({err})")
            time.sleep(5 * essai)


def telecharger(url, chemin, timeout=300):
    contenu = _lire(url, timeout)
    with open(chemin, "wb") as f:
        f.write(contenu)
    return len(contenu)


def lire_json(url):
    return json.loads(_lire(url, 120))


def collecter(dossier_raw, forcer=False):
    os.makedirs(dossier_raw, exist_ok=True)
    journal_path = os.path.join(dossier_raw, "sources.json")
    journal = {}
    if os.path.exists(journal_path):
        with open(journal_path, encoding="utf-8") as f:
            journal = json.load(f)
    maintenant = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    autres = {"ne_admin1": (config.URL_NE_ADMIN1, "ne_admin1.geojson", "Natural Earth — régions (1:10m)"),
              "ne_admin0": (config.URL_NE_ADMIN0, "ne_admin0.geojson", "Natural Earth — pays (1:50m)")}
    # le journal ne garde que les sources encore utilisées
    utiles = {f"wfp_{iso}" for iso in config.PAYS} | set(autres)
    journal = {cle: entree for cle, entree in journal.items() if cle in utiles}

    def deja_la(cle, chemin):
        return not forcer and cle in journal and os.path.exists(chemin)

    def noter(cle, entree):
        # journal réécrit après chaque fichier : une coupure réseau ne perd rien
        journal[cle] = entree
        with open(journal_path, "w", encoding="utf-8") as f:
            json.dump(journal, f, ensure_ascii=False, indent=1)

    for iso, (nom, _, slug) in config.PAYS.items():
        chemin = os.path.join(dossier_raw, f"wfp_{iso}.csv")
        if deja_la(f"wfp_{iso}", chemin):
            continue
        meta = lire_json(config.URL_HDX.format(slug))["result"]
        ressource = next(r for r in meta["resources"]
                         if r["url"].lower().endswith(".csv") and "market" not in r["name"].lower())
        taille = telecharger(ressource["url"], chemin)
        noter(f"wfp_{iso}", {"source": f"PAM / HDX — {meta['title']}", "url": ressource["url"],
                             "maj_source": ressource.get("last_modified"), "telecharge_le": maintenant,
                             "octets": taille})
        print(f"  {nom:15s} {taille / 1e6:6.1f} Mo")

    for cle, (url, nom_fichier, libelle) in autres.items():
        chemin = os.path.join(dossier_raw, nom_fichier)
        if deja_la(cle, chemin):
            continue
        taille = telecharger(url, chemin)
        noter(cle, {"source": libelle, "url": url, "telecharge_le": maintenant, "octets": taille})
        print(f"  {libelle:45s} {taille / 1e6:6.1f} Mo")
    with open(journal_path, "w", encoding="utf-8") as f:
        json.dump(journal, f, ensure_ascii=False, indent=1)
    return journal
