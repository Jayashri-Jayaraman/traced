package com.traced.backend.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Registered outside the Spring Security filter chain (see {@link RequestLoggingConfig}) so it
 * wraps the whole request, security included, and can log the final response status. Emits one
 * line per request to the "com.traced.backend.access" logger, tagged with a request id that's
 * also echoed back as a response header for client-side correlation.
 */
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger accessLog = LoggerFactory.getLogger("com.traced.backend.access");
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String MDC_REQUEST_ID = "requestId";
    private static final String MDC_USER = "user";

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String requestId = request.getHeader(REQUEST_ID_HEADER);
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }
        response.setHeader(REQUEST_ID_HEADER, requestId);
        MDC.put(MDC_REQUEST_ID, requestId);

        long startedAt = System.currentTimeMillis();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = System.currentTimeMillis() - startedAt;
            // JwtAuthFilter sets this in MDC when it authenticates a request; it survives here
            // because MDC is independent of SecurityContextHolder, which is already cleared by
            // this point in the chain.
            String user = MDC.get(MDC_USER) != null ? MDC.get(MDC_USER) : "-";
            accessLog.info("{} {} status={} durationMs={} ip={} user={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    response.getStatus(),
                    durationMs,
                    clientIp(request),
                    user);
            MDC.remove(MDC_REQUEST_ID);
            MDC.remove(MDC_USER);
        }
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
