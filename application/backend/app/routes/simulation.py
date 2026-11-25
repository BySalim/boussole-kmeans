"""Routes de la simulation : laboratoire, recherche, modèles et données."""

from fastapi import APIRouter, Response, UploadFile

from ..donnees import lire_csv, reference, valeurs
from ..erreurs import ErreurMetier
from ..indicateurs import INDICATEURS
from ..ml import kmeans
from ..ml.recherche import COMBINAISONS_MAX, essayer_un_lot, nombre_d_essais
from ..schemas import Demande, DemandeLaboratoire, DemandeModele, DemandeRecherche, LotRecherche
from ..sorties import reponse_csv
from ..travail import Travail

routes = APIRouter(prefix="/api/simulation")
TAILLE_CSV_MAX = 500_000


@routes.post("/laboratoire")
def laboratoire(demande: DemandeLaboratoire) -> dict:
    t = Travail(demande.contexte)
    return t.memoriser(
        "laboratoire",
        lambda: kmeans.analyser(t.tableau(), demande.configuration, demande.axe_x, demande.axe_y, t.priorites()),
        demande,
    )


@routes.post("/courbes")
def courbes(demande: DemandeModele) -> list[dict]:
    t = Travail(demande.contexte)
    return t.memoriser("courbes", lambda: kmeans.courbes(t.tableau(), demande.configuration), demande.configuration, donnees_seules=True)


@routes.post("/modeles")
def entrainer(demande: DemandeModele) -> dict:
    return Travail(demande.contexte).entrainer(demande.configuration)


@routes.post("/recherche/estimer")
def estimer(demande: DemandeRecherche) -> dict:
    return {"essais": nombre_d_essais(demande), "maximum": COMBINAISONS_MAX}


@routes.post("/recherche")
def rechercher(demande: LotRecherche) -> dict:
    if nombre_d_essais(demande.recherche) > COMBINAISONS_MAX:
        raise ErreurMetier("Cette recherche est trop large. Réduisez les indicateurs ou les groupes.")
    t = Travail(demande.contexte)
    return essayer_un_lot(t.tableau(), demande.recherche, t.priorites(), demande.depart)


@routes.post("/donnees/lire")
async def lire_fichier(fichier: UploadFile) -> dict:
    contenu = await fichier.read(TAILLE_CSV_MAX + 1)
    if len(contenu) > TAILLE_CSV_MAX:
        raise ErreurMetier("Ce fichier dépasse 500 Ko.")
    try:
        texte = contenu.decode("utf-8")
    except UnicodeDecodeError:
        raise ErreurMetier("Ce fichier n’est pas un CSV encodé en UTF-8.") from None
    return {p["id"]: valeurs(p) for p in lire_csv(texte)}


@routes.post("/donnees/export")
def exporter(demande: Demande) -> Response:
    tableau = Travail(demande.contexte).tableau()
    sources = {p["id"]: p["nom_source"] for p in reference()}
    lignes = [
        (sources[identifiant], *(f"{ligne[i.cle]:g}" for i in INDICATEURS)) for identifiant, ligne in tableau.iterrows()
    ]
    return reponse_csv("Country-data.csv", ["country", *(i.colonne for i in INDICATEURS)], lignes, ",")
