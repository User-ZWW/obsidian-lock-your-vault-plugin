# Obsidian Liquid Lock 💧

Obsidian 的液态玻璃拟态锁屏插件。
类似于苹果的锁屏效果，提供隐私保护，防止他人在您离开时查看您的笔记。

![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ 特性 (Features)

- **🛡️ 隐私保护**: 失去焦点或长时间无操作自动锁定。
- **🎨 极致美学**: 采用液态玻璃拟态 (Liquid Glassmorphism) 设计，高斯模糊背景 + 动态流体效果。
- **🔢 PIN 码解锁**: 简单快捷的 4 位 PIN 码解锁，输入错误会有震动反馈。
- **⚙️ 高度可配**:
    - 自定义 PIN 码。
    - 自定义自动锁定时间 (分钟)。
    - 是否在启动时自动锁定。
    - 是否模糊背景内容 (即将推出)。

## 🚀 安装 (Installation)

1.  下载本项目源码。
2.  在项目根目录运行命令安装依赖：
    ```bash
    npm install
    ```
3.  编译插件：
    ```bash
    npm run build
    ```
4.  将生成的 `main.js`, `manifest.json`, `styles.css` 复制到您的 Obsidian 插件目录：
    `YourVault/.obsidian/plugins/obsidian-liquid-lock/`
5.  在 Obsidian 设置中启用插件。

## 📖 使用指南 (Usage)

1.  **初始设置**: 启用插件后，请立即进入 **设置 -> Liquid Lock Settings** 修改默认 PIN 码 (默认为 `1234`)。
2.  **自动锁定**:
    - 插件会监测您的鼠标移动和键盘输入，若超过设定的时间 (默认 5 分钟) 无操作，将自动锁定。
    - (可选) 每次启动 Obsidian 时自动锁定。
3.  **手动锁定**:
    - **命令面板**: 按 `Ctrl/Cmd + P` 打开命令面板，输入 "Lock Obsidian" 并回车。
    - **快捷键**: 您可以在 **设置 -> 快捷键** 中搜索 "Lock Obsidian" 并绑定您习惯的快捷键 (例如 `Ctrl + L`)。
4.  **手动解锁**: 点击屏幕上的数字键盘或直接使用键盘输入 PIN 码。
    - `Backspace` / `Delete`: 删除一位。
    - 输入满 4 位自动验证。

## 🤝 贡献 (Contributing)

欢迎提交 Issue 和 PR！

## 📄 许可证 (License)

MIT License
