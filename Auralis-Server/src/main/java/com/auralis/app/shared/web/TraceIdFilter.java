package com.auralis.app.shared.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

@Component
public class TraceIdFilter extends OncePerRequestFilter {
    public static final String ATTRIBUTE = TraceIdFilter.class.getName() + ".traceId";
    private static final Pattern SAFE_TRACE_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String requestedTraceId = request.getHeader("X-Trace-Id");
        String traceId = requestedTraceId != null && SAFE_TRACE_ID.matcher(requestedTraceId).matches()
                ? requestedTraceId
                : UUID.randomUUID().toString();

        request.setAttribute(ATTRIBUTE, traceId);
        response.setHeader("X-Trace-Id", traceId);
        filterChain.doFilter(request, response);
    }
}
