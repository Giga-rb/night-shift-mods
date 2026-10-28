const A = CONFIG.api.replace(/\/$/, "");
let T = sessionStorage.getItem("t") || "", me = {}, S = { pending: [], mods: [], moderators: [] }, editing = null, img = null;

async function api(path, method = "GET", body) {
  const r = await fetch(A + path, { method, headers: { Authorization: "Bearer " + T, ...(body && { "Content-Type": "application/json" }) }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = Error(d.error || "Ошибка " + r.status); e.status = r.status; throw e; }
  return d;
}
const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, true); } };
const refresh = async () => { S = await api("/admin/state"); drawAll(); };

// --- вход ---
const h = new URLSearchParams(location.hash.slice(1));
if (h.get("token")) {
  if (h.get("state") && h.get("state") === sessionStorage.getItem("st")) { T = h.get("token"); sessionStorage.setItem("t", T); }
  history.replaceState(null, "", location.pathname);
}
$("#go").onclick = () => { const st = crypto.randomUUID(); sessionStorage.setItem("st", st); location.href = `${A}/auth/login?state=${st}`; };
$("#out").onclick = () => { sessionStorage.removeItem("t"); location.reload(); };
(async () => {
  if (!T) return;
  try {
    me = await api("/admin/me");
    $("#loginBox").hidden = true; $("#app").hidden = false;
    $("#me").textContent = me.login; $("#role").textContent = me.role === "admin" ? "админ" : "модератор";
    await refresh();
  } catch (e) { sessionStorage.removeItem("t"); T = ""; $("#err").textContent = e.message; }
})();

$("#tabs").onclick = e => {
  const t = e.target.dataset.tab; if (!t) return;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b === e.target));
  ["prs", "mods", "mdr"].forEach(x => $("#" + x).hidden = x !== t);
};
function drawAll() { drawPending(); drawMods(); drawMdr(); }
const label = (t, n) => n ? `${t} (${n})` : t;

// --- заявки ---
function drawPending() {
  document.querySelector('[data-tab="prs"]').textContent = label("Заявки", S.pending.length);
  $("#prs").innerHTML = S.pending.map(p => { const d = p.data; return `<div class="req">
    <div class="img" style="${p.imageUrl ? `background-image:url('${esc(p.imageUrl)}')` : ""}">${p.imageUrl ? "" : "нет картинки"}</div>
    <div><b>${esc(d.name)}</b> <span class="hint">от ${esc(d.author)}</span><br>
      <a href="https://github.com/${esc(d.repo)}" target="_blank" rel="noopener">${esc(d.repo)}</a>
      <p style="white-space:pre-line;margin:.4em 0">${esc(d.description)}</p>
      <span class="hint">Зависимости: ${(d.dependencies || []).map(esc).join(", ") || "нет"} · Теги: ${(d.tags || []).map(esc).join(", ") || "нет"}</span></div>
    <div class="acts"><button data-ok="${esc(p.id)}">Одобрить</button><button class="danger" data-no="${esc(p.id)}">Отклонить</button></div></div>`; }).join("") || '<p class="empty">Новых заявок нет.</p>';
}
$("#prs").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.ok) run(async () => { await api("/admin/approve", "POST", { id: b.dataset.ok }); await refresh(); }, "Одобрено. Сайт обновится через 1–2 минуты.");
  if (b.dataset.no && confirm("Отклонить заявку и удалить её?")) run(async () => { await api("/admin/reject", "POST", { id: b.dataset.no }); await refresh(); }, "Отклонено");
};

// --- моды ---
function drawMods() {
  const q = $("#mq").value.toLowerCase();
  $("#mrows").innerHTML = S.mods.filter(m => (m.data.name + " " + m.data.author).toLowerCase().includes(q)).map(m => `<tr>
    <td><b>${esc(m.data.name)}</b><br><span class="hint">${esc(m.data.author)}</span></td>
    <td><a href="https://github.com/${esc(m.data.repo)}" target="_blank" rel="noopener">${esc(m.data.repo)}</a></td>
    <td>${m.data.featured ? '<span class="pill amber">рекомендуемый</span> ' : ""}${m.data.hidden ? '<span class="pill red">скрыт</span>' : ""}</td>
    <td><div class="acts"><button class="ghost" data-e="${esc(m.id)}">Править</button><button class="danger" data-x="${esc(m.id)}">Удалить</button></div></td></tr>`).join("")
    || '<tr><td colspan="4" class="empty">Модов нет.</td></tr>';
}
$("#mq").oninput = drawMods;
$("#mods").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  const m = S.mods.find(x => x.id === (b.dataset.e || b.dataset.x));
  if (b.dataset.e) openEditor(m);
  if (b.dataset.x && confirm(`Удалить мод «${m.data.name}»? Это коммит в репозиторий.`))
    run(async () => { await api("/admin/mod?id=" + encodeURIComponent(m.id), "DELETE"); await refresh(); }, "Удалено");
};
$("#add").onclick = () => openEditor(null);
function openEditor(m) {
  editing = m; img = null; const d = m ? m.data : {};
  $("#dt").textContent = m ? "Править мод" : "Новый мод";
  $("#f_name").value = d.name || ""; $("#f_author").value = d.author || ""; $("#f_repo").value = d.repo || "";
  $("#f_desc").value = d.description || ""; $("#f_img").value = ""; $("#f_tags").value = (d.tags || []).join(", ");
  $("#f_feat").checked = !!d.featured; $("#f_hid").checked = !!d.hidden;
  $("#f_deps").innerHTML = depsBoxes(S.mods, d.dependencies || [], m?.id);
  $("#dlg").showModal();
}
$("#f_img").onchange = async e => { img = null; const f = e.target.files[0]; if (!f) return;
  try { img = await readImg(f); } catch (er) { e.target.value = ""; toast(er.message, true); } };
$("#cancel").onclick = () => $("#dlg").close();
$("#save").onclick = () => run(async () => {
  const repo = normRepo($("#f_repo").value);
  if (!okRepo(repo)) throw Error("Репозиторий должен быть вида user/repo.");
  const id = editing ? editing.id : repo.replace("/", "-").toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^[^a-z0-9]+/, "");
  if (!editing && S.mods.some(m => m.id === id)) throw Error("Такой мод уже есть.");
  await api("/admin/mod", "PUT", { id, image: img, data: {
    name: $("#f_name").value, author: $("#f_author").value, repo, description: $("#f_desc").value,
    tags: $("#f_tags").value.split(","), dependencies: pickedDeps($("#f_deps")), featured: $("#f_feat").checked, hidden: $("#f_hid").checked } });
  $("#dlg").close(); await refresh();
}, "Сохранено. Сайт обновится через 1–2 минуты.");

// --- модераторы ---
function drawMdr() {
  const adm = me.role === "admin";
  $("#mdr").innerHTML = `<p class="hint">${adm ? "Вы админ: можете добавлять и убирать модераторов." : "Менять список может только админ."}</p>
    <table><tbody>${S.moderators.map(u => `<tr><td>${esc(u)}</td><td>${adm ? `<button class="danger" data-r="${esc(u)}">Убрать</button>` : ""}</td></tr>`).join("")
    || '<tr><td class="empty">Других модераторов пока нет.</td></tr>'}</tbody></table>
    ${adm ? `<div class="bar" style="padding:16px 0"><input id="nm" placeholder="Логин на GitHub"><button id="addm">Добавить</button></div>` : ""}`;
}
$("#mdr").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  const set = (login, op) => run(async () => { await api("/admin/moderators", "POST", { login, op }); await refresh(); }, op === "add" ? "Модератор добавлен" : "Модератор убран");
  if (b.id === "addm") { const u = $("#nm").value.trim().replace(/^@/, ""); if (!/^[A-Za-z0-9-]{1,39}$/.test(u)) return toast("Некорректный логин", true); set(u, "add"); }
  if (b.dataset.r && confirm(`Убрать ${b.dataset.r}?`)) set(b.dataset.r, "remove");
};
