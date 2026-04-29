# OpenClaw 二进制文件存放说明

为了将 OpenClaw 本地智能体随应用打包（Tauri Sidecar），请将对应平台的二进制文件放入此目录下，并遵循 Tauri 的命名规范：

- Windows: `openclaw-x86_64-pc-windows-msvc.exe`
- macOS (Intel): `openclaw-x86_64-apple-darwin`
- macOS (M1/M2): `openclaw-aarch64-apple-darwin`
- Linux: `openclaw-x86_64-unknown-linux-gnu`

目前尚未放入真实文件，所以在打包或运行 Tauri 守护进程时，由于找不到此文件，后台代码会执行容错逻辑并返回默认 Mock Endpoint 提示。
