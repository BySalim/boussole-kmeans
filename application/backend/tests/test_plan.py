"""Plans d'aide : cohérence, contraintes et optimalité."""

import numpy as np
import pytest

from app.ml.plan import STRATEGIES, Projection, comparer, projeter
from app.schemas import Hypotheses, ParametresPlan


@pytest.fixture()
def contexte(reference):
    return reference.tableau(), reference.lecteur(), Hypotheses()


def test_la_strategie_du_notebook_est_conservee(contexte):
    plan = projeter(*contexte, ParametresPlan(strategie="urgence", duree=15))
    assert [a["effectifs"][0] for a in plan["annees"]] == [47, 47, 47, 47, 47, 47, 47, 46, 43, 43, 40, 36, 31, 27, 20, 15]
    assert plan["annees"][0]["aides"][0] == "HTI"


@pytest.mark.parametrize("strategie", STRATEGIES)
@pytest.mark.parametrize(("budget", "cout", "duree"), [(10, 1, 10), (5, 2, 8), (20, 1, 5), (1, 2, 6), (60, 1, 12)])
def test_contraintes(contexte, strategie, budget, cout, duree):
    plan = projeter(*contexte, ParametresPlan(budget=budget, cout=cout, duree=duree, strategie=strategie))
    places = int(budget // cout)
    assert len(plan["annees"]) == duree + 1
    for annee in plan["annees"]:
        assert len(annee["aides"]) <= places
        assert len(set(annee["aides"])) == len(annee["aides"])
        rang = {i: n for n, i in enumerate(plan["pays"])}
        assert all(annee["priorites"][rang[i]] == 1 for i in annee["aides"])
    assert plan["annees"][-1]["aides"] == []
    assert plan["synthese"]["depense"] <= budget * duree + 1e-6
    courbe = [a["effectifs"][0] for a in plan["annees"]]
    assert all(b <= a for a, b in zip(courbe, courbe[1:]))


@pytest.mark.parametrize(("budget", "duree"), [(5, 5), (5, 10), (8, 7), (10, 6), (10, 10), (15, 8), (20, 4)])
def test_la_meilleure_combinaison_n_est_jamais_battue(contexte, budget, duree):
    lignes = comparer(*contexte, ParametresPlan(budget=budget, duree=duree))
    sorties = {ligne["strategie"]: ligne["sorties"] for ligne in lignes}
    assert sorties["sorties"] == max(sorties.values())
    baisse = {ligne["strategie"]: ligne["mortalite_fin"] for ligne in lignes}
    assert baisse["urgence"] <= min(baisse.values()) + 1e-9


def test_sorties_atteint_exactement_le_nombre_possible(contexte):
    tableau, lecteur, hypotheses = contexte
    besoin = sorted(n for n in Projection(tableau, lecteur, hypotheses).annees_necessaires.values() if n)
    for budget, duree in ((10, 10), (6, 9), (4, 12)):
        possibles, total = 0, 0
        for n in besoin:
            if n <= duree and total + n <= budget * duree:
                possibles, total = possibles + 1, total + n
        plan = projeter(tableau, lecteur, hypotheses, ParametresPlan(budget=budget, duree=duree))
        assert plan["synthese"]["sorties"] >= possibles


def test_pays_imposes_et_exclus(contexte):
    plan = projeter(*contexte, ParametresPlan(imposes=["SEN"], exclus=["HTI"], strategie="urgence", duree=6))
    aides = [i for a in plan["annees"] for i in a["aides"]]
    assert "HTI" not in aides
    assert all("SEN" in a["aides"] for a in plan["annees"][:3])


def test_l_aide_ne_degrade_jamais_un_indicateur(contexte):
    tableau, lecteur, hypotheses = contexte
    projection = Projection(tableau, lecteur, hypotheses.model_copy(update={"leviers": ["mortalite", "revenu", "pib"]}))
    valeurs = projection.depart.copy()
    projection.aider(valeurs, np.flatnonzero(projection.priorites_depart == 1))
    j = projection.colonnes["revenu"]
    assert (valeurs[:, j] >= projection.depart[:, j] - 1e-9).all()


def test_besoin_compatible_avec_la_projection(contexte):
    tableau, lecteur, hypotheses = contexte
    besoin = Projection(tableau, lecteur, hypotheses).annees_necessaires
    senegal = list(tableau.index).index("SEN")
    plan = projeter(tableau, lecteur, hypotheses, ParametresPlan(budget=1, cout=1, duree=25, imposes=["SEN"]))
    sortie = next(d["sortie"] for d in plan["detail"] if d["id"] == "SEN")
    assert sortie == besoin[senegal]
