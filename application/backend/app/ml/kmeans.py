"""Entraînement de K-Means, mesures, étapes de l'algorithme et repère à deux dimensions."""

import warnings
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans, kmeans_plusplus
from sklearn.decomposition import PCA
from sklearn.metrics import (
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_samples,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, MinMaxScaler, RobustScaler, StandardScaler

from ..indicateurs import CLES, PAR_CLE
from ..schemas import Configuration, ParametresModele

warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

ECHELLES = {
    "standard": StandardScaler,
    "robuste": RobustScaler,
    "minmax": MinMaxScaler,
    "aucune": FunctionTransformer,
}


@dataclass
class Ajustement:
    """Un K-Means entraîné, avec ses groupes renumérotés de la priorité 1 à la priorité k."""

    configuration: Configuration
    pipeline: Pipeline
    X: np.ndarray
    centres_depart: np.ndarray
    rang: np.ndarray
    priorites: np.ndarray
    inertie: float
    iterations: int
    essais: list[float] = field(default_factory=list)

    @property
    def kmeans(self) -> KMeans:
        return self.pipeline[-1]

    @property
    def echelle(self):
        return self.pipeline[0]

    @property
    def centres(self) -> np.ndarray:
        """Centres dans l'espace du modèle, triés par priorité."""
        return self.kmeans.cluster_centers_[np.argsort(self.rang)]

    def parametres(self) -> ParametresModele:
        """Toutes les échelles sont affines : valeur = origine + pas × coordonnée."""
        p = len(self.configuration.indicateurs)
        origine = np.asarray(self.echelle.inverse_transform(np.zeros((1, p))))[0]
        pas = np.diag(np.asarray(self.echelle.inverse_transform(np.eye(p))) - origine)
        return ParametresModele(
            indicateurs=self.configuration.indicateurs, origine=origine.tolist(), pas=pas.tolist(), centres=self.centres.tolist()
        )


def centres_de_depart(X: np.ndarray, configuration: Configuration, alea: np.random.RandomState) -> np.ndarray:
    """Mêmes tirages que KMeans(n_init=..., random_state=graine) de Scikit-learn."""
    if configuration.initialisation == "k-means++":
        return kmeans_plusplus(X, configuration.k, random_state=alea)[0]
    return X[alea.choice(len(X), configuration.k, replace=False, p=np.full(len(X), 1 / len(X)))]


def _lloyd(X: np.ndarray, centres: np.ndarray, etapes: int) -> KMeans:
    return KMeans(len(centres), init=centres, n_init=1, max_iter=etapes).fit(X)


def ranger(tableau: pd.DataFrame, groupes: np.ndarray, k: int) -> np.ndarray:
    """Numéro de priorité de chaque groupe : 1 pour la mortalité infantile moyenne la plus forte."""
    moyennes = np.array(
        [tableau["mortalite"].to_numpy()[groupes == g].mean() if (groupes == g).any() else -1 for g in range(k)]
    )
    rang = np.empty(k, dtype=int)
    rang[np.argsort(-moyennes, kind="stable")] = np.arange(1, k + 1)
    return rang


def ajuster(tableau: pd.DataFrame, configuration: Configuration) -> Ajustement:
    echelle = ECHELLES[configuration.echelle]()
    X = np.asarray(echelle.fit_transform(tableau[list(configuration.indicateurs)].to_numpy(float)))

    alea = np.random.RandomState(configuration.graine)
    meilleur, depart_retenu, essais = None, None, []
    for _ in range(configuration.essais):
        depart = centres_de_depart(X, configuration, alea)
        modele = _lloyd(X, depart, configuration.etapes)
        essais.append(float(modele.inertia_))
        if meilleur is None or modele.inertia_ < meilleur.inertia_:
            meilleur, depart_retenu = modele, depart

    rang = ranger(tableau, meilleur.labels_, configuration.k)
    return Ajustement(
        configuration=configuration,
        pipeline=Pipeline([("echelle", echelle), ("kmeans", meilleur)]),
        X=X,
        centres_depart=depart_retenu,
        rang=rang,
        priorites=rang[meilleur.labels_],
        inertie=float(meilleur.inertia_),
        iterations=int(meilleur.n_iter_),
        essais=essais,
    )


def mesurer(X: np.ndarray, groupes: np.ndarray, inertie: float) -> dict:
    dispersion = float(((X - X.mean(axis=0)) ** 2).sum())
    distincts = len(np.unique(groupes))
    if distincts < 2:
        return {"silhouette": None, "davies_bouldin": None, "calinski_harabasz": None,
                "inertie": inertie, "part_expliquee": 0.0}
    return {
        "silhouette": float(silhouette_samples(X, groupes).mean()),
        "davies_bouldin": float(davies_bouldin_score(X, groupes)),
        "calinski_harabasz": float(calinski_harabasz_score(X, groupes)),
        "inertie": inertie,
        "part_expliquee": 1 - inertie / dispersion if dispersion else 0.0,
    }


def profils(tableau: pd.DataFrame, ajustement: Ajustement) -> list[dict]:
    k = ajustement.configuration.k
    silhouettes = (
        silhouette_samples(ajustement.X, ajustement.priorites)
        if len(np.unique(ajustement.priorites)) > 1
        else np.zeros(len(tableau))
    )
    resultat = []
    for priorite in range(1, k + 1):
        membres = ajustement.priorites == priorite
        resultat.append({
            "priorite": priorite,
            "effectif": int(membres.sum()),
            "silhouette": float(silhouettes[membres].mean()) if membres.any() else None,
            "moyennes": {c: float(tableau.loc[membres, c].mean()) if membres.any() else None for c in CLES},
        })
    return resultat


def etapes_de_lloyd(ajustement: Ajustement) -> list[dict]:
    """Rejoue l'algorithme étape par étape depuis les centres de départ retenus."""
    X, centres = ajustement.X, ajustement.centres_depart
    distances = ((X[:, None, :] - centres[None]) ** 2).sum(axis=2)
    groupes = distances.argmin(axis=1)
    etats = [{"centres": centres, "groupes": groupes, "inertie": float(distances.min(axis=1).sum())}]
    for _ in range(ajustement.iterations):
        modele = _lloyd(X, centres, 1)
        centres, groupes = modele.cluster_centers_, modele.labels_
        etats.append({"centres": centres, "groupes": groupes, "inertie": float(modele.inertia_)})
    return etats


def _transformation(ajustement: Ajustement, cle: str) -> tuple[float, float]:
    """Passage de l'échelle du modèle aux unités d'origine : valeur = centre + pas × coordonnée."""
    rang = list(ajustement.configuration.indicateurs).index(cle)
    ligne = np.zeros((2, len(ajustement.configuration.indicateurs)))
    ligne[1, rang] = 1
    brut = np.asarray(ajustement.echelle.inverse_transform(ligne))
    return float(brut[0, rang]), float(brut[1, rang] - brut[0, rang])


def repere(tableau: pd.DataFrame, ajustement: Ajustement, axe_x: str | None, axe_y: str | None) -> dict:
    """Projection à deux dimensions : plan principal (ACP) ou deux indicateurs au choix."""
    configuration, X = ajustement.configuration, ajustement.X
    etats = etapes_de_lloyd(ajustement)

    if axe_x is None or axe_y is None:
        acp = PCA(2).fit(X)
        points = acp.transform(X)
        moyenne = acp.mean_

        def projeter(centres):
            plans = acp.transform(centres)
            hors_plan = ((centres - moyenne) ** 2).sum(axis=1) - (plans**2).sum(axis=1)
            return np.column_stack([plans, np.maximum(hors_plan, 0)])

        axes = [
            {
                "libelle": f"Axe {i + 1}",
                "variance": float(acp.explained_variance_ratio_[i]),
                "centre": 0.0,
                "pas": 1.0,
                "poids": {c: float(p) for c, p in zip(configuration.indicateurs, acp.components_[i])},
            }
            for i in range(2)
        ]
        mode, frontieres = "acp", "exactes" if X.shape[1] == 2 else "coupe"
    else:
        dans_le_modele = [c in configuration.indicateurs for c in (axe_x, axe_y)]
        exactes = set(configuration.indicateurs) == {axe_x, axe_y}
        brut = tableau[[axe_x, axe_y]].to_numpy(float)
        axes, colonnes = [], []
        for i, cle in enumerate((axe_x, axe_y)):
            if dans_le_modele[i]:
                centre, pas = _transformation(ajustement, cle)
                colonnes.append(X[:, list(configuration.indicateurs).index(cle)])
            else:
                centre, pas = 0.0, 1.0
                colonnes.append(brut[:, i])
            axes.append({"cle": cle, "libelle": PAR_CLE[cle].libelle, "centre": centre, "pas": pas})
        points = np.column_stack(colonnes)

        def projeter(centres, groupes=None):
            sortie = np.zeros((len(centres), 3))
            for i, cle in enumerate((axe_x, axe_y)):
                if dans_le_modele[i]:
                    sortie[:, i] = centres[:, list(configuration.indicateurs).index(cle)]
                else:
                    for g in range(len(centres)):
                        membres = groupes == g
                        sortie[g, i] = brut[membres, i].mean() if membres.any() else brut[:, i].mean()
            return sortie

        mode, frontieres = "indicateurs", "exactes" if exactes else "aucune"

    etapes = []
    for etat in etats:
        plan = projeter(etat["centres"]) if mode == "acp" else projeter(etat["centres"], etat["groupes"])
        ordre = np.argsort(ajustement.rang)
        etapes.append({
            "inertie": etat["inertie"],
            "centres": plan[ordre].round(5).tolist(),
            "priorites": ajustement.rang[etat["groupes"]].tolist(),
        })
    return {
        "mode": mode,
        "frontieres": frontieres,
        "axes": axes,
        "points": np.asarray(points).round(5).tolist(),
        "etapes": etapes,
    }


def courbes(tableau: pd.DataFrame, configuration: Configuration, k_max: int = 10) -> list[dict]:
    """Critères de choix de k, avec la stabilité entre initialisations."""
    resultat = []
    for k in range(2, k_max + 1):
        variante = configuration.model_copy(update={"k": k, "etapes": 100})
        ajustement = ajuster(tableau, variante)
        accords = []
        for graine in range(12):
            unique = ajuster(tableau, variante.model_copy(update={"essais": 1, "graine": 1000 + graine}))
            accords.append(adjusted_rand_score(ajustement.priorites, unique.priorites))
        effectifs = np.bincount(ajustement.priorites, minlength=k + 1)[1:]
        resultat.append({
            "k": k,
            **mesurer(ajustement.X, ajustement.priorites, ajustement.inertie),
            "stabilite": float(np.mean(accords)),
            "plus_petit_groupe": int(effectifs.min()),
        })
    return resultat


def analyser(tableau: pd.DataFrame, configuration: Configuration, axe_x=None, axe_y=None, reference=None) -> dict:
    """Tout ce que le laboratoire affiche pour un réglage."""
    ajustement = ajuster(tableau, configuration)
    mesures = mesurer(ajustement.X, ajustement.priorites, ajustement.inertie)
    silhouettes = (
        silhouette_samples(ajustement.X, ajustement.priorites)
        if len(np.unique(ajustement.priorites)) > 1
        else np.zeros(len(tableau))
    )
    accord = adjusted_rand_score(reference, ajustement.priorites) if reference is not None else None
    return {
        "configuration": configuration.model_dump(),
        "mesures": {
            **mesures,
            "iterations": ajustement.iterations,
            "essais": ajustement.essais,
            "accord_modele_publie": None if accord is None else float(accord),
        },
        "groupes": profils(tableau, ajustement),
        "pays": [
            {"id": identifiant, "priorite": int(p), "silhouette": round(float(s), 4)}
            for identifiant, p, s in zip(tableau.index, ajustement.priorites, silhouettes)
        ],
        "repere": repere(tableau, ajustement, axe_x, axe_y),
    }
