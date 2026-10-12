package com.auralis.app.ai.usage;

public interface AiInvocationGateway {

    AiTaskScope beginTask(AiTaskContext context);
}
