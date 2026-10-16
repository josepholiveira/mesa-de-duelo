# Ponte do Forge. O build clona o Forge na versão fixada, instala no ~/.m2 e compila a ponte.
FROM maven:3.9-eclipse-temurin-17 AS build
ARG FORGE_COMMIT=0b0f7ecc51119bf9f9a2d1e777fcd299721c9f53
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /forge
RUN git init -q . && git remote add origin https://github.com/Card-Forge/forge.git \
 && git fetch -q --depth 1 origin "$FORGE_COMMIT" && git checkout -q FETCH_HEAD
RUN VERSION=$(mvn -q -B help:evaluate -Dexpression=revision -DforceStdout) \
 && mvn -q -B -pl forge-gui -am install -DskipTests -Dcheckstyle.skip \
 && for pom in /root/.m2/repository/forge/*/"$VERSION"/*.pom; do sed -i "s/\${revision}/$VERSION/g" "$pom"; done \
 && rm -rf "/root/.m2/repository/forge/forge/\${revision}" \
 && find /root/.m2/repository/forge -name '*.lastUpdated' -delete \
 && rm -rf forge-gui/src forge-gui/target
WORKDIR /bridge
COPY forge-bridge/pom.xml .
COPY forge-bridge/src ./src
COPY shared /shared
RUN mvn -q -B package -DskipTests && mvn -q -B dependency:copy-dependencies -DoutputDirectory=target/lib

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /forge/forge-gui /opt/forge/forge-gui
COPY --from=build /bridge/target/lib ./lib
COPY --from=build /bridge/target/forge-bridge-*.jar ./forge-bridge.jar
ENV JAVA_OPTS="-Xmx2g"
EXPOSE 7171
CMD ["sh", "-c", "exec java $JAVA_OPTS -Dforge.dir=/opt/forge -cp '/app/forge-bridge.jar:/app/lib/*' mesadeduelo.bridge.Main --host=0.0.0.0 --port=7171"]
