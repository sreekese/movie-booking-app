import { DatabaseSync } from 'node:sqlite';
import { scryptSync } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.mjs';

// Exercise either the production build or Vite's development transforms.
const dir = mkdtempSync(join(tmpdir(), 'quickshow-browser-'));
const server = await createApp({
  dbPath: join(dir, 'browser.sqlite'),
  databaseUrl: null,
});
const fixture = new DatabaseSync(join(dir, 'browser.sqlite'));
fixture
  .prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
  .run(
    'Browser Operator',
    'operator@example.com',
    `browser-test-salt:${scryptSync('operator-password-123', 'browser-test-salt', 64).toString('hex')}`,
    'admin',
  );
fixture.close();
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
        DATABASE_URL: '',
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
const pausedRequests = [];
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
    if (message.method === 'Fetch.requestPaused')
      pausedRequests.push(message.params.requestId);
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
  await navigate('/theater');
  await clickText('View movies & showtimes');
  await waitFor(
    `location.pathname === '/movies' && location.search.includes('theatre=1') && !!document.querySelector('.movie-card .poster-link')`,
    'theatre movie list',
  );
  await evaluate(`document.querySelector('.movie-card .poster-link').click()`);
  await waitFor(
    `location.search.includes('theatre=1') && !!document.querySelector('.theatre-show-group .show-time')`,
    'movie showtimes grouped by theatre',
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
  await send('Page.navigate', { url: `${base}/admin` });
  await waitFor(
    `location.pathname === '/my-bookings' && !!document.querySelector('h1')`,
    'customer admin route redirects to bookings',
  );
  await send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/shows?movie=*', requestStage: 'Request' }],
  });
  await navigate('/movies/1');
  await waitFor(
    `!!document.querySelector('.show-picker .loading-skeleton .shimmer')`,
    'screening shimmer while request is pending',
  );
  await until(() => pausedRequests.length > 0, 'intercepted screening request');
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.show-picker .shimmer'), '::after').animationName`,
    ),
    'shimmer-sweep',
  );
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.show-picker .shimmer'), '::after').animationName`,
    ),
    'none',
  );
  await send('Emulation.setEmulatedMedia', { features: [] });
  for (const requestId of pausedRequests.splice(0))
    await send('Fetch.continueRequest', { requestId });
  await send('Fetch.disable');
  await waitFor(
    `!document.querySelector('.show-picker .loading-skeleton')`,
    'screening shimmer replaced with content',
  );
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
    `!!document.querySelector('article.reservation')`,
    'reservation confirmation',
  );
  assert.match(
    await evaluate(`document.querySelector('article.reservation').innerText`),
    /A1, F1/,
  );
  await clickText('Print ticket / PDF');
  await waitFor(
    `!!document.querySelector('.ticket-print-root[open]') && document.querySelector('.ticket-artwork').complete`,
    'ticket preview',
  );
  assert.match(
    await evaluate(`document.querySelector('.ticket-artwork').alt`),
    /Base seat fare: ₹440, Premium upgrade.*₹60, Booking fee: ₹0/,
  );
  await send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dir,
  });
  await clickText('Download PNG');
  await until(
    () => readdirSync(dir).some((file) => file.endsWith('.png')),
    'PNG ticket download',
  );
  const ticketFile = readdirSync(dir).find((file) => file.endsWith('.png'));
  assert.equal(
    readFileSync(join(dir, ticketFile)).subarray(1, 4).toString(),
    'PNG',
  );
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(
    await evaluate(`getComputedStyle(document.querySelector('#root')).display`),
    'none',
    'Only the selected ticket should print',
  );
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.ticket-artwork')).display`,
    ),
    'block',
  );
  const pdf = await send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
  });
  writeFileSync(
    join(tmpdir(), 'quickshow-ticket.pdf'),
    Buffer.from(pdf.data, 'base64'),
  );
  await send('Emulation.setEmulatedMedia', { media: '' });
  const ticketPreview = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    join(tmpdir(), 'quickshow-ticket-preview.png'),
    Buffer.from(ticketPreview.data, 'base64'),
  );
  await evaluate(
    `document.querySelector('[aria-label="Close ticket preview"]').click()`,
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
  await waitFor(
    `document.querySelector('.save-button')?.disabled === false`,
    'favourites loaded before saving',
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await clickText('Sign out');
  await waitFor(
    `document.querySelector('.site-header').innerText.includes('Sign in')`,
    'sign out',
  );
  await navigate('/login');
  await evaluate(
    `document.querySelector('[name=email]').value='operator@example.com'; document.querySelector('[name=password]').value='operator-password-123'; document.querySelector('form').requestSubmit()`,
  );
  await waitFor(
    `location.pathname === '/admin' && !!document.querySelector('.admin-tabs')`,
    'operator login goes directly to dashboard',
  );
  await navigate('/admin');
  await waitFor(`!!document.querySelector('.admin-tabs')`, 'admin dashboard');
  await clickText('Movie catalogue');
  await clickText('Add movie');
  await waitFor(
    `!!document.querySelector('.admin-dialog[open]')`,
    'movie editor',
  );
  await evaluate(
    `Object.entries({title:'Browser Managed Film',genre:'Drama',duration:'90m',releaseDate:'2026-10-01',poster:'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg',banner:'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg',description:'A film added through the management dashboard.'}).forEach(([name,value]) => { document.querySelector('.admin-dialog [name="'+name+'"]').value=value; }); document.querySelector('.admin-dialog form').requestSubmit()`,
  );
  await waitFor(
    `!document.querySelector('.admin-dialog') && document.querySelector('table').innerText.includes('Browser Managed Film')`,
    'created movie in catalogue',
  );
  await clickText('Theatres');
  await clickText('Manage movies & timings');
  await clickText('Screenings & timings');
  await clickText('Add screening');
  await waitFor(
    `!!document.querySelector('.admin-dialog[open]')`,
    'screening editor',
  );
  await evaluate(
    `const form=document.querySelector('.admin-dialog form'); form.querySelector('[name=movie_id]').value=Array.from(form.querySelectorAll('option')).find(o=>o.textContent==='Browser Managed Film').value; form.querySelector('[name=screen]').value='Browser Studio'; form.querySelector('[name=date]').value=new Date(Date.now()+86400000).toISOString().slice(0,10); form.querySelector('[name=time]').value='14:00'; form.requestSubmit()`,
  );
  await waitFor(
    `!document.querySelector('.admin-dialog') && document.querySelector('table').innerText.includes('Browser Studio')`,
    'created screening',
  );
  const rowButton = async (text, button) =>
    evaluate(
      `Array.from(document.querySelectorAll('tbody tr')).find(row=>row.innerText.includes(${JSON.stringify(text)})) && Array.from(Array.from(document.querySelectorAll('tbody tr')).find(row=>row.innerText.includes(${JSON.stringify(text)})).querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(button)}).click()`,
    );
  await rowButton('Browser Studio', 'Edit');
  await waitFor(
    `!!document.querySelector('.admin-dialog[open]')`,
    'screening edit',
  );
  await evaluate(
    `document.querySelector('.admin-dialog [name=time]').value='16:00';document.querySelector('.admin-dialog form').requestSubmit()`,
  );
  await waitFor(
    `!document.querySelector('.admin-dialog') && Array.from(document.querySelectorAll('tbody tr')).some(row=>row.innerText.includes('Browser Studio') && row.innerText.includes('4:00 PM'))`,
    'updated screening',
  );
  await rowButton('Browser Studio', 'Delete');
  await clickText('Confirm');
  await waitFor(
    `!document.querySelector('table').innerText.includes('Browser Studio')`,
    'deleted screening',
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.admin-tabs button')).find(b => b.textContent.trim() === 'Movie catalogue').click()`,
  );
  await rowButton('Browser Managed Film', 'Edit');
  await waitFor(
    `!!document.querySelector('.admin-dialog[open]')`,
    'movie edit',
  );
  await evaluate(
    `document.querySelector('.admin-dialog [name=title]').value='Browser Edited Film';document.querySelector('.admin-dialog form').requestSubmit()`,
  );
  await waitFor(
    `!document.querySelector('.admin-dialog') && document.querySelector('table').innerText.includes('Browser Edited Film')`,
    'updated movie',
  );
  assert.equal(
    await evaluate(
      `document.querySelector('.site-header a[href="/movies"]') === null && document.querySelector('.site-footer') === null`,
    ),
    true,
    'Admin should only see dashboard navigation',
  );
  assert.equal(
    await evaluate(
      `fetch('/api/movies').then(r=>r.json()).then(movies=>movies.some(m=>m.title==='Browser Edited Film'))`,
    ),
    true,
  );
  await send('Page.navigate', { url: `${base}/movies` });
  await waitFor(
    `location.pathname === '/admin' && !!document.querySelector('.admin-tabs')`,
    'admin customer URL redirects to dashboard',
  );
  await navigate('/admin');
  await waitFor(`!!document.querySelector('.admin-tabs')`, 'dashboard reload');
  await clickText('Movie catalogue');
  await rowButton('Browser Edited Film', 'Delete');
  await clickText('Confirm');
  await waitFor(
    `!document.querySelector('table').innerText.includes('Browser Edited Film')`,
    'deleted movie',
  );
  await clickText('Accounts');
  await waitFor(
    `document.querySelector('table').innerText.includes('Browser Operator')`,
    'account management',
  );
  await clickText('Activity');
  await waitFor(
    `document.querySelector('table').innerText.includes('movie.deleted')`,
    'audit history',
  );
  const adminScreenshot = await send('Page.captureScreenshot', {
    format: 'png',
  });
  writeFileSync(
    join(tmpdir(), 'quickshow-admin.png'),
    Buffer.from(adminScreenshot.data, 'base64'),
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`),
    true,
    'Admin should not overflow on mobile',
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await clickText('Accounts');
  await clickText('Add account');
  await waitFor(
    `!!document.querySelector('.admin-dialog [name=role]')`,
    'account role editor',
  );
  await evaluate(
    `const role=document.querySelector('[name=role]'); role.value='theatre_admin'; role.dispatchEvent(new Event('change',{bubbles:true}));`,
  );
  await waitFor(
    `!!document.querySelector('[name=theatre_ids]')`,
    'theatre assignments',
  );
  await evaluate(
    `Object.entries({name:'Scoped Operator',email:'scoped@example.com',password:'scoped-password-123'}).forEach(([name,value])=>document.querySelector('.admin-dialog [name="'+name+'"]').value=value);document.querySelector('[name=theatre_ids] option[value="1"]').selected=true;document.querySelector('.admin-dialog form').requestSubmit()`,
  );
  await waitFor(
    `!document.querySelector('.admin-dialog') && document.querySelector('table').innerText.includes('Scoped Operator')`,
    'created assigned administrator',
  );
  await clickText('Sign out');
  await navigate('/login');
  await evaluate(
    `document.querySelector('[name=email]').value='scoped@example.com';document.querySelector('[name=password]').value='scoped-password-123';document.querySelector('form').requestSubmit()`,
  );
  await waitFor(
    `location.pathname==='/admin' && !!document.querySelector('.admin-tabs')`,
    'theatre administrator dashboard',
  );
  assert.equal(
    await evaluate(
      `document.querySelector('.admin-tabs').innerText.includes('Accounts') || document.querySelector('.admin-tabs').innerText.includes('Movie catalogue')`,
    ),
    false,
  );
  await clickText('Manage movies & timings');
  await clickText('Screens & seating');
  await clickText('Add screen');
  await waitFor(
    `!!document.querySelector('[name=screen_name]')`,
    'screen layout editor',
  );
  await evaluate(
    `var el=document.querySelector('[name=screen_name]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Custom Studio');el.dispatchEvent(new Event('input',{bubbles:true}));`,
  );
  await evaluate(
    `var el=document.querySelector('[aria-label="Row 1 seats"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'4');el.dispatchEvent(new Event('input',{bubbles:true}));`,
  );
  await evaluate(
    `var el=document.querySelector('[aria-label="Row 1 aisle"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'1,3');el.dispatchEvent(new Event('input',{bubbles:true}));`,
  );
  await evaluate(
    `var el=document.querySelector('[aria-label="Row 1 gap after"]');el.value='48';el.dispatchEvent(new Event('change',{bubbles:true}));`,
  );
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.screen-manager .seat-row')).paddingBottom`,
    ),
    '48px',
    'Preview displays row gap',
  );
  await evaluate(
    `var el=document.querySelector('[aria-label="Row 1 category"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Sofa');el.dispatchEvent(new Event('input',{bubbles:true}));`,
  );
  await evaluate(
    `var el=document.querySelector('[aria-label="Row 1 price"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'450');el.dispatchEvent(new Event('input',{bubbles:true}));`,
  );
  await clickText('Save layout');
  await waitFor(
    `!document.querySelector('[name=screen_name]') && document.querySelector('.screen-manager table').innerText.includes('Custom Studio')`,
    'custom layout saved',
  );
  const customShow = await evaluate(
    `fetch('/api/admin/shows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({movie_id:1,theatre_id:1,screen:'Custom Studio',date:new Date(Date.now()+86400000).toISOString().slice(0,10),time:'14:00',active:true})}).then(r=>r.json())`,
  );
  assert.ok(customShow.id);
  assert.equal(
    await evaluate(
      `fetch('/api/admin').then(r=>r.json()).then(async data=>{const screen=data.screens.find(s=>s.name==='Custom Studio');const layout={...screen.layout,rows:[...screen.layout.rows,{...screen.layout.rows[0],label:'B',gapAfter:0}]};const r=await fetch('/api/admin/screens/'+screen.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({layout})});return (await r.json()).updatedShows;})`,
    ),
    1,
    'Saved layout updates scheduled unbooked show',
  );
  await clickText('Refresh');
  await clickText('Statistics');
  await waitFor(
    `document.body.innerText.includes('Custom Studio') && document.body.innerText.includes('Occupancy')`,
    'theatre statistics',
  );
  writeFileSync(
    join(tmpdir(), 'quickshow-theatre-stats.png'),
    Buffer.from(
      (await send('Page.captureScreenshot', { format: 'png' })).data,
      'base64',
    ),
  );
  await clickText('Sign out');
  await navigate('/login');
  await evaluate(
    `document.querySelector('[name=email]').value='browser@example.com';document.querySelector('[name=password]').value='browser-password-123';document.querySelector('form').requestSubmit()`,
  );
  await waitFor(`location.pathname==='/my-bookings'`, 'customer re-login');
  await navigate(`/movies/1/${customShow.id}`);
  await waitFor(
    `document.querySelectorAll('.seat-map button').length===8`,
    'updated eight-seat layout',
  );
  assert.equal(
    await evaluate(
      `document.querySelectorAll('.seat-map button.aisle').length`,
    ),
    4,
    'Both aisle gaps render',
  );
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.seat-map .seat-row')).paddingBottom`,
    ),
    '48px',
    'Booking layout preserves row gap',
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.seat-row').length`),
    2,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.seat-tier').length`),
    1,
    'Category heading is grouped',
  );
  assert.match(
    await evaluate(`document.querySelector('.seat-tier').innerText`),
    /Sofa.*450/i,
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`),
    true,
    'Custom seating is usable on mobile',
  );
  writeFileSync(
    join(tmpdir(), 'quickshow-custom-seating.png'),
    Buffer.from(
      (await send('Page.captureScreenshot', { format: 'png' })).data,
      'base64',
    ),
  );
  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  console.log(
    'Browser smoke passed: registration, screenings, seat prices, reservation, cancellation, favourites, administrator movie/screening CRUD, audit history, theatre-admin assignments and scoped access, custom screen layouts, statistics, desktop and mobile layouts.',
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
