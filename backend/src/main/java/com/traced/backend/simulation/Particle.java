package com.traced.backend.simulation;

import java.util.List;

record Particle(String id, List<Long> path, long segStart, long segDuration, double latencyAcc) {
}
