package com.traced.backend.simulation;

import java.util.List;
import java.util.Map;

public record TickMessage(String type, List<ParticleDto> particles, Map<Long, Integer> nodeLoads, LiveStatsDto liveStats) {
}
