"""Lance Boussole : assemble le site s'il le faut, démarre le serveur et ouvre le navigateur."""

import argparse
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

RACINE = Path(__file__).resolve().parent
FRONT = RACINE / "frontend"
BACK = RACINE / "backend"
MODULES = ("fastapi", "uvicorn", "sklearn", "pandas", "multipart")


def python_du_projet() -> str:
    for candidat in (RACINE.parent / ".venv/Scripts/python.exe", RACINE.parent / ".venv/bin/python"):
        if candidat.exists():
            return str(candidat)
    return sys.executable


def verifier_bibliotheques(python: str) -> None:
    essai = subprocess.run([python, "-c", f"import {', '.join(MODULES)}"], capture_output=True)
    if essai.returncode:
        sys.exit(f"Bibliothèques manquantes. Lancez :\n  {python} -m pip install -r {BACK / 'requirements.txt'}")


def assembler(forcer: bool) -> None:
    accueil = FRONT / "dist" / "index.html"
    if accueil.exists() and not forcer:
        sources = [p for d in ("src", "public") for p in (FRONT / d).rglob("*") if p.is_file()] + [FRONT / "index.html"]
        if max(p.stat().st_mtime for p in sources) <= accueil.stat().st_mtime:
            return
    npm = shutil.which("npm")
    if npm is None:
        if accueil.exists():
            return
        sys.exit("Node.js est nécessaire pour assembler le site : https://nodejs.org")
    if not (FRONT / "node_modules").exists():
        subprocess.run([npm, "ci"], cwd=FRONT, check=True)
    print("Assemblage du site…")
    subprocess.run([npm, "run", "build"], cwd=FRONT, check=True)


def port_libre(port: int) -> int:
    for essai in range(port, port + 20):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", essai)):
                return essai
    sys.exit("Aucun port libre.")


def ouvrir_quand_pret(adresse: str) -> None:
    for _ in range(120):
        try:
            urllib.request.urlopen(f"{adresse}/api/etat", timeout=1)
            webbrowser.open(adresse)
            return
        except OSError:
            time.sleep(0.5)


def main() -> None:
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--port", type=int, default=8420)
    options.add_argument("--reseau", action="store_true", help="accessible aux appareils du même réseau")
    options.add_argument("--assembler", action="store_true", help="assembler le site même s'il est à jour")
    options.add_argument("--sans-navigateur", action="store_true")
    choix = options.parse_args()

    python = python_du_projet()
    verifier_bibliotheques(python)
    assembler(choix.assembler)
    port = port_libre(choix.port)
    adresse = f"http://127.0.0.1:{port}"
    print(f"Boussole est disponible sur {adresse}  (Ctrl C pour arrêter)")
    if not choix.sans_navigateur:
        threading.Thread(target=ouvrir_quand_pret, args=(adresse,), daemon=True).start()
    commande = [python, "-m", "uvicorn", "app.main:app", "--port", str(port), "--log-level", "warning"]
    commande += ["--host", "0.0.0.0" if choix.reseau else "127.0.0.1"]
    try:
        subprocess.run(commande, cwd=BACK, env={**os.environ, "PYTHONUTF8": "1"}, check=False)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
