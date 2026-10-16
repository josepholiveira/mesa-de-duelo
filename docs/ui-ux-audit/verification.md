# Mesa de Duelo runtime and verification

The audit ran the actual browser application against the real Forge engine on 16 October 2026. A live AI match reached turn 5. Screenshots and a sanitized WebSocket trace support the findings; gameplay was not simulated. No application source was modified.

## Versions and environment

- Application: `kassiogluten/mesa-de-duelo`, commit `ef1cb1adc325ebd58f92b7e34b0d57449628fddd`.
- Forge: `Card-Forge/forge`, commit `0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53`, version `2.0.16-SNAPSHOT`. This matches the application's Dockerfile pin and bridge dependency.
- Runtime: Node.js `24.18.0`, portable Eclipse Temurin JDK `17.0.20.1`, Apache Maven `3.9.9`, macOS ARM64.
- Frontend: `http://localhost:5173`. Bridge: `ws://127.0.0.1:7171/ws`.

The machine initially exposed only Java 8 and had no Maven command. Portable tools, the Forge checkout, Maven dependencies, and Forge preferences were placed under the audit workspace's `work/` directory. No system installation was required. Both application and Forge Git working trees were clean after setup.

## Reproducing the runtime

For an equivalent fresh audit directory, clone the application into `work/mesa-de-duelo` at the recorded commit. Provision the recorded JDK and Maven under `work/toolchains` (the paths below are the macOS ARM64 layout), then fetch and build pinned Forge:

```bash
mkdir -p work/forge work/m2 work/forge-runtime-home
git -C work/forge init
git -C work/forge remote add origin https://github.com/Card-Forge/forge.git
git -C work/forge fetch --depth 1 origin 0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53
git -C work/forge checkout FETCH_HEAD
AUDIT_ROOT="$PWD"
export JAVA_HOME="$AUDIT_ROOT/work/toolchains/jdk-17.0.20.1+1/Contents/Home"
export MAVEN_OPTS="-Xmx2g -Duser.home=$AUDIT_ROOT/work/forge-runtime-home"
"$AUDIT_ROOT/work/toolchains/apache-maven-3.9.9/bin/mvn" \
  -B -ntp -f work/forge/pom.xml \
  "-Dmaven.repo.local=$AUDIT_ROOT/work/m2" \
  -pl forge-gui -am install -DskipTests -Dcheckstyle.skip
```

Forge's installed Maven POMs retain the literal `${revision}` reference. Apply the repository's documented correction to the workspace cache before starting the bridge:

```bash
python3 - <<'PY'
from pathlib import Path
for path in Path('work/m2/forge').glob('*/2.0.16-SNAPSHOT/*.pom'):
    source = path.read_text()
    path.write_text(source.replace('${revision}', '2.0.16-SNAPSHOT'))
PY
```

Start the bridge with the same workspace variables, and run the frontend in another terminal:

```bash
export MAVEN_OPTS="-Xmx2g -Duser.home=$AUDIT_ROOT/work/forge-runtime-home -Dforge.dir=$AUDIT_ROOT/work/forge"
"$AUDIT_ROOT/work/toolchains/apache-maven-3.9.9/bin/mvn" \
  -B -ntp "-Dmaven.repo.local=$AUDIT_ROOT/work/m2" \
  -f work/mesa-de-duelo/forge-bridge/pom.xml compile exec:java
```

```bash
cd work/mesa-de-duelo
npm ci
npm run dev -- --host 127.0.0.1
```

This correction changes generated dependency metadata only. The provided installer otherwise clones current Forge rather than the Docker-pinned revision; its Linux-style `sed -i` invocation also needs adaptation on macOS. The portable setup avoided those differences. Forge's five-module build succeeded in approximately 36 seconds. Backend initialization indexed 35,348 card names and opened the expected WebSocket endpoint.

## Build and observed browser coverage

`npm run build` passed TypeScript checking and production bundling. It emitted a pre-existing CSS warning at `src/style.css:537`: the hover rule contains the malformed declaration `{: translateY(-3px);`. Passing the build does not establish correct rendering of that declaration.

The browser audit exercised:

- Initial lobby, loaded starter decks, empty personal decks, and the deck manager.
- Creating and naming a deck; searching for and adding a card; importing a list. The tested import dropped its sideboard section.
- Deck preview, card images, mana curve, and average mana cost.
- A real AI game: coin-toss choice, keeping the opening hand, land play, casting and paying mana, a visible stack entry, a flying creature, attack selection, and damage through turn 5.
- Card inspection, game log, keyboard focus, and the network setup form. Network coverage stopped at that form.

Captured desktop viewports were `1512 × 850`, `1440 × 900`, and `1280 × 720` CSS pixels. A `390 × 844` viewport covered the mobile lobby. These are browser viewport checks, not certification on a physical MacBook display.

Evidence is in [screenshots](screenshots/) and [the gameplay timing trace](gameplay-timing.json). The trace contains receive times, turn/phase, visible stack/battlefield names and life totals; it excludes session credentials, prompts, and private hands. Build and runtime logs remain in `work/forge-build.log` and `work/bridge-runtime.log`.

## Coverage limits

The audit did not complete a full match or validate multiplayer, long stacks and counterspells, crowded battlefields, actual MacBook Safari/Retina rendering, 200% zoom, or screen-reader use. Animation was not inspected at 10% playback speed. Audio prototypes were not aesthetically assessed through listening. These remain follow-up verification tasks, not passing checks.

The audit frontend and bridge processes were stopped after browser inspection. The portable tools, engine checkout, dependency cache, and runtime files occupy approximately 1.5 GB under `work/` and can be removed together when reproducibility is no longer needed.
