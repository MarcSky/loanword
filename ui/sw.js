const CACHE = 'loanword-shell-v4';

const SHELL = [
  '/',
  'index.html',
  'app.css',
  'app.js',
  'core.js',
  'languages.js',
  'answer.js',
  'quiz.js',
  'speak.js',
  'charts.js',
  'overview.js',
  'deck.js',
  'study.js',
  'analytics.js',
  'settings.js',
  'shell.js',
  'icons.svg',
  'favicon.svg',
  'manifest.webmanifest',
];

const LIVE = /^\/(state|due|stats|settings|grade|session|cloze|intervals|speech|build|clone|alphabet|produce|rewrite|delete|restore|favorite|card|export(\.csv)?|api|stop|i18n)(\/|\?|$)/;

const VENDOR = 'vendor/webawesome/';

const vendored = () =>
  fetch(`${VENDOR}FILES.json`)
    .then((reply) => reply.json())
    .then((files) => files.map((file) => `${VENDOR}${file}`))
    .catch(() => []);

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([caches.open(CACHE), vendored()])
      .then(([cache, files]) => cache.addAll([...SHELL, ...files]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (LIVE.test(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((reply) => {
        if (reply.ok && reply.type === 'basic') {
          const copy = reply.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return reply;
      })
      .catch(() =>
        caches
          .match(request, { ignoreSearch: true })
          .then((hit) => hit || caches.match('index.html')),
      ),
  );
});
