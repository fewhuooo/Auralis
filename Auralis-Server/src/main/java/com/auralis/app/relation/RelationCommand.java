package com.auralis.app.relation;

import java.util.UUID;

public record RelationCommand(
        RelationNodeType sourceType,
        UUID sourceId,
        RelationNodeType targetType,
        UUID targetId,
        RelationType type,
        String label) {
}
