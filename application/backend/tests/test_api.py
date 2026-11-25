"""L'API, vue de l'extérieur. Chaque demande porte son contexte ; le serveur ne garde rien."""

from pathlib import Path

import pytest

from app import travail

SEN_MIEUX = {"SEN": {"mortalite": 20, "esperance": 74, "fecondite": 2.5, "revenu": 12000}}


def demander(client, adresse, contexte=None, **corps):
    r = client.post(f"/api{adresse}", json={"contexte": contexte or {}, **corps})
    assert r.status_code == 200, r.text
    return r.json()


def effectifs(client, contexte=None):
    return [g["effectif"] for g in demander(client, "/situation", contexte)["groupes"]]


def valeurs_de(client, pays, contexte=None):
    return next(p for p in demander(client, "/situation", contexte)["pays"] if p["id"] == pays)["valeurs"]


def test_referentiel(client):
    r = client.get("/api/referentiel").json()
    assert len(r["indicateurs"]) == 9 and len(r["pays"]) == 167
    assert r["hypotheses"]["progres"] == 0.2
    assert [g["effectif"] for g in r["modele"]["mesures"]["groupes"]] == [47, 86, 34]


def test_situation(client):
    s = demander(client, "/situation")
    assert len(s["pays"]) == 167 and effectifs(client) == [47, 86, 34]
    assert all(p["marge"] >= 0 and p["profondeur"] >= 0 for p in s["pays"])


def test_fiche_senegal(client):
    f = demander(client, "/pays/SEN")
    assert f["priorite"] == 1
    assert f["distances"][0] == pytest.approx(0.86, abs=0.01)
    assert f["distances"][1] == pytest.approx(2.48, abs=0.01)
    leviers = {levier["indicateur"]: levier for levier in f["leviers"]["seuls"]}
    assert leviers["mortalite"]["requis"] < 10
    assert leviers["fecondite"]["atteignable"]
    assert 78 < leviers["esperance"]["requis"] < 82.8
    assert 0 < f["leviers"]["ensemble"]["part"] < 1
    assert len(f["semblables"]) == 5
    assert 0 < f["profondeur"] < 3
    assert sum(c["valeur"] for c in f["contributions"]) == pytest.approx(f["distances"][1] ** 2 - f["distances"][0] ** 2)


def test_levier_seul_fait_vraiment_changer_de_groupe(client):
    for pays in ("SEN", "GHA", "KEN", "ZAF", "PAK"):
        f = demander(client, f"/pays/{pays}")
        for levier in f["leviers"]["seuls"]:
            if levier["atteignable"]:
                actuel = valeurs_de(client, pays)[levier["indicateur"]]
                sens = 1 if levier["requis"] > actuel else -1
                valeur = levier["requis"] + sens * abs(levier["requis"] - actuel) * 0.02
                r = demander(client, f"/pays/{pays}/simuler", valeurs={levier["indicateur"]: valeur})
                assert r["priorite"] != f["priorite"], (pays, levier)


def test_simulation_d_un_pays(client):
    assert demander(client, "/pays/SEN/simuler", valeurs=SEN_MIEUX["SEN"])["priorite"] == 2
    assert demander(client, "/pays/SEN/simuler", valeurs={"revenu": 30000})["priorite"] == 1


def test_pays_inconnu(client):
    r = client.post("/api/pays/ZZZ", json={})
    assert r.status_code == 404 and "données" in r.json()["detail"]


@pytest.mark.parametrize("parametres", [{"budget": -1}, {"duree": 0}, {"strategie": "magie"}, {"imposes": ["SENEGAL"]}, {"inconnu": 1}])
def test_parametres_refuses(client, parametres):
    r = client.post("/api/plans/calculer", json={"parametres": parametres})
    assert r.status_code == 422 and r.json()["detail"]


def test_comparaison(client):
    lignes = demander(client, "/plans/comparer", parametres={"budget": 10, "duree": 10})
    assert len(lignes) == 4 and all(len(ligne["courbe"]) == 11 for ligne in lignes)


def test_exports(client):
    plan = client.post("/api/plans/export", json={"parametres": {"duree": 5}})
    assert plan.headers["content-type"].startswith("text/csv")
    assert len(plan.content.decode("utf-8-sig").strip().splitlines()) == 51
    pays = client.post("/api/export/pays", json={})
    assert len(pays.content.decode("utf-8-sig").strip().splitlines()) == 168


def test_laboratoire(client):
    d = demander(client, "/simulation/laboratoire", configuration={"k": 4})
    assert len(d["groupes"]) == 4 and len(d["pays"]) == 167
    assert 0 < d["mesures"]["accord_modele_publie"] < 1
    assert demander(client, "/simulation/laboratoire", configuration={})["mesures"]["accord_modele_publie"] == 1
    r = client.post("/api/simulation/laboratoire", json={"configuration": {"indicateurs": ["revenu"]}})
    assert r.status_code == 422


def test_publier_un_modele_change_la_situation(client):
    modele = demander(client, "/simulation/modeles", configuration={"k": 4})
    assert effectifs(client, {"modele": modele["parametres"]}) == [28, 40, 72, 27]
    assert [g["effectif"] for g in modele["mesures"]["groupes"]] == [28, 40, 72, 27]
    assert effectifs(client) == [47, 86, 34]


@pytest.mark.parametrize("echelle", ["standard", "robuste", "minmax", "aucune"])
@pytest.mark.parametrize("k", [2, 3, 5, 8])
def test_un_modele_envoye_se_lit_exactement(client, echelle, k):
    modele = demander(client, "/simulation/modeles", configuration={"k": k, "echelle": echelle})
    assert effectifs(client, {"modele": modele["parametres"]}) == [g["effectif"] for g in modele["mesures"]["groupes"]]


def test_modifier_les_donnees(client):
    contexte = {"donnees": SEN_MIEUX}
    assert next(p for p in demander(client, "/situation", contexte)["pays"] if p["id"] == "SEN")["priorite"] == 2
    assert valeurs_de(client, "SEN")["mortalite"] == 66.8
    assert valeurs_de(client, "SEN", {"donnees": {"SEN": {"mortalite": 20}}})["esperance"] == 64


def test_les_visiteurs_ne_se_melangent_pas(client):
    """Deux contextes qui se croisent : chacun ne voit que le sien, et rien ne reste après."""
    quatre = {"modele": demander(client, "/simulation/modeles", configuration={"k": 4})["parametres"]}
    for _ in range(3):
        assert len(effectifs(client, quatre)) == 4
        assert effectifs(client) == [47, 86, 34]
        assert valeurs_de(client, "SEN", {"donnees": {"SEN": {"mortalite": 10}}})["mortalite"] == 10
        assert valeurs_de(client, "SEN", {"donnees": {"SEN": {"mortalite": 30}}})["mortalite"] == 30
        assert valeurs_de(client, "SEN")["mortalite"] == 66.8


def test_le_serveur_peut_tout_oublier(client):
    contexte = {"donnees": SEN_MIEUX, "modele": demander(client, "/simulation/modeles", configuration={"k": 5})["parametres"]}
    avant = demander(client, "/situation", contexte)
    travail._cache.clear()
    assert demander(client, "/situation", contexte) == avant


def test_hypotheses(client):
    def sorties(contexte=None):
        return demander(client, "/plans/calculer", contexte, parametres={"duree": 10})["synthese"]["sorties"]

    assert sorties({"hypotheses": {"progres": 0.5}}) > sorties() == 34


def test_import_export_aller_retour(client):
    contenu = client.post("/api/simulation/donnees/export", json={}).content
    r = client.post("/api/simulation/donnees/lire", files={"fichier": ("donnees.csv", contenu, "text/csv")})
    assert r.status_code == 200 and len(r.json()) == 167
    assert effectifs(client, {"donnees": r.json(), "remplacees": True}) == [47, 86, 34]
    partiel = "\n".join(contenu.decode("utf-8-sig").strip().splitlines()[:61]).encode()
    lu = client.post("/api/simulation/donnees/lire", files={"fichier": ("x.csv", partiel, "text/csv")}).json()
    contexte = {"donnees": lu, "remplacees": True}
    assert len(demander(client, "/situation", contexte)["pays"]) == 60
    demander(client, "/plans/calculer", contexte)
    demander(client, "/simulation/laboratoire", contexte, configuration={})


@pytest.mark.parametrize(("contenu", "attendu"), [
    (b"country,child_mort\nFrance,3", "Colonnes absentes"),
    (b"\xff\xfe\x00", "UTF-8"),
])
def test_import_refuse(client, contenu, attendu):
    r = client.post("/api/simulation/donnees/lire", files={"fichier": ("x.csv", contenu, "text/csv")})
    assert r.status_code == 400 and attendu in r.json()["detail"]


@pytest.mark.parametrize("contexte", [
    {"donnees": {"ZZZ": {"mortalite": 1}}},
    {"remplacees": True},
    {"donnees": {"SEN": {"mortalite": -5}}},
    {"hypotheses": {"progres": 2}},
    {"inconnu": 1},
    {"modele": {"indicateurs": ["pib", "revenu"], "origine": [0, 0], "pas": [1, 0], "centres": [[0, 0], [1, 1]]}},
    {"modele": {"indicateurs": ["pib", "revenu"], "origine": [0], "pas": [1, 1], "centres": [[0, 0], [1, 1]]}},
    {"modele": {"indicateurs": ["pib", "pib"], "origine": [0, 0], "pas": [1, 1], "centres": [[0, 0], [1, 1]]}},
])
def test_contexte_illisible_refuse(client, contexte):
    r = client.post("/api/situation", json={"contexte": contexte})
    assert r.status_code == 422 and r.json()["detail"]


RECHERCHE = {"indicateurs": ["mortalite", "esperance", "revenu", "pib"], "taille_min": 2, "taille_max": 4, "echelles": ["standard"], "k_min": 2, "k_max": 4}


def test_recherche(client):
    assert client.post("/api/simulation/recherche/estimer", json=RECHERCHE).json()["essais"] == 33
    depart, lots = 0, 0
    while depart is not None:
        lot = demander(client, "/simulation/recherche", recherche=RECHERCHE, depart=depart)
        scores = [r["silhouette"] for r in lot["resultats"]]
        assert scores == sorted(scores, reverse=True) and all(min(r["effectifs"]) >= 10 for r in lot["resultats"])
        depart, lots = lot["suite"], lots + 1
        assert lots < 100
    assert lot["faites"] == lot["total"] == 33


def test_la_recherche_par_lots_donne_le_meme_resultat(client, monkeypatch):
    monkeypatch.setattr("app.ml.recherche.DUREE_LOT", 60)
    entier = demander(client, "/simulation/recherche", recherche=RECHERCHE)
    assert entier["suite"] is None
    monkeypatch.setattr("app.ml.recherche.DUREE_LOT", 0)
    depart, resultats, ecartees = 0, [], 0
    while depart is not None:
        lot = demander(client, "/simulation/recherche", recherche=RECHERCHE, depart=depart)
        assert lot["suite"] in (None, depart + 1)
        depart, resultats, ecartees = lot["suite"], resultats + lot["resultats"], ecartees + lot["ecartees"]
    assert sorted(map(str, resultats)) == sorted(map(str, entier["resultats"])) and ecartees == entier["ecartees"]


def test_le_fichier_embarque_est_celui_du_notebook():
    from app.config import CSV_ORIGINE, DOSSIER_PROJET

    original = Path(DOSSIER_PROJET) / "Country-data.csv"
    if original.exists():
        assert original.read_text(encoding="utf-8") == CSV_ORIGINE.read_text(encoding="utf-8")
