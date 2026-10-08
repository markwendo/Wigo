// Shared rules: used by the server (enforced) and the browser (live feedback).
(function (root) {
  const MIN_AGE = 13, ADULT_AGE = 18;
  const COMMON = ["password", "qwerty", "letmein", "iloveyou", "123456", "abc123"];

  // Returns what the password is still missing (empty list = accepted).
  // Length matters most: 8+ characters with letters AND numbers, or 12+ characters of anything.
  function passwordProblems(pw, ctx) {
    pw = String(pw || ""); ctx = ctx || {};
    const out = [], low = pw.toLowerCase();
    if (pw.length < 8) out.push("at least 8 characters");
    else if (pw.length < 12 && !(/[A-Za-z]/.test(pw) && /[0-9]/.test(pw))) out.push("letters and numbers together (or 12+ characters)");
    if (COMMON.some((w) => low.includes(w))) out.push("nothing very common like 'password' or '123456'");
    const personal = [String(ctx.name || "").toLowerCase().replace(/\s+/g, ""), String(ctx.email || "").toLowerCase().split("@")[0]].filter((s) => s.length >= 5);
    if (personal.some((s) => low.includes(s))) out.push("nothing containing your name or Gmail username");
    return out;
  }

  // 0-4, only used for the strength bar
  function passwordScore(pw) {
    pw = String(pw || "");
    return (pw.length >= 8) + (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) + (pw.length >= 12) + ((/[A-Z]/.test(pw) && /[a-z]/.test(pw)) || /[^A-Za-z0-9]/.test(pw));
  }

  // Age in whole years from "YYYY-MM-DD", or null if it isn't a real past date
  function ageFromDob(dob, now) {
    now = now || new Date();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ""));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900 || dt > now) return null;
    let age = now.getUTCFullYear() - y;
    if (now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d)) age--;
    return age;
  }

  // Safe Chat filter: a basic word list that also catches s p a c e d, l33t and stretched spellings.
  // It is a first line of defence, not a guarantee.
  const collapse = (s) => s.replace(/(.)\1+/g, "$1");
  const BAD = new Set(("sex sexy sexting sext nude nudes naked porn porno nsfw horny boob boobs tits titties dick cock penis " +
    "vagina pussy anal blowjob handjob cum cumming orgasm masturbate masturbation erection hentai slut whore bitch " +
    "fuck fucking fucker motherfucker cunt asshole").split(" ").map(collapse));
  const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

  function isUnsafeText(text) {
    let t = String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    t = t.replace(/(?:\b\w[\s.\-_*]+){2,}\w\b/g, (m) => m.replace(/[\s.\-_*]/g, ""));
    t = t.replace(/[013457@$]/g, (ch) => LEET[ch]);
    return t.split(/[^a-z]+/).some((w) => w && BAD.has(collapse(w)));
  }

  const api = { MIN_AGE, ADULT_AGE, passwordProblems, passwordScore, ageFromDob, isUnsafeText };
  root.WigoRules = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
