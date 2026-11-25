# Boussole : où envoyer l'aide en premier ?

Projet K-Means : regrouper 167 pays selon leurs conditions de vie pour aider une organisation humanitaire à choisir ses priorités.

- **`projet_kmeans_pays.ipynb`** : le notebook, K-Means étape par étape.
- **`application/`** : Boussole, l'application web qui utilise le modèle.

Données : [Unsupervised Learning on Country Data](https://www.kaggle.com/datasets/rohan0301/unsupervised-learning-on-country-data) (Kaggle).

## Notebook

```
pip install -r requirements.txt
jupyter notebook projet_kmeans_pays.ipynb
```

## Application

Il faut Python 3.12 et Node.js 20 ou plus récent.

```
python -m venv .venv
.venv\Scripts\python -m pip install -r application\backend\requirements.txt
.venv\Scripts\python application\demarrer.py
```

Sous Windows, une fois l'installation faite, un double-clic sur `Boussole.cmd` suffit. Les détails sont dans [application/README.md](application/README.md).
