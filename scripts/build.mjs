// Собирает mods.json из mods/*.json. Запуск: node scripts/build.mjs [--check]
import fs from "fs";
const check = process.argv.includes("--check");
const token = process.env.GITHUB_TOKEN;
const H = { "User-Agent": "night-shift-build", Accept: "application/vnd.github+json", ...(token && { Authorization: "Bearer " + token }) };
const REPO = /^[\w.-]+\/[\w.-]+$/;

async function downloadUrl(repo) {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: H });
    if (r.ok) {
      const d = await r.json(), a = (d.assets || []).find(x => /\.zip$/i.test(x.name)) || (d.assets || [])[0];
      return a ? a.browser_download_url : d.zipball_url;
    }
    const i = await (await fetch(`https://api.github.com/repos/${repo}`, { headers: H })).json();
    return i.default_branch ? `https://github.com/${repo}/archive/refs/heads/${i.default_branch}.zip` : "";
  } catch { return ""; }
}

const all = [];
for (const f of fs.readdirSync("mods").filter(f => f.endsWith(".json"))) {
  try {
    const m = JSON.parse(fs.readFileSync("mods/" + f, "utf8"));
    for (const k of ["name", "author", "description", "repo"]) if (!m[k]) throw Error("нет поля " + k);
    if (!REPO.test(m.repo)) throw Error("repo должен быть вида user/repo");
    if (m.image && !/^(images\/[\w.-]+\.(png|jpe?g)|https:\/\/\S+)$/i.test(m.image)) throw Error("image: путь images/… или https://…");
    if (m.image?.startsWith("images/") && !fs.existsSync(m.image)) throw Error("нет файла " + m.image);
    all.push({ id: f.slice(0, -5), ...m });
  } catch (e) { console.error(`${f}: ${e.message}`); if (check) process.exitCode = 1; }
}
const out = all.filter(m => !m.hidden);
const ids = new Set(out.map(m => m.id));
for (const m of out) {
  m.dependencies = (m.dependencies || []).filter(d => ids.has(d) && d !== m.id);
  if (!check) m.download = await downloadUrl(m.repo);
}
out.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.name.localeCompare(b.name));
if (!check) fs.writeFileSync("mods.json", JSON.stringify(out, null, 1) + "\n");
console.log(out.length + " модов");
