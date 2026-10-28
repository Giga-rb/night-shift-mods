# Каталог модов Just Another Night Shift

Сайт на GitHub Pages + маленький бэкенд на Cloudflare Workers (бесплатно). Бэкенд нужен, потому что GitHub Pages — статический хостинг: он не умеет принимать загрузки от анонимов и не умеет входить через GitHub.

## Как это устроено
- **Сайт** (эта папка) → GitHub Pages. Каталог, страница мода, форма отправки, панель модератора.
- **Worker** (`worker/worker.js`) → принимает заявки без входа, проверяет их и кладёт в `pending/` репозитория; даёт войти через GitHub; выполняет действия модераторов (одобрить, править, удалить, назначить модератора).
- **Модерация**: модераторам не нужен доступ к репозиторию. Worker сам проверяет логин GitHub по списку `moderators.json` и пишет в репозиторий токеном бота. Админ (вы) задаётся в `wrangler.toml`.
- **Сборка**: GitHub Action собирает `mods.json` из `mods/` и каждые 6 часов обновляет ссылки на последние релизы модов.

## Установка (один раз)
1. Создайте репозиторий, загрузите туда все файлы (включая `.github`). Settings → Pages → Deploy from a branch → `main` / root. Settings → Actions → General → Workflow permissions → **Read and write**.
2. **Токен бота**: GitHub → Settings → Developer settings → Fine-grained tokens. Доступ только к этому репозиторию, Permissions → **Contents: Read and write**. Срок действия у таких токенов ограничен — поставьте напоминание продлить.
3. **OAuth-приложение**: Settings → Developer settings → OAuth Apps → New. Homepage URL — адрес сайта, Authorization callback URL — `https://night-shift-mods.ВАШ_ПОДДОМЕН.workers.dev/auth/callback`. Сохраните Client ID и создайте Client secret.
4. **Worker**: заведите бесплатный аккаунт Cloudflare, затем в папке `worker/`:
   ```
   npm i -g wrangler
   wrangler login
   # впишите свои значения в wrangler.toml (OWNER, REPO, ADMIN, SITE_URL, CLIENT_ID)
   wrangler secret put GH_TOKEN        # токен из п. 2
   wrangler secret put CLIENT_SECRET   # secret из п. 3
   wrangler deploy
   ```
5. В `config.js` впишите `owner`, `repo` и адрес Worker (`api`). Закоммитьте.
6. Откройте `https://ВАШ_ЛОГИН.github.io/РЕПОЗИТОРИЙ/admin.html` и войдите через GitHub.

## Защита от спама (рекомендуется)
- Worker уже проверяет формат, размер и тип файла (PNG/JPG по содержимому), что репозиторий существует и публичный, и ограничивает очередь 200 заявками.
- Включите Cloudflare **Turnstile** (бесплатная капча): ключ сайта → `turnstileSiteKey` в `config.js`, секрет → `wrangler secret put TURNSTILE_SECRET`.
- В Cloudflare Dashboard добавьте Rate limiting rule на путь `/submit`.

## Зависимости модов
При отправке выбираются моды из каталога. Если моду нужен фреймворк или загрузчик модов, добавьте его в каталог как обычный мод — тогда на него можно ссылаться.

## Ограничения
- «Скачать» берёт файл из последнего Release репозитория мода (первый .zip, иначе первый файл), если релиза нет — архив основной ветки. Репозиторий мода должен быть публичным.
- После одобрения или правки сайт обновляется через 1–2 минуты (сборка + публикация Pages).
- Заявки в `pending/` лежат в публичном репозитории (не на сайте), как и `moderators.json`.
