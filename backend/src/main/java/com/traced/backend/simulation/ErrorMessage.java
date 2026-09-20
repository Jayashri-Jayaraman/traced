package com.traced.backend.simulation;

public record ErrorMessage(String type, String message) {
    public ErrorMessage(String message) {
        this("error", message);
    }
}
