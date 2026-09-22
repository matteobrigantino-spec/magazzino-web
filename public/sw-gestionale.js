const CACHE_NAME =
  "gestionale-matteo-v1";

const APP_SHELL = [
  "/gestionale",
  "/manifest-gestionale.webmanifest",
];

self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache.addAll(APP_SHELL)
        )
        .catch(() => undefined)
    );

    self.skipWaiting();
  }
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith(
                    "gestionale-matteo-"
                  ) &&
                  key !== CACHE_NAME
              )
              .map((key) =>
                caches.delete(key)
              )
          )
        )
        .then(() =>
          self.clients.claim()
        )
    );
  }
);

self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    if (
      request.method !== "GET"
    ) {
      return;
    }

    const url =
      new URL(request.url);

    if (
      url.origin !==
      self.location.origin
    ) {
      return;
    }

    if (
      request.mode ===
      "navigate"
    ) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const copy =
              response.clone();

            caches
              .open(CACHE_NAME)
              .then((cache) =>
                cache.put(
                  request,
                  copy
                )
              )
              .catch(
                () => undefined
              );

            return response;
          })
          .catch(async () => {
            return (
              (await caches.match(
                request
              )) ||
              (await caches.match(
                "/gestionale"
              )) ||
              Response.error()
            );
          })
      );

      return;
    }

    const isStaticAsset =
      /\.(?:js|css|woff2?|png|jpg|jpeg|webp|svg|ico)$/i.test(
        url.pathname
      );

    if (!isStaticAsset) {
      return;
    }

    event.respondWith(
      caches
        .match(request)
        .then(
          (cached) =>
            cached ||
            fetch(request).then(
              (response) => {
                const copy =
                  response.clone();

                caches
                  .open(
                    CACHE_NAME
                  )
                  .then(
                    (cache) =>
                      cache.put(
                        request,
                        copy
                      )
                  )
                  .catch(
                    () =>
                      undefined
                  );

                return response;
              }
            )
        )
    );
  }
);

/*
  NOTIFICHE PUSH
  (battelli a rischio consegna + scorte sotto minimo)
*/
self.addEventListener(
  "push",
  (event) => {
    let payload = {};

    try {
      payload = event.data
        ? event.data.json()
        : {};
    } catch (error) {
      payload = {
        title: "Gestionale Matteo",
        body: event.data
          ? event.data.text()
          : "",
      };
    }

    const title =
      payload.title ||
      "Gestionale Matteo";

    const options = {
      body: payload.body || "",
      icon: "/catalogo-icon.svg",
      badge:
        "/catalogo-icon.svg",
      data: {
        url: payload.url || "/",
      },
    };

    event.waitUntil(
      self.registration.showNotification(
        title,
        options
      )
    );
  }
);

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const targetUrl =
      (event.notification.data &&
        event.notification.data
          .url) ||
      "/";

    event.waitUntil(
      self.clients
        .matchAll({
          type: "window",
          includeUncontrolled: true,
        })
        .then((clientList) => {
          for (const client of clientList) {
            if (
              client.url.includes(
                targetUrl
              ) &&
              "focus" in client
            ) {
              return client.focus();
            }
          }

          if (
            self.clients.openWindow
          ) {
            return self.clients.openWindow(
              targetUrl
            );
          }
        })
    );
  }
);
