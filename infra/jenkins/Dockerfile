FROM jenkins/jenkins:lts

USER root

# Node.js 20 (tests npm) + curl
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# CLI Docker (le moteur est celui de l'hote via /var/run/docker.sock)
COPY --from=docker:25.0.3-cli /usr/local/bin/docker /usr/local/bin/docker

# kubectl (deploiement Kubernetes depuis les pipelines)
RUN curl -fsSLo /tmp/kubectl "https://dl.k8s.io/release/v1.30.4/bin/linux/amd64/kubectl" \
    && install -m 0755 /tmp/kubectl /usr/local/bin/kubectl \
    && rm /tmp/kubectl

# Plugins Jenkins requis par les pipelines
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli -f /usr/share/jenkins/ref/plugins.txt

# Kubeconfig du cluster kind (genere par `make jenkins-kubeconfig`)
ENV KUBECONFIG=/var/jenkins_home/.kube/config

USER jenkins
