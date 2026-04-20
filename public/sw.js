const CACHE_NAME = "ipms-v7";
const CORE_ASSETS = [
	"/",
	"/index.html",
	"/manifest.webmanifest?v=7",
	"/favicon.ico?v=7",
	"/logomarknobg.webp?v=7",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(CORE_ASSETS))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names
						.filter((name) => name !== CACHE_NAME)
						.map((name) => caches.delete(name)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;

	const requestUrl = new URL(event.request.url);
	if (requestUrl.origin !== self.location.origin) return;

	if (event.request.mode === "navigate") {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					const responseCopy = response.clone();
					caches
						.open(CACHE_NAME)
						.then((cache) => cache.put("/index.html", responseCopy));
					return response;
				})
				.catch(() => caches.match("/index.html")),
		);
		return;
	}

	const isStaticAsset = ["script", "style", "image", "font"].includes(
		event.request.destination,
	);
	if (isStaticAsset) {
		event.respondWith(
			caches.match(event.request).then((cached) => {
				if (cached) return cached;
				return fetch(event.request).then((response) => {
					const responseCopy = response.clone();
					caches
						.open(CACHE_NAME)
						.then((cache) => cache.put(event.request, responseCopy));
					return response;
				});
			}),
		);
	}
});
