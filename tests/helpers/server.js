import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function resetServerModules(modulePaths) {
  for (const modulePath of modulePaths) {
    const resolvedPath = path.isAbsolute(modulePath)
      ? modulePath
      : path.join(process.cwd(), modulePath);
    delete require.cache[require.resolve(resolvedPath)];
  }
}

export function createTempDataDir(prefix = 'trackspot-test-') {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.DATA_DIR = dataDir;
  return dataDir;
}

export function removeTempDir(dir) {
  if (dir) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    server,
    async close() {
      await new Promise(resolve => server.close(resolve));
    },
  };
}

export async function requestJson(baseUrl, requestPath, options = {}) {
  const response = await fetch(`${baseUrl}${requestPath}`, options);
  const text = await response.text();
  return {
    response,
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
    text,
  };
}

export async function requestBuffer(baseUrl, requestPath, options = {}) {
  const response = await fetch(`${baseUrl}${requestPath}`, options);
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    response,
    status: response.status,
    headers: response.headers,
    buffer,
  };
}

export function makeFormData(fields = {}, files = {}) {
  const form = new FormData();

  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  });

  Object.entries(files).forEach(([key, file]) => {
    if (!file) return;
    const filesForKey = Array.isArray(file) ? file : [file];
    filesForKey.forEach(item => {
      const blob = new Blob([item.contents ?? Buffer.from('file')], {
        type: item.type || 'application/octet-stream',
      });
      form.append(key, blob, item.name || 'upload.bin');
    });
  });

  return form;
}

export function makeMultipartBody(fields = {}, files = {}) {
  const boundary = `----trackspot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const chunks = [];

  const push = value => {
    chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
  };

  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
    push(String(value));
    push('\r\n');
  });

  Object.entries(files).forEach(([key, file]) => {
    if (!file) return;
    const filesForKey = Array.isArray(file) ? file : [file];
    filesForKey.forEach(item => {
      push(`--${boundary}\r\n`);
      push(`Content-Disposition: form-data; name="${key}"; filename="${item.name || 'upload.bin'}"\r\n`);
      push(`Content-Type: ${item.type || 'application/octet-stream'}\r\n\r\n`);
      push(item.contents ?? Buffer.from('file'));
      push('\r\n');
    });
  });

  push(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks),
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
  };
}

export function getRouteHandler(router, method, routePath, index = 0) {
  const layer = router.stack.find(entry =>
    entry.route?.path === routePath && entry.route.methods?.[method]
  );
  return layer?.route?.stack?.[index]?.handle ?? null;
}

export function getRouteHandlers(router, method, routePath) {
  const layer = router.stack.find(entry =>
    entry.route?.path === routePath && entry.route.methods?.[method]
  );
  return layer?.route?.stack?.map(entry => entry.handle) ?? [];
}

export function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    jsonBody: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      this.body = payload;
      this.ended = true;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      this.body = '';
      this.ended = true;
      return this;
    },
    end(payload = '') {
      this.body = payload;
      this.ended = true;
      return this;
    },
  };
}
