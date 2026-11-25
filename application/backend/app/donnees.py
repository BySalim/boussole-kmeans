"""Lecture des fichiers de données et données de référence."""

import csv
import io
import json
import math
from functools import lru_cache

from .config import CSV_ORIGINE, REFERENTIEL
from .erreurs import ErreurMetier
from .indicateurs import CLES, INDICATEURS

PAYS_MINIMUM = 20


def lire_csv(contenu: str) -> list[dict]:
    """Lit un fichier au format du jeu de données et vérifie chaque ligne."""
    referentiel = json.loads(REFERENTIEL.read_text(encoding="utf-8"))
    lecteur = csv.DictReader(io.StringIO(contenu.lstrip("﻿")))
    attendues = ["country", *(i.colonne for i in INDICATEURS)]
    absentes = [c for c in attendues if c not in (lecteur.fieldnames or [])]
    if absentes:
        raise ErreurMetier(f"Colonnes absentes du fichier : {', '.join(absentes)}.")

    lignes, inconnus, vus = [], [], set()
    for numero, ligne in enumerate(lecteur, start=2):
        nom = (ligne["country"] or "").strip()
        if nom not in referentiel:
            inconnus.append(nom or f"ligne {numero}")
            continue
        if nom in vus:
            raise ErreurMetier(f"Le pays « {nom} » figure deux fois dans le fichier.")
        vus.add(nom)
        valeurs = {}
        for indicateur in INDICATEURS:
            try:
                valeur = float(ligne[indicateur.colonne])
            except (TypeError, ValueError):
                valeur = math.nan
            if not math.isfinite(valeur):
                raise ErreurMetier(
                    f"Ligne {numero} : la valeur de « {indicateur.colonne} » pour « {nom} » n’est pas un nombre."
                )
            valeurs[indicateur.cle] = valeur
        fiche = referentiel[nom]
        lignes.append({
            "id": fiche["iso3"], "numero": fiche["numero"], "nom": fiche["nom"], "nom_source": nom,
            "region": fiche["region"], "latitude": fiche["latitude"], "longitude": fiche["longitude"], **valeurs,
        })
    if inconnus:
        raise ErreurMetier(f"Pays non reconnus : {', '.join(inconnus[:5])}{'…' if len(inconnus) > 5 else ''}.")
    if len(lignes) < PAYS_MINIMUM:
        raise ErreurMetier(f"Le fichier doit contenir au moins {PAYS_MINIMUM} pays.")
    return lignes


@lru_cache
def reference() -> list[dict]:
    """Les pays du fichier d'origine, dans son ordre."""
    return lire_csv(CSV_ORIGINE.read_text(encoding="utf-8"))


def valeurs(ligne: dict) -> dict[str, float]:
    return {c: ligne[c] for c in CLES}
