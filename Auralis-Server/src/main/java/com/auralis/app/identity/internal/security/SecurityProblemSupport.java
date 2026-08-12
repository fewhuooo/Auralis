package com.auralis.app.identity.internal.security;

import com.auralis.app.shared.web.TraceIdFilter;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

@Component
public class SecurityProblemSupport implements AuthenticationEntryPoint, AccessDeniedHandler {

    private static final Pattern SAFE_TRACE_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        writeProblem(request, response, 401, "Unauthorized", "UNAUTHENTICATED", "Authentication is required");
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException exception) throws IOException {
        writeProblem(request, response, 403, "Forbidden", "FORBIDDEN", "Access is denied");
    }

    private void writeProblem(
            HttpServletRequest request,
            HttpServletResponse response,
            int status,
            String title,
            String code,
            String detail) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        String traceId = traceId(request, response);
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write("{"
                + "\"type\":\"https://auralis.app/problems/" + code.toLowerCase() + "\","
                + "\"title\":\"" + escape(title) + "\","
                + "\"status\":" + status + ","
                + "\"detail\":\"" + escape(detail) + "\","
                + "\"instance\":\"" + escape(request.getRequestURI()) + "\","
                + "\"code\":\"" + code + "\","
                + "\"traceId\":\"" + escape(traceId) + "\","
                + "\"fieldErrors\":[]"
                + "}");
    }

    private String traceId(HttpServletRequest request, HttpServletResponse response) {
        Object attribute = request.getAttribute(TraceIdFilter.ATTRIBUTE);
        String traceId = attribute instanceof String value && SAFE_TRACE_ID.matcher(value).matches()
                ? value
                : request.getHeader("X-Trace-Id");
        if (traceId == null || !SAFE_TRACE_ID.matcher(traceId).matches()) {
            traceId = UUID.randomUUID().toString();
        }
        response.setHeader("X-Trace-Id", traceId);
        return traceId;
    }

    private String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
