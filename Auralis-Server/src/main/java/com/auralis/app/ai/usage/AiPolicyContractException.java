package com.auralis.app.ai.usage;

import com.auralis.app.shared.error.DomainException;

/** Internal server invocation does not match the registered operation contract. */
public final class AiPolicyContractException extends DomainException {
    public AiPolicyContractException() {
        super("AI_POLICY_CONTRACT_VIOLATION", "AI invocation contract is invalid");
    }
}
