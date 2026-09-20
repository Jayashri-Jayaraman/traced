package com.traced.backend.dto;

import tools.jackson.databind.JsonNode;

import java.time.Instant;

public record DesignResponse(
        Long id,
        String name,
        int currentStep,
        JsonNode stepAnswers,
        JsonNode nodes,
        JsonNode edges,
        Instant createdAt,
        Instant updatedAt
) {
}
