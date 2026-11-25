"""Une demande : les données, le modèle et les hypothèses que le visiteur envoie avec elle.

Le serveur ne garde rien d'un visiteur. Il retient seulement les derniers calculs, pour ne pas les refaire.
"""

import threading
from collections import OrderedDict

import numpy as np
import pandas as pd
from pydantic import BaseModel

from .donnees import PAYS_MINIMUM, reference, valeurs
from .erreurs import ErreurMetier
from .indicateurs import CLES
from .ml.fiche import Lecteur
from .ml.kmeans import ajuster, mesurer, profils
from .schemas import Configuration, Contexte

TAILLE_CACHE = 300
_cache: OrderedDict[tuple, object] = OrderedDict()
_verrou = threading.Lock()


def _memoriser(cle: tuple, calcul):
    with _verrou:
        if cle in _cache:
            _cache.move_to_end(cle)
            return _cache[cle]
    resultat = calcul()
    with _verrou:
        _cache[cle] = resultat
        while len(_cache) > TAILLE_CACHE:
            _cache.popitem(last=False)
    return resultat


class Travail:
    def __init__(self, contexte: Contexte | None = None):
        self.contexte = contexte or Contexte()
        self.hypotheses = self.contexte.hypotheses
        self._cle_donnees = self.contexte.model_dump_json(include={"donnees", "remplacees"})
        self._cle = self.contexte.model_dump_json()

    def memoriser(self, nom: str, calcul, demande: BaseModel | None = None, donnees_seules: bool = False):
        cle = self._cle_donnees if donnees_seules else self._cle
        return _memoriser((nom, cle, demande.model_dump_json() if demande else ""), calcul)

    def tableau(self) -> pd.DataFrame:
        return self.memoriser("tableau", self._construire, donnees_seules=True)

    def _construire(self) -> pd.DataFrame:
        changees = {i: v.fournies() for i, v in self.contexte.donnees.items()}
        lignes = []
        for p in reference():
            propres = changees.pop(p["id"], None)
            if propres is None and self.contexte.remplacees:
                continue
            lignes.append({"id": p["id"], "nom": p["nom"], "region": p["region"], **valeurs(p), **(propres or {})})
        if changees or len(lignes) < PAYS_MINIMUM:
            raise ErreurMetier("Les données de cet appareil ne sont pas lisibles. Réinitialisez-les dans Simulation, Hypothèses.", 422)
        return pd.DataFrame(lignes).set_index("id")

    def lecteur(self) -> Lecteur:
        return Lecteur(self.contexte.modele or modele_de_reference()["parametres_lus"])

    def priorites(self) -> np.ndarray:
        return self.lecteur().priorites(self.tableau())

    def situation(self) -> dict:
        """La photographie que voient les équipes : chaque pays lu par le modèle publié."""
        donnees, lecteur = self.tableau(), self.lecteur()
        X = lecteur.transformer(donnees)
        priorites = lecteur.distances(X).argmin(axis=1) + 1
        marges, voisins, profondeurs = lecteur.marges(X)
        fiches = {p["id"]: p for p in reference()}
        pays = [
            {
                "id": identifiant,
                **{c: fiches[identifiant][c] for c in ("numero", "nom", "region", "latitude", "longitude")},
                "priorite": int(priorites[i]),
                "marge": round(float(marges[i]), 4),
                "profondeur": round(float(profondeurs[i]), 4),
                "groupe_voisin": int(voisins[i]),
                "valeurs": {c: float(donnees.at[identifiant, c]) for c in CLES},
            }
            for i, identifiant in enumerate(donnees.index)
        ]
        groupes = []
        for g in range(1, lecteur.k + 1):
            membres = priorites == g
            groupes.append({
                "priorite": g,
                "effectif": int(membres.sum()),
                "moyennes": {c: float(donnees.loc[membres, c].mean()) if membres.any() else None for c in CLES},
            })
        return {
            "groupes": groupes,
            "pays": pays,
            "bornes": {c: [float(donnees[c].min()), float(donnees[c].max())] for c in CLES},
            "indicateurs_modele": lecteur.indicateurs,
        }

    def entrainer(self, configuration: Configuration) -> dict:
        donnees = self.tableau()
        ajustement = ajuster(donnees, configuration)
        return {
            "configuration": configuration.model_dump(),
            "parametres": ajustement.parametres().model_dump(),
            "mesures": {
                **mesurer(ajustement.X, ajustement.priorites, ajustement.inertie),
                "iterations": ajustement.iterations,
                "groupes": profils(donnees, ajustement),
            },
        }


def modele_de_reference() -> dict:
    def entrainer():
        donnees = Travail()
        ajustement = ajuster(donnees.tableau(), Configuration())
        return {**donnees.entrainer(Configuration()), "parametres_lus": ajustement.parametres()}

    return _memoriser(("modele de reference",), entrainer)
