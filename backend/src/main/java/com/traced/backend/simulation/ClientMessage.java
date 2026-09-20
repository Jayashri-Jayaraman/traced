package com.traced.backend.simulation;

import java.util.List;

// Incoming WebSocket message. "type" is one of: start, update, stop.
// nodes/edges are required for start and update, absent (null) for stop.
public record ClientMessage(String type, List<SimNode> nodes, List<SimEdge> edges) {
}
