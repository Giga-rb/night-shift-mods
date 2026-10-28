// Cloudflare Worker — бэкенд каталога модов (приём заявок, вход через GitHub, действия модераторов).
// Все записи в репозиторий делает он сам, токеном бота (секрет GH_TOKEN). Сайт токена не видит.
const GH = "https://api.github.com";
const RE = { repo: /^[\w.-]+\/[\w.-]+$/, id: /^[a-z0-9][a-z0-9._-]{0,90}$/, login: /^[A-Za-z0-9-]{1,39}$/ };
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...h } });
class Err extends Error { constructor(m, s = 400) { super(m); this.s = s; } }
const t2b = s => { let x = ""; new TextEncoder().encode(s).forEach(c => x += String.fromCharCode(c)); return btoa(x); };
const b2t = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), c => c.charCodeAt(0)));
const UA = { "User-Agent": "night-shift-mods" };

const gh = (env, p, method = "GET", body) => fetch(GH + p, { method, body: body && JSON.stringify(body),
  headers: { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github+json", ...UA } });
const cp = env => `/repos/${env.OWNER}/${env.REPO}/contents/`;
async function read(env, path) {
  const r = await gh(env, cp(env) + path + "?ref=" + env.BRANCH);
  if (r.status === 404) return null;
  if (!r.ok) throw new Err("GitHub " + r.status, 502);
  return r.json();
}
const list = async (env, dir) => { const d = await read(env, dir); return Array.isArray(d) ? d : []; };
async function readJson(env, path) {
  const f = await read(env, path); if (!f) return null;
  try { return { sha: f.sha, d: JSON.parse(b2t(f.content)) }; } catch { return null; }
}
async function write(env, path, b64, msg, sha) {
  if (!sha) sha = (await read(env, path))?.sha;
  const r = await gh(env, cp(env) + path, "PUT", { message: msg, content: b64, branch: env.BRANCH, ...(sha && { sha }) });
  if (!r.ok) throw new Err(`GitHub ${r.status} при записи ${path}`, 502);
}
async function remove(env, path, msg) {
  const f = await read(env, path); if (!f) return;
  const r = await gh(env, cp(env) + path, "DELETE", { message: msg, sha: f.sha, branch: env.BRANCH });
  if (!r.ok) throw new Err(`GitHub ${r.status} при удалении ${path}`, 502);
}
const writeJson = (env, path, d, msg) => write(env, path, t2b(JSON.stringify(d, null, 2) + "\n"), msg);

function checkImg(im) {
  if (!im) return null;
  const d = String(im.data || "");
  if (!/^[A-Za-z0-9+/=]+$/.test(d) || d.length > 950000) throw new Err("Картинка: только PNG/JPG до 700 КБ");
  const h = atob(d.slice(0, 8)), png = h.startsWith("\x89PNG"), jpg = h.startsWith("\xff\xd8\xff");
  if (!png && !jpg) throw new Err("Картинка должна быть PNG или JPG");
  return { ext: png ? "png" : "jpg", b64: d };
}
function clean(d) {
  const s = (v, n) => String(v ?? "").trim().slice(0, n), arr = v => Array.isArray(v) ? v : [];
  const o = {
    name: s(d.name, 80), author: s(d.author, 60), description: s(d.description, 1000), repo: s(d.repo, 100),
    tags: [...new Set(arr(d.tags).map(t => s(t, 24).toLowerCase()).filter(Boolean))].slice(0, 8),
    dependencies: [...new Set(arr(d.dependencies).map(x => s(x, 90)).filter(x => RE.id.test(x)))].slice(0, 15)
  };
  if (!o.name || !o.author || !o.description) throw new Err("Заполните название, автора и описание");
  if (!RE.repo.test(o.repo)) throw new Err("Репозиторий должен быть вида user/repo");
  return o;
}

async function who(req, env) {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!t) throw new Err("Нужен вход", 401);
  const r = await fetch(GH + "/user", { headers: { Authorization: "Bearer " + t, ...UA } });
  if (!r.ok) throw new Err("Вход устарел, войдите снова", 401);
  const login = (await r.json()).login, mods = (await readJson(env, "moderators.json"))?.d.moderators || [];
  const role = same(login, env.ADMIN) ? "admin" : mods.some(m => same(m, login)) ? "moderator" : null;
  if (!role) throw new Err("Вашего аккаунта нет в списке модераторов", 403);
  return { login, role, mods };
}

async function submit(req, env) {
  const b = await req.json().catch(() => { throw new Err("Некорректный запрос"); });
  if (b.hp) return json({ ok: true }); // ловушка для ботов
  if (env.TURNSTILE_SECRET) {
    const v = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: b.cf || "" }) })).json();
    if (!v.success) throw new Err("Проверка «я не робот» не пройдена");
  }
  const d = clean(b);
  if (!(await gh(env, `/repos/${d.repo}`)).ok) throw new Err("Репозиторий не найден или он приватный");
  if ((await list(env, "pending")).length > 200) throw new Err("Слишком много заявок в очереди, попробуйте позже", 429);
  const id = d.repo.replace("/", "-").toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^[^a-z0-9]+/, "") + "-" + crypto.randomUUID().slice(0, 4);
  const im = checkImg(b.image);
  d.image = im ? `pending/${id}.${im.ext}` : "";
  if (im) await write(env, d.image, im.b64, `Заявка: картинка ${id}`);
  await writeJson(env, `pending/${id}.json`, d, `Заявка: ${d.name}`);
  return json({ ok: true });
}

async function admin(req, env, url, p) {
  const u = await who(req, env), msg = m => `${m} (${u.login})`;
  if (p === "/admin/me") return json({ login: u.login, role: u.role });
  if (p === "/admin/state" && req.method === "GET") {
    const [pl, ml] = await Promise.all([list(env, "pending"), list(env, "mods")]);
    const load = async (f, pend) => { const x = await readJson(env, f.path); if (!x) return null;
      const o = { id: f.name.slice(0, -5), data: x.d };
      if (pend && x.d.image) o.imageUrl = `https://raw.githubusercontent.com/${env.OWNER}/${env.REPO}/${env.BRANCH}/${x.d.image}`;
      return o; };
    const js = a => a.filter(f => f.name.endsWith(".json"));
    return json({ role: u.role, moderators: u.mods,
      pending: (await Promise.all(js(pl).map(f => load(f, 1)))).filter(Boolean),
      mods: (await Promise.all(js(ml).map(f => load(f)))).filter(Boolean) });
  }
  const body = ["POST", "PUT"].includes(req.method) ? await req.json().catch(() => ({})) : {};
  const id = body.id || url.searchParams.get("id") || "";
  if (p.startsWith("/admin/mod") || p === "/admin/approve" || p === "/admin/reject")
    if (!RE.id.test(id)) throw new Err("Некорректный id");

  if (p === "/admin/approve" || p === "/admin/reject") {
    const f = await readJson(env, `pending/${id}.json`); if (!f) throw new Err("Заявка не найдена", 404);
    if (p === "/admin/approve") {
      if (await read(env, `mods/${id}.json`)) throw new Err("Мод с таким id уже есть", 409);
      const d = f.d;
      if (d.image) {
        if (!/^pending\/[\w.-]+\.(png|jpg)$/.test(d.image)) throw new Err("Некорректный путь картинки");
        const im = await read(env, d.image), ext = d.image.split(".").pop();
        if (im) { d.image = `images/${id}.${ext}`; await write(env, d.image, im.content.replace(/\n/g, ""), msg(`Картинка ${id}`)); } else d.image = "";
      }
      await writeJson(env, `mods/${id}.json`, d, msg(`Одобрить ${d.name}`));
    }
    if (f.d.image?.startsWith("pending/")) await remove(env, f.d.image, msg("Убрать картинку заявки"));
    await remove(env, `pending/${id}.json`, msg(`${p === "/admin/approve" ? "Заявка принята" : "Заявка отклонена"}: ${f.d.name}`));
    return json({ ok: true });
  }
  if (p === "/admin/mod" && req.method === "PUT") {
    const old = await readJson(env, `mods/${id}.json`), d = clean(body.data || {});
    d.featured = !!body.data?.featured; d.hidden = !!body.data?.hidden; d.image = old?.d.image || "";
    const im = checkImg(body.image);
    if (im) {
      const np = `images/${id}.${im.ext}`;
      await write(env, np, im.b64, msg(`Картинка ${id}`));
      if (d.image && d.image !== np && d.image.startsWith("images/")) await remove(env, d.image, msg("Старая картинка"));
      d.image = np;
    }
    await writeJson(env, `mods/${id}.json`, d, msg(`${old ? "Правка" : "Добавить мод"} ${d.name}`));
    return json({ ok: true });
  }
  if (p === "/admin/mod" && req.method === "DELETE") {
    const f = await readJson(env, `mods/${id}.json`); if (!f) throw new Err("Мод не найден", 404);
    if (f.d.image?.startsWith("images/")) await remove(env, f.d.image, msg("Убрать картинку"));
    await remove(env, `mods/${id}.json`, msg(`Удалить мод ${f.d.name}`));
    return json({ ok: true });
  }
  if (p === "/admin/moderators" && req.method === "POST") {
    if (u.role !== "admin") throw new Err("Список модераторов меняет только админ", 403);
    const login = String(body.login || "").replace(/^@/, "");
    if (!RE.login.test(login)) throw new Err("Некорректный логин");
    const l = u.mods.filter(x => !same(x, login));
    if (body.op === "add") l.push(login);
    await writeJson(env, "moderators.json", { moderators: l }, msg(`${body.op === "add" ? "Добавить" : "Убрать"} модератора ${login}`));
    return json({ ok: true, moderators: l });
  }
  throw new Err("Не найдено", 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    const cors = { "Access-Control-Allow-Origin": new URL(env.SITE_URL).origin, Vary: "Origin",
      "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      if (p === "/auth/login") {
        const st = url.searchParams.get("state") || "";
        if (!/^[\w-]{8,64}$/.test(st)) throw new Err("Некорректный state");
        return Response.redirect("https://github.com/login/oauth/authorize?" + new URLSearchParams({
          client_id: env.CLIENT_ID, redirect_uri: url.origin + "/auth/callback", state: st }), 302);
      }
      if (p === "/auth/callback") {
        const r = await fetch("https://github.com/login/oauth/access_token", { method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json", ...UA },
          body: JSON.stringify({ client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, code: url.searchParams.get("code") }) });
        const d = await r.json();
        if (!d.access_token) throw new Err("GitHub не выдал токен");
        return Response.redirect(`${env.SITE_URL}/admin.html#` + new URLSearchParams({ token: d.access_token, state: url.searchParams.get("state") || "" }), 302);
      }
      if (p === "/submit" && req.method === "POST") { const r = await submit(req, env); return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...cors } }); }
      if (p.startsWith("/admin/")) { const r = await admin(req, env, url, p); return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...cors } }); }
      throw new Err("Не найдено", 404);
    } catch (e) {
      return json({ error: e instanceof Err ? e.message : "Внутренняя ошибка" }, e.s || 500, cors);
    }
  }
};
