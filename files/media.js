/* Photos, GIFs, videos and voice messages */
const LIM = { image: 3e6, video: 8e6, audio: 2e6 }; // bytes (the server checks again)

async function sendFile(file) {
  const f = friends.get(active);
  if (!f || f.safe) return toast("Photos and videos are turned off in Safe Chat.");
  if (file.type.startsWith("image/")) {
    if (file.type === "image/gif") { // GIFs are sent as they are so they keep moving
      if (file.size > LIM.image) return toast("That GIF is over 3 MB.");
      return sendMsg({ kind: "image", data: await readFile(file) });
    }
    return sendMsg({ kind: "image", data: await shrink(await readFile(file), 1280, .8) });
  }
  if (file.type.startsWith("video/")) {
    if (file.size > LIM.video) return toast("Videos can be up to 8 MB.");
    return sendMsg({ kind: "video", data: await readFile(file) });
  }
  toast("You can send photos, GIFs and videos.");
}
$("aFile").onclick = () => { $("attachMenu").hidden = true; $("fileInput").click(); };
$("aGif").onclick = () => { $("attachMenu").hidden = true; $("gifInput").click(); };
$("aCam").onclick = async () => {
  $("attachMenu").hidden = true; const p = await takePhoto();
  if (p) sendMsg({ kind: "image", data: await shrink(p, 1280, .8) });
};
$("fileInput").onchange = $("gifInput").onchange = (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (file) sendFile(file).catch(() => toast("Couldn't send that file."));
};

/* Voice messages: tap the mic to start, tap again to send */
let rec = null, recChunks = [], recTimer = null, recStart = 0;
$("micBtn").onclick = async () => {
  if (rec) return rec.stop();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast("Can't use the microphone. Check the permission."); }
  rec = new MediaRecorder(stream); recChunks = []; recStart = Date.now();
  rec.ondataavailable = (e) => recChunks.push(e.data);
  rec.onstop = async () => {
    clearInterval(recTimer); stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(recChunks, { type: rec.mimeType }); rec = null;
    $("micBtn").classList.remove("rec"); $("recNote").hidden = true;
    if (blob.size > LIM.audio) return toast("Voice messages can be about 2 minutes long.");
    sendMsg({ kind: "audio", data: await readFile(blob) });
  };
  rec.start(); $("micBtn").classList.add("rec"); $("recNote").hidden = false;
  recTimer = setInterval(() => {
    const s = Math.floor((Date.now() - recStart) / 1000);
    $("recNote").textContent = `Recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}. Tap the mic to send.`;
    if (s >= 110 && rec) rec.stop();
  }, 400);
};
