package com.auralis.server.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SyncPushResponse {
    private List<String> successBlockIds;
    private List<String> successTaskIds;
    private List<String> conflictBlockIds;
    private List<String> conflictTaskIds;
}
