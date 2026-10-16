#!/usr/bin/env bash
# Build and run. Set FORGE_DIR, M2_REPO, JAVA_HOME and MVN for portable installations.
set -euo pipefail
cd "$(dirname "$0")/.."
FORGE_DIR="${FORGE_DIR:-$HOME/forge}"
M2="${M2_REPO:-$HOME/.m2/repository}"
MVN="${MVN:-mvn}"
if [ -n "${JAVA_HOME:-}" ]; then export PATH="$JAVA_HOME/bin:$PATH"; fi
export MAVEN_OPTS="${MAVEN_OPTS:--Xmx2g}"
exec "$MVN" -B -ntp "-Dmaven.repo.local=$M2" "-Dforge.dir=$FORGE_DIR" compile exec:java "-Dexec.args=$*"
