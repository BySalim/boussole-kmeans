"""Les neuf indicateurs du jeu de données et leur description."""

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Indicateur:
    cle: str
    colonne: str
    libelle: str
    court: str
    unite: str
    sens: int
    decimales: int
    definition: str


INDICATEURS = (
    Indicateur("mortalite", "child_mort", "Mortalité infantile", "Mortalité", "‰", -1, 1,
               "Décès avant 5 ans pour 1 000 naissances"),
    Indicateur("esperance", "life_expec", "Espérance de vie", "Espérance de vie", "ans", 1, 1,
               "Années de vie attendues à la naissance"),
    Indicateur("fecondite", "total_fer", "Fécondité", "Fécondité", "enfants", -1, 2,
               "Nombre d’enfants par femme"),
    Indicateur("revenu", "income", "Revenu par personne", "Revenu", "$", 1, 0,
               "Revenu net par personne"),
    Indicateur("pib", "gdpp", "PIB par habitant", "PIB", "$", 1, 0,
               "Produit intérieur brut par habitant"),
    Indicateur("sante", "health", "Dépenses de santé", "Santé", "% du PIB", 1, 1,
               "Dépenses de santé, en part du PIB"),
    Indicateur("inflation", "inflation", "Inflation", "Inflation", "%", -1, 1,
               "Hausse annuelle des prix mesurée sur le PIB"),
    Indicateur("exportations", "exports", "Exportations", "Exportations", "% du PIB", 1, 1,
               "Exportations de biens et services, en part du PIB"),
    Indicateur("importations", "imports", "Importations", "Importations", "% du PIB", 1, 1,
               "Importations de biens et services, en part du PIB"),
)

CLES = tuple(i.cle for i in INDICATEURS)
PAR_CLE = {i.cle: i for i in INDICATEURS}
RETENUS = ("mortalite", "esperance", "fecondite", "revenu", "pib")


def description() -> list[dict]:
    return [{k: v for k, v in asdict(i).items() if k != "colonne"} for i in INDICATEURS]
