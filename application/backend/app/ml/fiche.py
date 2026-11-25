"""Lecture d'un pays par le modèle : distances, frontière, leviers et pays semblables."""

import math

import numpy as np
import pandas as pd

from ..indicateurs import CLES
from ..schemas import ParametresModele


class Lecteur:
    """Applique un modèle entraîné à des valeurs, sans le réentraîner."""

    def __init__(self, parametres: ParametresModele):
        self.indicateurs = list(parametres.indicateurs)
        self.origine, self.pas = np.array(parametres.origine), np.array(parametres.pas)
        self.centres = np.array(parametres.centres)
        self.k = len(self.centres)

    def normaliser(self, valeurs: np.ndarray) -> np.ndarray:
        """Passe des unités d'origine à l'espace du modèle (colonnes dans l'ordre des indicateurs)."""
        return (valeurs - self.origine) / self.pas

    def transformer(self, tableau: pd.DataFrame) -> np.ndarray:
        return self.normaliser(tableau[self.indicateurs].to_numpy(float))

    def distances(self, X: np.ndarray) -> np.ndarray:
        return np.sqrt(((X[:, None, :] - self.centres[None]) ** 2).sum(axis=2))

    def priorites(self, tableau: pd.DataFrame) -> np.ndarray:
        return self.distances(self.transformer(tableau)).argmin(axis=1) + 1

    def marges(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Distance à la frontière la plus proche, groupe situé derrière, et profondeur dans le groupe.

        La profondeur vaut 0 sur la frontière et 1 à la hauteur du centre du groupe.
        """
        d = self.distances(X)
        propre = d.argmin(axis=1)
        marges = np.full(len(X), np.inf)
        voisins = propre.copy()
        for g in range(self.k):
            ecart = np.sqrt(((self.centres[propre] - self.centres[g]) ** 2).sum(axis=1))
            autre = (propre != g) & (ecart > 1e-12)
            valeur = np.where(autre, (d[:, g] ** 2 - d[np.arange(len(X)), propre] ** 2) / (2 * np.where(autre, ecart, 1)), np.inf)
            mieux = valeur < marges
            marges = np.where(mieux, valeur, marges)
            voisins = np.where(mieux, g, voisins)
        marges = np.where(np.isfinite(marges), marges, 0.0)
        demi = np.sqrt(((self.centres[propre] - self.centres[voisins]) ** 2).sum(axis=1)) / 2
        profondeurs = np.divide(marges, demi, out=np.zeros_like(marges), where=demi > 1e-12)
        return marges, voisins + 1, profondeurs

    def _valeur_d_origine(self, x: np.ndarray, colonne: int) -> float:
        return float(self.origine[colonne] + self.pas[colonne] * x[colonne])

    def leviers(self, x: np.ndarray, priorite: int, tableau: pd.DataFrame, progres: float) -> dict | None:
        """Ce qui ferait passer le pays dans le groupe suivant, moins urgent."""
        if priorite >= self.k:
            return None
        ici, cible = self.centres[priorite - 1], self.centres[priorite]
        ecart = float(((x - cible) ** 2).sum() - ((x - ici) ** 2).sum())
        pente = 2 * (cible - ici)

        seuls = []
        for j, cle in enumerate(self.indicateurs):
            bornes = (float(tableau[cle].min()), float(tableau[cle].max()))
            requis, atteignable = None, False
            if abs(pente[j]) > 1e-9:
                deplace = x.copy()
                deplace[j] += ecart / pente[j]
                requis = self._valeur_d_origine(deplace, j)
                proche = int(((deplace + np.eye(len(x))[j] * np.sign(pente[j]) * 1e-6 - self.centres) ** 2).sum(axis=1).argmin()) + 1
                atteignable = bornes[0] <= requis <= bornes[1] and proche != priorite
            seuls.append({"indicateur": cle, "requis": requis, "atteignable": bool(atteignable), "bornes": bornes})

        direction = cible - x
        denominateur = float((direction * pente).sum())
        part = ecart / denominateur if denominateur > 1e-9 else None
        ensemble = None
        if part is not None and 0 < part <= 1:
            atteint = x + part * direction
            annees = max(1, math.ceil(math.log(1 - min(part, 0.999)) / math.log(1 - progres)))
            ensemble = {
                "part": float(part),
                "annees": annees,
                "valeurs": {c: self._valeur_d_origine(atteint, j) for j, c in enumerate(self.indicateurs)},
            }
        return {"vers": priorite + 1, "seuls": seuls, "ensemble": ensemble}

    def lire(self, tableau: pd.DataFrame, valeurs: pd.Series, progres: float) -> dict:
        ligne = valeurs[list(CLES)].to_frame().T.astype(float)
        x = self.transformer(ligne)
        d = self.distances(x)[0]
        priorite = int(d.argmin()) + 1
        marge, voisin, profondeur = self.marges(x)
        autre = int(np.argsort(d)[1])
        poids = (x[0] - self.centres[autre]) ** 2 - (x[0] - self.centres[priorite - 1]) ** 2
        return {
            "priorite": priorite,
            "distances": [float(v) for v in d],
            "marge": float(marge[0]),
            "groupe_voisin": int(voisin[0]),
            "profondeur": float(profondeur[0]),
            "contributions": [
                {"indicateur": c, "valeur": float(p)} for c, p in zip(self.indicateurs, poids)
            ],
            "leviers": self.leviers(x[0], priorite, tableau, progres),
        }

    def semblables(self, tableau: pd.DataFrame, identifiant: str, nombre: int = 5) -> list[dict]:
        X = self.transformer(tableau)
        position = tableau.index.get_loc(identifiant)
        distances = np.sqrt(((X - X[position]) ** 2).sum(axis=1))
        ordre = [i for i in np.argsort(distances) if i != position][:nombre]
        return [{"id": tableau.index[i], "distance": float(distances[i])} for i in ordre]

