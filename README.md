# Plateforme e-commerce simplifiée — Mini-projet DevOps II (Groupe 2)

Architecture microservices (3 services indépendants + API gateway), conteneurisée
avec **Docker**, orchestrée sur **Kubernetes (kind)**, avec pipelines CI/CD
**Jenkins** indépendants par microservice et supervision **Nagios**.

## Architecture

```
                        port 30080 (NodePort)
                    ┌──────────────────────────────┐
   navigateur  ───► │  gateway (API gateway/mini-front) │
                    └───────┬─────────┬─────────┬──┘
            /api/catalogue  │         │         │  /api/commandes
                    ┌───────▼──┐  ┌───▼─────┐  ┌▼─────────┐
   Nagios  ───────► │ catalogue│  │ panier  │  │ commandes│   (NodePorts 30081-30083)
                    └───────┬──┘  └───┬─────┘  └┬─────────┘
                            │         │         │
                    ┌───────▼──┐  ┌───▼─────┐  ┌▼──────────┐
                    │ mongo-   │  │ mongo-  │  │ mongo-    │  (StatefulSets, base
                    │ catalogue│  │ panier  │  │ commandes │   DÉDIÉE par service)
                    └──────────┘  └─────────┘  └───────────┘

   Git ──► Jenkins (1 pipeline / service) ──► registry localhost:5000 ──► kubectl (kind)
```

- Chaque microservice possède **son image Docker**, **son Deployment + Service Kubernetes**
  et **sa propre base de données** (isolation des données, panne non propagée,
  schéma évolué indépendamment — justification attendue par l'énoncé).
- Un seul point d'entrée : la **gateway** expose la page de démo sur
  `http://localhost:30080` et route `/api/catalogue`, `/api/panier`,
  `/api/commandes` vers les 3 services.

## Prérequis

- Docker
- [kind](https://kind.sigs.k8s.io/), `kubectl`, `make`
- (fournis) Node.js n'est requis que sur la machine hôte si tu codes sans Docker.

## Démarrage

```bash
git clone <ce repo> && cd ecommerce-devops

make cluster-up          # kind + registre local localhost:5000 + namespace ecommerce
make deploy-all          # build/push via... non: build manuel local OU Jenkins
make build-all && make push-all      # 1er déploiement "manuel" (facultatif si Jenkins ok)
make deploy-all
make jenkins-up          # Jenkins sur http://localhost:8081
make nagios-up           # Nagios sur http://localhost:8082/nagios
```

Boutique de démo : **http://localhost:30080**

## CI/CD — 4 pipelines, 4 cycles de version indépendants

Dans Jenkins → *Nouvelle tâche → Pipeline*, un job par service (`catalogue`,
`panier`, `commandes`, `gateway`) :

- Type : **Pipeline**
- Définition : *Pipeline script from SCM* → ton repo Git
- *Script Path* :
  - `services/catalogue/Jenkinsfile`
  - `services/panier/Jenkinsfile`
  - `services/commandes/Jenkinsfile`
  - `services/gateway/Jenkinsfile`

Chaque pipeline (voir `services/*/Jenkinsfile`) :

1. lit la version dans `services/<svc>/VERSION`
2. **tests** (`node --test`, mongo éphémère pour le test)
3. **build** de l'image `localhost:5000/ecommerce/<svc>:v<version>-b<build>`
4. **push** dans le registre local (attaché au réseau `kind`)
5. **déploiement** : `kubectl apply -f services/<svc>/k8s/` + `kubectl set image`
   — **uniquement pour ce service**, jamais les autres.

### Passer une version

Modifie `services/catalogue/VERSION` → `2.0.0`, commit/push, le pipeline
catalogue s'exécute et le catalogue est mis à jour **sans toucher aux pods**
panier/commandes.

## 🔥 Scénario de démonstration (aligné sur l'énoncé)

| Étape | Commande / action | Point montré |
|---|---|---|
| 1. Dépôts Git | montrer l'arborescence 4 services + 4 Jenkinsfiles | Git |
| 2. Pipelines Jenkins | 4 jobs, un par service | CI/CD |
| 3. Build & publication | Builder un pipeline → logs "Push registre" | Docker |
| 4. **Catalogue v2 uniquement** | `echo 2.0.0 > services/catalogue/VERSION && git commit ...` → pipeline | cycle de version indépendant |
| 5. Panier/Commandes intacts | `kubectl -n ecommerce get pods -w` pendant l'étape 4 : les âges des pods `panier-*` / `commandes-*` ne changent pas | déploiement isolé |
| 6. Nagios suit les 4 services | http://localhost:8082/nagios → *Services*, 4 lignes `Up` | supervision |
| 7. Alerte | `kubectl -n ecommerce scale deployment/panier --replicas=0` → CRITICAL sur "Panier (30082)" dans ~1-2 min | détection |
| 8. Retour à la normale | `kubectl -n ecommerce scale deployment/panier --replicas=1` → le service repasse UP (RECOVERY) | rétablissement |

Le `make catalogue-v2` automatise l'étape 4 manuellement (sans Jenkins).

## Tests

Chaque service embarque ses tests (Node test runner, `node --test test/`):

```bash
cd services/catalogue && npm install && npm test
```

## Structure du projet

```
services/
  catalogue/          # API produits GET /products, /products/:id + Mongo
    src/ test/ k8s/   Jenkinsfile VERSION Dockerfile
  panier/             # POST /cart/items, DELETE /cart/items/:id, GET /cart + Mongo
  commandes/          # POST /orders, GET /orders/:userId + Mongo
  gateway/            # reverse-proxy /api/* + page démo (http://localhost:30080)
infra/
  jenkins/            # image Jenkins (docker+node+kubectl), plugins.txt, create-jobs.sh
  nagios/             # supervision des 4 NodePorts, alertes
kind/                 # config kind (NodePorts 30080-83, miroir registre)
k8s/00-namespace.yaml
Makefile
```

## Justification : une base de données par service

Chaque microservice possède sa propre base (StatefulSet `mongo-<svc>` dédiée) :
- **isolation** : une panne de `mongo-panier` n'affecte ni catalogue ni commandes ;
- **schémas indépendants** : le catalogue peut évoluer (champs, index) sans
  impact sur les autres services ;
- **scalabilité indépendante** : le service le plus sollicité peut monter en
  charge sans partager les ressources.
C'est la structure attendue d'une microservices d'architecture — une base
partagée créerait un couplage à interdire ici.
