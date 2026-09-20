package com.traced.backend.simulation;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Per-connection traffic simulation, mirroring the tick loop that used to run
 * client-side in App.jsx: spawns request "particles" at each client node on
 * a fixed tick, walks them hop by hop across edges, and tracks per-node load
 * plus a rolling throughput/latency window.
 */
public class SimulationEngine {

    private static final long TICK_MS = 150;
    private static final long STATS_WINDOW_MS = 2000;
    private static final int MAX_HOPS = 8;

    private volatile List<SimNode> nodes = List.of();
    private volatile List<SimEdge> edges = List.of();

    private final Map<Long, Double> spawnAcc = new HashMap<>();
    private final Map<Long, Integer> nodeLoads = new HashMap<>();
    private final Deque<CompletedEntry> completed = new ArrayDeque<>();
    private List<Particle> particles = new ArrayList<>();
    private long totalCompleted = 0;

    public void setGraph(List<SimNode> nodes, List<SimEdge> edges) {
        this.nodes = nodes != null ? nodes : List.of();
        this.edges = edges != null ? edges : List.of();
    }

    public TickMessage tick() {
        long now = System.currentTimeMillis();
        List<SimNode> currentNodes = nodes;

        Map<Long, List<Long>> adjacency = new HashMap<>();
        for (SimEdge e : edges) {
            adjacency.computeIfAbsent(e.from(), k -> new ArrayList<>()).add(e.to());
        }
        Map<Long, SimNode> nodeById = new HashMap<>();
        for (SimNode n : currentNodes) {
            nodeById.put(n.id(), n);
        }

        List<Particle> newParticles = new ArrayList<>();
        for (SimNode client : currentNodes) {
            if (!"client".equals(client.type())) continue;
            double rps = paramOrDefault(client, "rps", 10.0);
            double acc = spawnAcc.getOrDefault(client.id(), 0.0) + rps * (TICK_MS / 1000.0);
            while (acc >= 1) {
                acc -= 1;
                Particle p = spawnSegment(client.id(), List.of(client.id()), 0, now, adjacency, nodeById);
                if (p != null) newParticles.add(p);
            }
            spawnAcc.put(client.id(), acc);
        }

        Map<Long, Integer> loadCounts = new HashMap<>();
        List<Particle> stillActive = new ArrayList<>();
        List<Double> completedThisTick = new ArrayList<>();

        for (Particle p : particles) {
            long targetId = lastHop(p);
            loadCounts.merge(targetId, 1, Integer::sum);

            if (now - p.segStart() < p.segDuration()) {
                stillActive.add(p);
                continue;
            }

            double newLatency = p.latencyAcc() + p.segDuration();
            List<Long> outgoing = adjacency.getOrDefault(targetId, List.of());
            if (outgoing.isEmpty() || p.path().size() >= MAX_HOPS) {
                completedThisTick.add(newLatency);
                continue;
            }
            Particle next = spawnSegment(targetId, p.path(), newLatency, now, adjacency, nodeById);
            if (next != null) stillActive.add(next);
            else completedThisTick.add(newLatency);
        }

        for (Particle p : newParticles) {
            loadCounts.merge(lastHop(p), 1, Integer::sum);
        }

        List<Particle> merged = new ArrayList<>(stillActive);
        merged.addAll(newParticles);
        particles = merged;

        Map<Long, Integer> loads = new HashMap<>();
        for (SimNode n : currentNodes) {
            int count = loadCounts.getOrDefault(n.id(), 0);
            loads.put(n.id(), Math.round(count * (1000f / TICK_MS)));
        }
        nodeLoads.clear();
        nodeLoads.putAll(loads);

        if (!completedThisTick.isEmpty()) {
            totalCompleted += completedThisTick.size();
            for (double latency : completedThisTick) {
                completed.addLast(new CompletedEntry(latency, now));
            }
        }
        while (!completed.isEmpty() && now - completed.peekFirst().t() > STATS_WINDOW_MS) {
            completed.pollFirst();
        }

        double avgLatency = completed.isEmpty()
                ? 0
                : completed.stream().mapToDouble(CompletedEntry::latency).average().orElse(0);
        long rps = Math.round(completed.size() / (STATS_WINDOW_MS / 1000.0));
        LiveStatsDto stats = new LiveStatsDto(rps, Math.round(avgLatency), totalCompleted);

        List<ParticleDto> particleDtos = merged.stream()
                .map(p -> new ParticleDto(p.id(), p.path(), p.segDuration()))
                .toList();

        return new TickMessage("tick", particleDtos, loads, stats);
    }

    private long lastHop(Particle p) {
        return p.path().get(p.path().size() - 1);
    }

    private Particle spawnSegment(
            long fromId, List<Long> path, double latencyAcc, long now,
            Map<Long, List<Long>> adjacency, Map<Long, SimNode> nodeById
    ) {
        List<Long> outgoing = adjacency.getOrDefault(fromId, List.of());
        if (outgoing.isEmpty()) return null;

        long nextId = outgoing.get(ThreadLocalRandom.current().nextInt(outgoing.size()));
        SimNode nextNode = nodeById.get(nextId);
        boolean overloaded = nodeLoads.getOrDefault(nextId, 0) > effectiveCapacity(nextNode);

        List<Long> newPath = new ArrayList<>(path);
        newPath.add(nextId);

        long segDuration = Math.max(20, Math.round(segmentLatency(nextNode, overloaded)));
        return new Particle(UUID.randomUUID().toString(), newPath, now, segDuration, latencyAcc);
    }

    private double effectiveCapacity(SimNode node) {
        if (node == null || node.params() == null) return Double.POSITIVE_INFINITY;
        Double capacity = node.params().get("capacity");
        if (capacity == null) return Double.POSITIVE_INFINITY;
        Double instances = node.params().get("instances");
        Double replicas = node.params().get("replicas");
        double multiplier = instances != null && instances > 0
                ? instances
                : (replicas != null && replicas > 0 ? replicas : 1.0);
        return capacity * multiplier;
    }

    private double segmentLatency(SimNode node, boolean overloaded) {
        double base = paramOrDefault(node, "latencyMs", 10.0);
        double latency = base;
        if (node != null && node.params() != null && ("cache".equals(node.type()) || "cdn".equals(node.type()))) {
            Double hitRate = node.params().get("hitRate");
            if (hitRate != null) {
                boolean isHit = ThreadLocalRandom.current().nextDouble(100) < hitRate;
                latency = isHit ? base : base + 40;
            }
        }
        return overloaded ? latency * 3 : latency;
    }

    private double paramOrDefault(SimNode node, String key, double defaultValue) {
        if (node == null || node.params() == null) return defaultValue;
        Double value = node.params().get(key);
        return value != null ? value : defaultValue;
    }

    private record CompletedEntry(double latency, long t) {
    }
}
