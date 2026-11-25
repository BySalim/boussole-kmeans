"""Le modèle de l'application doit donner les mêmes résultats que le notebook."""

import numpy as np
import pytest
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score
from sklearn.preprocessing import StandardScaler

from app.indicateurs import CLES, RETENUS
from app.ml.kmeans import ajuster, analyser, courbes, etapes_de_lloyd, mesurer
from app.schemas import Configuration


@pytest.fixture()
def tableau(reference):
    return reference.tableau()


def test_le_modele_de_depart_retrouve_le_notebook(tableau):
    ajustement = ajuster(tableau, Configuration())
    mesures = mesurer(ajustement.X, ajustement.priorites, ajustement.inertie)
    assert np.bincount(ajustement.priorites)[1:].tolist() == [47, 86, 34]
    assert mesures["silhouette"] == pytest.approx(0.499, abs=0.001)
    assert mesures["inertie"] == pytest.approx(224.69, abs=0.01)
    X = StandardScaler().fit_transform(tableau[list(RETENUS)].to_numpy(float))
    notebook = KMeans(n_clusters=3, n_init=10, random_state=0).fit_predict(X)
    assert adjusted_rand_score(notebook, ajustement.priorites) == 1


def test_neuf_indicateurs_isolent_le_nigeria(tableau):
    resultat = analyser(tableau, Configuration(indicateurs=list(CLES), k=5))
    assert sorted(g["effectif"] for g in resultat["groupes"]) == [1, 3, 30, 47, 86]
    assert [p["id"] for p in resultat["pays"] if p["priorite"] == 1] == ["NGA"]


def test_sans_echelle_le_revenu_decide(tableau):
    resultat = analyser(tableau, Configuration(echelle="aucune"))
    assert [g["effectif"] for g in resultat["groupes"]] == [128, 32, 7]
    assert resultat["mesures"]["silhouette"] == pytest.approx(0.70, abs=0.01)


@pytest.mark.parametrize("echelle", ["standard", "robuste", "minmax", "aucune"])
@pytest.mark.parametrize("initialisation", ["k-means++", "hasard"])
@pytest.mark.parametrize("k", [2, 5, 8])
def test_l_inertie_ne_remonte_jamais(tableau, echelle, initialisation, k):
    configuration = Configuration(echelle=echelle, initialisation=initialisation, k=k, essais=2, graine=7)
    ajustement = ajuster(tableau, configuration)
    etats = etapes_de_lloyd(ajustement)
    inerties = [e["inertie"] for e in etats]
    assert all(b <= a * (1 + 1e-9) + 1e-9 for a, b in zip(inerties, inerties[1:]))
    assert inerties[-1] == pytest.approx(ajustement.inertie, rel=1e-6)
    assert adjusted_rand_score(etats[-1]["groupes"], ajustement.priorites) == 1


def test_les_etapes_sont_limitees(tableau):
    configuration = Configuration(initialisation="hasard", etapes=3, essais=1, graine=3)
    assert len(etapes_de_lloyd(ajuster(tableau, configuration))) <= 4


def test_les_priorites_suivent_la_mortalite(tableau):
    for k in (3, 6):
        resultat = analyser(tableau, Configuration(k=k))
        mortalites = [g["moyennes"]["mortalite"] for g in resultat["groupes"]]
        assert mortalites == sorted(mortalites, reverse=True)


def test_repere_acp(tableau):
    repere = analyser(tableau, Configuration())["repere"]
    assert repere["mode"] == "acp" and repere["frontieres"] == "coupe"
    assert repere["axes"][0]["variance"] == pytest.approx(0.727, abs=0.002)
    assert len(repere["points"]) == 167
    assert len(repere["etapes"][-1]["centres"]) == 3


def test_frontieres_exactes_a_deux_indicateurs(tableau):
    configuration = Configuration(indicateurs=["revenu", "esperance"])
    repere = analyser(tableau, configuration, "revenu", "esperance")["repere"]
    assert repere["frontieres"] == "exactes"
    points, centres = np.array(repere["points"]), np.array(repere["etapes"][-1]["centres"])[:, :2]
    proches = ((points[:, None] - centres[None]) ** 2).sum(axis=2).argmin(axis=1) + 1
    assert proches.tolist() == repere["etapes"][-1]["priorites"]
    axe = repere["axes"][0]
    assert axe["centre"] + axe["pas"] * points[0, 0] == pytest.approx(tableau["revenu"].iloc[0], rel=1e-3)


def test_deux_indicateurs_dont_un_hors_modele(tableau):
    repere = analyser(tableau, Configuration(), "revenu", "inflation")["repere"]
    assert repere["frontieres"] == "aucune"
    assert repere["axes"][1] == {"cle": "inflation", "libelle": "Inflation", "centre": 0.0, "pas": 1.0}


def test_courbes_de_choix_de_k(tableau):
    resultat = courbes(tableau, Configuration())
    assert [r["k"] for r in resultat] == list(range(2, 11))
    assert max(resultat, key=lambda r: r["silhouette"])["k"] == 3
    assert min(resultat[:5], key=lambda r: r["davies_bouldin"])["k"] == 3
    assert all(0 <= r["stabilite"] <= 1 for r in resultat)


@pytest.mark.parametrize("k", [3, 4, 5])
@pytest.mark.parametrize(("initialisation", "init"), [("k-means++", "k-means++"), ("hasard", "random")])
def test_memes_groupes_que_scikit_learn(tableau, k, initialisation, init):
    for graine in (0, 1, 5):
        ajustement = ajuster(tableau, Configuration(indicateurs=list(CLES), k=k, initialisation=initialisation, graine=graine))
        direct = KMeans(k, init=init, n_init=10, random_state=graine).fit(ajustement.X)
        assert ajustement.inertie == pytest.approx(direct.inertia_, rel=1e-6)


def test_meme_graine_meme_resultat(tableau):
    a, b = (analyser(tableau, Configuration(k=5, graine=42, initialisation="hasard")) for _ in range(2))
    assert a["pays"] == b["pays"] and a["mesures"] == b["mesures"]
