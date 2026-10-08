/* Profiles: a photo (upload or camera), a banner colour, status, pronouns, bio and interests */
let draft = {};

function renderCard(el, p) { // the card friends see when they tap your name
  el.innerHTML = ""; el.className = "pcard";
  const color = p.color || getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
  const ban = document.createElement("div"); ban.className = "pban"; ban.style.background = `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 35%, var(--card)))`;
  const nm = document.createElement("h3"); nm.textContent = p.name;
  const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = [p.pronouns, p.status].filter(Boolean).join(" · ");
  el.append(ban, avEl(p.name, p.avatar, "big"), nm, sub);
  if (p.bio) { const b = document.createElement("p"); b.textContent = p.bio; el.appendChild(b); }
  if ((p.interests || []).length) {
    const chips = document.createElement("div"); chips.className = "chips";
    p.interests.forEach((i) => { const c = document.createElement("span"); c.className = "chip"; c.textContent = i; chips.appendChild(c); });
    el.appendChild(chips);
  }
}
function readDraft() {
  draft.status = $("pStatus").value; draft.pronouns = $("pPronouns").value; draft.bio = $("pBio").value; draft.color = $("pColor").value;
  draft.interests = $("pInterests").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
}
const paintCard = () => { readDraft(); renderCard($("pcard"), draft); };
function fillProfile() {
  draft = { ...myProfile, name: myName };
  $("pStatus").value = draft.status || ""; $("pPronouns").value = draft.pronouns || ""; $("pBio").value = draft.bio || "";
  $("pInterests").value = (draft.interests || []).join(", "); $("pColor").value = draft.color || "#d62839"; paintCard();
}
["pStatus", "pPronouns", "pBio", "pInterests", "pColor"].forEach((id) => $(id).addEventListener("input", paintCard));
$("pUpload").onclick = () => $("pFile").click();
$("pFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (f && f.type.startsWith("image/")) { draft.avatar = await shrink(await readFile(f), 256, .82, true); paintCard(); }
};
$("pCam").onclick = async () => { const p = await takePhoto(); if (p) { draft.avatar = await shrink(p, 256, .82, true); paintCard(); } };
$("pRemove").onclick = () => { draft.avatar = ""; paintCard(); };
$("pSave").onclick = async () => {
  readDraft();
  const res = await api("/api/account/profile", { token, profile: draft });
  if (res.ok) { myProfile = { ...draft }; note("pNote", "Profile saved.", true); } else note("pNote", res.error);
};

function showProfile(id) { // someone else's profile, shown when you tap their name
  socket.emit("profile:get", id, (res) => {
    if (!res.ok) return toast("Couldn't open that profile.");
    renderCard($("pmCard"), res.profile); $("profileModal").hidden = false;
  });
}
$("pmClose").onclick = () => ($("profileModal").hidden = true);
$("profileModal").addEventListener("click", (e) => { if (e.target === $("profileModal")) $("profileModal").hidden = true; });
$("peerHead").onclick = () => { const f = friends.get(active); if (f && !f.group) showProfile(active); };
