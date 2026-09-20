package com.traced.backend.simulation;

import java.util.Map;

public record SimNode(long id, String type, Map<String, Double> params) {
}
