"""Formes des requêtes reçues par l'API."""

import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .indicateurs import CLES, RETENUS

Cle = Literal["mortalite", "esperance", "fecondite", "revenu", "pib", "sante", "inflation", "exportations", "importations"]
Echelle = Literal["standard", "robuste", "minmax", "aucune"]
Strategie = Literal["sorties", "urgence", "seuil", "rotation"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Configuration(Strict):
    indicateurs: list[Cle] = Field(default=list(RETENUS), min_length=2, max_length=9)
    echelle: Echelle = "standard"
    k: int = Field(default=3, ge=2, le=8)
    initialisation: Literal["k-means++", "hasard"] = "k-means++"
    etapes: int = Field(default=100, ge=1, le=100)
    essais: int = Field(default=10, ge=1, le=25)
    graine: int = Field(default=0, ge=0, le=999)

    @field_validator("indicateurs")
    @classmethod
    def _sans_doublon(cls, valeur):
        return [c for c in CLES if c in set(valeur)]


class DemandeLaboratoireSeule(Strict):
    configuration: Configuration
    axe_x: Cle | None = None
    axe_y: Cle | None = None

    @model_validator(mode="after")
    def _axes_distincts(self):
        if self.axe_x and self.axe_x == self.axe_y:
            raise ValueError("Choisissez deux axes différents.")
        return self


class DemandeRecherche(Strict):
    indicateurs: list[Cle] = Field(default=list(CLES), min_length=2, max_length=9)
    taille_min: int = Field(default=3, ge=2, le=9)
    taille_max: int = Field(default=6, ge=2, le=9)
    echelles: list[Echelle] = Field(default=["standard", "robuste"], min_length=1, max_length=4)
    k_min: int = Field(default=2, ge=2, le=8)
    k_max: int = Field(default=6, ge=2, le=8)
    effectif_min: int = Field(default=10, ge=1, le=50)
    critere: Literal["silhouette", "silhouette_commune", "davies_bouldin", "calinski_harabasz"] = "silhouette"

    @model_validator(mode="after")
    def _bornes(self):
        if self.taille_min > self.taille_max:
            raise ValueError("Le nombre minimal d’indicateurs dépasse le maximum.")
        if self.k_min > self.k_max:
            raise ValueError("Le nombre minimal de groupes dépasse le maximum.")
        if self.taille_min > len(self.indicateurs):
            raise ValueError("Sélectionnez davantage d’indicateurs.")
        return self


Identifiant = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]


class ParametresPlan(Strict):
    budget: float = Field(default=10, ge=0.5, le=500)
    cout: float = Field(default=1, ge=0.1, le=100)
    duree: int = Field(default=10, ge=1, le=25)
    strategie: Strategie = "sorties"
    imposes: list[Identifiant] = Field(default=[], max_length=60)
    exclus: list[Identifiant] = Field(default=[], max_length=60)


class Valeurs(Strict):
    mortalite: float | None = Field(default=None, ge=0, le=1000)
    esperance: float | None = Field(default=None, ge=0, le=120)
    fecondite: float | None = Field(default=None, ge=0, le=15)
    revenu: float | None = Field(default=None, ge=0, le=1_000_000)
    pib: float | None = Field(default=None, ge=0, le=1_000_000)
    sante: float | None = Field(default=None, ge=0, le=100)
    inflation: float | None = Field(default=None, ge=-100, le=10_000)
    exportations: float | None = Field(default=None, ge=0, le=1000)
    importations: float | None = Field(default=None, ge=0, le=1000)

    def fournies(self) -> dict[str, float]:
        return {c: v for c, v in self.model_dump().items() if v is not None}


class Hypotheses(Strict):
    progres: float = Field(default=0.2, ge=0.01, le=0.9)
    leviers: list[Cle] = Field(default=["mortalite", "esperance", "fecondite"], min_length=1, max_length=9)
    budget: float = Field(default=10, ge=0.5, le=500)
    cout: float = Field(default=1, ge=0.1, le=100)
    duree: int = Field(default=10, ge=1, le=25)


class ParametresModele(Strict):
    """Un modèle entraîné, réduit à ce qu'il faut pour lire un pays."""

    indicateurs: list[Cle] = Field(min_length=2, max_length=9)
    origine: list[float]
    pas: list[float]
    centres: list[list[float]] = Field(min_length=2, max_length=8)

    @model_validator(mode="after")
    def _dimensions(self):
        p = len(self.indicateurs)
        rangees = [self.origine, self.pas, *self.centres]
        if len(set(self.indicateurs)) != p or any(len(r) != p or not all(map(math.isfinite, r)) for r in rangees) or 0 in self.pas:
            raise ValueError("Ce modèle n’est pas lisible.")
        return self


class Contexte(Strict):
    """Ce que le visiteur a changé : ses données, son modèle publié, ses hypothèses. Gardé dans son navigateur."""

    donnees: dict[Identifiant, Valeurs] = Field(default={}, max_length=200)
    remplacees: bool = False
    modele: ParametresModele | None = None
    hypotheses: Hypotheses = Field(default_factory=Hypotheses)


class Demande(Strict):
    contexte: Contexte = Field(default_factory=Contexte)


class DemandePlan(Demande):
    parametres: ParametresPlan = Field(default_factory=ParametresPlan)


class DemandeSimulation(Demande):
    valeurs: Valeurs


class DemandeLaboratoire(DemandeLaboratoireSeule, Demande):
    pass


class DemandeModele(Demande):
    configuration: Configuration


class LotRecherche(Demande):
    recherche: DemandeRecherche
    depart: int = Field(default=0, ge=0, le=12_000)
