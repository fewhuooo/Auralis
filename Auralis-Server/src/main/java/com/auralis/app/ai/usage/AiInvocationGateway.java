package com.auralis.app.ai.usage;

public interface AiInvocationGateway {

    AiTaskScope beginTask(AiTaskContext context);

    /**
     * Returns the persisted lifetime usage snapshot for a private Overview budget task.
     * Lightweight gateway stubs may return {@code null}; production gateways provide the ledger view.
     */
    default OverviewTaskUsageSummary overviewTaskUsage(AiTaskContext context) {
        return null;
    }
}
