package com.auralis.app.identity;

import java.util.UUID;

public record UserView(UUID id, String username, String displayName, long version) {
}
