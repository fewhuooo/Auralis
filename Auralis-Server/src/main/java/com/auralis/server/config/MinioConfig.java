package com.auralis.server.config;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 15.7 MinIO Configuration
 * Creates MinioClient bean and auto-creates the asset bucket on startup.
 */
@Slf4j
@Configuration
public class MinioConfig {

    @Value("${minio.endpoint:http://127.0.0.1:9000}")
    private String endpoint;

    @Value("${minio.access-key:minioadmin}")
    private String accessKey;

    @Value("${minio.secret-key:minioadmin}")
    private String secretKey;

    @Value("${minio.bucket:Auralis-assets}")
    private String bucket;

    @Bean
    public MinioClient minioClient() {
        MinioClient client = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();

        // Auto-create bucket on startup
        try {
            boolean exists = client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("[MinIO] Bucket '{}' created successfully", bucket);
            } else {
                log.info("[MinIO] Bucket '{}' already exists", bucket);
            }
        } catch (Exception e) {
            log.warn("[MinIO] Failed to initialize bucket '{}': {}. File upload will not work until MinIO is available.", bucket, e.getMessage());
        }

        return client;
    }
}
