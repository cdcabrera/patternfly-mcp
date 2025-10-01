const http = require('http');
const fs = require('fs');
const path = require('path');

function startHttpFixture({ routes = {} } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const route = routes[req.url];
      if (!route) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end('Not Found');
      }
      const { status = 200, headers = {}, body } = route;
      res.statusCode = status;
      for (const [k, v] of Object.entries(headers)) {
        res.setHeader(k, v);
      }
      if (typeof body === 'function') return body(req, res);
      return res.end(body);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const baseUrl = `http://${addr.address}:${addr.port}`;
      resolve({ baseUrl, close: () => new Promise((r) => server.close(() => r())) });
    });

    server.on('error', reject);
  });
}

function loadFixture(relPath) {
  const filePath = path.join(__dirname, '..', '__fixtures__', 'http', relPath);
  return fs.readFileSync(filePath, 'utf-8');
}

module.exports = { startHttpFixture, loadFixture };
