import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

// The server intentionally stays dependency-free so the prototype can run on a
// fresh Mac with only Node.js. It serves static assets and exposes one local AI
// proxy endpoint; all product state remains in the browser.
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 5_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleAi(req, res) {
  try {
    const body = JSON.parse(await readBody(req));
    const apiKey = String(body.apiKey || "").trim();
    const baseUrl = normalizeBaseUrl(body.baseUrl || "https://api.openai.com/v1");
    const model = String(body.model || "gpt-4.1-mini").trim();
    const messages = sanitizeMessages(body.messages);
    const responseFormat = sanitizeResponseFormat(body.responseFormat);

    if (!apiKey) return sendJson(res, 400, { error: "Missing API key." });
    if (!model) return sendJson(res, 400, { error: "Missing model." });
    if (!messages.length) return sendJson(res, 400, { error: "Missing messages." });

    // Keep model calls behind the local server instead of calling providers
    // directly from UI code. This centralizes validation, avoids CORS issues,
    // and makes provider errors visible to the app in one consistent shape.
    const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: body.temperature ?? 0.2,
        response_format: responseFormat
      })
    });

    const text = await aiResponse.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!aiResponse.ok) {
      return sendJson(res, aiResponse.status, {
        error: payload?.error?.message || payload?.error || "AI request failed.",
        details: payload
      });
    }

    return sendJson(res, 200, payload);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Server error." });
  }
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value || "https://api.openai.com/v1"));
  } catch {
    throw new Error("Invalid API base URL.");
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("API base URL must use http or https.");
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  // Bound request size before forwarding to the model provider. This prevents a
  // long class transcript or imported backup from accidentally creating an
  // oversized local proxy request.
  return messages
    .slice(-24)
    .map(message => {
      const role = ["system", "user", "assistant"].includes(message?.role) ? message.role : "user";
      const content = String(message?.content || "").slice(0, 40_000);
      return { role, content };
    })
    .filter(message => message.content.trim());
}

function sanitizeResponseFormat(responseFormat) {
  if (!responseFormat || typeof responseFormat !== "object") return undefined;
  if (responseFormat.type === "json_object") return { type: "json_object" };
  return undefined;
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  // Static serving is limited to this project directory. The check matters
  // because file paths are derived from the URL.
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/ai") {
    await handleAi(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await handleStatic(req, res);
    return;
  }

  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
}).listen(port, () => {
  console.log(`Study Translate MVP is running at http://localhost:${port}`);
});
