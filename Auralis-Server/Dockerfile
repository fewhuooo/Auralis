# Stage 1: Build the Spring Boot application
FROM maven:3.9.6-eclipse-temurin-21 AS builder

WORKDIR /app

# Copy the pom.xml and source code
COPY pom.xml .
COPY src ./src

# Package the application (skip tests to speed up the build)
RUN mvn clean package -DskipTests

# Stage 2: Run the application
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Create logs directory
RUN mkdir -p logs

# Copy the built JAR file from the builder stage
COPY --from=builder /app/target/Auralis-server-0.0.1-SNAPSHOT.jar app.jar

EXPOSE 8080

# Run the JAR file
ENTRYPOINT ["java", "-jar", "app.jar"]
