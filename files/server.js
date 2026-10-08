const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Server } = require("socket.io");
const { isUnsafeText, ageFromDob, passwordProblems, MIN_AGE, ADULT_AGE } = require("./public/rules.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 12e6 }); // room for photos, short videos and voice notes
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

/* ---------- storage: a JSON file (data/users.json) ---------- */
const DB_FILE = path.join(__dirname, "data", "users.json");
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : {};
db.users = db.users || {};       // wigoId -> account
db.friends = db.friends || {};   // wigoId -> [friend wigoIds]
db.requests = db.requests || []; // pending friend requests [{from, to}]
db.retired = db.retired || [];
db.groups = db.groups || {};     // groupId -> { id, name, owner, members: [wigoIds] }   // IDs of deleted accounts: never handed out again
const saveDb = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const findByEmail = (email) => Object.values(db.users).find((u) => u.email === email);
const sessions = new Map(); // login token -> wigoId (cleared on restart)
// Under 18 (or unknown birth date) = Safe Chat mode
const isMinor = (id) => { const a = ageFromDob(db.users[id].dob); return a === null || a < ADULT_AGE; };

/* ---------- IDs, passwords, rate limits ---------- */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ID_FORMAT = /^WIGO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const EMAIL_RE = /^[a-z0-9._%+-]+@gmail\.com$/i;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;
const randomPart = (n) => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
function newWigoId() { // random, and checked so it can never match an existing ID
  let id;
  do { id = `WIGO-${randomPart(4)}-${randomPart(4)}`; } while (db.users[id] || db.retired.includes(id));
  return id;
}
function normalize(input) {
  let s = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.startsWith("WIGO")) s = s.slice(4);
  if (s.length !== 8) return null;
  const id = `WIGO-${s.slice(0, 4)}-${s.slice(4)}`;
  return ID_FORMAT.test(id) ? id : null;
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64);
const checkPw = (pw, u) => crypto.timingSafeEqual(hashPw(pw, Buffer.from(u.salt, "hex")), Buffer.from(u.hash, "hex"));
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}
function startSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, user.wigoId);
  return { token, wigoId: user.wigoId, name: user.name, minor: isMinor(user.wigoId) };
}

/* ---------- email (set SMTP_USER + SMTP_PASS to send real emails) ---------- */
const transporter = process.env.SMTP_USER
  ? nodemailer.createTransport({ service: process.env.SMTP_SERVICE || "gmail", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  : null;
async function sendIdEmail(user) {
  const text = `Hi ${user.name},\n\nYour Wigo ID is: ${user.wigoId}\n\nShare it only with people you trust. To log in, use this Gmail (or your Wigo ID) and your password.\n`;
  if (!transporter) { console.log(`\n[Email not configured. Would have sent to ${user.email}]\n${text}`); return false; }
  try { await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: user.email, subject: "Your Wigo ID", text }); return true; }
  catch (e) { console.error("Email failed:", e.message); return false; }
}

/* ---------- account routes ---------- */
app.post("/api/signup", async (req, res) => {
  if (limited(`signup:${req.ip}`, 10, 3600e3)) return res.json({ ok: false, error: "Too many attempts. Try again later." });
  const b = req.body || {};
  const name = String(b.name || "").trim().slice(0, 30), email = String(b.email || "").trim().toLowerCase();
  const phone = String(b.phone || "").trim(), password = String(b.password || ""), age = ageFromDob(b.dob);
  const fail = (error) => res.json({ ok: false, error });

  if (!name) return fail("Enter your name.");
  if (age === null) return fail("Enter a valid date of birth.");
  if (age < MIN_AGE) return fail(`You must be at least ${MIN_AGE} years old to use Wigo.`);
  if (!EMAIL_RE.test(email)) return fail("Enter a valid Gmail address (ends with @gmail.com).");
  if (phone && !PHONE_RE.test(phone)) return fail("That phone number doesn't look right.");
  const weak = passwordProblems(password, { name, email });
  if (weak.length) return fail(`Password is too weak. It needs: ${weak.join(", ")}.`);
  if (findByEmail(email)) return fail("An account with that Gmail already exists. Log in instead.");

  const salt = crypto.randomBytes(16);
  const user = { wigoId: newWigoId(), name, email, phone, dob: b.dob, salt: salt.toString("hex"), hash: hashPw(password, salt).toString("hex") };
  db.users[user.wigoId] = user;
  saveDb();
  res.json({ ok: true, ...startSession(user), email, emailSent: await sendIdEmail(user) });
});

app.post("/api/login", (req, res) => {
  const { identifier, password } = req.body || {};
  const idf = String(identifier || "").trim();
  if (limited(`login:${req.ip}:${idf.toLowerCase()}`, 5, 15 * 60e3)) return res.json({ ok: false, error: "Too many attempts. Try again in a few minutes." });
  const user = idf.includes("@") ? findByEmail(idf.toLowerCase()) : db.users[normalize(idf)];
  if (!user || !checkPw(String(password || ""), user)) return res.json({ ok: false, error: "Wrong Gmail / Wigo ID or password." });
  res.json({ ok: true, ...startSession(user) });
});

app.post("/api/resend", async (req, res) => { // same answer whether or not the account exists
  if (limited(`resend:${req.ip}`, 5, 3600e3)) return res.json({ ok: false, error: "Too many requests. Try again later." });
  const user = findByEmail(String((req.body || {}).email || "").trim().toLowerCase());
  if (user) await sendIdEmail(user);
  res.json({ ok: true });
});

/* ---------- account settings (all need a valid login token) ---------- */
const authed = (req, res) => {
  const user = db.users[sessions.get(String((req.body || {}).token || ""))];
  if (!user) res.json({ ok: false, error: "Please log in again." });
  return user;
};
app.post("/api/account/name", (req, res) => {
  const user = authed(req, res); if (!user) return;
  const name = String(req.body.name || "").trim().slice(0, 30);
  if (!name) return res.json({ ok: false, error: "Enter a name." });
  user.name = name; saveDb();
  const s = online.get(user.wigoId); if (s) s.data.name = name;
  friendsOf(user.wigoId).forEach((f) => emitTo(f, "friend-renamed", { id: user.wigoId, name }));
  res.json({ ok: true, name });
});
app.post("/api/account/password", (req, res) => {
  const user = authed(req, res); if (!user) return;
  if (limited(`pw:${user.wigoId}`, 5, 15 * 60e3)) return res.json({ ok: false, error: "Too many attempts. Try again in a few minutes." });
  if (!checkPw(String(req.body.current || ""), user)) return res.json({ ok: false, error: "Your current password is wrong." });
  const next = String(req.body.next || ""), weak = passwordProblems(next, { name: user.name, email: user.email });
  if (weak.length) return res.json({ ok: false, error: `New password is too weak. It needs: ${weak.join(", ")}.` });
  const salt = crypto.randomBytes(16);
  user.salt = salt.toString("hex"); user.hash = hashPw(next, salt).toString("hex"); saveDb();
  res.json({ ok: true });
});
app.post("/api/account/privacy", (req, res) => {
  const user = authed(req, res); if (!user) return;
  user.acceptRequests = req.body.acceptRequests !== false; saveDb();
  res.json({ ok: true });
});
app.post("/api/account/delete", (req, res) => {
  const user = authed(req, res); if (!user) return;
  if (limited(`pw:${user.wigoId}`, 5, 15 * 60e3)) return res.json({ ok: false, error: "Too many attempts. Try again in a few minutes." });
  if (!checkPw(String(req.body.password || ""), user)) return res.json({ ok: false, error: "Wrong password." });
  const id = user.wigoId;
  friendsOf(id).forEach((f) => { db.friends[f] = friendsOf(f).filter((x) => x !== id); emitTo(f, "friend-removed", { id }); });
  delete db.friends[id]; delete db.users[id]; db.retired.push(id);
  Object.values(db.groups).forEach((g) => { g.members = g.members.filter((m) => m !== id); if (g.members.length < 2) delete db.groups[g.id]; });
  db.requests = db.requests.filter((r) => r.from !== id && r.to !== id);
  for (const [t, v] of sessions) if (v === id) sessions.delete(t);
  saveDb();
  const s = online.get(id); if (s) s.disconnect(true);
  res.json({ ok: true });
});

app.post("/api/account/profile", (req, res) => {
  const user = authed(req, res); if (!user) return;
  const p = req.body.profile || {}, clean = (v, n) => String(v || "").trim().slice(0, n), avatar = String(p.avatar || "");
  if (avatar && !(avatar.length <= 120000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))) return res.json({ ok: false, error: "That photo is too large or not supported." });
  user.profile = {
    bio: clean(p.bio, 160), status: clean(p.status, 60), pronouns: clean(p.pronouns, 20), avatar,
    interests: (Array.isArray(p.interests) ? p.interests : []).map((x) => clean(x, 20)).filter(Boolean).slice(0, 5),
    color: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : "",
  };
  saveDb();
  friendsOf(user.wigoId).forEach((f) => emitTo(f, "friend-profile", { id: user.wigoId, avatar }));
  res.json({ ok: true });
});

/* ---------- friends + real-time chat ---------- */
const online = new Map(); // wigoId -> socket
const emitTo = (id, ev, data) => { const s = online.get(id); if (s) s.emit(ev, data); };
const friendsOf = (id) => db.friends[id] || [];
// "safe" = Safe Chat applies when either person is under 18
const friendInfo = (viewer, other) => ({ id: other, name: db.users[other].name, online: online.has(other), safe: isMinor(viewer) || isMinor(other), avatar: (db.users[other].profile || {}).avatar || "" });
const tellFriends = (id, isOnline) => friendsOf(id).forEach((f) => emitTo(f, "presence", { id, online: isOnline }));

function makeFriends(a, b) {
  (db.friends[a] = db.friends[a] || []).push(b);
  (db.friends[b] = db.friends[b] || []).push(a);
  saveDb();
  emitTo(a, "friend-added", friendInfo(a, b));
  emitTo(b, "friend-added", friendInfo(b, a));
}

/* ---------- media, profiles, groups, games ---------- */
const MIME = { image: /^image\/(jpeg|png|webp|gif)$/, video: /^video\/(mp4|webm|quicktime)$/, audio: /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a)$/ };
const MAX_LEN = { image: 4.2e6, video: 11.5e6, audio: 3e6 }; // data-URL length limits (about 3 MB, 8 MB, 2 MB)
function validMedia(kind, data) {
  data = String(data || "");
  const m = /^data:([a-z]+\/[a-z0-9.+-]+)(?:;[\w=.+-]+)*;base64,/.exec(data.slice(0, 150));
  return !!(m && MIME[kind] && MIME[kind].test(m[1]) && data.length <= MAX_LEN[kind]);
}
const publicProfile = (id) => {
  const u = db.users[id], p = u.profile || {};
  return { id, name: u.name, bio: p.bio || "", status: p.status || "", pronouns: p.pronouns || "", interests: p.interests || [], color: p.color || "", avatar: p.avatar || "" };
};
const groupsOf = (id) => Object.values(db.groups).filter((g) => g.members.includes(id));
const groupInfo = (g) => ({ id: g.id, name: g.name, group: true, online: true, safe: g.members.some(isMinor), owner: g.owner, members: g.members.map((id) => ({ id, name: db.users[id].name })) });
const canSee = (me, id) => me === id || friendsOf(me).includes(id) || groupsOf(me).some((g) => g.members.includes(id));

const GAMES = { tictactoe: "Tic-tac-toe", rps: "Rock Paper Scissors" };
const INVITE_MS = Number(process.env.WIGO_INVITE_MS) || 4 * 60 * 1000; // an invite lapses after 4 minutes
const invites = new Map(), games = new Map();
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
const nameOf = (id) => (db.users[id] ? db.users[id].name : "They");

function newGame(type, a, b) {
  const g = { id: randomPart(8), type, players: [a, b] };
  g.s = type === "tictactoe"
    ? { board: Array(9).fill(""), turn: a, marks: { [a]: "X", [b]: "O" }, winner: null }
    : { picks: { [a]: null, [b]: null }, scores: { [a]: 0, [b]: 0 }, round: 1, last: null, winner: null };
  return g;
}
function gameView(g, me) {
  const other = g.players.find((p) => p !== me), s = g.s;
  const v = { id: g.id, type: g.type, title: GAMES[g.type], you: me, opponent: nameOf(other), ...s };
  if (g.type === "rps") { v.picked = { [me]: !!s.picks[me], [other]: !!s.picks[other] }; delete v.picks; } // hide their choice until the round ends
  return v;
}
function playMove(g, me, move) {
  const s = g.s, other = g.players.find((p) => p !== me);
  if (s.winner) return false;
  if (g.type === "tictactoe") {
    if (s.turn !== me || !Number.isInteger(move) || move < 0 || move > 8 || s.board[move]) return false;
    s.board[move] = s.marks[me];
    if (LINES.some((l) => l.every((i) => s.board[i] === s.marks[me]))) s.winner = me;
    else if (s.board.every(Boolean)) s.winner = "draw";
    else s.turn = other;
    return true;
  }
  if (!BEATS[move] || s.picks[me]) return false;
  s.picks[me] = move;
  if (s.picks[other]) {
    const [a, b] = g.players, pa = s.picks[a], pb = s.picks[b];
    const w = pa === pb ? null : BEATS[pa] === pb ? a : b;
    s.last = { picks: { ...s.picks }, winner: w };
    if (w) s.scores[w]++;
    s.picks = { [a]: null, [b]: null }; s.round++;
    const top = g.players.find((p) => s.scores[p] >= 2);
    if (top) s.winner = top;
  }
  return true;
}
const pushGame = (g) => g.players.forEach((p) => emitTo(p, "game:state", gameView(g, p)));
function dropGames(id) {
  for (const [k, i] of invites) {
    if (i.from !== id && i.to !== id) continue;
    clearTimeout(i.timer); invites.delete(k);
    if (i.to === id) emitTo(i.from, "game:declined", { name: nameOf(id), type: GAMES[i.type] }); else emitTo(i.to, "game:expired", { id: k });
  }
  for (const [k, g] of games) {
    if (!g.players.includes(id)) continue;
    games.delete(k);
    if (!g.s.winner) g.players.filter((p) => p !== id).forEach((p) => emitTo(p, "game:ended", { name: nameOf(id) }));
  }
}
function dropCall(socket) {
  const peer = socket.data.call;
  if (!peer) return;
  const p = online.get(peer);
  socket.data.call = null;
  if (p) { p.data.call = null; p.emit("call:ended", { from: socket.data.wigoId }); }
}

io.on("connection", (socket) => {
  socket.on("auth", ({ token } = {}, ack) => {
    const id = sessions.get(token);
    if (!id || !db.users[id]) return ack({ ok: false });
    const old = online.get(id);
    if (old && old !== socket) { old.emit("kicked"); old.disconnect(true); } // one live session per account
    socket.data = { wigoId: id, name: db.users[id].name, token };
    online.set(id, socket);
    tellFriends(id, true);
    ack({
      ok: true, wigoId: id, name: db.users[id].name, minor: isMinor(id), email: db.users[id].email, phone: db.users[id].phone || "", acceptRequests: db.users[id].acceptRequests !== false,
      friends: friendsOf(id).map((f) => friendInfo(id, f)), groups: groupsOf(id).map(groupInfo), profile: publicProfile(id),
      requests: db.requests.filter((r) => r.to === id).map((r) => ({ fromId: r.from, fromName: db.users[r.from].name })),
    });
  });

  socket.on("logout", () => sessions.delete(socket.data.token));

  socket.on("request", ({ id: targetInput, name: theirName } = {}, ack) => {
    const me = socket.data.wigoId;
    if (!me) return ack({ ok: false, error: "Not signed in." });
    if (limited(`req:${me}`, 20, 3600e3)) return ack({ ok: false, error: "Too many requests. Try again later." });
    const tid = normalize(targetInput);
    if (!tid) return ack({ ok: false, error: "That doesn't look like a Wigo ID." });
    if (tid === me) return ack({ ok: false, error: "That's your own Wigo ID." });
    if (!db.users[tid] || String(theirName || "").trim().toLowerCase() !== db.users[tid].name.toLowerCase()) return ack({ ok: false, error: "We couldn't find anyone with that Wigo ID and name. Check both and try again." });
    if (db.users[tid].acceptRequests === false) return ack({ ok: false, error: "This person isn't accepting friend requests right now." });
    if (friendsOf(me).includes(tid)) return ack({ ok: false, error: "You're already friends." });
    if (db.requests.some((r) => r.from === me && r.to === tid)) return ack({ ok: false, error: "You already sent them a request." });
    const back = db.requests.findIndex((r) => r.from === tid && r.to === me);
    if (back >= 0) { db.requests.splice(back, 1); makeFriends(me, tid); return ack({ ok: true, note: "They had already sent you a request, so you're now friends!" }); }
    db.requests.push({ from: me, to: tid });
    saveDb();
    emitTo(tid, "incoming", { fromId: me, fromName: socket.data.name });
    ack({ ok: true });
  });

  socket.on("respond", ({ fromId, accept } = {}) => {
    const me = socket.data.wigoId;
    const i = db.requests.findIndex((r) => r.from === fromId && r.to === me);
    if (!me || i < 0) return; // must be a real, pending request
    db.requests.splice(i, 1);
    saveDb();
    if (accept) makeFriends(me, fromId); else emitTo(fromId, "declined", { name: socket.data.name });
  });

  socket.on("message", ({ to, kind, text, sticker, data } = {}) => {
    const me = socket.data.wigoId;
    if (!me) return;
    const group = db.groups[to];
    let targets, safe;
    if (group) {
      if (!group.members.includes(me)) return;
      targets = group.members; safe = group.members.some(isMinor);
    } else {
      if (!friendsOf(me).includes(to)) return;
      if (!online.has(to)) return socket.emit("blocked", { to, reason: "They're offline right now." });
      targets = [me, to]; safe = isMinor(me) || isMinor(to);
    }
    const m = { id: crypto.randomBytes(6).toString("hex"), from: me, to, name: socket.data.name, kind: kind || "text", time: Date.now() };
    if (m.kind === "text") {
      text = String(text || "").trim().slice(0, 1000);
      if (!text) return;
      if (safe && isUnsafeText(text)) return socket.emit("blocked", { to, reason: "Safe Chat blocked this message. Please keep things friendly." });
      m.text = text;
    } else if (m.kind === "sticker") {
      if (!/^[a-z0-9-]{1,20}$/.test(sticker || "")) return;
      m.sticker = sticker;
    } else if (MIME[m.kind]) {
      // Uploads can't be scanned, so they are switched off whenever Safe Chat applies
      if (safe) return socket.emit("blocked", { to, reason: "Photos, videos and voice messages are turned off in Safe Chat." });
      if (!validMedia(m.kind, data)) return socket.emit("blocked", { to, reason: "That file isn't supported or is too large." });
      m.data = data;
    } else return;
    targets.forEach((id) => emitTo(id, "message", m));
  });

  socket.on("unfriend", (peerId) => {
    const me = socket.data.wigoId;
    if (!me || !friendsOf(me).includes(peerId)) return;
    db.friends[me] = friendsOf(me).filter((x) => x !== peerId);
    db.friends[peerId] = friendsOf(peerId).filter((x) => x !== me);
    saveDb();
    emitTo(peerId, "friend-removed", { id: me });
  });

  /* ----- profiles ----- */
  socket.on("profile:get", (id, ack) => {
    const me = socket.data.wigoId;
    if (!me || !db.users[id] || !canSee(me, id)) return ack({ ok: false });
    ack({ ok: true, profile: publicProfile(id) });
  });

  /* ----- group chats ----- */
  socket.on("group:create", ({ name, members } = {}, ack) => {
    const me = socket.data.wigoId;
    if (!me) return;
    name = String(name || "").trim().slice(0, 40);
    members = [...new Set(Array.isArray(members) ? members : [])].filter((id) => friendsOf(me).includes(id)).slice(0, 19);
    if (!name) return ack({ ok: false, error: "Give the group a name." });
    if (!members.length) return ack({ ok: false, error: "Pick at least one friend." });
    const g = { id: "GRP-" + randomPart(8), name, owner: me, members: [me, ...members] };
    db.groups[g.id] = g; saveDb();
    g.members.forEach((id) => emitTo(id, "group-added", groupInfo(g)));
    ack({ ok: true, id: g.id });
  });
  socket.on("group:leave", (gid) => {
    const me = socket.data.wigoId, g = db.groups[gid];
    if (!me || !g || !g.members.includes(me)) return;
    g.members = g.members.filter((x) => x !== me);
    if (g.members.length < 2) { g.members.forEach((id) => emitTo(id, "group-removed", { id: gid })); delete db.groups[gid]; }
    else g.members.forEach((id) => emitTo(id, "group-added", groupInfo(g)));
    saveDb();
  });

  /* ----- audio / video calls (the server only passes signals along) ----- */
  const REACT = ["laugh", "love", "clap", "fire"];
  socket.on("call:invite", ({ to, mode } = {}, ack) => {
    const me = socket.data.wigoId;
    if (!me || !friendsOf(me).includes(to)) return ack({ ok: false, error: "You can only call friends." });
    if (isMinor(me) || isMinor(to)) return ack({ ok: false, error: "Calls are turned off in Safe Chat." });
    if (!online.has(to)) return ack({ ok: false, error: "They're offline right now." });
    if (socket.data.call || online.get(to).data.call) return ack({ ok: false, error: "One of you is already in a call." });
    socket.data.call = to; online.get(to).data.call = me;
    emitTo(to, "call:incoming", { from: me, name: socket.data.name, mode: mode === "video" ? "video" : "audio" });
    ack({ ok: true });
  });
  socket.on("call:answer", ({ to, accept } = {}) => {
    const me = socket.data.wigoId, p = online.get(to);
    if (socket.data.call !== to) return;
    if (!p) { socket.data.call = null; return; }
    if (accept) return p.emit("call:accepted", { from: me });
    socket.data.call = null; p.data.call = null; p.emit("call:declined");
  });
  socket.on("call:signal", ({ to, data } = {}) => {
    if (socket.data.call !== to || JSON.stringify(data || {}).length > 20000) return;
    emitTo(to, "call:signal", { from: socket.data.wigoId, data });
  });
  socket.on("call:react", ({ to, emoji } = {}) => { if (socket.data.call === to && REACT.includes(emoji)) emitTo(to, "call:react", { emoji }); });
  socket.on("call:end", ({ to } = {}) => { if (socket.data.call === to) dropCall(socket); });

  /* ----- games: invite, accept / decline / no answer, play ----- */
  socket.on("game:invite", ({ to, type } = {}, ack) => {
    const me = socket.data.wigoId;
    if (!me || !GAMES[type] || !friendsOf(me).includes(to)) return ack({ ok: false, error: "Pick a friend and a game." });
    if (!online.has(to)) return ack({ ok: false, error: "They're offline right now." });
    if ([...invites.values()].some((i) => i.from === me && i.to === to)) return ack({ ok: false, error: "You already sent them an invite." });
    const id = randomPart(8);
    const timer = setTimeout(() => { // nobody answered in time
      invites.delete(id);
      emitTo(me, "game:timeout", { name: nameOf(to), type: GAMES[type] });
      emitTo(to, "game:expired", { id });
    }, INVITE_MS);
    invites.set(id, { id, from: me, to, type, timer });
    emitTo(to, "game:invited", { id, name: socket.data.name, type: GAMES[type] });
    ack({ ok: true });
  });
  socket.on("game:respond", ({ id, accept } = {}) => {
    const me = socket.data.wigoId, inv = invites.get(id);
    if (!inv || inv.to !== me) return;
    clearTimeout(inv.timer); invites.delete(id);
    if (!accept) return emitTo(inv.from, "game:declined", { name: socket.data.name, type: GAMES[inv.type] });
    if (!online.has(inv.from)) return;
    const g = newGame(inv.type, inv.from, me);
    games.set(g.id, g); pushGame(g);
  });
  socket.on("game:move", ({ id, move } = {}) => {
    const g = games.get(id);
    if (g && g.players.includes(socket.data.wigoId) && playMove(g, socket.data.wigoId, move)) pushGame(g);
  });
  socket.on("game:quit", ({ id } = {}) => {
    const me = socket.data.wigoId, g = games.get(id);
    if (!g || !g.players.includes(me)) return;
    games.delete(id);
    if (!g.s.winner) g.players.filter((p) => p !== me).forEach((p) => emitTo(p, "game:ended", { name: nameOf(me) }));
  });

  socket.on("disconnect", () => {
    const id = socket.data.wigoId;
    if (id && online.get(id) === socket) { online.delete(id); tellFriends(id, false); dropCall(socket); dropGames(id); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Wigo running at http://localhost:${PORT}`));
