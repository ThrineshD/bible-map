/* Bible Atlas 3D — offline service worker (version ba3d-8877e46f14) */
const V = 'ba3d-8877e46f14';
const BUILD = '8877e46f14';
const SCOPE = self.registration.scope;
const SHELL = new URL('index.html', SCOPE).href;
const OPTIONAL = ['manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

async function say(msg) {
  const cl = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  cl.forEach((c) => c.postMessage(msg));
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(V);
      // the app itself: must succeed. A unique ?v= query skips GitHub's 10-minute CDN cache, and the
      // build stamp is checked so a stale copy can never be saved under the new version.
      let blob = null, seen = '';
      for (const q of ['?v=' + BUILD, '?v=' + BUILD + '&t=' + Date.now()]) {
        const res = await fetch(new Request(SHELL + q, { cache: 'reload' }));
        if (!res.ok) throw new Error('index.html returned HTTP ' + res.status);
        const b = await res.blob();
        const head = await b.slice(0, 6000).text();
        const m = head.match(/name="ba-build" content="([^"]+)"/); seen = m ? m[1] : 'old';
        if (seen === BUILD) { blob = b; break; }
      }
      if (!blob) throw new Error('the website is still serving the previous index.html (sw.js is new, index.html is ' + seen + '). Check both files were replaced on GitHub, wait a few minutes, then reopen');
      if (blob.size < 1000000) throw new Error('index.html looks incomplete (' + blob.size + ' bytes)');
      // Rebuild the Response so it is never marked "redirected" (Safari refuses those).
      await cache.put(SHELL, new Response(blob, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
      // icons/manifest: nice to have, never block the install
      await Promise.all(OPTIONAL.map(async (f) => {
        try { const u = new URL(f, SCOPE).href; const r = await fetch(u, { cache: 'reload' }); if (r.ok) await cache.put(u, new Response(await r.blob(), { status: 200, headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream' } })); } catch (_) {}
      }));
      say({ ba: 'cached', v: BUILD });
      await self.skipWaiting();
    } catch (err) {
      say({ ba: 'fail', msg: String((err && err.message) || err) });
      throw err;
    }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== V && k.startsWith('ba3d-')).map((k) => caches.delete(k)));
    await self.clients.claim();
    say({ ba: 'active', v: BUILD });
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Any page load inside the scope (with or without index.html, ?query or #hash) gets the cached app.
    e.respondWith((async () => {
      const hit = await caches.match(SHELL);
      if (hit) return hit;
      try { return await fetch(req); } catch (_) {
        return new Response('<meta name=viewport content="width=device-width"><body style="font:16px system-ui;background:#05070d;color:#eee;padding:32px"><h2>Bible Atlas</h2><p>The offline copy is not saved on this device yet. Open this page once with internet, wait for "Offline ready ✓" on the opening screen, then try again.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); } catch (_) { return Response.error(); }
  })());
});
