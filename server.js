const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};

function serveStatic(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const filePath = path.join(__dirname, decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// Reddit's JSON endpoint has no Access-Control-Allow-Origin header, so the
// browser can't fetch it directly. This proxies the request server-to-server
// (no CORS involved there) and hands the JSON back same-origin.
function proxyReddit(req, res, sub, search) {
  const options = {
    hostname: "www.reddit.com",
    path: `/r/${sub}/hot.json${search}`,
    headers: { "User-Agent": "FullBrainRotApp/1.0 (personal demo project)" },
  };
  https
    .get(options, (redditRes) => {
      let body = "";
      redditRes.on("data", (chunk) => (body += chunk));
      redditRes.on("end", () => {
        res.writeHead(redditRes.statusCode, { "Content-Type": "application/json" });
        res.end(body);
      });
    })
    .on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/reddit/")) {
    const sub = url.pathname.slice("/api/reddit/".length);
    proxyReddit(req, res, sub, url.search);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
