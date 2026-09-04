package com.auralis.app.identity;

import java.util.UUID;

public record AuthResult(UserView user, TokenPair tokens, UUID sessionId, UUID serverDeviceId) {
}
