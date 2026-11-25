"""Recherche automatique des meilleures combinaisons de réglages."""

import itertools
import time

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import (
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    pairwise_distances,
    silhouette_score,
)
from sklearn.preprocessing import StandardScaler

from ..indicateurs import CLES
from ..schemas import DemandeRecherche
from .kmeans import ECHELLES, ranger

NOMBRE_GARDE = 40
COMBINAISONS_MAX = 12_000
DUREE_LOT = 1.5


def combinaisons(demande: DemandeRecherche) -> list[tuple[tuple[str, ...], str]]:
    candidats = [c for c in CLES if c in demande.indicateurs]
    taille_max = min(demande.taille_max, len(candidats))
    return [
        (sous_ensemble, echelle)
        for taille in range(demande.taille_min, taille_max + 1)
        for sous_ensemble in itertools.combinations(candidats, taille)
        for echelle in demande.echelles
    ]


def nombre_d_essais(demande: DemandeRecherche) -> int:
    return len(combinaisons(demande)) * (demande.k_max - demande.k_min + 1)


def essayer_un_lot(tableau: pd.DataFrame, demande: DemandeRecherche, reference, depart: int) -> dict:
    """Essaie les combinaisons à partir de « depart », pendant DUREE_LOT secondes au plus, et garde les meilleures."""
    debut = time.monotonic()
    toutes = combinaisons(demande)
    ks = range(demande.k_min, demande.k_max + 1)
    commun = pairwise_distances(StandardScaler().fit_transform(tableau[list(CLES)].to_numpy(float)))
    garde: list[dict] = []
    ecartees, position = 0, min(depart, len(toutes))
    while position < len(toutes) and (position == depart or time.monotonic() - debut < DUREE_LOT):
        sous_ensemble, echelle = toutes[position]
        position += 1
        X = np.asarray(ECHELLES[echelle]().fit_transform(tableau[list(sous_ensemble)].to_numpy(float)))
        distances = pairwise_distances(X)
        for k in ks:
            groupes = KMeans(k, n_init=4, random_state=0).fit(X).labels_
            effectifs = np.bincount(groupes, minlength=k)
            if effectifs.min() < demande.effectif_min:
                ecartees += 1
                continue
            rang = ranger(tableau, groupes, k)
            garde.append({
                "indicateurs": list(sous_ensemble),
                "echelle": echelle,
                "k": k,
                "silhouette": float(silhouette_score(distances, groupes, metric="precomputed")),
                "silhouette_commune": float(silhouette_score(commun, groupes, metric="precomputed")),
                "davies_bouldin": float(davies_bouldin_score(X, groupes)),
                "calinski_harabasz": float(calinski_harabasz_score(X, groupes)),
                "effectifs": effectifs[np.argsort(rang)].tolist(),
                "accord": None if reference is None else float(adjusted_rand_score(reference, groupes)),
            })
    garde.sort(key=lambda r: r[demande.critere], reverse=demande.critere != "davies_bouldin")
    return {
        "suite": position if position < len(toutes) else None,
        "faites": position * len(ks),
        "total": len(toutes) * len(ks),
        "ecartees": ecartees,
        "resultats": garde[:NOMBRE_GARDE],
    }
