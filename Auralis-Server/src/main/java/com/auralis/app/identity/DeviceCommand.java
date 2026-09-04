package com.auralis.app.identity;

public record DeviceCommand(String clientDeviceKey, String name, DevicePlatform platform) {
}
