TILLER_NAMESPACE ?= kube-system
TILLER_SERVICE_ACCOUNT ?= helm-admin
TILLER_CLUSTER_ROLE_BINDING ?= helm-admin

# This gives tiller "God-mode" on this cluster
# For a more robust solution, please see https://github.com/michelleN/helm-tiller-rbac
TILLER_CLUSTER_ROLE ?= cluster-admin

# Ingress hosts for Brigade UI (Kashti) and GitHub webhook handler
BRIGADE_KASHTI_URL ?= kashti.memelordz.net
BRIGADE_GITHUB_APP_URL ?= brigade-github-app.memelordz.net

.PHONY: install-helm
install-helm:
	curl -L https://git.io/get_helm.sh | bash

.PHONY: uninstall-helm
uninstall-helm:
	rm -f $(shell which tiller)
	rm -f $(shell which helm)

.PHONY: install-tiller
install-tiller:
	kubectl create serviceaccount --namespace $(TILLER_NAMESPACE) $(TILLER_SERVICE_ACCOUNT) || true
	kubectl create clusterrolebinding $(TILLER_CLUSTER_ROLE_BINDING) --clusterrole=$(TILLER_CLUSTER_ROLE) --serviceaccount=$(TILLER_NAMESPACE):$(TILLER_SERVICE_ACCOUNT) || true
	helm init --tiller-namespace=$(TILLER_NAMESPACE) --service-account=$(TILLER_SERVICE_ACCOUNT)

.PHONY: uninstall-tiller
uninstall-tiller:
	helm reset || true
	kubectl delete clusterrolebinding $(TILLER_CLUSTER_ROLE_BINDING) || true
	kubectl delete serviceaccount --namespace $(TILLER_NAMESPACE) $(TILLER_SERVICE_ACCOUNT) || true

.PHONY: install-cert-manager
install-cert-manager:
	kubectl apply -f https://raw.githubusercontent.com/jetstack/cert-manager/release-0.8/deploy/manifests/00-crds.yaml
	kubectl label namespace kube-system certmanager.k8s.io/disable-validation=true --overwrite
	kubectl apply -f cluster-issuer.yaml
	helm repo add jetstack https://charts.jetstack.io
	helm install --namespace kube-system --name cert-manager jetstack/cert-manager --set ingressShim.defaultIssuerName=letsencrypt-prod --set ingressShim.defaultIssuerKind=ClusterIssuer

.PHONY: uninstall-cert-manager
uninstall-cert-manager:
	helm delete cert-manager --purge || true
	kubectl delete -f cluster-issuer.yaml || true
	kubectl label namespace kube-system certmanager.k8s.io/disable-validation-
	kubectl delete -f https://raw.githubusercontent.com/jetstack/cert-manager/release-0.8/deploy/manifests/00-crds.yaml

.PHONY: install-nginx-ingress
install-nginx-ingress:
	helm repo add bitnami https://charts.bitnami.com
	helm install --namespace kube-system --name nginx-ingress bitnami/nginx-ingress-controller

.PHONY: uninstall-nginx-ingress
uninstall-nginx-ingress:
	helm delete nginx-ingress --purge

.PHONY: install-brigade-cli
install-brigade-cli:
	wget https://github.com/brigadecore/brigade/releases/download/v1.0.0/brig-darwin-amd64
	mv brig-darwin-amd64 brig
	chmod +x brig
	sudo mv brig /usr/local/bin/
	wget https://github.com/slok/brigadeterm/releases/download/v0.11.1/brigadeterm-darwin-amd64
	mv brigadeterm-darwin-amd64 brigadeterm
	chmod +x brigadeterm
	sudo mv brigadeterm /usr/local/bin/

.PHONY: uninstall-brigade-cli
uninstall-brigade-cli:
	rm -f $(shell which brigadeterm)
	rm -f $(shell which brig)

.PHONY: install-brigade-server
install-brigade-server:
	helm repo add brigade https://brigadecore.github.io/charts
	helm install --namespace kube-system --name brigade-server brigade/brigade --set brigade-github-app.github.checkSuiteOnPR=false --set brigade-github-app.serviceAccount.create=false --set brigade-github-app.serviceAccount.name=$(TILLER_SERVICE_ACCOUNT) --set brigade-github-app.enabled=true --set brigade-github-app.ingress.hosts[0]=$(BRIGADE_GITHUB_APP_URL) --set brigade-github-app.ingress.tls[0].secretName=$(BRIGADE_GITHUB_APP_URL) --set brigade-github-app.ingress.tls[0].hosts[0]=$(BRIGADE_GITHUB_APP_URL) --set kashti.ingress.enabled=true --set kashti.ingress.hosts[0]=$(BRIGADE_KASHTI_URL) --set kashti.ingress.tls[0].secretName=$(BRIGADE_KASHTI_URL)--set kashti.ingress.tls[0].hosts[0]=$(BRIGADE_KASHTI_URL) --set kashti.ingress.annotations."kubernetes\.io/ingress\.class"=nginx --set kashti.ingress.annotations."kubernetes\.io/tls-acme"="true"

.PHONY: uninstall-brigade-server
uninstall-brigade-server:
	helm delete brigade-server --purge
