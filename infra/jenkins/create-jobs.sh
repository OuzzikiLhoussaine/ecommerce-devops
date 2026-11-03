#!/bin/bash
# Cree les 4 jobs Pipeline (un par microservice) dans Jenkins.
#
# Usage: ./create-jobs.sh
# Necessite: JENKINS_URL et JENKINS_TOKEN (token API), repo Git defini
# dans SCREPO. Par defaut: repo local file:// (demo sans GitHub).
set -euo pipefail

JENKINS_URL="${JENKINS_URL:-http://localhost:8081}"
JENKINS_USER="${JENKINS_USER:-admin}"
REPO="${SCM_REPO:-file:///home/ouzziki/ecommerce-devops}"
SERVICES=(catalogue panier commandes gateway)

# ATTENDRE que Jenkins soit pret
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$JENKINS_URL/login" || true)
  [ "$code" = "200" ] && break
  echo "Jenkins pas encore pret ($code), nouvelle tentative dans 5s..."
  sleep 5
done

TOKEN_VAR="${JENKINS_TOKEN:?export JENKINS_TOKEN=<token api> obligatoire (Jenkins > votre profil > API Token)}"

# Crumb CSRF obligatoire pour les POST (Jenkins >= 2).
# Le crumb doit etre jumele au meme cookie de session (cookiejar).
CRUMB_JSON=$(curl -s -u "${JENKINS_USER}:${TOKEN_VAR}" \
  -c "${JENKINS_COOKIE:-/tmp/opencode/jenkins.cookie}" \
  "${JENKINS_URL}/crumbIssuer/api/json")
CRUMB_FIELD=$(echo "$CRUMB_JSON" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['crumbRequestField'])")
CRUMB_VALUE=$(echo "$CRUMB_JSON" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['crumb'])")
CRUMB_HEADER="${CRUMB_FIELD}: ${CRUMB_VALUE}"
COOKIE_ARGS=("-b" "${JENKINS_COOKIE:-/tmp/opencode/jenkins.cookie}")

make_config() { # $1 = service
  cat <<XML
<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <actions>
    <org.jenkinsci.plugins.pipeline.modeldefinition.actions.DeclarativeJobAction plugin="pipeline-model-definition"/>
    <org.jenkinsci.plugins.pipeline.modeldefinition.actions.DeclarativePipelineAction plugin="pipeline-model-definition"/>
  </actions>
  <description>Pipeline CI/CD du microservice $1</description>
  <keepDependencies>false</keepDependencies>
  <properties>
    <jenkins.model.BuildDiscarderProperty>
      <strategy class="hudson.tasks.LogRotator">
        <daysToKeep>-1</daysToKeep>
        <numToKeep>20</numToKeep>
        <artifactDaysToKeep>-1</artifactDaysToKeep>
        <artifactNumToKeep>-1</artifactNumToKeep>
      </strategy>
    </jenkins.model.BuildDiscarderProperty>
  </properties>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
    <scm class="hudson.plugins.git.GitSCM" plugin="git">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>${REPO}</url>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/main</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
      <submoduleCfg class="list"/>
      <extensions/>
    </scm>
    <scriptPath>services/$1/Jenkinsfile</scriptPath>
    <lightweight>true</lightweight>
  </definition>
  <triggers/>
  <disabled>false</disabled>
</flow-definition>
XML
}

for svc in "${SERVICES[@]}"; do
  echo "== creation du job '$svc' =="
  if curl -s -o /dev/null -w '%{http_code}' "${JENKINS_URL}/view/all/job/${svc}/" | grep -q 200; then
    echo "   (existe deja, maj du script-path: re Cree une tache manuellement si besoin)"
    continue
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' -u "${JENKINS_USER}:${TOKEN_VAR}" \
    "${COOKIE_ARGS[@]}" \
    -H "$CRUMB_HEADER" \
    -X POST -H "Content-Type: application/xml" \
    --data-binary "$(make_config "$svc")" \
    "${JENKINS_URL}/createItem?name=${svc}")
  echo "   HTTP $code (201 = cree)"
  echo "   HTTP $code (201 = cree)"
done

echo "Terminé. Jobs créés: catalogue panier commandes gateway"
