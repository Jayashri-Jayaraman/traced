package com.traced.backend.simulation;

public record LiveStatsDto(long rps, long avgLatency, long completed) {
}
