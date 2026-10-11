import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.mjs';

// Exercise either the production build or Vite's development transforms.
const dir = mkdtempSync(join(tmpdir(), 'quickshow-browser-'));
const server = createApp({ dbPath: join(dir, 'browser.sqlite') });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let base = `http://127.0.0.1:${server.address().port}`;
let development;
let developmentExit;
let developmentOutput = '';
if (process.argv.includes('--dev')) {
  const apiPort = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  development = spawn(
    process.execPath,
    JSON.parse(readFileSync('package.json', 'utf8'))
      .scripts.dev.split(' ')
      .slice(1),
    {
      env: {
        ...process.env,
        PORT: String(apiPort),
        HOST: '127.0.0.1',
        DATABASE_PATH: join(dir, 'browser.sqlite'),
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  developmentExit = new Promise((resolve) => development.once('exit', resolve));
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(`Development startup timed out: ${developmentOutput}`),
        ),
      12000,
    );
    const collect = (chunk) => {
      developmentOutput += chunk.toString();
      const match = developmentOutput.match(
        /Local:\s+(http:\/\/localhost:\d+\/)/,
      );
      if (match) {
        clearTimeout(timer);
        resolve(match[1].replace(/\/$/, ''));
      }
    };
    development.stdout.on('data', collect);
    development.stderr.on('data', collect);
    development.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
const chrome = spawn(
  process.env.CHROME_PATH || '/usr/bin/google-chrome',
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${join(dir, 'chrome')}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
let launchError;
chrome.on('error', (error) => {
  launchError = error;
});
let socket;
let inspect;
let nextId = 1;
const pending = new Map();
const errors = [];
async function until(check, message) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(
    `Timed out: ${message}. Browser errors: ${errors.join('; ')}`,
  );
}
try {
  let port;
  await until(() => {
    if (launchError) throw launchError;
    try {
      port = readFileSync(join(dir, 'chrome/DevToolsActivePort'), 'utf8').split(
        '\n',
      )[0];
      return !!port;
    } catch {
      return false;
    }
  }, 'Chrome startup (set CHROME_PATH to your Chromium executable)');
  const pages = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  socket = new WebSocket(
    pages.find((p) => p.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text,
      );
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  inspect = evaluate;
  const waitFor = (expression, label) =>
    until(() => evaluate(expression), label);
  const clickText = (text) =>
    evaluate(
      `Array.from(document.querySelectorAll('button,a')).find(el => el.textContent.trim() === ${JSON.stringify(text)})?.click()`,
    );
  const navigate = async (path) => {
    await send('Page.navigate', { url: `${base}${path}` });
    await waitFor(
      `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && !!document.querySelector('h1')`,
      path,
    );
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate('/');
  assert.equal(
    await evaluate(`document.querySelectorAll('.movie-card').length`),
    5,
  );
  await navigate('/login');
  await clickText('Create an account');
  await waitFor(
    `!!document.querySelector('input[name="name"]')`,
    'registration form',
  );
  await evaluate(
    `document.querySelector('[name=name]').value='Browser Viewer'; document.querySelector('[name=email]').value='browser@example.com'; document.querySelector('[name=password]').value='browser-password-123'; document.querySelector('form').requestSubmit()`,
  );
  await waitFor(
    `location.pathname === '/my-bookings' && document.querySelector('h1')?.textContent === 'My reservations'`,
    'registered session',
  );
  await navigate('/movies/1');
  await waitFor(`!!document.querySelector('.show-time')`, 'screenings');
  await evaluate(`document.querySelector('.show-time').click()`);
  await waitFor(`document.querySelectorAll('.seat').length === 96`, 'seat map');
  await evaluate(
    `document.querySelector('[aria-label="Seat A1, available"]').click()`,
  );
  await evaluate(
    `document.querySelector('[aria-label="Seat F1, available"]').click()`,
  );
  await waitFor(
    `document.querySelector('.summary-line.total').innerText.includes('500')`,
    'server-compatible seat total',
  );
  await evaluate(`document.querySelector('input[type=checkbox]').click()`);
  await clickText('Reserve seats ↗');
  await waitFor(
    `!!document.querySelector('.reservation')`,
    'reservation confirmation',
  );
  assert.match(
    await evaluate(`document.querySelector('.reservation').innerText`),
    /A1, F1/,
  );
  await clickText('Cancel reservation');
  await clickText('Yes, cancel');
  await waitFor(
    `document.querySelector('.status').textContent === 'Cancelled'`,
    'cancelled reservation',
  );
  await navigate('/movies');
  await waitFor(
    `document.querySelector('.site-header').innerText.includes('Sign out')`,
    'session restoration before saving',
  );
  await evaluate(`document.querySelector('.save-button').click()`);
  await waitFor(
    `document.querySelector('.save-button').getAttribute('aria-pressed') === 'true'`,
    'saved favourite',
  );
  await navigate('/favourite');
  await waitFor(
    `document.querySelectorAll('.movie-card').length === 1`,
    'favourite persists across reload',
  );
  await navigate('/');
  await delay(1200);
  const desktop = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    join(tmpdir(), 'quickshow-desktop.png'),
    Buffer.from(desktop.data, 'base64'),
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(300);
  assert.equal(
    await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`),
    true,
    'Mobile home should not overflow',
  );
  await evaluate(`document.querySelector('.menu-toggle').click()`);
  await waitFor(
    `document.querySelector('#main-nav').classList.contains('open')`,
    'mobile navigation',
  );
  await evaluate(`document.querySelector('.menu-toggle').click()`);
  const mobile = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    join(tmpdir(), 'quickshow-mobile.png'),
    Buffer.from(mobile.data, 'base64'),
  );
  await navigate('/movies/1');
  await waitFor(`!!document.querySelector('.show-time')`, 'mobile screenings');
  await evaluate(`document.querySelector('.show-time').click()`);
  await waitFor(
    `document.querySelectorAll('.seat').length === 96`,
    'mobile seats',
  );
  assert.equal(
    await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`),
    true,
    'Mobile seat page should not overflow',
  );
  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  console.log(
    'Browser smoke passed: registration, screenings, seat prices, reservation, cancellation, favourites, desktop and mobile layouts.',
  );
  console.log(
    `Screenshots: ${join(tmpdir(), 'quickshow-desktop.png')} and ${join(tmpdir(), 'quickshow-mobile.png')}`,
  );
} catch (error) {
  if (development) console.error('Development server log:', developmentOutput);
  if (inspect)
    console.error(
      'Browser page at failure:',
      await inspect('document.body.innerText'),
    );
  throw error;
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await new Promise((resolve) => chrome.once('exit', resolve));
  }
  if (development) {
    development.kill('SIGTERM');
    const force = setTimeout(() => development.kill('SIGKILL'), 3000);
    await developmentExit;
    clearTimeout(force);
  } else {
    await new Promise((resolve) => server.close(resolve));
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
