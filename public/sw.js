const CACHE_VERSION = "catalogo-magazzino-v2";

const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const CORE_FILES = [
  "/catalogo",
  "/manifest.webmanifest",
  "/catalogo-icon.svg",
];

/*
  INSTALLAZIONE
*/
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);

      for (const url of CORE_FILES) {
        try {
          const response = await fetch(url, {
            cache: "reload",
          });

          if (response.ok) {
            await cache.put(
              url,
              response.clone()
            );
          }
        } catch (error) {
          console.warn(
            "Impossibile salvare nella cache:",
            url
          );
        }
      }

      await self.skipWaiting();
    })()
  );
});

/*
  ATTIVAZIONE
*/
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      const cachesToKeep = [
        APP_CACHE,
        RUNTIME_CACHE,
        IMAGE_CACHE,
      ];

      await Promise.all(
        cacheNames.map((cacheName) => {
          /*
            Eliminiamo le vecchie versioni
            del catalogo.
          */
          if (
            cacheName.startsWith(
              "catalogo-magazzino-"
            ) &&
            !cachesToKeep.includes(cacheName)
          ) {
            return caches.delete(cacheName);
          }

          /*
            Eliminiamo anche la vecchia cache
            immagini usata nella prima prova.
          */
          if (
            cacheName ===
            "magazzino-catalogo-images-v1"
          ) {
            return caches.delete(cacheName);
          }

          return Promise.resolve();
        })
      );

      await self.clients.claim();
    })()
  );
});

/*
  RICHIESTE
*/
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
    PAGINA CATALOGO
  */
  if (
    request.mode === "navigate" &&
    url.origin === self.location.origin &&
    url.pathname.startsWith("/catalogo")
  ) {
    event.respondWith(
      networkFirstCatalogPage(request)
    );

    return;
  }

  /*
    FILE NEXT.JS
  */
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/")
  ) {
    event.respondWith(
      cacheFirst(request)
    );

    return;
  }

  /*
    MANIFEST E ICONA
  */
  if (
    url.origin === self.location.origin &&
    (
      url.pathname ===
        "/manifest.webmanifest" ||
      url.pathname ===
        "/catalogo-icon.svg"
    )
  ) {
    event.respondWith(
      cacheFirst(request)
    );

    return;
  }

  /*
    IMMAGINI

    IMPORTANTE:
    intercettiamo anche le immagini
    provenienti da siti esterni.

    Se sono già state salvate,
    vengono lette dalla cache del PC.
  */
  if (request.destination === "image") {
    event.respondWith(
      imageCacheFirst(request)
    );

    return;
  }
});

/*
  PAGINA CATALOGO:
  internet prima, cache se offline.
*/
async function networkFirstCatalogPage(request) {
  const cache = await caches.open(APP_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(
        request,
        response.clone()
      );

      await cache.put(
        "/catalogo",
        response.clone()
      );
    }

    return response;
  } catch (error) {
    const cachedResponse =
      await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    const catalogFallback =
      await cache.match("/catalogo");

    if (catalogFallback) {
      return catalogFallback;
    }

    return new Response(
      `
        <!doctype html>
        <html lang="it">
          <head>
            <meta charset="utf-8">
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            >
            <title>Catalogo Magazzino</title>
          </head>

          <body
            style="
              font-family:Arial,sans-serif;
              padding:40px;
              background:#050505;
              color:white;
            "
          >
            <h1>Catalogo Magazzino</h1>

            <p>
              Il catalogo non è ancora stato
              salvato su questo PC.
            </p>

            <p>
              Collega il PC a Internet,
              apri il catalogo e premi
              "Aggiorna magazzino".
            </p>
          </body>
        </html>
      `,
      {
        headers: {
          "Content-Type":
            "text/html; charset=utf-8",
        },
      }
    );
  }
}

/*
  CACHE DEI FILE DELLA PWA
*/
async function cacheFirst(request) {
  const cache =
    await caches.open(RUNTIME_CACHE);

  const cached =
    await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response =
      await fetch(request);

    if (
      response.ok ||
      response.type === "opaque"
    ) {
      await cache.put(
        request,
        response.clone()
      );
    }

    return response;
  } catch (error) {
    return new Response("", {
      status: 504,
      statusText: "Offline",
    });
  }
}

/*
  CACHE DELLE FOTO

  Funziona anche con immagini provenienti
  da siti esterni.

  Le risposte "opaque" sono normali
  per immagini cross-domain.
*/
async function imageCacheFirst(request) {
  const cache =
    await caches.open(IMAGE_CACHE);

  const cached =
    await cache.match(request, {
      ignoreVary: true,
    });

  if (cached) {
    return cached;
  }

  try {
    const response =
      await fetch(request);

    if (
      response.ok ||
      response.type === "opaque"
    ) {
      await cache.put(
        request,
        response.clone()
      );
    }

    return response;
  } catch (error) {
    /*
      Nessuna rete e foto mai scaricata.
    */
    return Response.error();
  }
}