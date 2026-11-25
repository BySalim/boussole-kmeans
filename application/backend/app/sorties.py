"""Fichiers CSV remis au visiteur."""

import csv
import io

from fastapi import Response


def reponse_csv(nom: str, entetes: list[str], lignes, separateur: str = ";") -> Response:
    sortie = io.StringIO()
    redacteur = csv.writer(sortie, delimiter=separateur, lineterminator="\r\n")
    redacteur.writerow(entetes)
    redacteur.writerows(lignes)
    return Response(
        "\ufeff" + sortie.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nom}"'},
    )


def nombre(valeur: float, decimales: int) -> str:
    return f"{valeur:.{decimales}f}".replace(".", ",")
