# 留学生课堂翻译助手 / Classroom Translation Assistant for International Students

> 先从课件中抽取大纲、术语表和易误译词，再用这些上下文优化课堂实时转写和翻译 —— 课后自动生成记忆树。
>
> Extracts outlines, glossaries, and mistranslation-prone terms from course materials first, then uses that context to optimize real-time classroom transcription and translation — auto-generates a memory tree after class.

[![Node.js](https://img.shields.io/badge/Node.js-Backend-339933)](https://nodejs.org/)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E)]()
[![Web Speech API](https://img.shields.io/badge/ASR-Web%20Speech%20API-blue)]()
[![Type](https://img.shields.io/badge/type-MVP-orange)]()

---

## 简介 / Overview

面向海外留学生英文课堂场景的翻译助手。核心不是单次翻译，而是**先理解课件，再优化课堂实时翻译**。工程上用本地 Node.js 代理统一处理模型请求，前端负责语音识别、分段去重、实时追加译文、本地持久化和课后记忆树。

A translation assistant for international students in English-language classrooms. The core isn't single-shot translation — it's **understanding the course material first, then optimizing real-time translation**. A local Node.js proxy handles all model requests; the frontend handles speech recognition, segment deduplication, real-time translation append, local persistence, and post-class memory trees.

> 💡 内置**演示模式**，不需要 API Key 也能跑通"课件分析 → 实时翻译 → 记忆树保存"的完整流程。
>
> 💡 Built-in **demo mode** — runs the full "material analysis → real-time translation → memory tree" pipeline without any API key.

---

## 核心功能 / Key Features

### 课件分析 / Material Analysis
- 上传或粘贴课件内容，AI 自动提取**大纲、术语表、易误译词**
- 支持 txt / md / csv / json / pdf / pptx / docx
- Upload or paste course materials; AI extracts **outline, glossary, mistranslation-prone terms**
- Supports txt / md / csv / json / pdf / pptx / docx

### 实时课堂翻译 / Real-time Classroom Translation
- 点击翻译按钮开启麦克风，实时识别课堂语音并翻译
- 提交课件后，翻译自动结合课件大纲和术语表优化专业词
- 未提交课件时使用普通实时语音翻译
- Tap to start mic; real-time speech recognition + translation
- After submitting materials, translation auto-optimizes using outline & glossary
- Falls back to generic real-time translation without materials

### 课后记忆树 / Post-class Memory Tree
- 点击生成记忆树表示本节课结束
- 系统根据课件大纲和课堂记录套用可编辑记忆树模板
- 课堂玩笑、闲聊、点名、设备调试等内容不作为复习节点
- Tap to generate memory tree marking class end
- System applies editable template using outline + class notes
- Jokes, chitchat, roll call, device setup are excluded from review nodes

### 其他 / Others
- App 式三栏导航（首页 · API · 我的）/ App-style 3-tab navigation (Home · API · Profile)
- 深色潮流界面，不依赖外网图片资源 / Dark trendy UI, no external image dependencies
- 全站常驻学术 AI Agent，只回答学术/课程/翻译/学习相关问题 / Site-wide academic AI agent, only answers academic/course/translation/study questions
- 当前课程状态保存在本地浏览器，支持导出/导入 JSON 备份 / Course state saved in browser, export/import JSON backup

---

## 快速开始 / Quick Start

```bash
node server.js
```

打开 / Open：`http://localhost:4173`

> 面试演示时保持 API 页面的「演示模式」开启即可，无需填写 API Key。
> For demo purposes, keep "Demo Mode" on in the API page — no API key needed.

---

## 演示模式 / Demo Mode

| 功能 / Feature | 说明 / Description |
|---|---|
| 演示课件 / Demo material | 自动填充一份课堂材料并生成大纲、术语表和易误译词 / Auto-fills sample material, generates outline/glossary/mistranslations |
| 演示一句 / Demo sentence | 模拟一段课堂英文语音，展示 ASR 校正和实时翻译链路 / Simulates classroom English speech, shows ASR correction + translation pipeline |

---

## API 配置 / API Configuration

默认使用 OpenAI 兼容接口 / Uses OpenAI-compatible API by default：

```
Base URL: https://api.openai.com/v1
Default model: gpt-4.1-mini
```

也支持其他兼容 `/chat/completions` 的服务（DeepSeek、通义、Ollama 等）。在「API」页面填写 Key、模型和 Base URL 即可。/ Also supports other `/chat/completions`-compatible services (DeepSeek, Qwen, Ollama, etc.). Fill in Key, model, and Base URL on the API page.

内置模型预设 / Built-in model presets：GPT-5.2、GPT-5.1、GPT-5、GPT-5 mini/nano、GPT-4.1、GPT-4o 等，并支持自定义模型名。

---

## 语音识别 / Speech Recognition

实时语音识别使用浏览器 **Web Speech API**。建议使用 Chrome 或 Edge，并允许网页访问麦克风。/ Real-time speech recognition uses the browser **Web Speech API**. Use Chrome or Edge and grant microphone permission.

---

## 文件结构 / File Structure

```
study-translate-mvp/
├── server.js          # Node.js 后端：AI 代理 + 静态服务 / Backend: AI proxy + static server
├── app.js             # 前端交互逻辑 / Frontend interaction logic
├── index.html         # 主页面 / Main page
├── styles.css         # 样式 / Styles
├── assets/            # 本地抽象背景图片 / Local abstract backgrounds
├── start.command      # macOS 一键启动 / macOS one-click launcher
├── package.json
└── README.md
```

---

## 架构设计 / Architecture

```
课件上传 → AI 代理(/api/ai) → 大纲 + 术语表 + 易误译词
                                         ↓
课堂语音 → Web Speech API → ASR 校正 → 实时翻译(结合课件上下文) → 译文追加
                                         ↓
                              课后记忆树(模板 + 课件大纲 + 课堂记录)
```

- 本地代理 `/api/ai` 统一处理模型请求，增加 base URL、消息角色、长度和 response format 校验，避免前端直接暴露模型请求细节
- Local proxy `/api/ai` handles all model requests with validation (base URL, message roles, length, response format), preventing the frontend from exposing model request details

---

## 许可证 / License

MIT
