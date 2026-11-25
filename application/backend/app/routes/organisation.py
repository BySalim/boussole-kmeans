"""Routes de l'interface de l'organisation."""

from fastapi import APIRouter, Response

from ..donnees import reference, valeurs
from ..erreurs import ErreurMetier
from ..indicateurs import CLES, INDICATEURS, PAR_CLE, RETENUS, description
from ..ml import plan as moteur_plan
from ..schemas import Demande, DemandePlan, DemandeSimulation, Hypotheses
from ..sorties import nombre, reponse_csv
from ..travail import Travail, modele_de_reference

routes = APIRouter(prefix="/api")


@routes.get("/etat")
def etat() -> dict:
    return {"etat": "ok"}


@routes.get("/referentiel")
def referentiel() -> dict:
    modele = modele_de_reference()
    return {
        "indicateurs": description(),
        "retenus": list(RETENUS),
        "strategies": moteur_plan.STRATEGIES,
        "hypotheses": Hypotheses().model_dump(),
        "pays": [{"id": p["id"], "nom": p["nom"], "region": p["region"], "valeurs": valeurs(p)} for p in reference()],
        "modele": {c: modele[c] for c in ("configuration", "mesures")},
    }


@routes.post("/situation")
def situation(demande: Demande) -> dict:
    t = Travail(demande.contexte)
    return t.memoriser("situation", t.situation)


def _verifier_pays(t: Travail, identifiant: str) -> str:
    identifiant = identifiant.upper()
    if identifiant not in t.tableau().index:
        raise ErreurMetier("Ce pays ne figure pas dans les données.", 404)
    return identifiant


@routes.post("/pays/{identifiant}")
def fiche(identifiant: str, demande: Demande) -> dict:
    t = Travail(demande.contexte)
    identifiant = _verifier_pays(t, identifiant)
    donnees, lecteur = t.tableau(), t.lecteur()
    rangs = {
        c: int(donnees[c].rank(ascending=PAR_CLE[c].sens > 0, method="min")[identifiant]) for c in CLES
    }
    return {
        "id": identifiant,
        **lecteur.lire(donnees, donnees.loc[identifiant], t.hypotheses.progres),
        "rangs": rangs,
        "effectif_total": len(donnees),
        "semblables": lecteur.semblables(donnees, identifiant),
        "indicateurs_modele": lecteur.indicateurs,
    }


@routes.post("/pays/{identifiant}/simuler")
def simuler_pays(identifiant: str, demande: DemandeSimulation) -> dict:
    t = Travail(demande.contexte)
    identifiant = _verifier_pays(t, identifiant)
    donnees = t.tableau()
    modifiees = donnees.loc[identifiant, list(CLES)].copy()
    for cle, valeur in demande.valeurs.fournies().items():
        modifiees[cle] = valeur
    return t.lecteur().lire(donnees, modifiees, t.hypotheses.progres)


def _projeter(t: Travail, demande: DemandePlan) -> dict:
    return t.memoriser(
        "plan", lambda: moteur_plan.projeter(t.tableau(), t.lecteur(), t.hypotheses, demande.parametres), demande.parametres
    )


@routes.post("/plans/calculer")
def calculer(demande: DemandePlan) -> dict:
    return _projeter(Travail(demande.contexte), demande)


@routes.post("/plans/comparer")
def comparer(demande: DemandePlan) -> list[dict]:
    t = Travail(demande.contexte)
    return t.memoriser(
        "comparaison", lambda: moteur_plan.comparer(t.tableau(), t.lecteur(), t.hypotheses, demande.parametres), demande.parametres
    )


# --- Exports ------------------------------------------------------------------

@routes.post("/plans/export")
def exporter_plan(demande: DemandePlan) -> Response:
    t = Travail(demande.contexte)
    resultat = _projeter(t, demande)
    noms = t.tableau()["nom"]
    lignes = [
        (annee["annee"] + 1, noms[identifiant], nombre(demande.parametres.cout, 2),
         *(nombre(v, 2) for v in annee["leviers"].get(identifiant, {}).values()))
        for annee in resultat["annees"]
        for identifiant in annee["aides"]
    ]
    leviers = [PAR_CLE[c].libelle for c in t.hypotheses.leviers]
    return reponse_csv("plan-d-aide.csv", ["Année", "Pays aidé", "Aide (M$)", *leviers], lignes)


@routes.post("/export/pays")
def exporter_pays(demande: Demande) -> Response:
    lignes = [
        (p["nom"], p["region"], p["priorite"], nombre(p["marge"], 3),
         *(nombre(p["valeurs"][i.cle], i.decimales) for i in INDICATEURS))
        for p in sorted(situation(demande)["pays"], key=lambda p: (p["priorite"], -p["valeurs"]["mortalite"]))
    ]
    entetes = ["Pays", "Région", "Priorité", "Distance à la frontière", *(i.libelle for i in INDICATEURS)]
    return reponse_csv("pays-par-priorite.csv", entetes, lignes)
