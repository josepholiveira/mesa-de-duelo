#!/usr/bin/env bash
# Compila e roda a ponte do Forge. Argumentos são repassados: ./rodar.sh --mode=watch --delay=200
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${JAVA_HOME:-}" ] && [ -d "$HOME/.local/opt/jdk-17" ]; then export JAVA_HOME="$HOME/.local/opt/jdk-17"; fi
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
MVN=mvn
command -v mvn >/dev/null 2>&1 || MVN="$HOME/.local/opt/apache-maven-3.9.9/bin/mvn"
export MAVEN_OPTS="${MAVEN_OPTS:--Xmx2g}"
exec "$MVN" -q -B compile exec:java -Dexec.args="$*"
