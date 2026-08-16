package com.auralis.app.review;

import java.time.Instant;
import java.util.UUID;

public record ReviewParameterSetView(UUID id, String scheduler, int version, String parameters, Instant createdAt) {
}
