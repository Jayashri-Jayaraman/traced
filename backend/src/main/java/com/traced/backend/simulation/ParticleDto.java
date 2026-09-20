package com.traced.backend.simulation;

import java.util.List;

public record ParticleDto(String id, List<Long> path, long segDuration) {
}
