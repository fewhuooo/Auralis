package com.studycore.server.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Spring multipart 框架层拦截：文件超过 spring.servlet.multipart.max-file-size 阈值
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    public Result<String> handleMaxUploadSize(MaxUploadSizeExceededException e) {
        log.warn("[Upload] File size exceeds framework limit: {}", e.getMessage());
        return Result.error(413, "上传文件过大，请确保文件不超过 50MB");
    }

    /**
     * 业务层校验：自定义文件大小超限异常
     */
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<String> handleIllegalArgument(IllegalArgumentException e) {
        log.warn("[Validation] {}", e.getMessage());
        return Result.error(400, e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public Result<String> handleException(Exception e) {
        log.error("Global Exception: ", e);
        return Result.error(500, "Internal Server Error: " + e.getMessage());
    }
}
