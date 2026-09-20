package com.traced.backend.dto;

import java.time.Instant;

public record DesignSummaryResponse(
        Long id,
        String name,
        int currentStep,
        Instant createdAt,
        Instant updatedAt
) {
}
