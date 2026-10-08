  /* ---- Settings controls ---- */
  document.querySelectorAll(".seg").forEach((el) => OPTS[el.dataset.key].forEach(([v, l]) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = l; b.dataset.v = v; b.onclick = () => setPref(el.dataset.key, v); el.appendChild(b);
  }));
  for (const [id, [label, accent]] of Object.entries(PRESETS)) {
    const b = document.createElement("button"); b.type = "button"; b.className = "swatch"; b.dataset.t = id;
    b.innerHTML = "<i></i>" + label; b.firstChild.style.background = accent; b.onclick = () => setPref("theme", id); $("swatches").appendChild(b);
  }
  $("accentPick").oninput = (e) => { prefs.accent = e.target.value; savePrefs(); applyTheme(); syncSettings(); };
  $("accentReset").onclick = () => setPref("accent", "");
  document.querySelectorAll("[data-pref]").forEach((c) => (c.onchange = () => {
    if (c.dataset.pref === "desktop" && c.checked) {
      if (typeof Notification === "undefined") { c.checked = false; return; }
      Notification.requestPermission().then((p) => setPref("desktop", p === "granted"));
      return;
    }
    setPref(c.dataset.pref, c.checked);
  }));
  function syncSettings() {
    document.querySelectorAll(".seg").forEach((el) => el.querySelectorAll("button").forEach((b) => b.classList.toggle("on", prefs[el.dataset.key] === b.dataset.v)));
    document.querySelectorAll(".swatch").forEach((b) => b.classList.toggle("on", !prefs.accent && prefs.theme === b.dataset.t));
    document.querySelectorAll("[data-pref]").forEach((c) => (c.checked = !!prefs[c.dataset.pref]));
    $("accentPick").value = prefs.accent || (PRESETS[prefs.theme] || PRESETS.cherry)[1];
  }
  function fillAccount() {
    $("setName").value = myName; $("acEmail").textContent = myEmail; $("acPhone").textContent = myPhone || "Not added"; $("acId").textContent = myId;
    $("safeStatus").textContent = minor ? "Always on for your account because you're under 18. Inappropriate messages are blocked, and photos, videos, voice messages and calls are turned off." : "Switches on in any chat with someone under 18. Inappropriate messages are blocked, and photos, videos, voice messages and calls are turned off.";
  }
  const note = (id, t, ok) => { $(id).textContent = t || ""; $(id).className = "note" + (ok ? " ok" : ""); };
  $("saveName").onclick = async () => {
    const res = await api("/api/account/name", { token, name: $("setName").value });
    if (res.ok) { myName = res.name; note("nameNote", "Name updated.", true); } else note("nameNote", res.error);
  };
  $("savePw").onclick = async () => {
    const res = await api("/api/account/password", { token, current: $("pwCur").value, next: $("pwNew").value });
    if (res.ok) { $("pwCur").value = $("pwNew").value = ""; note("pwNote", "Password updated.", true); } else note("pwNote", res.error);
  };
  $("acceptReq").onchange = (e) => api("/api/account/privacy", { token, acceptRequests: e.target.checked });
  $("delBtn").onclick = () => ($("delBox").hidden = !$("delBox").hidden);
  $("delGo").onclick = async () => {
    const res = await api("/api/account/delete", { token, password: $("delPw").value });
    if (!res.ok) return note("delNote", res.error);
    store.set("wigoToken", ""); location.reload();
  };
  $("logoutBtn").onclick = () => { socket.emit("logout"); store.set("wigoToken", ""); location.reload(); };
