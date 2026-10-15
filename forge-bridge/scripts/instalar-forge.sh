#!/usr/bin/env bash
# Compila os módulos do Forge usados pela ponte e os instala no repositório Maven local.
# O Forge usa versões "${revision}" sem o flatten-maven-plugin, então os poms instalados
# guardam o texto literal ${revision}; este script troca pelo número da versão.
set -euo pipefail
FORGE_DIR="${FORGE_DIR:-$HOME/forge}"
M2="${M2_REPO:-$HOME/.m2/repository}"

if [ ! -d "$FORGE_DIR" ]; then
  git clone --depth 1 https://github.com/Card-Forge/forge.git "$FORGE_DIR"
fi
cd "$FORGE_DIR"
VERSION=$(mvn -q -B help:evaluate -Dexpression=revision -DforceStdout)
mvn -q -B -pl forge-gui -am install -DskipTests -Dcheckstyle.skip

for pom in "$M2"/forge/*/"$VERSION"/*.pom; do
  sed -i "s/\${revision}/$VERSION/g" "$pom"
done
rm -rf "$M2/forge/forge/\${revision}"
find "$M2/forge" -name '*.lastUpdated' -delete
echo "Forge $VERSION instalado em $M2/forge"
