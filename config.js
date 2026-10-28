window.CONFIG = {
  owner: "YOUR_GITHUB",   // аккаунт, где лежит репозиторий сайта
  repo: "YOUR_REPO",      // название репозитория сайта
  branch: "main",
  api: "https://night-shift-mods.YOUR_SUBDOMAIN.workers.dev", // адрес Cloudflare Worker (без / в конце)
  turnstileSiteKey: ""    // необязательно: ключ Cloudflare Turnstile (капча для формы отправки)
};
