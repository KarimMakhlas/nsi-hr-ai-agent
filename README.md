# NSI HR Mini Système Agentique

Assistant RH/Data pour interroger, analyser et comparer les KPI de recrutement du T3 2024.

## Contexte métier

Chez NSI, le suivi du recrutement repose aujourd'hui sur un **reporting Excel** : candidats contactés, entretiens, présentations client, recrutements, refus, etc. Ces chiffres existent, mais ils restent **statiques** — difficiles à interroger rapidement, à comparer entre recruteuses ou à relier à une analyse actionnable.

Ce projet répond à un besoin concret : **donner aux équipes RH et aux managers un accès direct à leurs KPI**, en langage naturel, sans perdre la fiabilité des chiffres source.

Concrètement, il transforme le fichier Excel du T3 2024 en :

- un **cockpit de pilotage** (vue d'ensemble, tunnel de conversion, comparaison des recruteuses) ;
- un **assistant conversationnel** capable de répondre à des questions métier ;
- une **API** réutilisable pour d'autres usages (reporting, intégrations, démos).

Période couverte : **T3 2024**. Recruteuses suivies : **Inès**, **Mariéme**, **Pauline**, **Samya**.

## Ce que le système apporte

| Besoin métier | Réponse du système |
| --- | --- |
| « Quels sont nos chiffres clés du trimestre ? » | KPI globaux et taux de conversion calculés depuis l'Excel |
| « Comment se compare Inès par rapport à Pauline ? » | Comparaison par recruteuse sur les mêmes indicateurs |
| « Où perd-on des candidats dans le parcours ? » | Analyse des frictions du tunnel de recrutement |
| « Sommes-nous alignés avec le marché ? » | Mise en perspective avec des tendances externes (recherche web) |
| « D'où viennent ces chiffres ? » | Source KPI tracée, agent utilisé et parcours d'exécution visibles |

L'objectif n'est pas de remplacer l'Excel source, mais de le **rendre exploitable** : lecture rapide, comparaisons, interprétation et transparence sur la façon dont chaque réponse est produite.

## Questions types

Le système sait traiter des demandes comme :

- des **questions factuelles** sur les KPI globaux ;
- des **questions par recruteuse** ou entre deux recruteuses ;
- des **demandes d'analyse** sur le tunnel de recrutement ;
- des **comparaisons avec le marché** lorsque la recherche web est disponible.

Quatre questions sont prévues pour la démonstration :

1. `Donne-moi les 4 KPI clés du T3 2024.`
2. `Compare Inès et Pauline sur les mêmes indicateurs.`
3. `Où se situe la principale friction du parcours de recrutement ?`
4. `Compare nos KPI aux tendances du recrutement IA/Data en France.`

## Principe de confiance

> **Python calcule. Le LLM explique.**

Les KPI ne sont **jamais inventés** par le modèle. Ils sont toujours calculés de façon déterministe à partir de l'Excel. Le LLM intervient pour comprendre la question, choisir le bon agent et formuler la réponse — pas pour produire les chiffres.

C'est ce qui permet de concilier **facilité d'usage** (langage naturel) et **crédibilité métier** (chiffres vérifiables).

## Architecture

<img src="docs/NSI_France_Agentic_Workflow.svg" alt="Architecture Diagram">

### Routes agentiques

| Route | Rôle | Exemples |
| --- | --- | --- |
| `kpi_agent` | Réponses factuelles et comparaisons internes | `Combien de candidats avons-nous contactés ?`, `Compare Inès et Pauline` |
| `analysis_agent` | Interprétation métier et recommandations | `Quels sont les points de friction ?`, `Que recommandes-tu ?` |
| `web_agent` | Comparaison avec le marché ou tendances externes | `Compare nos KPI avec les tendances du recrutement en France` |

Chaque réponse expose la route choisie, la raison du routage, le chemin d'exécution et les sources utilisées.

### Composants techniques

- `backend/app/services/kpi_service.py` — lecture Excel et calcul des KPI
- `backend/app/mcp_server/server.py` — exposition des KPI comme outils MCP
- `backend/app/agents/graph.py` — orchestration LangGraph
- `backend/app/services/llm_service.py` — routage et génération via NVIDIA NIM
- `backend/app/prompts.py` — prompts du superviseur et des agents spécialistes

Le client MCP lance le serveur en sous-processus : les agents appellent les outils sans serveur MCP séparé à démarrer à la main.

## Cockpit RH

Après avoir lancé l'API, ouvrir :

```text
http://127.0.0.1:8000/
```

Le cockpit regroupe trois vues :

- **Vue d'ensemble** — 4 KPI clés, parcours de conversion, taux de présentation et de signature
- **Équipe** — comparaison des recruteuses
- **Assistant** — questions en langage naturel avec transparence agentique

Dans un même onglet, plusieurs questions et réponses restent visibles dans l'ordre d'envoi. Chaque question reste toutefois **indépendante** : seule la question courante est envoyée à l'API, sans historique ni mémoire conversationnelle côté serveur.

La conversation est conservée uniquement en mémoire dans l'onglet courant. Actualiser ou fermer la page l'efface. Le bouton **Effacer** restaure l'état initial. Si une demande échoue, les réponses précédentes restent visibles et **Réessayer** remplace l'erreur à la même position.

Chaque réponse peut afficher l'agent sélectionné, puis — dans une section repliée par défaut — ses sources et son parcours d'exécution. Le champ optionnel `presentation` enrichit l'affichage avec des blocs validés : `metrics` (cartes KPI), `table` (tableau comparatif), `insight` (point d'attention) et `actions` (actions proposées). Si `presentation` est absent ou vide, le texte `answer` reste l'affichage de référence.

### Scénario de démonstration

1. Montrer les quatre KPI du cockpit et les deux taux de conversion calculés depuis Excel.
2. Envoyer la première question pour faire apparaître les cartes KPI de l'agent KPI.
3. Envoyer la deuxième sans effacer la première : montrer que les deux tours restent visibles, puis le tableau comparatif des recruteuses.
4. Envoyer la troisième pour montrer l'analyse de la friction principale, en distinguant faits, hypothèses et recommandations.
5. Déplier **Sources et parcours agentique** sur une réponse pour montrer la source KPI, le superviseur, l'agent spécialiste et les outils MCP.
6. Si Tavily est configuré, envoyer la quatrième question pour montrer l'agent web et les sources externes ; sinon, expliquer la dégradation prévue sans appel externe.

## Installation

Depuis la racine du projet :

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cp .env.example .env
```

Renseigner les clés dans `.env` :

```bash
NVIDIA_API_KEY=...
NVIDIA_MODEL=meta/llama-3.1-8b-instruct
TAVILY_API_KEY=...
```

Notes :

- `NVIDIA_API_KEY` est requis pour `/assistant/ask`.
- `TAVILY_API_KEY` est requis pour les vraies comparaisons web.
- Sans Tavily, l'agent web dégrade proprement la réponse au lieu de casser le workflow.
- Le fichier Excel par défaut est lu depuis `data/Data Reporting KPI RH Q32024 (1).xlsx` (dossier `data/` non versionné — à placer localement).

## Lancer l'API

```bash
.venv/bin/python -m uvicorn backend.app.main:app --reload
```

| URL | Usage |
| --- | --- |
| http://127.0.0.1:8000/ | Cockpit RH |
| http://127.0.0.1:8000/docs | Swagger |
| http://127.0.0.1:8000/health | Health check |

```bash
curl -fsS http://127.0.0.1:8000/health
```

## API principale

### KPI globaux

```http
GET /kpis/summary
```

### Taux principaux

```http
GET /kpis/rates
```

### KPI par recruteuse

```http
GET /kpis/recruiters
```

### Assistant

```http
POST /assistant/ask
```

Exemple :

```bash
curl -X POST http://127.0.0.1:8000/assistant/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Compare Inès et Pauline"}'
```

La réponse contient notamment :

- `answer` — réponse finale
- `route` — agent sélectionné
- `route_reason` — justification du routage
- `agent_path` — chemin d'exécution
- `sources` — source KPI et sources web éventuelles
- `presentation` — blocs visuels optionnels ; le client conserve `answer` comme fallback

## Outils MCP

| Outil | Description |
| --- | --- |
| `get_hr_kpi_summary` | KPI globaux du T3 2024 |
| `get_hr_kpi_rates` | Taux principaux |
| `get_kpis_by_recruiter` | KPI par recruteuse |
| `web_search` | Recherche web via Tavily |

## Tests automatiques

Les tests `pytest` sont déterministes. Ils ne doivent pas appeler NVIDIA, Tavily, ni une API FastAPI déjà lancée.

```bash
.venv/bin/python -m pytest -q
node --test frontend/tests/*.test.mjs
```

Ils couvrent les KPI calculés depuis l'Excel, le workflow LangGraph, les réponses API, le parsing du routeur LLM et le rendu du cockpit.

## Scripts manuels de démo

```bash
# Vérifier les outils MCP
.venv/bin/python backend/scripts/manual_mcp_check.py

# Évaluer les questions business (API déjà lancée)
.venv/bin/python backend/scripts/evaluate_assistant.py --show-answers
```

## Observabilité

OpenTelemetry trace les requêtes FastAPI, les appels agents, LLM et MCP. Exports OTLP HTTP vers `http://localhost:4318/v1/traces` et `http://localhost:4318/v1/metrics`.

Pour désactiver en test :

```bash
NSI_TELEMETRY_DISABLED=1 .venv/bin/python -m pytest -q
```

## Structure du projet

```text
backend/
  app/
    agents/            workflow LangGraph
    mcp_server/        outils MCP et client MCP
    observability/     OpenTelemetry et logs
    services/          lecture Excel, KPI et LLM NVIDIA
    main.py            API FastAPI
    prompts.py         prompts des agents
  scripts/             vérifications manuelles
  tests/               tests Python
  requirements.txt
frontend/
  js/                  logique du cockpit et de l'assistant
  tests/               tests JavaScript
  index.html
  styles.css
docs/
  NSI_France_Agentic_Workflow.svg
```

## Limites actuelles

- Une seule période : T3 2024.
- Une seule source Excel.
- Pas d'authentification.
- Pas de base de données.
- Les réponses assistant dépendent de NVIDIA NIM.
- Les comparaisons web dépendent de Tavily.

## Commandes utiles

```bash
# Tests
.venv/bin/python -m pytest -q
node --test frontend/tests/*.test.mjs

# API locale
.venv/bin/python -m uvicorn backend.app.main:app --reload

# Vérification MCP
.venv/bin/python backend/scripts/manual_mcp_check.py

# Évaluation business live
.venv/bin/python backend/scripts/evaluate_assistant.py --show-answers
```
