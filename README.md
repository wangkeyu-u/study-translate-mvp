# Classroom Translation MVP

课堂翻译原型：先整理课件大纲与术语，再将稳定的语音转写分段送去校正和翻译，最后生成可编辑的复习树。

## 运行

需要支持内置 `fetch` 的 Node.js 18+，无需安装第三方 Node 依赖：

```bash
npm start
```

打开 `http://localhost:4173`；可用 `PORT` 改端口。首次启动默认开启演示模式，不需要 API Key。

1. 加载演示课件并提交分析。
2. 点击“演示一句”查看模拟转写和翻译。
3. 生成并编辑记忆树；课程状态可导出为 JSON。

## 真实模型与语音

在 API 页面关闭演示模式，填写服务商的 Key、模型 ID 和 OpenAI 兼容 Base URL。前端通过本地 `/api/ai` 代理调用 `/chat/completions`；模型是否可用由所选服务商决定。GitHub Pages 静态页只能直接使用演示流程，真实模型代理需要本地 Node 服务。

演示模式使用预设返回值，不测量识别或翻译质量。真实语音依赖浏览器 `SpeechRecognition` / Web Speech API；麦克风权限、语言支持和识别服务随浏览器环境而变。

API 设置和课程状态保存在浏览器 `localStorage`。启用真实模型后，课件文本和课堂转写会送往所配置的模型服务；浏览器识别也可能使用远程服务，因此不能把整个链路称为完全离线。

## 目录与处理流

| 文件 | 用途 |
| --- | --- |
| `server.js` | 静态服务、模型代理和请求校验 |
| `app.js` | 课件解析、转写分段/去重、翻译队列、本地状态与复习树 |
| `index.html` / `styles.css` | 界面 |
| `assets/` | 本地背景 |
| `start.command` | macOS 启动入口 |

稳定转写串行进入翻译队列，课件上下文随请求提交；结束或清空课程时用修订号丢弃迟到的结果。复习树是可编辑的结构化整理，不是经过验证的学习效果评估。

## 验证与开发

```bash
node --check server.js
node --check app.js
```

没有独立 ASR 模型、翻译质量基准或自动化测试套件。[AI 辅助开发记录](docs/ai-usage.md)保留实际使用方式和去重修复说明。
