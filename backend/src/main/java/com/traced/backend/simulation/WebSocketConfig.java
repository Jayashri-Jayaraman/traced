package com.traced.backend.simulation;

import com.traced.backend.security.JwtHandshakeInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final SimulationWebSocketHandler simulationWebSocketHandler;
    private final JwtHandshakeInterceptor jwtHandshakeInterceptor;

    @Value("${app.cors.allowed-origin}")
    private String allowedOrigin;

    public WebSocketConfig(SimulationWebSocketHandler simulationWebSocketHandler, JwtHandshakeInterceptor jwtHandshakeInterceptor) {
        this.simulationWebSocketHandler = simulationWebSocketHandler;
        this.jwtHandshakeInterceptor = jwtHandshakeInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(simulationWebSocketHandler, "/ws/simulation")
                .addInterceptors(jwtHandshakeInterceptor)
                .setAllowedOrigins(allowedOrigin);
    }
}
