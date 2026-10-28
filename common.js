const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const okRepo = r => /^[\w.-]+\/[\w.-]+$/.test(r || "");
const normRepo = s => String(s || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
const imgUrl = m => /^(images\/[\w.-]+\.(png|jpe?g)|https:\/\/[^\s'")]+)$/i.test(m.image || "") ? m.image : "";
const loadMods = () => fetch("mods.json?t=" + Date.now()).then(r => r.json());

async function downloadMod(m, btn) {
  if (/^https:\/\//.test(m.download || "")) { location.href = m.download; return; }
  if (!okRepo(m.repo)) return;
  if (btn) btn.disabled = true;
  try { // запасной путь, если сборка не успела записать ссылку
    const r = await fetch(`https://api.github.com/repos/${m.repo}/releases/latest`);
    if (r.ok) { const d = await r.json(), a = (d.assets || [])[0]; location.href = a ? a.browser_download_url : d.zipball_url; }
    else { const i = await (await fetch(`https://api.github.com/repos/${m.repo}`)).json(); location.href = `https://github.com/${m.repo}/archive/refs/heads/${i.default_branch || "main"}.zip`; }
  } catch { location.href = `https://github.com/${m.repo}`; }
  if (btn) setTimeout(() => btn.disabled = false, 1500);
}
function toast(msg, err) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : ""); t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), err ? 6000 : 3000);
}
function readImg(f) {
  return new Promise((ok, no) => {
    const type = f.type === "image/png" ? "png" : f.type === "image/jpeg" ? "jpg" : "";
    if (!type) return no(Error("Только PNG или JPG"));
    if (f.size > 700 * 1024) return no(Error("Картинка больше 700 КБ"));
    const r = new FileReader();
    r.onload = () => ok({ type, data: String(r.result).split(",")[1] });
    r.onerror = () => no(Error("Не удалось прочитать файл"));
    r.readAsDataURL(f);
  });
}
const depsBoxes = (mods, sel = [], skip = "") => mods.filter(m => m.id !== skip).map(m =>
  `<label class="chk"><input type="checkbox" value="${esc(m.id)}"${sel.includes(m.id) ? " checked" : ""}> ${esc(m.name || m.data?.name)}</label>`).join("") || '<span class="hint">В каталоге пока нет модов.</span>';
const pickedDeps = box => [...box.querySelectorAll("input:checked")].map(i => i.value);
