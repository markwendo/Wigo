/* Audio and video calls (WebRTC; the server only passes the signals along),
   with a "Watch together" mode that streams your screen or a tab to your friend. */
let call = null, pc = null, local = null, ringing = null, sharing = null, pendingIce = [];
// Public STUN server. If people on strict networks can't connect, add a TURN server here.
const RTC = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const REACTIONS = { laugh: "😂", love: "❤️", clap: "👏", fire: "🔥" };

async function getLocal(mode) {
  try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" }); }
  catch { toast(`Can't use your ${mode === "video" ? "camera or microphone" : "microphone"}. Check the permission.`); return null; }
}
function buildPC(peer) {
  pc = new RTCPeerConnection(RTC); pendingIce = [];
  pc.onicecandidate = (e) => e.candidate && socket.emit("call:signal", { to: peer, data: { candidate: e.candidate } });
  pc.ontrack = (e) => { $("remoteVideo").srcObject = e.streams[0]; $("callNote").textContent = ""; };
  pc.onconnectionstatechange = () => { if (pc && ["failed", "closed"].includes(pc.connectionState)) endCall(true, "The call dropped."); };
  local.getTracks().forEach((t) => pc.addTrack(t, local));
}
async function sendOffer() {
  await pc.setLocalDescription(await pc.createOffer());
  socket.emit("call:signal", { to: call.peer, data: { description: pc.localDescription } });
}
const maybeOffer = () => { if (call && call.caller && call.accepted && pc && !call.offered) { call.offered = true; sendOffer(); } };
function showCall(name, mode) {
  $("callTitle").textContent = name; $("localVideo").srcObject = local; $("callUI").hidden = false;
  $("callUI").classList.toggle("audio", mode !== "video"); $("cCam").hidden = $("cShare").hidden = mode !== "video";
  ["cMute", "cCam", "cShare"].forEach((id) => $(id).classList.remove("off", "on"));
}

function startCall(mode) {
  const f = friends.get(active);
  if (!f || f.group || f.safe) return;
  if (call || ringing) return toast("You're already in a call.");
  socket.emit("call:invite", { to: active, mode }, async (res) => {
    if (!res.ok) return toast(res.error);
    local = await getLocal(mode);
    if (!local) return socket.emit("call:end", { to: f.id });
    call = { peer: f.id, name: f.name, caller: true };
    buildPC(f.id); showCall(f.name, mode); $("callNote").textContent = "Calling...";
    call.timer = setTimeout(() => endCall(true, `${f.name} didn't answer.`), 45000);
    maybeOffer();
  });
}
function endCall(notify, text) {
  if (!call) return;
  if (notify) socket.emit("call:end", { to: call.peer });
  clearTimeout(call.timer); stopShare(true);
  if (pc) pc.close(); pc = null;
  if (local) local.getTracks().forEach((t) => t.stop()); local = null;
  $("remoteVideo").srcObject = null; $("callUI").hidden = true; call = null;
  if (text) toast(text);
}

socket.on("call:incoming", ({ from, name, mode }) => {
  if (call || ringing) return socket.emit("call:answer", { to: from, accept: false });
  ringing = { from, name, mode }; $("ringText").textContent = `${name} is ${mode === "video" ? "video" : "audio"} calling`; $("ring").hidden = false;
  if (prefs.sound) beep();
});
$("ringYes").onclick = async () => {
  const r = ringing; ringing = null; $("ring").hidden = true;
  local = await getLocal(r.mode);
  if (!local) return socket.emit("call:answer", { to: r.from, accept: false });
  call = { peer: r.from, name: r.name }; buildPC(r.from); showCall(r.name, r.mode);
  socket.emit("call:answer", { to: r.from, accept: true });
};
$("ringNo").onclick = () => { socket.emit("call:answer", { to: ringing.from, accept: false }); ringing = null; $("ring").hidden = true; };
socket.on("call:accepted", ({ from }) => { if (call && call.peer === from) { clearTimeout(call.timer); call.accepted = true; maybeOffer(); } });
socket.on("call:declined", () => endCall(false, "Call declined."));
socket.on("call:ended", ({ from }) => {
  if (ringing && ringing.from === from) { ringing = null; $("ring").hidden = true; toast("Missed call."); }
  else if (call && call.peer === from) endCall(false, "Call ended.");
});
socket.on("call:signal", async ({ from, data }) => {
  if (!call || call.peer !== from || !pc) return;
  try {
    if (data.description) {
      await pc.setRemoteDescription(data.description);
      for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (data.description.type === "offer") { await pc.setLocalDescription(await pc.createAnswer()); socket.emit("call:signal", { to: from, data: { description: pc.localDescription } }); }
    } else if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {}); else pendingIce.push(data.candidate);
    }
  } catch {}
});

$("callAudio").onclick = () => startCall("audio");
$("callVideo").onclick = () => startCall("video");
$("cEnd").onclick = () => endCall(true, "Call ended.");
$("cMute").onclick = () => { const t = local && local.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; $("cMute").classList.toggle("off", !t.enabled); } };
$("cCam").onclick = () => { const t = local && local.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; $("cCam").classList.toggle("off", !t.enabled); } };

/* Watch together: swap your camera for a screen or tab, and mix its sound with your mic */
$("cShare").onclick = () => (sharing ? stopShare() : startShare());
async function startShare() {
  let s;
  try { s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); } catch { return; }
  const vs = pc.getSenders().find((x) => x.track && x.track.kind === "video"), as = pc.getSenders().find((x) => x.track && x.track.kind === "audio");
  const ac = new AudioContext(), dest = ac.createMediaStreamDestination();
  ac.createMediaStreamSource(new MediaStream(local.getAudioTracks())).connect(dest);
  if (s.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dest);
  await vs.replaceTrack(s.getVideoTracks()[0]); await as.replaceTrack(dest.stream.getAudioTracks()[0]);
  sharing = { s, ac, vs, as }; $("localVideo").srcObject = s; $("cShare").classList.add("on");
  $("callNote").textContent = "You're streaming. Your friend sees what's on your screen.";
  s.getVideoTracks()[0].onended = () => stopShare();
}
async function stopShare(quiet) {
  if (!sharing) return;
  const { s, ac, vs, as } = sharing; sharing = null;
  s.getTracks().forEach((t) => t.stop()); ac.close();
  if (quiet) return;
  const vt = local.getVideoTracks()[0], at = local.getAudioTracks()[0];
  if (vt) await vs.replaceTrack(vt); await as.replaceTrack(at);
  $("localVideo").srcObject = local; $("cShare").classList.remove("on"); $("callNote").textContent = "";
}

/* Reactions float up on both screens during a call */
function floatEmoji(key) {
  const s = document.createElement("span"); s.className = "float"; s.textContent = REACTIONS[key] || "";
  s.style.left = 15 + Math.random() * 70 + "%"; $("callStage").appendChild(s); setTimeout(() => s.remove(), 2500);
}
document.querySelectorAll(".react").forEach((b) => (b.onclick = () => { if (call) { socket.emit("call:react", { to: call.peer, emoji: b.dataset.e }); floatEmoji(b.dataset.e); } }));
socket.on("call:react", ({ emoji }) => floatEmoji(emoji));
