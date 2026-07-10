package com.auralis.server.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.auralis.server.entity.MutationLog;

public interface MutationLogService extends IService<MutationLog> {
    void applyMutation(MutationLog mutation);
    void cleanOldMutations(long days);
}
