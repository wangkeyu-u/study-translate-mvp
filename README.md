# 留学生课堂翻译助手 / Classroom Translation Assistant for International Students

> 先从课件中抽取大纲、术语表和易误译词，再用这些上下文优化课堂实时转写和翻译，课后生成可编辑记忆树。
>
> Extracts outlines, glossaries, and mistranslation-prone terms from course materials first, then uses that context to optimize real-time classroom transcription and translation, with an editable memory tree after class.

[![Node.js](https://img.shields.io/badge/Node.js-Backend-339933)](https://nodejs.org/)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E)]()
[![Web Speech API](https://img.shields.io/badge/ASR-Web%20Speech%20API-blue)]()
[![Type](https://img.shields.io/badge/type-MVP-orange)]()

---

## 简介 / Overview

面向海外留学生英文课堂场景的翻译助手。核心不是单次翻译，而是**先理解课件，再优化课堂实时翻译**。工程上用本地 Node.js 代理统一处理模型请求，前端负责语音识别、分段去重、实时追加译文、本地持久化和课后记忆树。

A translation assistant for international students in English-language classrooms. The core is not single-shot translation; it is **understanding course material first, then optimizing real-time classroom translation**. A local Node.js proxy handles model requests, while the frontend handles speech recognition, segment deduplication, real-time translation display, local persistence, and post-class memory trees.

> 内置**演示模式**，不需要 API Key 也能跑通“课件分析 -> 实时翻译 -> 记忆树保存”的完整流程。
>
> Built-in **demo mode** runs the full "material analysis -> real-time translation -> memory tree" pipeline without an API key.

---

## 核心功能 / Key Features

### 课件分析 / Material Analysis

- 上传或粘贴课件内容，AI 自动提取**大纲、术语表、易误译词**
- 支持 `txt` / `md` / `csv` / `json` / `pdf` / `pptx` / `docx`
- Upload or paste course materials; AI extracts **outline, glossary, and mistranslation-prone terms**
- Supports `txt` / `md` / `csv` / `json` / `pdf` / `pptx` / `docx`

### 实时课堂翻译 / Real-time Classroom Translation

- 点击翻译按钮开启麦克风，实时识别课堂语音并翻译
- 提交课件后，翻译自动结合课件大纲和术语表优化专业词
- 未提交课件时使用普通实时语音翻译
- Tap to start the microphone, then perform real-time speech recognition and translation
- After submitting materials, translation uses the course outline and glossary to improve terminology
- Falls back to generic real-time translation when no course material has been submitted

### 课后记忆树 / Post-class Memory Tree

- 点击生成记忆树表示本节课结束
- 系统根据课件大纲和课堂记录套用可编辑记忆树模板
- 课堂玩笑、闲聊、点名、设备调试等内容不作为复习节点
- Tap to generate a memory tree at the end of class
- The system applies an editable memory-tree template using the outline and class notes
- Jokes, chitchat, roll call, and device setup are excluded from review nodes

### 其他 / Others

- App 式三栏导航：首页、API、我的 / App-style 3-tab navigation: Home, API, Profile
- 深色界面，不依赖外网图片资源 / Dark UI with no external image dependency
- 全站常驻学术 AI Agent，只回答学术、课程、翻译和学习相关问题 / Site-wide academic AI agent for study-related questions
- 当前课程状态保存在本地浏览器，支持导出/导入 JSON 备份 / Course state is saved in the browser with JSON export/import backup

---

## AI 辅助开发方式 / AI-assisted Development

本项目在开发过程中使用 Codex 作为本地工程协作工具，主要用于需求拆解、代码生成、问题定位和文档整理。实际代码围绕项目目标进行筛选、调整和验证，重点保证功能闭环、可运行性和面试演示稳定性。

Codex 在项目中的使用方式：

- 需求拆解：将“留学生课堂实时翻译助手”拆成课前课件分析、课中语音翻译、课后记忆树复习、API 设置和本地存储几个模块。
- 原型搭建：根据功能需求生成 `index.html`、`styles.css`、`app.js` 和 `server.js` 的初始结构。
- 交互迭代：根据测试反馈调整首页/API/我的三栏导航、实时转写框、实时译文框、演示课件和演示语音入口。
- Bug 修复：定位并修复实时语音识别中 interim transcript 重复触发翻译的问题，改成“稳定句子 -> 去重 -> AI 校正 -> 翻译”的流程。
- 工程整理：补充工程级注释、README 说明、GitHub Pages 静态部署支持和面试演示模式。

Codex 的作用是提高开发效率。项目核心设计包括：课件上下文增强翻译、语音识别结果校正、翻译队列、重复句过滤、本地数据持久化和可编辑记忆树。

---

## GPT-5.6 使用方式 / GPT-5.6 Usage

项目支持 OpenAI 兼容的 `/chat/completions` 接口。只要服务商支持对应模型名，就可以在 API 页面填写 `gpt-5.6` 或服务商提供的 GPT-5.6 兼容模型 ID。

配置步骤：

1. 打开页面底部的 `API`。
2. 在 `服务地址` 中填写 OpenAI 兼容接口地址，例如：

```text
https://api.openai.com/v1
```

3. 在 `当前/自定义模型名` 中填写：

```text
gpt-5.6
```

4. 关闭 `演示模式`。
5. 在 `API Key` 中填写自己的密钥。
6. 点击 `保存`。
7. 回到首页上传课件或点击 `演示课件`，再点击 `翻译` 开始实时语音翻译。

GPT-5.6 在项目中的调用场景：

- 课件分析：读取上传或粘贴的课程材料，生成课程大纲、重点知识、专业术语和易误译词。
- 实时语音翻译：接收浏览器语音识别出的英文句子，先校正口语语法、误听词和缺失词，再生成中文译文。
- 上下文增强：如果课件已经提交，翻译时会把课程大纲和术语表一起放入提示词，让模型优先采用专业课语境下的译法。
- 学术 AI Agent：根据当前课程上下文回答学习、翻译、术语解释和复习相关问题。

线上 GitHub Pages 版本没有本地 Node.js 代理，因此默认建议使用 `演示模式` 展示完整流程。如果要使用真实 GPT-5.6 API，建议在本机运行项目，或后续接入云端后端服务。

---

## 快速开始 / Quick Start

```bash
node server.js
```

打开 / Open:

```text
http://localhost:4173
```

面试演示时保持 API 页面的 `演示模式` 开启即可，无需填写 API Key。

For demo purposes, keep `Demo Mode` enabled on the API page. No API key is required.

---

## 演示模式 / Demo Mode

| 功能 / Feature | 说明 / Description |
|---|---|
| 演示课件 / Demo material | 自动填充一份课堂材料并生成大纲、术语表和易误译词 / Auto-fills sample material and generates outline, glossary, and mistranslation-prone terms |
| 演示一句 / Demo sentence | 模拟一段课堂英文语音，展示 ASR 校正和实时翻译链路 / Simulates classroom English speech and shows the ASR correction + translation pipeline |

---

## API 配置 / API Configuration

默认使用 OpenAI 兼容接口 / Uses OpenAI-compatible API by default:

```text
Base URL: https://api.openai.com/v1
Default model: gpt-4.1-mini
```

也支持其他兼容 `/chat/completions` 的服务。在 `API` 页面填写 Key、模型和 Base URL 即可。

It also supports other `/chat/completions`-compatible services. Fill in the key, model, and Base URL on the `API` page.

内置模型预设包括 GPT-5.2、GPT-5.1、GPT-5、GPT-5 mini/nano、GPT-4.1、GPT-4o 等，并支持自定义模型名，例如 `gpt-5.6`。

Built-in model presets include GPT-5.2, GPT-5.1, GPT-5, GPT-5 mini/nano, GPT-4.1, GPT-4o, and custom model names such as `gpt-5.6`.

---

## 语音识别 / Speech Recognition

实时语音识别使用浏览器 **Web Speech API**。建议使用 Chrome 或 Edge，并允许网页访问麦克风。

Real-time speech recognition uses the browser **Web Speech API**. Use Chrome or Edge and grant microphone permission.

---

## 文件结构 / File Structure

```text
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

```text
课件上传 -> AI 代理(/api/ai) -> 大纲 + 术语表 + 易误译词
                                         ↓
课堂语音 -> Web Speech API -> ASR 校正 -> 实时翻译(结合课件上下文) -> 译文追加
                                         ↓
                              课后记忆树(模板 + 课件大纲 + 课堂记录)
```

- 本地代理 `/api/ai` 统一处理模型请求，增加 base URL、消息角色、长度和 response format 校验，避免前端直接暴露模型请求细节。
- Local proxy `/api/ai` handles model requests with validation for base URL, message roles, length, and response format.

---

## 许可证 / License

MIT
