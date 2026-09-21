package com.traced.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Fixed-window rate limit on /api/auth/** per client IP, to slow down credential
 * stuffing / signup abuse. In-memory only: fine for a single instance, but each
 * instance would track its own counts behind a load balancer — swap for a shared
 * store (e.g. Redis) before running more than one replica.
 */
@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final long WINDOW_MS = 60_000;

    private final int limitPerWindow;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public AuthRateLimitFilter(@Value("${app.ratelimit.auth-per-minute:20}") int limitPerWindow) {
        this.limitPerWindow = limitPerWindow;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        if (!request.getRequestURI().startsWith("/api/auth/")) {
            filterChain.doFilter(request, response);
            return;
        }

        String clientIp = clientIp(request);
        long now = System.currentTimeMillis();
        Window window = windows.computeIfAbsent(clientIp, k -> new Window(now));

        synchronized (window) {
            if (now - window.startedAt >= WINDOW_MS) {
                window.startedAt = now;
                window.count.set(0);
            }
            if (window.count.incrementAndGet() > limitPerWindow) {
                response.setStatus(429);
                response.setContentType("application/json");
                response.getWriter().write("{\"message\":\"Too many requests, please try again shortly.\"}");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private static final class Window {
        volatile long startedAt;
        final AtomicInteger count = new AtomicInteger(0);

        Window(long startedAt) {
            this.startedAt = startedAt;
        }
    }
}
