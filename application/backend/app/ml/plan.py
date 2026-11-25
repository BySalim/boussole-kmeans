"""Plans d'aide : stratégies, meilleure combinaison et projection année par année."""

from functools import cached_property

import numpy as np
import pandas as pd

from ..indicateurs import CLES, PAR_CLE
from ..schemas import Hypotheses, ParametresPlan
from .fiche import Lecteur

STRATEGIES = {
    "sorties": "Faire sortir le plus de pays",
    "urgence": "Aider les plus touchés",
    "seuil": "Aider les plus proches du seuil",
    "rotation": "Répartir à tour de rôle",
}
HORIZON_MAX = 60


class Projection:
    """Fait avancer le monde d'une année sous l'effet de l'aide."""

    def __init__(self, tableau: pd.DataFrame, lecteur: Lecteur, hypotheses: Hypotheses):
        self.lecteur = lecteur
        self.ids = list(tableau.index)
        self.colonnes = {c: i for i, c in enumerate(CLES)}
        self.du_modele = [self.colonnes[c] for c in lecteur.indicateurs]
        self.depart = tableau[list(CLES)].to_numpy(float)
        self.leviers = list(hypotheses.leviers)
        self.progres = hypotheses.progres
        self.priorites_depart = self.priorites(self.depart)
        groupe_vise = self.priorites_depart == 2
        self.objectif = {
            c: float(self.depart[groupe_vise, self.colonnes[c]].mean()) if groupe_vise.any() else None
            for c in self.leviers
        }

    def _positions(self, valeurs: np.ndarray) -> np.ndarray:
        return self.lecteur.normaliser(valeurs[:, self.du_modele])

    def priorites(self, valeurs: np.ndarray) -> np.ndarray:
        return self.lecteur.distances(self._positions(valeurs)).argmin(axis=1) + 1

    def marges(self, valeurs: np.ndarray) -> np.ndarray:
        return self.lecteur.marges(self._positions(valeurs))[0]

    def aider(self, valeurs: np.ndarray, lignes) -> None:
        lignes = list(lignes)
        if not lignes:
            return
        for c in self.leviers:
            if self.objectif[c] is None:
                continue
            j, sens = self.colonnes[c], PAR_CLE[c].sens
            retard = self.objectif[c] - valeurs[lignes, j]
            valeurs[lignes, j] += self.progres * np.where(retard * sens > 0, retard, 0)

    @cached_property
    def annees_necessaires(self) -> dict[int, int | None]:
        """Pour chaque pays prioritaire, le nombre d'années d'aide qui le fait sortir."""
        lignes = np.flatnonzero(self.priorites_depart == 1)
        besoin: dict[int, int | None] = {int(i): None for i in lignes}
        valeurs = self.depart.copy()
        for annee in range(1, HORIZON_MAX + 1):
            restants = [i for i in lignes if besoin[int(i)] is None]
            if not restants:
                break
            self.aider(valeurs, restants)
            priorites = self.priorites(valeurs)
            for i in restants:
                if priorites[i] != 1:
                    besoin[int(i)] = annee
        return besoin


def _choisir_sorties(besoin: dict[int, int | None], places: int, duree: int) -> dict[int, int]:
    """Le plus grand nombre de sorties possible : les besoins les plus courts d'abord."""
    choix, total = {}, 0
    for n, i in sorted((n, i) for i, n in besoin.items() if n is not None and n <= duree):
        if total + n > places:
            break
        choix[i] = n
        total += n
    return choix


def _selection_annuelle(reste: dict[int, int], candidats: set[int], nombre: int, annees_restantes: int) -> list[int]:
    """Sert d'abord ce qui ne peut plus attendre, puis ce qui peut finir le plus tôt."""
    ouverts = [i for i, n in reste.items() if n > 0 and i in candidats]
    ouverts.sort(key=lambda i: (reste[i] < annees_restantes, reste[i], i))
    return ouverts[:nombre]


def projeter(
    tableau: pd.DataFrame,
    lecteur: Lecteur,
    hypotheses: Hypotheses,
    parametres: ParametresPlan,
    projection: Projection | None = None,
) -> dict:
    projection = projection or Projection(tableau, lecteur, hypotheses)
    ids = projection.ids
    rang = {identifiant: i for i, identifiant in enumerate(ids)}
    exclus = {rang[i] for i in parametres.exclus if i in rang}
    imposes = [rang[i] for i in parametres.imposes if i in rang and rang[i] not in exclus]
    nombre = int(parametres.budget / parametres.cout + 1e-9)
    duree = parametres.duree

    besoin = {i: n for i, n in projection.annees_necessaires.items() if i not in exclus}
    imposes = [i for i in imposes if i in besoin]
    reserve = sum(min(besoin[i] or duree, duree) for i in imposes[:nombre])
    libre = {i: n for i, n in besoin.items() if i not in imposes}
    places = max(0, nombre * duree - reserve)
    reste: dict[int, int] = {}
    if parametres.strategie == "sorties":
        reste = _choisir_sorties(libre, places, duree)

    j_mort = projection.colonnes["mortalite"]
    valeurs = projection.depart.copy()
    anciennete = np.zeros(len(ids), dtype=int)
    annees, sortie_en, aides_par_pays = [], {}, np.zeros(len(ids), dtype=int)
    depense = 0.0
    initial = np.flatnonzero(projection.priorites_depart == 1)

    for annee in range(duree + 1):
        priorites = projection.priorites(valeurs)
        for i in initial:
            if priorites[i] != 1 and int(i) not in sortie_en:
                sortie_en[int(i)] = annee
        candidats = {int(i) for i in np.flatnonzero(priorites == 1) if int(i) not in exclus}

        aides: list[int] = []
        if annee < duree and nombre > 0:
            aides = [i for i in imposes if i in candidats][:nombre]
            libres = nombre - len(aides)
            if reste and libres:
                eligibles = candidats - set(aides)
                aides += _selection_annuelle(reste, eligibles, libres, duree - annee)
            libres = nombre - len(aides)
            if libres:
                autres = [i for i in candidats if i not in set(aides)]
                if parametres.strategie == "seuil":
                    marges = projection.marges(valeurs)
                    autres.sort(key=lambda i: (marges[i], i))
                elif parametres.strategie == "rotation":
                    autres.sort(key=lambda i: (anciennete[i], -valeurs[i, j_mort], i))
                else:
                    autres.sort(key=lambda i: (-valeurs[i, j_mort], i))
                aides += autres[:libres]

        annees.append({
            "annee": annee,
            "priorites": priorites.tolist(),
            "aides": [ids[i] for i in aides],
            "effectifs": np.bincount(priorites, minlength=lecteur.k + 1)[1:].tolist(),
            "mortalite_prioritaires": float(valeurs[initial, j_mort].mean()) if len(initial) else None,
            "leviers": {
                ids[i]: {c: round(float(valeurs[i, projection.colonnes[c]]), 3) for c in projection.leviers}
                for i in initial
            },
        })
        for i in aides:
            anciennete[i] += 1
            aides_par_pays[i] += 1
            if reste.get(i, 0) > 0:
                reste[i] -= 1
        depense += len(aides) * parametres.cout
        projection.aider(valeurs, aides)

    reussites = [i for i in sortie_en if sortie_en[i] <= duree]
    synthese = {
        "prioritaires_depart": len(initial),
        "prioritaires_fin": int((projection.priorites(valeurs) == 1).sum()) if duree else len(initial),
        "sorties": len(reussites),
        "premiere_sortie": min(sortie_en.values()) if sortie_en else None,
        "mortalite_depart": float(projection.depart[initial, j_mort].mean()) if len(initial) else None,
        "mortalite_fin": annees[-1]["mortalite_prioritaires"],
        "depense": depense,
        "budget_total": parametres.budget * duree,
        "cout_par_sortie": depense / len(reussites) if reussites else None,
        "aides_par_an": nombre,
        "pays_aides": int((aides_par_pays > 0).sum()),
    }
    return {
        "parametres": parametres.model_dump(),
        "strategie": STRATEGIES[parametres.strategie],
        "pays": ids,
        "annees": annees,
        "detail": [
            {
                "id": ids[i],
                "annees_aide": int(aides_par_pays[i]),
                "annees_necessaires": besoin.get(int(i)),
                "sortie": sortie_en.get(int(i)),
            }
            for i in initial
        ],
        "synthese": synthese,
    }


def comparer(tableau, lecteur, hypotheses, parametres) -> list[dict]:
    resultat = []
    projection = Projection(tableau, lecteur, hypotheses)
    for cle, libelle in STRATEGIES.items():
        plan = projeter(tableau, lecteur, hypotheses, parametres.model_copy(update={"strategie": cle}), projection)
        resultat.append({
            "strategie": cle,
            "libelle": libelle,
            "courbe": [a["effectifs"][0] for a in plan["annees"]],
            **plan["synthese"],
        })
    return resultat
