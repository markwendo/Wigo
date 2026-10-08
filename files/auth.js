  /* ---- 1. Sign up / log in ---- */
  function tab(signup) {
    $("signupForm").hidden = !signup; $("loginForm").hidden = signup;
    $("tabSignup").classList.toggle("on", signup); $("tabLogin").classList.toggle("on", !signup); msg("");
  }
  $("tabSignup").onclick = () => tab(true); $("tabLogin").onclick = () => tab(false);
  $("suDob").max = new Date().toISOString().slice(0, 10);

  function updateMeter() {
    const pw = $("suPass").value, probs = WigoRules.passwordProblems(pw, { name: $("suName").value, email: $("suEmail").value });
    const score = WigoRules.passwordScore(pw), bar = $("meter").firstElementChild;
    bar.style.width = pw ? Math.max(score, 1) * 25 + "%" : "0";
    bar.style.background = probs.length ? "#d64545" : score >= 3 ? "#4b8a5a" : "#e0a100";
    $("pwHint").textContent = !pw ? "Use 8+ characters with letters and numbers, or 12+ characters of anything."
      : probs.length ? "Still needs: " + probs.join(", ") + "."
      : score >= 3 ? "Strong password." : "Good enough. Making it longer makes it stronger.";
  }
  ["suPass", "suName", "suEmail"].forEach((id) => $(id).addEventListener("input", updateMeter));

  function saveSession(res) { token = res.token; store.set("wigoToken", token); myId = res.wigoId; myName = res.name; minor = res.minor; prefs = loadPrefs(myId); applyTheme(); savePrefs(); }
  function authSocket(done) {
    socket.emit("auth", { token }, (res) => {
      if (!res.ok) { token = ""; store.set("wigoToken", ""); return go("auth"); }
      if (myId !== res.wigoId) { myId = res.wigoId; prefs = loadPrefs(myId); applyTheme(); savePrefs(); }
      myName = res.name; minor = res.minor; myEmail = res.email; myPhone = res.phone; $("acceptReq").checked = res.acceptRequests;
      applyAuth(res);
      if (done) done();
    });
  }
  const goApp = () => (store.get("intro:" + myId) ? enterApp() : showIntro());

  socket.on("connect", () => { if (token) authSocket(() => { if (!$("auth").hidden) goApp(); }); }); // auto log-in / reconnect
  socket.on("kicked", () => { token = ""; go("auth"); msg("You signed in on another tab or device."); });
  socket.on("disconnect", () => { friends.forEach((f) => (f.online = false)); if (active) renderPane(); renderList(); });

  $("signupBtn").onclick = async () => {
    if ($("suPass").value !== $("suPass2").value) return msg("Passwords don't match.");
    const res = await api("/api/signup", { name: $("suName").value, dob: $("suDob").value, email: $("suEmail").value, phone: $("suPhone").value, password: $("suPass").value });
    if (!res.ok) return msg(res.error);
    saveSession(res);
    $("revealId").textContent = res.wigoId;
    $("revealMail").textContent = res.emailSent ? `We also sent your Wigo ID to ${res.email}.` : "Email isn't set up on the server yet, so no email was sent. Download your ID below and keep it safe.";
    go("reveal"); authSocket();
  };
  $("loginBtn").onclick = async () => {
    const res = await api("/api/login", { identifier: $("liId").value, password: $("liPass").value });
    if (!res.ok) return msg(res.error);
    saveSession(res); authSocket(goApp);
  };
  $("liPass").addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginBtn").click(); });
  $("resendBtn").onclick = async () => {
    const email = $("liId").value.trim();
    if (!email.includes("@")) return msg("Type your Gmail in the box above first.");
    await api("/api/resend", { email });
    msg("If that Gmail has a Wigo account, we've emailed its Wigo ID (check spam).", true);
  };

  /* ---- 2. Your Wigo ID ---- */
  async function copyId(btn, label) {
    try { await navigator.clipboard.writeText(myId); btn.textContent = "Copied"; } catch { btn.textContent = "Select & copy"; }
    setTimeout(() => (btn.textContent = label), 1500);
  }
  $("copyBtn1").onclick = () => copyId($("copyBtn1"), "Copy");
  $("copyBtn2").onclick = () => copyId($("copyBtn2"), "Copy");
  $("downloadBtn").onclick = downloadId; $("downloadBtn2").onclick = downloadId;
  $("nextBtn").onclick = () => showIntro();

  /* ---- 3. Introduction ---- */
  const slides = () => [
    ["01", "A chat for people you trust", "Wigo has no public profiles and no strangers. You only talk to people who have your Wigo ID."],
    ["02", "Your Wigo ID", "Your ID is random and one of a kind. It's your address on Wigo. Share it only with people you trust, and keep your downloaded copy safe."],
    ["03", "Add friends with +", "Tap Add friend, then type your friend's Wigo ID and their name. Both have to match. When they accept your request, you can start chatting."],
    ["04", "Do more together", "Send photos, stickers, GIFs and voice messages. Make audio and video calls, watch something together, start group chats and play games."],
    ["05", "Make it yours", "Add a profile photo and bio, pick colours and fonts in Settings, and give each chat its own background picture."],
    ["06", "Safe Chat", minor ? "You're under 18, so Safe Chat is on. Inappropriate messages are blocked in all your chats. Photos, videos, voice messages and calls are turned off there."
      : "When you or a friend is under 18, Safe Chat switches on. Inappropriate messages are blocked, and photos, videos, voice messages and calls are turned off."]
  ];
  function showIntro() { slide = 0; go("intro"); renderSlide(); }
  function renderSlide() {
    const all = slides(), [num, title, text] = all[slide];
    $("slideNum").textContent = num; $("slideTitle").textContent = title; $("slideText").textContent = text;
    $("dots").innerHTML = all.map((_, i) => `<span class="dot${i === slide ? " on" : ""}"></span>`).join("");
    $("introBack").hidden = slide === 0; $("skipBtn").hidden = slide === all.length - 1;
    $("introNext").textContent = slide === all.length - 1 ? "Get started" : "Next";
  }
  function finishIntro() { store.set("intro:" + myId, "1"); enterApp(); }
  $("introNext").onclick = () => { if (slide < slides().length - 1) { slide++; renderSlide(); } else finishIntro(); };
  $("introBack").onclick = () => { slide--; renderSlide(); };
  $("skipBtn").onclick = finishIntro;
