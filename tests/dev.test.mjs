import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test(
  'development command starts both services and proxies a custom API port',
  { timeout: 20000 },
  async (t) => {
    const probe = createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const dir = mkdtempSync(join(tmpdir(), 'quickshow-dev-'));
    const child = spawn(
      process.execPath,
      JSON.parse(readFileSync('package.json', 'utf8'))
        .scripts.dev.split(' ')
        .slice(1),
      {
        env: {
          ...process.env,
          PORT: String(port),
          HOST: '127.0.0.1',
          DATABASE_PATH: join(dir, 'test.sqlite'),
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const exit = new Promise((resolve) => child.once('exit', resolve));
    t.after(async () => {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exit;
      clearTimeout(force);
      rmSync(dir, { recursive: true, force: true });
    });
    let output = '';
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Development startup timed out: ${output}`)),
        12000,
      );
      const collect = (chunk) => {
        output += chunk.toString();
        const match = output.match(/Local:\s+(http:\/\/localhost:\d+\/)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Development server exited (${code}): ${output}`));
      });
    });
    const response = await fetch(`${url}api/me`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { user: null });
    assert.equal((await fetch(url)).status, 200);
    const registration = await fetch(`${url}api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: new URL(url).origin,
      },
      body: JSON.stringify({
        name: 'Development Viewer',
        email: 'development@example.com',
        password: 'test-password-123',
      }),
    });
    assert.equal(registration.status, 200, await registration.text());
    const rejected = await fetch(`${url}api/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://untrusted.example',
      },
    });
    assert.equal(
      rejected.status,
      403,
      'Cross-origin requests must remain blocked',
    );
  },
);
