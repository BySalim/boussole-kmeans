"""Point d'entrée : API et site assemblé sur la même adresse."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse

from .erreurs import ErreurMetier
from .config import DOSSIER_SITE
from .routes import organisation, simulation
from .travail import Travail, modele_de_reference


# Prêt avant la première visite.
modele_de_reference()
Travail().situation()

app = FastAPI(title="Boussole", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(organisation.routes)
app.include_router(simulation.routes)


@app.middleware("http")
async def entetes(requete: Request, suivant):
    reponse = await suivant(requete)
    reponse.headers["X-Content-Type-Options"] = "nosniff"
    reponse.headers["Referrer-Policy"] = "same-origin"
    reponse.headers["X-Frame-Options"] = "DENY"
    reponse.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if requete.url.path.startswith("/api"):
        reponse.headers["Cache-Control"] = "no-store"
    return reponse


@app.exception_handler(ErreurMetier)
async def erreur_metier(_: Request, erreur: ErreurMetier):
    return JSONResponse({"detail": erreur.message}, status_code=erreur.statut)


@app.exception_handler(RequestValidationError)
async def erreur_de_saisie(_: Request, erreur: RequestValidationError):
    details = erreur.errors()
    message = "Une valeur saisie n’est pas valable."
    for detail in details:
        if detail.get("type") == "value_error":
            message = str(detail.get("msg", "")).removeprefix("Value error, ") or message
            break
    champs = [".".join(str(p) for p in d.get("loc", ()) if p != "body") for d in details]
    return JSONResponse({"detail": message, "champs": champs}, status_code=422)


@app.get("/{chemin:path}", include_in_schema=False)
def site(chemin: str):
    if chemin.startswith("api/"):
        return JSONResponse({"detail": "Cette adresse n’existe pas."}, status_code=404)
    racine = DOSSIER_SITE.resolve()
    fichier = (racine / chemin).resolve()
    if chemin and fichier.is_file() and fichier.is_relative_to(racine):
        cache = "public, max-age=31536000, immutable" if chemin.startswith("assets/") else "no-cache"
        return FileResponse(fichier, headers={"Cache-Control": cache})
    accueil = racine / "index.html"
    if accueil.is_file():
        return FileResponse(accueil, headers={"Cache-Control": "no-cache"})
    return PlainTextResponse("Le site n’est pas encore assemblé.", status_code=503)
