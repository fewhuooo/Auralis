# syntax=docker/dockerfile:1.7

FROM eclipse-temurin:21.0.8_9-jdk-jammy AS build

WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw
RUN ./mvnw -B -ntp dependency:go-offline
COPY src src
RUN ./mvnw -B -ntp -DskipTests package

FROM eclipse-temurin:21.0.8_9-jre-jammy AS runtime

USER root
RUN apt-get update \
    && apt-get install --no-install-recommends --yes curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 auralis \
    && useradd --system --uid 10001 --gid auralis --home-dir /nonexistent --shell /usr/sbin/nologin auralis

WORKDIR /app
COPY --from=build --chown=auralis:auralis /workspace/target/*.jar app.jar

USER auralis:auralis
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 \
    CMD curl --fail --silent http://127.0.0.1:8080/actuator/health/readiness || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
