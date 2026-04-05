function resolveTarget(method, body, pathname) {
  // GET 请求：路径中包含 URL → r.jina.ai
  if (method === "GET" && pathname.match(/^\/https?:\/\//)) {
    return { host: "r.jina.ai", path: pathname };
  }

  if (!body || typeof body !== "object") {
    return null;
  }

  const model = (body.model || "").toLowerCase();

  if (model.includes("reranker") || model.includes("rerank")) {
    return { host: "api.jina.ai", path: "/v1/rerank" };
  }

  if (model.includes("embedding")) {
    return { host: "api.jina.ai", path: "/v1/embeddings" };
  }

  if (model.includes("classifier") || model.includes("classification")) {
    return { host: "api.jina.ai", path: "/v1/classify" };
  }

  if (body.url) {
    return { host: "r.jina.ai", path: "/" };
  }

  if (body.q || (!model && body.query)) {
    return { host: "s.jina.ai", path: "/" };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return res.status(204).end();
  }

  const auth = req.headers["authorization"] || "";
  if (!auth.match(/^Bearer\s+jina_\S+$/)) {
    return res.status(403).json({ error: "Invalid or missing API key" });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const target = resolveTarget(req.method, req.body, url.pathname);

  if (!target) {
    return res.status(400).json({
      error: "Cannot determine target service",
      hint: {
        rerank: 'POST with "model": "jina-reranker-*"',
        embeddings: 'POST with "model": "jina-embeddings-*"',
        reader_post: 'POST with "url": "..."',
        reader_get: "GET /https://example.com",
        search: 'POST with "q": "..."',
      },
    });
  }

  const targetUrl = `https://${target.host}${target.path}${url.search}`;

  const fetchOptions = {
    method: req.method,
    headers: {
      "Authorization": auth,
      "Accept": req.headers["accept"] || "*/*",
      "Host": target.host,
    },
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    fetchOptions.headers["Content-Type"] = req.headers["content-type"] || "application/json";
    fetchOptions.body = JSON.stringify(req.body);
  }

  const response = await fetch(targetUrl, fetchOptions);

  const data = await response.text();
  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Proxy-Target", `${target.host}${target.path}`);
  res.send(data);
}

export const config = {
  maxDuration: 60,
};