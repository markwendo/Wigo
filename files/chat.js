/* Views, friends and groups, messages and the composer */
const VIEWS = ["settings", "games", "profile"];
const go = (name) => { ["auth", "reveal", "intro", "app"].forEach((s) => ($(s).hidden = s !== name)); if (name === "app") setView("chats"); };
const msg = (t, ok) => { $("authMsg").textContent = t || ""; $("authMsg").className = ok ? "ok" : ""; };

function setView(v) {
  view = v; $("app").dataset.view = v;
  document.querySelectorAll(".rb").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  VIEWS.forEach((n) => ($(n).hidden = v !== n));
  $("empty").hidden = v !== "chats" || !!active; $("pane").hidden = v !== "chats" || !active;
  if (v === "settings") { syncSettings(); fillAccount(); } else if (v === "games") renderGames(); else if (v === "profile") fillProfile();
}
document.querySelectorAll(".rb").forEach((b) => (b.onclick = () => { if (b.dataset.view === "chats") $("app").classList.remove("in-chat"); setView(b.dataset.view); }));
document.querySelectorAll(".vback").forEach((b) => (b.onclick = () => setView("chats")));

function applyAuth(res) { // called after every successful log-in / reconnect
  const old = new Map(friends); friends.clear();
  [...res.friends, ...res.groups].forEach((f) => friends.set(f.id, { ...f, msgs: old.has(f.id) ? old.get(f.id).msgs : [], unread: 0 }));
  myProfile = res.profile;
  $("reqList").innerHTML = ""; res.requests.forEach(addRequest);
}
function enterApp() { go("app"); $("safePill").hidden = !minor; active && friends.has(active) ? renderPane() : showEmpty(); renderList(); }

/* ---- Add a friend: their Wigo ID and their name must both match ---- */
const openModal = () => { $("modal").hidden = false; $("homeStatus").textContent = ""; $("friendId").focus(); };
$("plusBtn").onclick = openModal; $("emptyPlus").onclick = openModal;
$("cancelBtn").onclick = () => ($("modal").hidden = true);
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) $("modal").hidden = true; });
function requestChat() {
  socket.emit("request", { id: $("friendId").value, name: $("friendName").value }, (res) => {
    $("homeStatus").textContent = res.ok ? (res.note || "Request sent. They'll see it as soon as they open Wigo.") : res.error;
    if (res.ok) $("friendId").value = $("friendName").value = "";
  });
}
$("requestBtn").onclick = requestChat;
["friendId", "friendName"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") requestChat(); }));

/* ---- Requests and invites shown above the chat list ---- */
function card(key, text, onYes, onNo) {
  if (document.querySelector(`[data-key="${key}"]`)) return;
  const box = document.createElement("div"); box.className = "incoming"; box.dataset.key = key;
  const t = document.createElement("div"); t.textContent = text;
  const btns = document.createElement("div"); btns.className = "btns";
  const yes = document.createElement("button"); yes.textContent = "Accept"; yes.className = "small";
  const no = document.createElement("button"); no.textContent = "Decline"; no.className = "small ghost";
  yes.onclick = () => { onYes(); box.remove(); }; no.onclick = () => { onNo(); box.remove(); };
  btns.append(yes, no); box.append(t, btns); $("reqList").appendChild(box);
}
const dropCard = (key) => { const el = document.querySelector(`[data-key="${key}"]`); if (el) el.remove(); };
const addRequest = ({ fromId, fromName }) => card("f:" + fromId, `${fromName} (${fromId}) wants to be your friend.`,
  () => socket.emit("respond", { fromId, accept: true }), () => socket.emit("respond", { fromId, accept: false }));

/* ---- Group chats ---- */
let openAfter = null;
$("groupBtn").onclick = () => {
  const box = $("gmFriends"); box.innerHTML = "";
  for (const f of friends.values()) {
    if (f.group) continue;
    const l = document.createElement("label"); l.className = "frow";
    const c = document.createElement("input"); c.type = "checkbox"; c.value = f.id; c.style.cssText = "width:auto;margin:0";
    const n = document.createElement("span"); n.textContent = f.name; l.append(c, avEl(f.name, f.avatar, "sm"), n); box.appendChild(l);
  }
  $("gmNote").textContent = box.children.length ? "" : "Add a friend first, then you can start a group."; $("groupModal").hidden = false;
};
$("gmCancel").onclick = () => ($("groupModal").hidden = true);
$("gmCreate").onclick = () => socket.emit("group:create", { name: $("gmName").value, members: [...$("gmFriends").querySelectorAll("input:checked")].map((c) => c.value) }, (res) => {
  if (!res.ok) return ($("gmNote").textContent = res.error);
  $("groupModal").hidden = true; $("gmName").value = "";
  if (friends.has(res.id)) openChat(res.id); else openAfter = res.id;
});

/* ---- Stickers (original, drawn in CSS) ---- */
const STICKERS = { hi: ["Hi!", "#f2c14e", "#3a2a00", -5], yes: ["Yes!", "#7bbf8e", "#0f3a1e", 4], no: ["Nope", "#e27d7d", "#3d0d0d", -3], lol: ["LOL", "#8fb8de", "#0c2b49", 5],
  thanks: ["Thank you", "#f0a8b8", "#4a1022", -4], love: ["Love it", "#e4577a", "#ffffff", 3], omg: ["OMG", "#b69cdb", "#26104a", -6], sorry: ["Sorry", "#c9b79c", "#2e2210", 4],
  cheers: ["Cheers", "#f5a65b", "#4a2300", -3], nice: ["Nice one", "#78c6c0", "#06302d", 5], sleepy: ["Sleepy", "#9fb0d8", "#101d3f", -4], hungry: ["Hungry", "#d9c256", "#3a3200", 3] };
function stickerEl(id) {
  const s = STICKERS[id] || STICKERS.hi, el = document.createElement("div");
  el.className = "stk"; el.textContent = s[0]; el.style.cssText = `background:${s[1]};color:${s[2]};--rot:${s[3]}deg`; return el;
}
const sendMsg = (extra) => active && socket.emit("message", { to: active, ...extra });
for (const id in STICKERS) { const s = stickerEl(id); s.onclick = () => { sendMsg({ kind: "sticker", sticker: id }); $("tray").hidden = true; }; $("tray").appendChild(s); }

/* ---- Chat list ---- */
const previewOf = (m) => ({ sticker: "Sticker", image: "Photo", video: "Video", audio: "Voice message" }[m.kind] || m.text);
$("search").addEventListener("input", () => renderList());
function renderList() {
  const list = $("chatList"); list.innerHTML = "";
  if (!friends.size) { const n = document.createElement("div"); n.className = "none"; n.textContent = "No friends yet. Tap Add friend to start."; list.appendChild(n); return; }
  const q = $("search").value.trim().toLowerCase();
  for (const [id, f] of friends) {
    if (q && !f.name.toLowerCase().includes(q)) continue;
    const item = document.createElement("div"); item.className = "item" + (id === active ? " active" : "");
    const t = document.createElement("div"); t.className = "t";
    const nm = document.createElement("div"); nm.textContent = f.name;
    const last = f.msgs.filter((m) => !m.sys).slice(-1)[0];
    const pv = document.createElement("div");
    pv.textContent = last ? (prefs.preview || !f.unread ? previewOf(last) : "New message") : f.group ? `${f.members.length} members` : f.online ? "Online" : "Offline";
    t.append(nm, pv); item.append(avEl(f.name, f.avatar, f.online && !f.group ? "on" : ""), t);
    if (f.unread) { const b = document.createElement("span"); b.className = "badge"; b.textContent = f.unread; item.appendChild(b); }
    item.onclick = () => openChat(id); list.appendChild(item);
  }
}

/* ---- Messages ---- */
function bubble(m) {
  const el = document.createElement("div");
  if (m.sys) { el.className = "sys"; el.textContent = m.sys; return el; }
  el.className = "msg" + (m.me ? " me" : "") + (m.kind === "sticker" ? " bare" : "");
  const time = new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const label = [m.me ? "" : m.name, prefs.stamps ? time : ""].filter(Boolean).join(" · ");
  if (label) { const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = label; el.appendChild(nm); }
  let body;
  if (m.kind === "sticker") body = stickerEl(m.sticker);
  else if (m.kind === "image") { body = document.createElement("img"); body.src = m.data; body.className = "media"; body.alt = "Photo"; }
  else if (m.kind === "video") { body = document.createElement("video"); body.src = m.data; body.controls = true; body.playsInline = true; body.preload = "metadata"; body.className = "media"; }
  else if (m.kind === "audio") { body = document.createElement("audio"); body.src = m.data; body.controls = true; }
  else { body = document.createElement("div"); body.textContent = m.text; } // textContent blocks HTML injection
  el.appendChild(body); return el;
}

const bgKey = () => `chatbg:${myId}:${active}`;
function applyBg() { // each chat can have its own background picture (kept on this device)
  const bg = store.get(bgKey()), dim = "color-mix(in srgb, var(--chatbg) 42%, transparent)";
  $("messages").style.backgroundImage = bg ? `linear-gradient(${dim}, ${dim}), url("${bg}")` : "";
  $("messages").style.backgroundSize = bg ? "cover" : ""; $("messages").style.backgroundPosition = "center";
}
$("bgInput").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = ""; if (!file || !file.type.startsWith("image/")) return;
  const small = await shrink(await readFile(file), 1100, .72); store.set(bgKey(), small);
  if (store.get(bgKey()) !== small) toast("Couldn't save that picture because this device's storage is full."); applyBg();
};

function renderPane() {
  const f = friends.get(active); if (!f) return;
  $("peerName").textContent = f.name;
  $("peerStatus").textContent = f.group ? f.members.map((m) => m.name).join(", ") : f.online ? "Online" : "Offline";
  $("safeBadge").hidden = !f.safe; $("callAudio").hidden = $("callVideo").hidden = f.group || f.safe; $("attachBtn").hidden = $("micBtn").hidden = f.safe;
  $("mRemove").textContent = f.group ? "Leave group" : "Remove friend";
  $("messages").innerHTML = ""; f.msgs.forEach((m) => $("messages").appendChild(bubble(m))); $("messages").scrollTop = $("messages").scrollHeight; applyBg();
  const off = !f.group && !f.online; $("text").disabled = off;
  $("text").placeholder = off ? `${f.name} is offline. You can chat when they're online.` : "Write a message";
  $("moreMenu").hidden = $("tray").hidden = $("attachMenu").hidden = true;
}
function openChat(id) {
  active = id; friends.get(id).unread = 0; $("app").classList.add("in-chat");
  setView("chats"); renderPane(); renderList(); if (!$("text").disabled) $("text").focus();
}
function showEmpty() { active = null; $("app").classList.remove("in-chat"); setView("chats"); renderList(); }
$("back").onclick = showEmpty;

$("moreBtn").onclick = () => { const f = friends.get(active); $("mRemove").textContent = f.group ? "Leave group" : "Remove friend"; $("moreMenu").hidden = !$("moreMenu").hidden; };
$("mBg").onclick = () => { $("moreMenu").hidden = true; $("bgInput").click(); };
$("mBgReset").onclick = () => { store.set(bgKey(), ""); applyBg(); $("moreMenu").hidden = true; };
$("mRemove").onclick = () => { // two taps, so it can't happen by accident
  const f = friends.get(active);
  if (!$("mRemove").textContent.startsWith("Tap")) { $("mRemove").textContent = "Tap again to confirm"; return; }
  socket.emit(f.group ? "group:leave" : "unfriend", active); friends.delete(active); showEmpty();
};
document.addEventListener("click", (e) => {
  if (!e.target.closest("#moreMenu,#moreBtn")) $("moreMenu").hidden = true;
  if (!e.target.closest("#attachMenu,#attachBtn")) $("attachMenu").hidden = true;
  if (!e.target.closest("#tray,#stickerBtn")) $("tray").hidden = true;
});
$("attachBtn").onclick = () => { $("tray").hidden = true; $("attachMenu").hidden = !$("attachMenu").hidden; };
$("stickerBtn").onclick = () => { $("attachMenu").hidden = true; $("tray").hidden = !$("tray").hidden; };
$("form").addEventListener("submit", (e) => {
  e.preventDefault(); const text = $("text").value.trim();
  if (text) { sendMsg({ kind: "text", text }); $("text").value = ""; }
});

/* ---- Sound and desktop notifications ---- */
function beep() {
  try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 660; g.gain.value = .05; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .12); } catch {}
}
function notify(f, m) {
  if (m.from === myId || (active === f.id && view === "chats" && !document.hidden)) return;
  if (prefs.sound) beep();
  if (prefs.desktop && typeof Notification !== "undefined" && Notification.permission === "granted") { try { new Notification(f.name, { body: prefs.preview ? previewOf(m) : "New message" }); } catch {} }
}

/* ---- Live events from the server ---- */
socket.on("incoming", addRequest);
socket.on("declined", ({ name }) => { if (!$("modal").hidden) $("homeStatus").textContent = `${name} declined your request.`; });
socket.on("friend-added", (f) => {
  friends.set(f.id, { ...f, msgs: [{ sys: "You're now friends." }], unread: 0 });
  $("modal").hidden = true; renderList(); if (!active) openChat(f.id);
});
socket.on("friend-removed", ({ id }) => { friends.delete(id); if (active === id) showEmpty(); renderList(); });
socket.on("friend-renamed", ({ id, name }) => { const f = friends.get(id); if (f) { f.name = name; if (active === id) renderPane(); renderList(); } });
socket.on("friend-profile", ({ id, avatar }) => { const f = friends.get(id); if (f) { f.avatar = avatar; renderList(); } });
socket.on("presence", ({ id, online }) => { const f = friends.get(id); if (f) { f.online = online; if (active === id) renderPane(); renderList(); } });
socket.on("blocked", ({ to, reason }) => { const f = friends.get(to); if (f) { f.msgs.push({ sys: reason }); if (active === to) renderPane(); } });
socket.on("group-added", (g) => {
  const old = friends.get(g.id); friends.set(g.id, { ...g, msgs: old ? old.msgs : [{ sys: "Group created." }], unread: old ? old.unread : 0 });
  if (openAfter === g.id) { openAfter = null; openChat(g.id); } else { if (active === g.id) renderPane(); renderList(); }
});
socket.on("group-removed", ({ id }) => { friends.delete(id); if (active === id) showEmpty(); renderList(); });
socket.on("message", (m) => {
  const g = friends.get(m.to), peer = g && g.group ? m.to : m.from === myId ? m.to : m.from, f = friends.get(peer); if (!f) return;
  f.msgs.push({ ...m, me: m.from === myId });
  if (active === peer && view === "chats") { $("messages").appendChild(bubble(f.msgs[f.msgs.length - 1])); $("messages").scrollTop = $("messages").scrollHeight; } else f.unread++;
  notify(f, m); renderList();
});
