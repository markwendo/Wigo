  const socket = io();
  const $ = (id) => document.getElementById(id);
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
  };
  let myId = null, myName = "", myEmail = "", myPhone = "", minor = false, active = null, slide = 0, view = "chats", token = store.get("wigoToken");
  const friends = new Map(); // id -> { name, online, safe, msgs: [], unread }

  async function api(path, body) {
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return await r.json();
    } catch { return { ok: false, error: "Can't reach the server." }; }
  }

  function downloadId() {
    const text = `WIGO ID\n=======\nName: ${myName}\nWigo ID: ${myId}\n\nKeep this safe and only share your ID with people you trust.\nTo log in, use your Gmail (or this ID) and your password.\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = `wigo-id-${myId}.txt`; a.click(); URL.revokeObjectURL(a.href);
  }



  /* ---- Shared helpers ---- */
  let myProfile = {};
  const MORE_ICONS = {
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    video: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    clip: '<path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 3 4 3 4-3 4-3M9 9h.01M15 9h.01"/>',
    gamepad: '<rect x="3" y="7" width="18" height="11" rx="5"/><path d="M8 10v5M5.5 12.5h5M15 12h.01M18 14h.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>'
  };
  function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 4500); }

  const TONES = ["#b07d62", "#7d9b84", "#8a8fb0", "#c08a9a", "#c9a15c", "#6f98a8"];
  const tone = (name) => TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TONES.length];
  function avEl(name, avatar, cls) { // round avatar: their photo, or their initial on a soft colour
    const d = document.createElement("div"); d.className = "av " + (cls || "");
    if (avatar) d.style.backgroundImage = `url("${avatar}")`; else { d.textContent = name.charAt(0).toUpperCase(); d.style.background = tone(name); }
    return d;
  }

  const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  async function shrink(src, max, q, square) { // resize a picture to a small JPEG
    const i = await loadImg(src); let w = i.width, h = i.height, sx = 0, sy = 0, sw = w, sh = h;
    if (square) { const s = Math.min(w, h); sx = (w - s) / 2; sy = (h - s) / 2; sw = sh = s; w = h = Math.min(s, max); }
    else { const k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k); }
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(i, sx, sy, sw, sh, 0, 0, w, h);
    return c.toDataURL("image/jpeg", q);
  }
  function takePhoto() { // opens the camera; resolves with a photo (data URL) or null
    return new Promise(async (resolve) => {
      let stream; const v = $("camVideo");
      const close = (val) => { if (stream) stream.getTracks().forEach((t) => t.stop()); $("camModal").hidden = true; resolve(val); };
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } }); } catch { toast("Can't open the camera. Check the permission."); return resolve(null); }
      v.srcObject = stream; $("camModal").hidden = false;
      $("camShot").onclick = () => { const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0); close(c.toDataURL("image/jpeg", .9)); };
      $("camCancel").onclick = () => close(null);
    });
  }
