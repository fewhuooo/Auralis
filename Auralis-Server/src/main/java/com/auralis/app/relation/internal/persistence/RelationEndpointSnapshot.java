package com.auralis.app.relation.internal.persistence;

import com.auralis.app.relation.RelationNodeType;
import com.auralis.app.relation.RelationType;

import java.util.UUID;

/** Unmanaged endpoint discovery projection used only to calculate Subject locks. */
public interface RelationEndpointSnapshot {

    RelationNodeType getSourceType();

    UUID getSourceId();

    RelationNodeType getTargetType();

    UUID getTargetId();

    RelationType getType();

    String getLabel();
}
