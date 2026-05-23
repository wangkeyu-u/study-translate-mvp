const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const state = {
  extractedText: "",
  fileNames: [],
  analysis: null,
  lastTranslation: "",
  translationLog: [],
  lastSummary: "",
  recognition: null,
  listening: false,
  voiceShouldRun: false,
  transcript: "",
  interimTranscript: "",
  pendingInterim: "",
  lastQueuedVoiceText: "",
  voiceSegmentSignatures: new Set(),
  translatingSources: new Set(),
  lastTranslationError: "",
  translationTimer: null,
  translationQueue: Promise.resolve(),
  lectureRevision: 0,
  pendingMemoryTree: "",
  agentHistory: [],
  agentComposing: false,
  agentSending: false
};

const defaultSettings = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.2",
  apiKey: ""
};

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 2600);
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.original = button.textContent;
    button.textContent = label || "处理中";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.original || button.textContent;
    button.disabled = false;
  }
}

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem("studyTranslateSettings") || "{}");
  const settings = { ...defaultSettings, ...saved };
  $("#baseUrl").value = settings.baseUrl;
  $("#model").value = settings.model;
  $("#apiKey").value = settings.apiKey;
  const preset = $(`#modelPreset option[value="${settings.model}"]`);
  $("#modelPreset").value = preset ? settings.model : "custom";
}

function getSettings() {
  return {
    baseUrl: $("#baseUrl").value.trim() || defaultSettings.baseUrl,
    model: $("#model").value.trim() || defaultSettings.model,
    apiKey: $("#apiKey").value.trim()
  };
}

function saveSettings() {
  localStorage.setItem("studyTranslateSettings", JSON.stringify(getSettings()));
  toast("API 设置已保存在本机。");
}

function saveCourseState() {
  const courseState = {
    extractedText: state.extractedText,
    fileNames: state.fileNames,
    analysis: state.analysis,
    lastTranslation: state.lastTranslation,
    translationLog: state.translationLog,
    transcript: state.transcript,
    courseName: $("#courseName")?.value || "",
    targetLanguage: $("#targetLanguage")?.value || "中文",
    manualText: $("#manualText")?.value || ""
  };
  localStorage.setItem("studyTranslateCourseState", JSON.stringify(courseState));
}

function loadCourseState() {
  try {
    const saved = JSON.parse(localStorage.getItem("studyTranslateCourseState") || "{}");
    state.extractedText = saved.extractedText || "";
    state.fileNames = saved.fileNames || [];
    state.analysis = saved.analysis || null;
    state.lastTranslation = saved.lastTranslation || "";
    state.translationLog = Array.isArray(saved.translationLog) ? saved.translationLog : [];
    state.transcript = saved.transcript || "";
    state.interimTranscript = "";
    state.voiceSegmentSignatures = new Set(
      state.transcript
        .split("\n")
        .map(normalizeVoiceSegment)
        .filter(Boolean)
    );
    $("#courseName").value = saved.courseName || "";
    $("#targetLanguage").value = saved.targetLanguage || "中文";
    $("#manualText").value = saved.manualText || "";
    if (state.fileNames.length) {
      $("#fileStatus").textContent = `${state.fileNames.length} 个文件`;
      $("#profileFileCount").textContent = String(state.fileNames.length);
    }
    if (state.analysis) renderAnalysis();
    if (state.transcript) $("#liveTranscript").textContent = state.transcript;
    if (state.translationLog.length) $("#translationResult").textContent = state.translationLog.join("\n\n");
  } catch {
    localStorage.removeItem("studyTranslateCourseState");
  }
}

function loadAgentHistory() {
  try {
    state.agentHistory = JSON.parse(localStorage.getItem("studyTranslateAgentHistory") || "[]");
  } catch {
    state.agentHistory = [];
  }
}

function saveAgentHistory() {
  localStorage.setItem("studyTranslateAgentHistory", JSON.stringify(state.agentHistory.slice(-40)));
}

function loadMemoryTrees() {
  try {
    return JSON.parse(localStorage.getItem("studyTranslateMemoryTrees") || "[]");
  } catch {
    return [];
  }
}

function saveMemoryTrees(trees) {
  localStorage.setItem("studyTranslateMemoryTrees", JSON.stringify(trees));
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTreeNode(label, children = []) {
  return {
    id: createId(),
    label: label.trim() || "新分支",
    expanded: true,
    children
  };
}

function parseMemoryTreeToNodes(content) {
  const lines = String(content || "")
    .split("\n")
    .map(line => line.replace(/```/g, "").trimEnd())
    .filter(line => line.trim());
  const roots = [];
  const stack = [];

  lines.forEach(line => {
    const prefix = line.match(/^[\s│├└─]+/)?.[0] || "";
    const label = line.replace(/^[\s│├└─]+/, "").trim();
    if (!label) return;
    const depth = Math.max(0, Math.floor(prefix.length / 4));
    const node = createTreeNode(label);
    stack[depth] = node;
    stack.length = depth + 1;
    if (depth === 0 || !stack[depth - 1]) roots.push(node);
    else stack[depth - 1].children.push(node);
  });

  return roots.length ? roots : [createTreeNode("记忆树")];
}

function nodesToText(nodes, depth = 0) {
  return nodes.map((node, index) => {
    const connector = depth === 0 ? "" : index === nodes.length - 1 ? "└── " : "├── ";
    const prefix = depth === 0 ? "" : "│   ".repeat(depth - 1);
    const line = `${prefix}${connector}${node.label}`;
    const childText = node.children?.length ? nodesToText(node.children, depth + 1) : "";
    return [line, childText].filter(Boolean).join("\n");
  }).join("\n");
}

function findTreeNode(nodes, nodeId) {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findTreeNode(node.children || [], nodeId);
    if (found) return found;
  }
  return null;
}

function updateMemoryTree(treeId, updater) {
  const trees = loadMemoryTrees();
  const tree = trees.find(item => item.id === treeId);
  if (!tree) return;
  if (!tree.nodes) tree.nodes = parseMemoryTreeToNodes(tree.content);
  updater(tree);
  tree.content = nodesToText(tree.nodes);
  saveMemoryTrees(trees);
  renderSavedMemoryTrees();
}

function truncateText(text, maxChars = 36000) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[内容过长，已截取前 ${maxChars} 个字符用于本次 AI 分析]`;
}

function scrollToLatest(selector) {
  const el = $(selector);
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function normalizeVoiceSegment(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelySpeechSegment(text) {
  const clean = String(text || "").trim();
  if (!clean) return false;
  if (!/[a-zA-Z]/.test(clean)) return false;
  return normalizeVoiceSegment(clean).length >= 2;
}

async function askAi(messages, options = {}) {
  const settings = getSettings();
  if (!settings.apiKey) {
    throw new Error("请先填写并保存 API Key。");
  }

  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...settings,
      messages,
      temperature: options.temperature ?? 0.2,
      responseFormat: options.responseFormat
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "AI 请求失败。");
  }

  return payload.choices?.[0]?.message?.content || "";
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI 返回内容不是可解析的 JSON。");
  }
}

function renderList(container, items) {
  container.innerHTML = "";
  (items || []).forEach(item => {
    const li = document.createElement("li");
    li.textContent = typeof item === "string" ? item : JSON.stringify(item);
    container.appendChild(li);
  });
}

function renderAnalysis() {
  if (!state.analysis) return;
  $("#analysisEmpty").classList.add("hidden");
  $("#analysisResult").classList.remove("hidden");
  $("#contextStatus").textContent = "已生成课件大纲";
  $("#contextStatus").classList.add("ready");
  $("#translateMode").textContent = "高级翻译";
  $("#translateMode").classList.add("ready");
  $("#advancedTranslationCard").classList.remove("hidden");
  $("#profileContextState").textContent = "已生成";

  renderList($("#keyPoints"), state.analysis.keyPoints);
  renderList($("#pitfalls"), state.analysis.translationPitfalls);

  const terms = $("#terms");
  terms.innerHTML = "";
  (state.analysis.terms || []).forEach(term => {
    const card = document.createElement("div");
    card.className = "term-card";
    const title = document.createElement("strong");
    title.textContent = `${term.source || term.term || "Term"} -> ${term.bestTranslation || term.translation || ""}`;
    const desc = document.createElement("span");
    desc.textContent = term.explanation || term.note || "";
    card.append(title, desc);
    terms.appendChild(card);
  });
}

function renderSavedMemoryTrees() {
  const trees = loadMemoryTrees();
  $("#memoryTreeCount").textContent = `${trees.length} 个`;
  const container = $("#savedMemoryTrees");
  container.innerHTML = "";

  if (!trees.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "命名保存后的记忆树会显示在这里。";
    container.appendChild(empty);
    return;
  }

  trees.forEach(tree => {
    if (!tree.nodes) tree.nodes = parseMemoryTreeToNodes(tree.content);
    const card = document.createElement("article");
    card.className = "memory-tree-card";

    const header = document.createElement("header");
    const titleWrap = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = tree.name;
    const course = document.createElement("p");
    course.className = "hint";
    course.textContent = tree.courseName || "未命名课程";
    titleWrap.append(title, course);

    const time = document.createElement("time");
    time.textContent = new Date(tree.createdAt).toLocaleDateString();
    header.append(titleWrap, time);

    const rootButton = document.createElement("button");
    rootButton.className = "tree-action root-action";
    rootButton.textContent = "+ 根分支";
    rootButton.addEventListener("click", () => {
      const label = prompt("新根分支名称");
      if (!label?.trim()) return;
      updateMemoryTree(tree.id, item => item.nodes.push(createTreeNode(label)));
    });

    const treeView = document.createElement("div");
    treeView.className = "interactive-tree";
    treeView.appendChild(renderTreeNodes(tree.nodes, tree.id));
    card.append(header, rootButton, treeView);
    container.appendChild(card);
  });

  saveMemoryTrees(trees);
}

function renderTreeNodes(nodes, treeId) {
  const list = document.createElement("ul");
  list.className = "tree-list";

  nodes.forEach(node => {
    const item = document.createElement("li");
    item.className = "tree-item";

    const row = document.createElement("div");
    row.className = "tree-row";

    const toggle = document.createElement("button");
    toggle.className = "tree-toggle";
    toggle.textContent = node.children?.length ? (node.expanded === false ? "›" : "⌄") : "•";
    toggle.title = "展开或收起";
    toggle.addEventListener("click", () => {
      if (!node.children?.length) return;
      updateMemoryTree(treeId, tree => {
        const target = findTreeNode(tree.nodes, node.id);
        if (target) target.expanded = target.expanded === false;
      });
    });

    const label = document.createElement("button");
    label.className = "tree-label";
    label.textContent = node.label;
    label.title = "点击修改节点名称";
    label.addEventListener("click", () => {
      const next = prompt("修改节点名称", node.label);
      if (!next?.trim()) return;
      updateMemoryTree(treeId, tree => {
        const target = findTreeNode(tree.nodes, node.id);
        if (target) target.label = next.trim();
      });
    });

    const addChild = document.createElement("button");
    addChild.className = "tree-action";
    addChild.textContent = "+";
    addChild.title = "添加子分支";
    addChild.addEventListener("click", () => {
      const child = prompt(`给「${node.label}」添加子分支`);
      if (!child?.trim()) return;
      updateMemoryTree(treeId, tree => {
        const target = findTreeNode(tree.nodes, node.id);
        if (!target) return;
        target.children = target.children || [];
        target.children.push(createTreeNode(child));
        target.expanded = true;
      });
    });

    row.append(toggle, label, addChild);
    item.appendChild(row);
    if (node.children?.length && node.expanded !== false) {
      item.appendChild(renderTreeNodes(node.children, treeId));
    }
    list.appendChild(item);
  });

  return list;
}

function openMemoryModal(content) {
  state.pendingMemoryTree = content;
  const courseName = $("#courseName").value.trim();
  $("#memoryTreeName").value = courseName ? `${courseName} 记忆树` : "";
  $("#memoryTreePreview").textContent = content;
  $("#memoryModal").classList.remove("hidden");
  $("#memoryTreeName").focus();
}

function closeMemoryModal() {
  $("#memoryModal").classList.add("hidden");
}

function savePendingMemoryTree() {
  const name = $("#memoryTreeName").value.trim();
  if (!name) {
    toast("请先给这棵记忆树命名。");
    return;
  }
  if (!state.pendingMemoryTree) {
    toast("还没有可保存的记忆树。");
    return;
  }

  const trees = loadMemoryTrees();
  trees.unshift({
    id: createId(),
    name,
    courseName: $("#courseName").value.trim() || "未命名课程",
    createdAt: new Date().toISOString(),
    content: state.pendingMemoryTree,
    nodes: parseMemoryTreeToNodes(state.pendingMemoryTree)
  });
  saveMemoryTrees(trees);
  renderSavedMemoryTrees();
  saveCourseState();
  closeMemoryModal();
  switchScreen("profileScreen");
  toast("记忆树已保存到我的。");
}

function renderAgentMessages() {
  const container = $("#agentMessages");
  container.innerHTML = "";
  const intro = document.createElement("div");
  intro.className = "agent-message assistant";
  intro.textContent = "我只回答学术、课程、翻译和学习相关问题。";
  container.appendChild(intro);
  state.agentHistory.forEach(message => {
    const bubble = document.createElement("div");
    bubble.className = `agent-message ${message.role === "user" ? "user" : "assistant"}`;
    bubble.textContent = message.content;
    container.appendChild(bubble);
  });
  scrollToLatest("#agentMessages");
}

function agentContext() {
  return [
    $("#courseName").value.trim() ? `课程名称：${$("#courseName").value.trim()}` : "",
    state.analysis ? `课件大纲和术语表：\n${analysisContext()}` : "",
    state.transcript ? `课堂实时转写节选：\n${truncateText(state.transcript, 12000)}` : "",
    state.translationLog.length ? `实时译文节选：\n${truncateText(state.translationLog.join("\n\n"), 12000)}` : ""
  ].filter(Boolean).join("\n\n");
}

async function askAcademicAgent() {
  if (state.agentSending) return;
  const input = $("#agentQuestion");
  const question = input.value.trim();
  if (!question) return;

  state.agentSending = true;
  state.agentHistory.push({ role: "user", content: question });
  input.value = "";
  renderAgentMessages();
  saveAgentHistory();

  const button = $("#agentAsk");
  setBusy(button, true, "问中");
  try {
    const content = await askAi([
      {
        role: "system",
        content: "You are an academic-only AI agent inside a study translation app. You may answer questions about school subjects, coursework, lecture content, academic writing, terminology, translation for study, exams, research, and learning methods. If the user asks for non-academic content, politely refuse in Chinese and ask them to ask an academic question. Do not answer entertainment, gossip, shopping, dating, or unrelated personal requests."
      },
      {
        role: "user",
        content: `当前课程上下文：\n${agentContext() || "暂无课程上下文"}\n\n用户问题：${question}`
      }
    ], { temperature: 0.2 });
    state.agentHistory.push({ role: "assistant", content });
  } catch (error) {
    state.agentHistory.push({ role: "assistant", content: error.message });
  } finally {
    setBusy(button, false);
    state.agentSending = false;
    renderAgentMessages();
    saveAgentHistory();
  }
}

function exportAllData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: JSON.parse(localStorage.getItem("studyTranslateSettings") || "{}"),
    courseState: JSON.parse(localStorage.getItem("studyTranslateCourseState") || "{}"),
    memoryTrees: loadMemoryTrees(),
    agentHistory: state.agentHistory
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `study-translate-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast("已导出本地数据备份。");
}

async function importAllData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.settings) localStorage.setItem("studyTranslateSettings", JSON.stringify(payload.settings));
    if (payload.courseState) localStorage.setItem("studyTranslateCourseState", JSON.stringify(payload.courseState));
    if (payload.memoryTrees) saveMemoryTrees(payload.memoryTrees);
    if (payload.agentHistory) {
      state.agentHistory = payload.agentHistory;
      saveAgentHistory();
    }
    loadSettings();
    loadCourseState();
    renderSavedMemoryTrees();
    renderAgentMessages();
    toast("备份已导入。");
  } catch {
    toast("导入失败，请确认是有效的 JSON 备份。");
  } finally {
    event.target.value = "";
  }
}

function switchScreen(screenId) {
  const titles = {
    homeScreen: "首页",
    apiScreen: "API",
    profileScreen: "我的"
  };
  $$(".nav-button").forEach(item => item.classList.toggle("active", item.dataset.screen === screenId));
  $$(".screen").forEach(panel => panel.classList.toggle("active", panel.id === screenId));
  $("#screenTitle").textContent = titles[screenId] || "首页";
}

function analysisContext() {
  if (!state.analysis) return "No course analysis has been generated yet.";
  return JSON.stringify(state.analysis, null, 2);
}

async function analyzeCourse() {
  const button = $("#analyzeBtn");
  const manualText = $("#manualText").value.trim();
  const courseText = truncateText([state.extractedText, manualText].filter(Boolean).join("\n\n"));
  if (!courseText) {
    toast("请先上传或粘贴课件内容。");
    return;
  }

  setBusy(button, true, "生成中");
  try {
    const content = await askAi([
      {
        role: "system",
        content: "You are an expert academic translator and study coach for international students. Return strict JSON only."
      },
      {
        role: "user",
        content: `请阅读下面课程材料，为留学生生成课堂翻译上下文。目标语言：${$("#targetLanguage").value}。课程名称：${$("#courseName").value || "未命名课程"}。

请只返回 JSON，格式如下：
{
  "courseTitle": "string",
  "keyPoints": ["5-10 个本节课重点"],
  "terms": [
    {
      "source": "原文术语",
      "bestTranslation": "最适合课堂语境的译法",
      "explanation": "简短解释",
      "risk": "为什么普通翻译容易翻错"
    }
  ],
  "translationPitfalls": ["容易误译或难听懂的表达"],
  "likelyLecturePhrases": ["老师课堂上可能会说的表达"],
  "studyQuestions": ["可用于复习的问题"]
}

课程材料：
${courseText}`
      }
    ], {
      responseFormat: { type: "json_object" }
    });

    state.analysis = safeJsonParse(content);
    renderAnalysis();
    saveCourseState();
    toast("已生成课件大纲和术语表，翻译会自动参考课件。");
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false);
  }
}

function updateVoiceUi(status, badge) {
  $("#voiceState").textContent = status;
  $("#listeningBadge").textContent = badge;
  $("#listeningBadge").classList.toggle("ready", state.listening);
  document.body.classList.toggle("is-listening", state.listening);
}

function appendTranscript(text, interim = "") {
  const cleanText = String(text || "").trim();
  if (cleanText) {
    const lines = state.transcript.split("\n").filter(Boolean);
    if (lines[lines.length - 1] !== cleanText) {
      state.transcript = [...lines, cleanText].join("\n");
    }
  }
  state.interimTranscript = interim || "";
  renderLiveTranscript();
}

function renderLiveTranscript() {
  const display = [state.transcript, state.interimTranscript].filter(Boolean).join(state.interimTranscript ? "\n" : "");
  $("#liveTranscript").textContent = display || "老师说的话会实时显示在这里。";
  scrollToLatest("#liveTranscript");
}

function replaceTranscriptLine(original, replacement) {
  const cleanReplacement = String(replacement || "").trim();
  if (!cleanReplacement) return;
  const originalSignature = normalizeVoiceSegment(original);
  const lines = state.transcript.split("\n").filter(Boolean);
  const index = lines
    .map(normalizeVoiceSegment)
    .lastIndexOf(originalSignature);

  if (index >= 0) {
    lines[index] = cleanReplacement;
  } else if (lines[lines.length - 1] !== cleanReplacement) {
    lines.push(cleanReplacement);
  }

  state.transcript = lines.join("\n");
  state.voiceSegmentSignatures.add(normalizeVoiceSegment(cleanReplacement));
  renderLiveTranscript();
}

function showTranslationPending(source) {
  const clean = String(source || "").trim();
  if (!clean) return;
  $("#translationNotes").textContent = `正在校正并翻译最新一句：${clean}`;
}

function queueVoiceSegment(text, options = {}) {
  const clean = String(text || "").trim();
  if (!isLikelySpeechSegment(clean)) return;
  const signature = normalizeVoiceSegment(clean);
  if (!signature || state.voiceSegmentSignatures.has(signature)) return;
  state.voiceSegmentSignatures.add(signature);
  state.lastQueuedVoiceText = clean;
  if (options.recordTranscript !== false) appendTranscript(clean, "");
  showTranslationPending(clean);
  if (options.recordTranscript !== false) saveCourseState();
  queueVoiceTranslation(clean);
}

function parseSpeechAiResult(content, source) {
  const raw = String(content || "").trim();
  try {
    const parsed = safeJsonParse(raw);
    return {
      correctedTranscript: String(parsed.correctedTranscript || parsed.corrected || source).trim(),
      translation: String(parsed.translation || parsed.translatedText || parsed.译文 || "").trim()
    };
  } catch {
    return {
      correctedTranscript: source,
      translation: raw.replace(/^译文[:：]\s*/i, "").trim()
    };
  }
}

async function translateText(source, revision = state.lectureRevision) {
  if (!source) {
    toast("还没有识别到可以翻译的语音。");
    return;
  }
  const cleanSource = String(source).trim();
  if (state.translatingSources.has(cleanSource)) return;
  state.translatingSources.add(cleanSource);
  showTranslationPending(cleanSource);

  try {
    const useContext = Boolean(state.analysis);
    const content = await askAi([
      {
        role: "system",
        content: "You are a real-time academic lecture interpreter. First lightly repair English ASR transcript errors, oral grammar issues, and obvious missing words. Keep the speaker's meaning, do not invent unrelated content, and preserve academic terminology. Then translate into the target language. Return strict JSON only."
      },
      {
        role: "user",
        content: `目标语言：${$("#targetLanguage").value}
课程名称：${$("#courseName").value || "未命名课程"}
${useContext ? `课件重点和术语上下文：\n${analysisContext()}` : "不要使用课件上下文。"}

请处理下面这一句课堂语音转写。
要求：
1. correctedTranscript: 用自然课堂口语英文轻量校正语法、误听词和明显缺词。
2. translation: 翻译 correctedTranscript，输出自然中文。
3. 不要解释，不要输出 Markdown。
4. 如果无法确定缺失词，不要乱补，保留原意。

输出 JSON 格式：
{"correctedTranscript":"...","translation":"..."}

课堂语音转写：
${cleanSource}`
      }
    ]);
    const result = parseSpeechAiResult(content, cleanSource);
    const correctedTranscript = result.correctedTranscript || cleanSource;
    const translation = result.translation || content.replace(/^译文[:：]\s*/i, "").trim();
    if (revision !== state.lectureRevision) return;
    replaceTranscriptLine(cleanSource, correctedTranscript);
    state.lastTranslation = translation;
    state.translationLog.push(translation);
    $("#translationResult").textContent = state.translationLog.join("\n\n");
    scrollToLatest("#translationResult");
    $("#translationNotes").textContent = state.analysis && useContext ? "已校正英文转写，并根据左侧课件大纲优化专业词翻译。" : "已校正英文转写，并完成普通实时语音翻译。";
    saveCourseState();
  } catch (error) {
    if (revision !== state.lectureRevision) return;
    const message = `翻译失败：${error.message}`;
    if (message !== state.lastTranslationError) {
      state.translationLog.push(message);
      state.lastTranslationError = message;
    }
    $("#translationResult").textContent = state.translationLog.join("\n\n");
    $("#translationNotes").textContent = "请检查 API 页面里的 API Key、模型和服务地址。";
    scrollToLatest("#translationResult");
    toast(error.message);
  } finally {
    state.translatingSources.delete(cleanSource);
  }
}

function queueVoiceTranslation(text) {
  const revision = state.lectureRevision;
  state.translationQueue = state.translationQueue
    .catch(() => {})
    .then(() => translateText(text, revision));
  return state.translationQueue;
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function createRecognition() {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    state.listening = true;
    updateVoiceUi("正在听课", "实时识别中");
  };

  recognition.onresult = event => {
    let finalText = "";
    let interimText = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript?.trim() || "";
      if (!text) continue;
      if (result.isFinal) finalText += `${text} `;
      else interimText += `${text} `;
    }

    if (finalText.trim()) {
      const cleanText = finalText.trim();
      state.pendingInterim = "";
      clearTimeout(state.translationTimer);
      state.translationTimer = null;
      queueVoiceSegment(cleanText, { recordTranscript: true });
    } else {
      const cleanInterim = interimText.trim();
      state.pendingInterim = cleanInterim;
      appendTranscript("", cleanInterim);
    }
  };

  recognition.onerror = event => {
    const message = event.error === "not-allowed" ? "麦克风权限被拒绝，请允许浏览器使用麦克风。" : `语音识别出错：${event.error}`;
    updateVoiceUi(message, "已停止");
    toast(message);
  };

  recognition.onend = () => {
    state.listening = false;
    updateVoiceUi("麦克风未开启", "已停止");
    if (state.voiceShouldRun) {
      setTimeout(() => {
        if (state.voiceShouldRun && state.recognition) {
          try {
            state.recognition.start();
          } catch {
            updateVoiceUi("正在恢复语音识别", "恢复中");
          }
        }
      }, 500);
    }
  };

  return recognition;
}

function startVoiceTranslation() {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    toast("当前浏览器不支持实时语音识别，请换 Chrome/Edge 或使用支持 Web Speech API 的浏览器。");
    updateVoiceUi("当前浏览器不支持实时语音识别", "不可用");
    return;
  }

  if (!state.recognition) state.recognition = createRecognition();
  if (state.listening) return;
  state.voiceShouldRun = true;

  try {
    state.recognition.start();
  } catch {
    toast("语音识别已经在启动中。");
  }
}

function stopVoiceTranslation() {
  state.voiceShouldRun = false;
  if (state.recognition && state.listening) {
    state.recognition.stop();
  }
  state.listening = false;
  state.pendingInterim = "";
  state.interimTranscript = "";
  appendTranscript("", "");
  updateVoiceUi("麦克风未开启", "已停止");
}

function clearLectureRecords(options = {}) {
  state.lectureRevision += 1;
  state.transcript = "";
  state.interimTranscript = "";
  state.pendingInterim = "";
  state.lastQueuedVoiceText = "";
  state.lastTranslation = "";
  state.translationLog = [];
  state.lastTranslationError = "";
  state.voiceSegmentSignatures.clear();
  state.translatingSources.clear();
  clearTimeout(state.translationTimer);
  state.translationTimer = null;
  $("#liveTranscript").textContent = "老师说的话会实时显示在这里。";
  $("#translationResult").textContent = "译文会显示在这里。";
  $("#translationNotes").textContent = "";
  saveCourseState();
  if (!options.silent) toast("实时转写和译文记录已清空。");
}

function buildMemoryTreeTemplate() {
  const courseName = $("#courseName").value.trim() || state.analysis?.courseTitle || "本节课";
  const keyPoints = state.analysis?.keyPoints?.slice(0, 6) || [];
  const terms = state.analysis?.terms?.slice(0, 6) || [];
  const pitfalls = state.analysis?.translationPitfalls?.slice(0, 4) || [];
  const transcriptHints = state.transcript
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-4);

  const lines = [courseName];
  lines.push("├── 核心概念");
  if (keyPoints.length) keyPoints.forEach(point => lines.push(`│   ├── ${point}`));
  else transcriptHints.forEach(point => lines.push(`│   ├── ${point}`));
  if (!keyPoints.length && !transcriptHints.length) lines.push("│   └── 待补充");

  lines.push("├── 专业术语");
  if (terms.length) {
    terms.forEach(term => {
      const source = term.source || term.term || "术语";
      const translation = term.bestTranslation || term.translation || "待补充译法";
      lines.push(`│   ├── ${source} -> ${translation}`);
    });
  } else {
    lines.push("│   └── 待补充");
  }

  lines.push("├── 易混淆点");
  if (pitfalls.length) pitfalls.forEach(item => lines.push(`│   ├── ${item}`));
  else lines.push("│   └── 待补充");

  lines.push("└── 我的补充分支");
  lines.push("    └── 点击节点可改名，点 + 可添加子分支");
  return lines.join("\n");
}

function generateMemoryTreeForClass() {
  stopVoiceTranslation();
  openMemoryModal(buildMemoryTreeTemplate());
  clearLectureRecords({ silent: true });
  toast("已生成可编辑记忆树模板，并清空本节转写和译文。");
}

async function readTextLikeFile(file) {
  return await file.text();
}

function decodePdfText(buffer) {
  const raw = new TextDecoder("latin1").decode(buffer);
  const chunks = [];
  const literalMatches = raw.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g);
  for (const match of literalMatches) chunks.push(match[0].replace(/\)\s*Tj$/, "").slice(1));

  const arrayMatches = raw.matchAll(/\[(.*?)\]\s*TJ/gs);
  for (const match of arrayMatches) {
    const inner = match[1];
    const parts = Array.from(inner.matchAll(/\((?:\\.|[^\\)])*\)/g)).map(part => part[0].slice(1, -1));
    if (parts.length) chunks.push(parts.join(""));
  }

  return chunks
    .join("\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("当前浏览器不支持解压 PPTX/DOCX，请粘贴课件文字。");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipXmlFiles(buffer, predicate) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files = [];
  let offset = 0;

  while (offset < bytes.length - 30) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + fileNameLength));
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    if (predicate(name)) {
      let data;
      if (method === 0) data = compressed;
      if (method === 8) data = await inflateRaw(compressed);
      if (data) files.push(new TextDecoder().decode(data));
    }

    offset = dataStart + compressedSize;
  }

  return files;
}

function xmlText(xml) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function readOfficeText(file) {
  const buffer = await file.arrayBuffer();
  const isPptx = file.name.toLowerCase().endsWith(".pptx");
  const xmlFiles = await unzipXmlFiles(buffer, name => {
    if (isPptx) return /^ppt\/slides\/slide\d+\.xml$/.test(name);
    return name === "word/document.xml";
  });
  return xmlFiles.map(xmlText).filter(Boolean).join("\n\n");
}

async function extractFileText(file) {
  const name = file.name.toLowerCase();
  if (/\.(txt|md|csv|json)$/i.test(name)) return await readTextLikeFile(file);
  if (name.endsWith(".pdf")) return decodePdfText(await file.arrayBuffer());
  if (name.endsWith(".pptx") || name.endsWith(".docx")) return await readOfficeText(file);
  return await readTextLikeFile(file);
}

async function handleFiles(files) {
  const selected = Array.from(files || []);
  if (!selected.length) return;

  const pieces = [];
  const names = [];
  for (const file of selected) {
    try {
      const text = await extractFileText(file);
      names.push(file.name);
      pieces.push(`--- ${file.name} ---\n${text || "[未能提取文本]"}`);
    } catch (error) {
      names.push(file.name);
      pieces.push(`--- ${file.name} ---\n[读取失败：${error.message}]`);
    }
  }

  state.fileNames = names;
  state.extractedText = pieces.join("\n\n");
  $("#fileStatus").textContent = `${names.length} 个文件`;
  $("#profileFileCount").textContent = String(names.length);
  saveCourseState();
  toast(`已读取：${names.join("、")}`);
}

function setupNavigation() {
  $$(".nav-button").forEach(tab => {
    tab.addEventListener("click", () => {
      switchScreen(tab.dataset.screen);
    });
  });
}

function resetCourse() {
  state.lectureRevision += 1;
  state.extractedText = "";
  state.fileNames = [];
  state.analysis = null;
  state.lastTranslation = "";
  state.translationLog = [];
  state.lastSummary = "";
  state.transcript = "";
  state.interimTranscript = "";
  state.pendingInterim = "";
  state.lastQueuedVoiceText = "";
  state.voiceSegmentSignatures.clear();
  state.translatingSources.clear();
  state.lastTranslationError = "";
  clearTimeout(state.translationTimer);
  state.translationTimer = null;
  stopVoiceTranslation();
  $("#fileInput").value = "";
  $("#manualText").value = "";
  $("#courseName").value = "";
  $("#targetLanguage").value = "中文";
  $("#fileStatus").textContent = "未上传";
  $("#contextStatus").textContent = "未提交课件";
  $("#contextStatus").classList.remove("ready");
  $("#translateMode").textContent = "普通翻译";
  $("#translateMode").classList.remove("ready");
  $("#advancedTranslationCard").classList.add("hidden");
  $("#profileFileCount").textContent = "0";
  $("#profileContextState").textContent = "未生成";
  $("#analysisEmpty").classList.remove("hidden");
  $("#analysisResult").classList.add("hidden");
  $("#translationResult").textContent = "译文会显示在这里。";
  $("#liveTranscript").textContent = "老师说的话会实时显示在这里。";
  $("#translationNotes").textContent = "";
  $("#translatorPanel").classList.add("hidden");
  localStorage.removeItem("studyTranslateCourseState");
  switchScreen("homeScreen");
  toast("课程内容已清空。");
}

function setupFileDrop() {
  const dropZone = $("#dropZone");
  const input = $("#fileInput");
  input.addEventListener("change", event => handleFiles(event.target.files));

  ["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  });

  dropZone.addEventListener("drop", event => handleFiles(event.dataTransfer.files));
}

function bindEvents() {
  $("#saveSettings").addEventListener("click", saveSettings);
  $("#modelPreset").addEventListener("change", event => {
    if (event.target.value !== "custom") $("#model").value = event.target.value;
  });
  $("#model").addEventListener("input", () => {
    const preset = $(`#modelPreset option[value="${$("#model").value.trim()}"]`);
    $("#modelPreset").value = preset ? $("#model").value.trim() : "custom";
  });
  $("#resetCourse").addEventListener("click", resetCourse);
  $("#courseName").addEventListener("input", saveCourseState);
  $("#targetLanguage").addEventListener("change", saveCourseState);
  $("#manualText").addEventListener("input", saveCourseState);
  $("#analyzeBtn").addEventListener("click", analyzeCourse);
  $("#openTranslator").addEventListener("click", () => {
    $("#translatorPanel").classList.remove("hidden");
    startVoiceTranslation();
  });
  $("#stopVoice").addEventListener("click", stopVoiceTranslation);
  $("#generateMemoryTree").addEventListener("click", generateMemoryTreeForClass);
  $("#clearLectureRecords").addEventListener("click", () => clearLectureRecords());
  $("#closeMemoryModal").addEventListener("click", closeMemoryModal);
  $("#saveMemoryTree").addEventListener("click", savePendingMemoryTree);
  $("#memoryModal").addEventListener("click", event => {
    if (event.target === $("#memoryModal")) closeMemoryModal();
  });
  $("#copyTranslation").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("#translationResult").textContent);
    toast("译文已复制。");
  });
  $("#agentToggle").addEventListener("click", () => $("#agentPanel").classList.toggle("hidden"));
  $("#agentClose").addEventListener("click", () => $("#agentPanel").classList.add("hidden"));
  $("#agentAsk").addEventListener("click", askAcademicAgent);
  $("#agentQuestion").addEventListener("compositionstart", () => {
    state.agentComposing = true;
  });
  $("#agentQuestion").addEventListener("compositionend", () => {
    state.agentComposing = false;
  });
  $("#agentQuestion").addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    if (event.isComposing || state.agentComposing || event.keyCode === 229) return;
    event.preventDefault();
    askAcademicAgent();
  });
  $("#exportData").addEventListener("click", exportAllData);
  $("#importData").addEventListener("click", () => $("#importDataFile").click());
  $("#importDataFile").addEventListener("change", importAllData);
}

loadSettings();
loadAgentHistory();
loadCourseState();
renderAgentMessages();
renderSavedMemoryTrees();
setupNavigation();
setupFileDrop();
bindEvents();
