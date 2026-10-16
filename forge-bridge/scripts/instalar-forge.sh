#!/usr/bin/env bash
# Install the exact engine revision supported by this bridge. Existing clones are never reset.
set -euo pipefail
FORGE_COMMIT=0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53
FORGE_DIR="${FORGE_DIR:-$HOME/forge}"
M2="${M2_REPO:-$HOME/.m2/repository}"
MVN="${MVN:-mvn}"
if [ ! -d "$FORGE_DIR" ]; then
  mkdir -p "$FORGE_DIR"
  git -C "$FORGE_DIR" init -q
  git -C "$FORGE_DIR" remote add origin https://github.com/Card-Forge/forge.git
  git -C "$FORGE_DIR" fetch --depth 1 origin "$FORGE_COMMIT"
  git -C "$FORGE_DIR" checkout -q FETCH_HEAD
fi
if [ "$(git -C "$FORGE_DIR" rev-parse HEAD)" != "$FORGE_COMMIT" ]; then
  echo "FORGE_DIR must point to revision $FORGE_COMMIT. Use a new directory to install it." >&2
  exit 1
fi
cd "$FORGE_DIR"
VERSION=2.0.16-SNAPSHOT
"$MVN" -B -ntp "-Dmaven.repo.local=$M2" -pl forge-gui -am install -DskipTests -Dcheckstyle.skip
for pom in "$M2"/forge/*/"$VERSION"/*.pom; do
  [ -f "$pom" ] || continue
  # POSIX sed + temporary file works with both BSD and GNU sed.
  sed "s/\${revision}/$VERSION/g" "$pom" > "$pom.bridge-tmp"
  mv "$pom.bridge-tmp" "$pom"
done
find "$M2/forge" -name '*.lastUpdated' -delete
echo "Forge $VERSION ($FORGE_COMMIT) installed in $M2/forge"
