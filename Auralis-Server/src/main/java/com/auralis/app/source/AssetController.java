package com.auralis.app.source;

import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

import static org.springframework.http.HttpStatus.CREATED;

@RestController
@RequestMapping("/api/assets")
public class AssetController {

    private final AssetService assetService;

    public AssetController(AssetService assetService) {
        this.assetService = assetService;
    }

    @PostMapping("/upload-intents")
    public ResponseEntity<AssetDtos.UploadIntentResponse> createUploadIntent(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody AssetDtos.UploadIntentRequest request) {
        AssetDtos.UploadIntentResponse response = AssetDtos.UploadIntentResponse.from(
                assetService.createUploadIntent(principal.userId(), request.command()));
        return ResponseEntity.status(CREATED)
                .location(URI.create("/api/assets/" + response.assetId()))
                .body(response);
    }

    @PostMapping("/{id}/complete")
    public AssetDtos.Response complete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id) {
        return AssetDtos.Response.from(assetService.complete(principal.userId(), id));
    }

    @PostMapping("/{id}/download-url")
    public AssetDtos.DownloadUrlResponse downloadUrl(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id) {
        return AssetDtos.DownloadUrlResponse.from(assetService.downloadUrl(principal.userId(), id));
    }
}
