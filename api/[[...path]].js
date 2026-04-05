export default async function handler(req, res) {
  // CORS 预检
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return res.status(204).end();
  }

  // 验证 Authorization
  const auth = req.headers["authorization"] || "";
  if (!auth.match(/^Bearer\s+jina_\S+$/)) {
    return res.status(403).json({ error: "Invalid or missing API key" });
  }

  // 从路径提取子域名和剩余路径
  // /api/v1/rerank → subdomain=api, rest=v1/rerank
  // /r/https://example.com → subdomain=r, rest=https://example.com
  const segments = (req.query.path || []);
  if (segments.length === 0) {
    return res.status(400).json({
      error: "Missing subdomain prefix",
      usage: "/api/..., /r/..., /s/...",
    });
  }

  const subdomain = segments[0];
  const allowed = ["api", "r", "s", "deepsearch", "g"];
  if (!allowed.includes(subdomain)) {
    return res.status(400).json({
      error: `Unknown subdomain: ${subdomain}`,
      allowed,
    });
  }

  const restPath = segments.slice(1).join("/");
  const queryString = new URL(req.url, `http://${req.headers.host}`).search;
  const targetUrl = `https://${subdomain}.jina.ai/${restPath}${queryString}`;

  // 转发请求
  const response = await fetch(targetUrl, {
    method: req.method,
    headers: {
      "Authorization": auth,
      "Content-Type": req.headers["content-type"] || "application/json",
      "Accept": req.headers["accept"] || "*/*",
      "Host": `${subdomain}.jina.ai`,
    },
    body: req.method !== "GET" && req.method !== "HEAD"
      ? JSON.stringify(req.body)
      : undefined,
  });

  // 返回响应
  const data = await response.text();
  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(data);
}

export const config = {
  maxDuration: 60,
};