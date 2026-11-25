"""Emplacements des fichiers."""

import os
from pathlib import Path

DOSSIER_APP = Path(__file__).resolve().parent
DOSSIER_APPLICATION = DOSSIER_APP.parent.parent
DOSSIER_PROJET = DOSSIER_APPLICATION.parent

REFERENTIEL = DOSSIER_APP / "referentiel_pays.json"
CSV_ORIGINE = DOSSIER_APP / "Country-data.csv"
DOSSIER_SITE = Path(os.environ.get("BOUSSOLE_SITE", DOSSIER_APPLICATION / "frontend" / "dist"))
