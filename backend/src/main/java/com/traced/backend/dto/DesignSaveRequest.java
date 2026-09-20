package com.traced.backend.dto;

import tools.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record DesignSaveRequest(
        @NotBlank String name,
        int currentStep,
        @NotNull JsonNode stepAnswers,
        @NotNull JsonNode nodes,
        @NotNull JsonNode edges
) {
}
