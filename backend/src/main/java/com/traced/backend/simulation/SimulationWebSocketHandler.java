package com.traced.backend.simulation;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Component
public class SimulationWebSocketHandler extends TextWebSocketHandler {

    private static final long TICK_MS = 150;

    private final ObjectMapper objectMapper;
    private final ScheduledExecutorService scheduler;
    private final Map<String, RunningSimulation> running = new ConcurrentHashMap<>();

    public SimulationWebSocketHandler(ObjectMapper objectMapper, ScheduledExecutorService simulationScheduler) {
        this.objectMapper = objectMapper;
        this.scheduler = simulationScheduler;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        ClientMessage msg;
        try {
            msg = objectMapper.readValue(message.getPayload(), ClientMessage.class);
        } catch (Exception e) {
            sendError(session, "Invalid message payload");
            return;
        }

        String type = msg.type() == null ? "" : msg.type();
        switch (type) {
            case "start" -> start(session, msg);
            case "update" -> update(session, msg);
            case "stop" -> stopInternal(session.getId());
            default -> sendError(session, "Unknown message type: " + type);
        }
    }

    private void start(WebSocketSession session, ClientMessage msg) {
        stopInternal(session.getId());
        SimulationEngine engine = new SimulationEngine();
        engine.setGraph(msg.nodes(), msg.edges());
        ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(
                () -> tick(session, engine), TICK_MS, TICK_MS, TimeUnit.MILLISECONDS);
        running.put(session.getId(), new RunningSimulation(engine, future));
    }

    private void update(WebSocketSession session, ClientMessage msg) {
        RunningSimulation sim = running.get(session.getId());
        if (sim == null) {
            sendError(session, "Simulation not started");
            return;
        }
        sim.engine().setGraph(msg.nodes(), msg.edges());
    }

    private void stopInternal(String sessionId) {
        RunningSimulation sim = running.remove(sessionId);
        if (sim != null) sim.future().cancel(false);
    }

    private void tick(WebSocketSession session, SimulationEngine engine) {
        if (!session.isOpen()) {
            stopInternal(session.getId());
            return;
        }
        try {
            TickMessage tickMessage = engine.tick();
            synchronized (session) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(tickMessage)));
            }
        } catch (Exception e) {
            stopInternal(session.getId());
        }
    }

    private void sendError(WebSocketSession session, String message) {
        try {
            synchronized (session) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(new ErrorMessage(message))));
            }
        } catch (Exception ignored) {
            // best-effort; if the session is broken the next tick/close will clean it up
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        stopInternal(session.getId());
    }

    private record RunningSimulation(SimulationEngine engine, ScheduledFuture<?> future) {
    }
}
