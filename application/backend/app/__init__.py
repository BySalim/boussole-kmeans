"""Boussole : l'API et le modèle.

Les jeux de données sont petits : un seul fil de calcul par K-Means est plusieurs fois plus rapide.
"""

import os

os.environ.setdefault("OMP_NUM_THREADS", "1")
