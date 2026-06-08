package com.studycore.server.common;

/**
 * 15.5 UserContext
 * Propagates the logged-in user ID across the thread boundary using ThreadLocal.
 */
public class UserContext {
    private static final ThreadLocal<String> currentUserId = new ThreadLocal<>();
    private static final ThreadLocal<String> currentUserApiKey = new ThreadLocal<>();
    private static final ThreadLocal<String> currentUserBaseUrl = new ThreadLocal<>();

    public static void setCurrentUserId(String userId) {
        currentUserId.set(userId);
    }

    public static String getCurrentUserId() {
        return currentUserId.get();
    }

    public static void setUserApiKey(String apiKey) {
        currentUserApiKey.set(apiKey);
    }

    public static String getUserApiKey() {
        return currentUserApiKey.get();
    }

    public static void setUserBaseUrl(String baseUrl) {
        currentUserBaseUrl.set(baseUrl);
    }

    public static String getUserBaseUrl() {
        return currentUserBaseUrl.get();
    }

    public static void clear() {
        currentUserId.remove();
        currentUserApiKey.remove();
        currentUserBaseUrl.remove();
    }
}
