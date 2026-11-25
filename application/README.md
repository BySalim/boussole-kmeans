# Boussole

Boussole aide une ONG à décider où l'aide doit aller en premier. Un modèle K-Means répartit 167 pays en groupes de priorité à partir de leurs indicateurs ; l'organisation explore la carte, prépare un plan d'aide et en compare les effets. L'espace de simulation permet de changer tous les réglages du modèle et de voir aussitôt ce qu'ils changent.

## Lancer

Double-cliquer sur `Boussole.cmd`, à la racine du projet, ou :

```powershell
.venv\Scripts\python application\demarrer.py
```

Le site s'ouvre sur <http://127.0.0.1:8420>. Il fonctionne sans Internet. Options : `--reseau` (téléphones du même Wi-Fi), `--port`, `--assembler`, `--sans-navigateur`.

Première installation : `pip install -r application/backend/requirements.txt`, puis `npm ci` dans `application/frontend`.

## Architecture

```
frontend/   React et TypeScript : écrans, carte, repère, graphiques
   │  HTTP, /api
backend/    FastAPI : validation et règles
   ├─ app/ml/       Scikit-learn : entraînement, lecture d'un pays, plans, recherche de réglages
   └─ app/Country-data.csv    les données de référence
```

| Fichier | Rôle |
| --- | --- |
| `app/ml/kmeans.py` | Entraînement, mesures, étapes de Lloyd, repère et frontières |
| `app/ml/fiche.py` | Distances aux centres, frontière, leviers, pays semblables |
| `app/ml/plan.py` | Stratégies, meilleure combinaison, projection année par année |
| `app/ml/recherche.py` | Essai automatique de milliers de réglages |
| `app/travail.py` | Une demande : données, modèle publié et hypothèses du visiteur |
| `app/routes/` | API de l'organisation et de la simulation |

La documentation de l'API est sur `/api/docs`.

## Espace du visiteur

Le serveur calcule et ne garde rien. Les modèles, les données modifiées, les hypothèses et les plans restent dans le navigateur du visiteur, qui les envoie avec chaque demande. Chacun administre donc librement son espace, sans effet sur les autres.

## Mise en ligne

`vercel.json`, à la racine du projet, décrit les deux services : le site et l'API. Aucune base de données ni variable n'est nécessaire.

## Tests

```powershell
cd application\backend
..\..\.venv\Scripts\python -m pytest
```

Ils vérifient notamment que le modèle de départ donne les mêmes groupes que le notebook (47, 86 et 34 pays) et que la meilleure combinaison d'aide n'est battue par aucune autre stratégie.

## Hypothèses du plan d'aide

Un pays aidé rattrape chaque année une part de son retard sur la moyenne de la priorité 2, sur les indicateurs choisis. Ce rythme se règle : il décrit un scénario, pas une prévision.
