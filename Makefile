SHELL := /bin/bash
CLUSTER_NAME := ecommerce
REGISTRY_PORT := 5000
SERVICES := catalogue panier commandes gateway
KUBECONFIG_FILE ?= $(HOME)/.kube/config

.PHONY: help cluster-up registry-up build-all push-all deploy-all jenkins-kubeconfig \
        jenkins-up nagios-up catalogue-v2 down

help:
	@echo "  cluster-up ...... cree le cluster kind + registre local + namespace"
	@echo "  build-all ....... build les images Docker de tous les services"
	@echo "  push-all ........ build + push toutes les images sur localhost:$(REGISTRY_PORT)"
	@echo "  deploy-all ...... deploie namespace + tous les microservices + gateway"
	@echo "  jenkins-kubeconfig  genere le kubeconfig monte dans Jenkins"
	@echo "  jenkins-up ...... demarre Jenkins (http://localhost:8081)"
	@echo "  nagios-up ....... demarre Nagios   (http://localhost:8082/nagios)"
	@echo "  catalogue-v2 .... demo: build/push/deploie catalogue v2.0.0 uniquement"
	@echo "  down ............ supprime cluster + jenkins + nagios"

# ---------------------------------------------------------------- cluster
registry-up:
	@docker inspect kind-registry >/dev/null 2>&1 || \
	  docker run -d --name kind-registry --network kind -p $(REGISTRY_PORT):5000 registry:2

cluster-up:
	kind create cluster --name $(CLUSTER_NAME) --config kind/kind-config.yaml
	$(MAKE) registry-up
	kubectl apply -f k8s/00-namespace.yaml

# ---------------------------------------------------------------- build
define build_service
	docker build --build-arg APP_VERSION=$$(cat services/$(1)/VERSION) \
	  -t localhost:$(REGISTRY_PORT)/ecommerce/$(1):v$$(cat services/$(1)/VERSION) services/$(1)
endef

build-all:
	$(foreach s,$(SERVICES),$(call build_service,$(s));)

push-all: build-all
	$(foreach s,$(SERVICES),docker push localhost:$(REGISTRY_PORT)/ecommerce/$(s):v$$(cat services/$(s)/VERSION);)

# ---------------------------------------------------------------- deploy
deploy-all:
	kubectl apply -f k8s/00-namespace.yaml
	$(foreach s,$(SERVICES),kubectl apply -f services/$(s)/k8s/;)
	kubectl -n ecommerce get pods -o wide

# ---------------------------------------------------------------- jenkins
jenkins-kubeconfig:
	mkdir -p infra/jenkins
	sed -e 's/0\.0\.0\.0:6443/host.docker.internal:6443/g' \
	    -e 's/127\.0\.0\.1:6443/host.docker.internal:6443/g' \
	    -e 's/certificate-authority-data:.*/insecure-skip-tls-verify: true/' \
	    "$(KUBECONFIG_FILE)" > infra/jenkins/kubeconfig

jenkins-up: jenkins-kubeconfig
	docker compose -f infra/jenkins/docker-compose.yml up -d --build
	@echo ">>> Jenkins: http://localhost:8081 (mot de passe: docker exec jenkins-devops cat /var/jenkins_home/secrets/initialAdminPassword)"

nagios-up:
	docker compose -f infra/nagios/docker-compose.yml up -d
	@echo ">>> Nagios: http://localhost:8082/nagios"

# ---------------------------------------------------------------- demo v2
catalogue-v2:
	@cat services/catalogue/VERSION
	docker build --build-arg APP_VERSION=$$(cat services/catalogue/VERSION) \
	  -t localhost:$(REGISTRY_PORT)/ecommerce/catalogue:v$$(cat services/catalogue/VERSION) services/catalogue
	docker push localhost:$(REGISTRY_PORT)/ecommerce/catalogue:v$$(cat services/catalogue/VERSION)
	kubectl -n ecommerce set image deployment/catalogue \
	  catalogue=localhost:$(REGISTRY_PORT)/ecommerce/catalogue:v$$(cat services/catalogue/VERSION)
	kubectl -n ecommerce rollout status deployment/catalogue
	@echo ">>> Catalogue mis a jour. Panier/Commandes: kubectl -n ecommerce get pods -l 'app in (panier,commandes)' -w"

# ---------------------------------------------------------------- teardown
down:
	kind delete cluster --name $(CLUSTER_NAME) || true
	docker rm -f kind-registry || true
	docker compose -f infra/jenkins/docker-compose.yml down -v || true
	docker compose -f infra/nagios/docker-compose.yml down || true
