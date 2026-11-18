// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `livekit-room-end` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/_vendor/esm.sh/tslib@2.8.1/denonext/tslib.mjs
function S(e4, t72) {
  var r10 = {};
  for (var n9 in e4) Object.prototype.hasOwnProperty.call(e4, n9) && t72.indexOf(n9) < 0 && (r10[n9] = e4[n9]);
  if (e4 != null && typeof Object.getOwnPropertySymbols == "function") for (var i12 = 0, n9 = Object.getOwnPropertySymbols(e4); i12 < n9.length; i12++) t72.indexOf(n9[i12]) < 0 && Object.prototype.propertyIsEnumerable.call(e4, n9[i12]) && (r10[n9[i12]] = e4[n9[i12]]);
  return r10;
}
function F(e4, t72, r10, n9) {
  function i12(o18) {
    return o18 instanceof r10 ? o18 : new r10(function(a8) {
      a8(o18);
    });
  }
  return new (r10 || (r10 = Promise))(function(o18, a8) {
    function f11(s8) {
      try {
        c9(n9.next(s8));
      } catch (l8) {
        a8(l8);
      }
    }
    function p9(s8) {
      try {
        c9(n9.throw(s8));
      } catch (l8) {
        a8(l8);
      }
    }
    function c9(s8) {
      s8.done ? o18(s8.value) : i12(s8.value).then(f11, p9);
    }
    c9((n9 = n9.apply(e4, t72 || [])).next());
  });
}

// supabase/functions/_vendor/esm.sh/@supabase/auth-js@2.108.1/denonext/auth-js.mjs
var de = "2.108.1";
var q = 30 * 1e3;
var ee = 3;
var fe = ee * q;
var Ge = "http://localhost:9999";
var Be = "supabase.auth.token";
var Fe = { "X-Client-Info": `gotrue-js/${de}` };
var se = "X-Supabase-Api-Version";
var Ae = { "2024-01-01": { timestamp: Date.parse("2024-01-01T00:00:00.0Z"), name: "2024-01-01" } };
var ze = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}$|[a-z0-9_-]{2}$)$/i;
var Ve = 600 * 1e3;
var M = class extends Error {
  constructor(e4, t72, r10) {
    super(e4), this.__isAuthError = true, this.name = "AuthError", this.status = t72, this.code = r10;
  }
  toJSON() {
    return { name: this.name, message: this.message, status: this.status, code: this.code };
  }
};
function h(i12) {
  return typeof i12 == "object" && i12 !== null && "__isAuthError" in i12;
}
var _e = class extends M {
  constructor(e4, t72, r10) {
    super(e4, t72, r10), this.name = "AuthApiError", this.status = t72, this.code = r10;
  }
};
function Je(i12) {
  return h(i12) && i12.name === "AuthApiError";
}
var x = class extends M {
  constructor(e4, t72) {
    super(e4), this.name = "AuthUnknownError", this.originalError = t72;
  }
};
var C = class extends M {
  constructor(e4, t72, r10, s8) {
    super(e4, r10, s8), this.name = t72, this.status = r10;
  }
};
var E = class extends C {
  constructor() {
    super("Auth session missing!", "AuthSessionMissingError", 400, void 0);
  }
};
function ae(i12) {
  return h(i12) && i12.name === "AuthSessionMissingError";
}
var K = class extends C {
  constructor() {
    super("Auth session or user missing", "AuthInvalidTokenResponseError", 500, void 0);
  }
};
var J = class extends C {
  constructor(e4) {
    super(e4, "AuthInvalidCredentialsError", 400, void 0);
  }
};
var H = class extends C {
  constructor(e4, t72 = null) {
    super(e4, "AuthImplicitGrantRedirectError", 500, void 0), this.details = null, this.details = t72;
  }
  toJSON() {
    return Object.assign(Object.assign({}, super.toJSON()), { details: this.details });
  }
};
function He(i12) {
  return h(i12) && i12.name === "AuthImplicitGrantRedirectError";
}
var ie = class extends C {
  constructor(e4, t72 = null) {
    super(e4, "AuthPKCEGrantCodeExchangeError", 500, void 0), this.details = null, this.details = t72;
  }
  toJSON() {
    return Object.assign(Object.assign({}, super.toJSON()), { details: this.details });
  }
};
var ge = class extends C {
  constructor() {
    super("PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.", "AuthPKCECodeVerifierMissingError", 400, "pkce_code_verifier_not_found");
  }
};
var te = class extends C {
  constructor(e4, t72) {
    super(e4, "AuthRetryableFetchError", t72, void 0);
  }
};
function we(i12) {
  return h(i12) && i12.name === "AuthRetryableFetchError";
}
var ne = class extends C {
  constructor(e4 = "Refresh result discarded: session state changed mid-flight (e.g., concurrent signOut)") {
    super(e4, "AuthRefreshDiscardedError", 409, void 0);
  }
};
function Ye(i12) {
  return h(i12) && i12.name === "AuthRefreshDiscardedError";
}
var oe = class extends C {
  constructor(e4, t72, r10) {
    super(e4, "AuthWeakPasswordError", t72, "weak_password"), this.reasons = r10;
  }
  toJSON() {
    return Object.assign(Object.assign({}, super.toJSON()), { reasons: this.reasons });
  }
};
var G = class extends C {
  constructor(e4) {
    super(e4, "AuthInvalidJwtError", 400, "invalid_jwt");
  }
};
var pe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
var Xe = ` 	
\r=`.split("");
var Rt = (() => {
  let i12 = new Array(128);
  for (let e4 = 0; e4 < i12.length; e4 += 1) i12[e4] = -1;
  for (let e4 = 0; e4 < Xe.length; e4 += 1) i12[Xe[e4].charCodeAt(0)] = -2;
  for (let e4 = 0; e4 < pe.length; e4 += 1) i12[pe[e4].charCodeAt(0)] = e4;
  return i12;
})();
function Ze(i12, e4, t72) {
  if (i12 !== null) for (e4.queue = e4.queue << 8 | i12, e4.queuedBits += 8; e4.queuedBits >= 6; ) {
    let r10 = e4.queue >> e4.queuedBits - 6 & 63;
    t72(pe[r10]), e4.queuedBits -= 6;
  }
  else if (e4.queuedBits > 0) for (e4.queue = e4.queue << 6 - e4.queuedBits, e4.queuedBits = 6; e4.queuedBits >= 6; ) {
    let r10 = e4.queue >> e4.queuedBits - 6 & 63;
    t72(pe[r10]), e4.queuedBits -= 6;
  }
}
function Qe(i12, e4, t72) {
  let r10 = Rt[i12];
  if (r10 > -1) for (e4.queue = e4.queue << 6 | r10, e4.queuedBits += 6; e4.queuedBits >= 8; ) t72(e4.queue >> e4.queuedBits - 8 & 255), e4.queuedBits -= 8;
  else {
    if (r10 === -2) return;
    throw new Error(`Invalid Base64-URL character "${String.fromCharCode(i12)}"`);
  }
}
function Te(i12) {
  let e4 = [], t72 = (o18) => {
    e4.push(String.fromCodePoint(o18));
  }, r10 = { utf8seq: 0, codepoint: 0 }, s8 = { queue: 0, queuedBits: 0 }, n9 = (o18) => {
    At(o18, r10, t72);
  };
  for (let o18 = 0; o18 < i12.length; o18 += 1) Qe(i12.charCodeAt(o18), s8, n9);
  return e4.join("");
}
function St(i12, e4) {
  if (i12 <= 127) {
    e4(i12);
    return;
  } else if (i12 <= 2047) {
    e4(192 | i12 >> 6), e4(128 | i12 & 63);
    return;
  } else if (i12 <= 65535) {
    e4(224 | i12 >> 12), e4(128 | i12 >> 6 & 63), e4(128 | i12 & 63);
    return;
  } else if (i12 <= 1114111) {
    e4(240 | i12 >> 18), e4(128 | i12 >> 12 & 63), e4(128 | i12 >> 6 & 63), e4(128 | i12 & 63);
    return;
  }
  throw new Error(`Unrecognized Unicode codepoint: ${i12.toString(16)}`);
}
function Et(i12, e4) {
  for (let t72 = 0; t72 < i12.length; t72 += 1) {
    let r10 = i12.charCodeAt(t72);
    if (r10 > 55295 && r10 <= 56319) {
      let s8 = (r10 - 55296) * 1024 & 65535;
      r10 = (i12.charCodeAt(t72 + 1) - 56320 & 65535 | s8) + 65536, t72 += 1;
    }
    St(r10, e4);
  }
}
function At(i12, e4, t72) {
  if (e4.utf8seq === 0) {
    if (i12 <= 127) {
      t72(i12);
      return;
    }
    for (let r10 = 1; r10 < 6; r10 += 1) if ((i12 >> 7 - r10 & 1) === 0) {
      e4.utf8seq = r10;
      break;
    }
    if (e4.utf8seq === 2) e4.codepoint = i12 & 31;
    else if (e4.utf8seq === 3) e4.codepoint = i12 & 15;
    else if (e4.utf8seq === 4) e4.codepoint = i12 & 7;
    else throw new Error("Invalid UTF-8 sequence");
    e4.utf8seq -= 1;
  } else if (e4.utf8seq > 0) {
    if (i12 <= 127) throw new Error("Invalid UTF-8 sequence");
    e4.codepoint = e4.codepoint << 6 | i12 & 63, e4.utf8seq -= 1, e4.utf8seq === 0 && t72(e4.codepoint);
  }
}
function B(i12) {
  let e4 = [], t72 = { queue: 0, queuedBits: 0 }, r10 = (s8) => {
    e4.push(s8);
  };
  for (let s8 = 0; s8 < i12.length; s8 += 1) Qe(i12.charCodeAt(s8), t72, r10);
  return new Uint8Array(e4);
}
function et(i12) {
  let e4 = [];
  return Et(i12, (t72) => e4.push(t72)), new Uint8Array(e4);
}
function W(i12) {
  let e4 = [], t72 = { queue: 0, queuedBits: 0 }, r10 = (s8) => {
    e4.push(s8);
  };
  return i12.forEach((s8) => Ze(s8, t72, r10)), Ze(null, t72, r10), e4.join("");
}
function tt(i12) {
  return Math.round(Date.now() / 1e3) + i12;
}
function rt() {
  return Symbol("auth-callback");
}
var T = () => typeof globalThis < "u" && typeof document < "u";
var Y = { tested: false, writable: false };
var ye = () => {
  if (!T()) return false;
  try {
    if (typeof globalThis.localStorage != "object") return false;
  } catch {
    return false;
  }
  if (Y.tested) return Y.writable;
  let i12 = `lswt-${Math.random()}${Math.random()}`;
  try {
    globalThis.localStorage.setItem(i12, i12), globalThis.localStorage.removeItem(i12), Y.tested = true, Y.writable = true;
  } catch {
    Y.tested = true, Y.writable = false;
  }
  return Y.writable;
};
function st(i12) {
  let e4 = {}, t72 = new URL(i12);
  if (t72.hash && t72.hash[0] === "#") try {
    new URLSearchParams(t72.hash.substring(1)).forEach((s8, n9) => {
      e4[n9] = s8;
    });
  } catch {
  }
  return t72.searchParams.forEach((r10, s8) => {
    e4[s8] = r10;
  }), e4;
}
var ve = (i12) => i12 ? (...e4) => i12(...e4) : (...e4) => fetch(...e4);
var it = (i12) => typeof i12 == "object" && i12 !== null && "status" in i12 && "ok" in i12 && "json" in i12 && typeof i12.json == "function";
var X = async (i12, e4, t72) => {
  await i12.setItem(e4, JSON.stringify(t72));
};
var $ = async (i12, e4) => {
  let t72 = await i12.getItem(e4);
  if (!t72) return null;
  try {
    return JSON.parse(t72);
  } catch {
    return null;
  }
};
var A = async (i12, e4) => {
  await i12.removeItem(e4);
};
var le = class i {
  constructor() {
    this.promise = new i.promiseConstructor((e4, t72) => {
      this.resolve = e4, this.reject = t72;
    });
  }
};
le.promiseConstructor = Promise;
function ue(i12) {
  let e4 = i12.split(".");
  if (e4.length !== 3) throw new G("Invalid JWT structure");
  for (let r10 = 0; r10 < e4.length; r10++) if (!ze.test(e4[r10])) throw new G("JWT not in base64url format");
  return { header: JSON.parse(Te(e4[0])), payload: JSON.parse(Te(e4[1])), signature: B(e4[2]), raw: { header: e4[0], payload: e4[1] } };
}
async function nt(i12) {
  return await new Promise((e4) => {
    setTimeout(() => e4(null), i12);
  });
}
function ot(i12, e4) {
  return new Promise((r10, s8) => {
    (async () => {
      for (let n9 = 0; n9 < 1 / 0; n9++) try {
        let o18 = await i12(n9);
        if (!e4(n9, null, o18)) {
          r10(o18);
          return;
        }
      } catch (o18) {
        if (!e4(n9, o18)) {
          s8(o18);
          return;
        }
      }
    })();
  });
}
function Tt(i12) {
  return ("0" + i12.toString(16)).substr(-2);
}
function It() {
  let e4 = new Uint32Array(56);
  if (typeof crypto > "u") {
    let t72 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~", r10 = t72.length, s8 = "";
    for (let n9 = 0; n9 < 56; n9++) s8 += t72.charAt(Math.floor(Math.random() * r10));
    return s8;
  }
  return crypto.getRandomValues(e4), Array.from(e4, Tt).join("");
}
async function xt(i12) {
  let t72 = new TextEncoder().encode(i12), r10 = await crypto.subtle.digest("SHA-256", t72), s8 = new Uint8Array(r10);
  return Array.from(s8).map((n9) => String.fromCharCode(n9)).join("");
}
async function Ot(i12) {
  if (!(typeof crypto < "u" && typeof crypto.subtle < "u" && typeof TextEncoder < "u")) return console.warn("WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256."), i12;
  let t72 = await xt(i12);
  return btoa(t72).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function F2(i12, e4, t72 = false) {
  let r10 = It(), s8 = r10;
  t72 && (s8 += "/recovery"), await X(i12, `${e4}-code-verifier`, s8);
  let n9 = await Ot(r10);
  return [n9, r10 === n9 ? "plain" : "s256"];
}
var Pt = /^2[0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/i;
function at(i12) {
  let e4 = i12.headers.get(se);
  if (!e4 || !e4.match(Pt)) return null;
  try {
    return /* @__PURE__ */ new Date(`${e4}T00:00:00.0Z`);
  } catch {
    return null;
  }
}
function lt(i12) {
  if (!i12) throw new Error("Missing exp claim");
  let e4 = Math.floor(Date.now() / 1e3);
  if (i12 <= e4) throw new Error("JWT has expired");
}
function ut(i12) {
  switch (i12) {
    case "RS256":
      return { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } };
    case "ES256":
      return { name: "ECDSA", namedCurve: "P-256", hash: { name: "SHA-256" } };
    default:
      throw new Error("Invalid alg claim");
  }
}
var Ct = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function N(i12) {
  if (!Ct.test(i12)) throw new Error("@supabase/auth-js: Expected parameter to be UUID but is not");
}
function O(i12) {
  if (!i12.passkey) throw new Error("@supabase/auth-js: the passkey API is experimental and disabled by default. Enable it by passing `auth: { experimental: { passkey: true } }` to createClient (or to the GoTrueClient constructor).");
}
function be() {
  let i12 = {};
  return new Proxy(i12, { get: (e4, t72) => {
    if (t72 === "__isUserNotAvailableProxy") return true;
    if (typeof t72 == "symbol") {
      let r10 = t72.toString();
      if (r10 === "Symbol(Symbol.toPrimitive)" || r10 === "Symbol(Symbol.toStringTag)" || r10 === "Symbol(util.inspect.custom)") return;
    }
    throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Accessing the "${t72}" property of the session object is not supported. Please use getUser() instead.`);
  }, set: (e4, t72) => {
    throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Setting the "${t72}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
  }, deleteProperty: (e4, t72) => {
    throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Deleting the "${t72}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
  } });
}
function ct(i12, e4) {
  return new Proxy(i12, { get: (t72, r10, s8) => {
    if (r10 === "__isInsecureUserWarningProxy") return true;
    if (typeof r10 == "symbol") {
      let n9 = r10.toString();
      if (n9 === "Symbol(Symbol.toPrimitive)" || n9 === "Symbol(Symbol.toStringTag)" || n9 === "Symbol(util.inspect.custom)" || n9 === "Symbol(nodejs.util.inspect.custom)") return Reflect.get(t72, r10, s8);
    }
    return !e4.value && typeof r10 == "string" && (console.warn("Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server."), e4.value = true), Reflect.get(t72, r10, s8);
  } });
}
function Ie(i12) {
  return JSON.parse(JSON.stringify(i12));
}
var Z = (i12) => {
  if (typeof i12 == "object" && i12 !== null) {
    let e4 = i12;
    if (typeof e4.msg == "string") return e4.msg;
    if (typeof e4.message == "string") return e4.message;
    if (typeof e4.error_description == "string") return e4.error_description;
    if (typeof e4.error == "string") return e4.error;
  }
  return JSON.stringify(i12);
};
var Ut = [502, 503, 504, 520, 521, 522, 523, 524, 530];
async function ht(i12) {
  var e4;
  if (!it(i12)) throw new te(Z(i12), 0);
  if (Ut.includes(i12.status)) throw new te(Z(i12), i12.status);
  let t72;
  try {
    t72 = await i12.json();
  } catch (n9) {
    throw new x(Z(n9), n9);
  }
  let r10, s8 = at(i12);
  if (s8 && s8.getTime() >= Ae["2024-01-01"].timestamp && typeof t72 == "object" && t72 && typeof t72.code == "string" ? r10 = t72.code : typeof t72 == "object" && t72 && typeof t72.error_code == "string" && (r10 = t72.error_code), r10) {
    if (r10 === "weak_password") throw new oe(Z(t72), i12.status, ((e4 = t72.weak_password) === null || e4 === void 0 ? void 0 : e4.reasons) || []);
    if (r10 === "session_not_found") throw new E();
  } else if (typeof t72 == "object" && t72 && typeof t72.weak_password == "object" && t72.weak_password && Array.isArray(t72.weak_password.reasons) && t72.weak_password.reasons.length && t72.weak_password.reasons.reduce((n9, o18) => n9 && typeof o18 == "string", true)) throw new oe(Z(t72), i12.status, t72.weak_password.reasons);
  throw new _e(Z(t72), i12.status || 500, r10);
}
var $t = (i12, e4, t72, r10) => {
  let s8 = { method: i12, headers: e4?.headers || {} };
  return i12 === "GET" ? s8 : (s8.headers = Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, e4?.headers), s8.body = JSON.stringify(r10), Object.assign(Object.assign({}, s8), t72));
};
async function f(i12, e4, t72, r10) {
  var s8;
  let n9 = Object.assign({}, r10?.headers);
  n9[se] || (n9[se] = Ae["2024-01-01"].name), r10?.jwt && (n9.Authorization = `Bearer ${r10.jwt}`);
  let o18 = (s8 = r10?.query) !== null && s8 !== void 0 ? s8 : {};
  r10?.redirectTo && (o18.redirect_to = r10.redirectTo);
  let a8 = Object.keys(o18).length ? "?" + new URLSearchParams(o18).toString() : "", l8 = await Nt(i12, e4, t72 + a8, { headers: n9, noResolveJson: r10?.noResolveJson }, {}, r10?.body);
  return r10?.xform ? r10?.xform(l8) : { data: Object.assign({}, l8), error: null };
}
async function Nt(i12, e4, t72, r10, s8, n9) {
  let o18 = $t(e4, r10, s8, n9), a8;
  try {
    a8 = await i12(t72, Object.assign({}, o18));
  } catch (l8) {
    throw console.error(l8), new te(Z(l8), 0);
  }
  if (a8.ok || await ht(a8), r10?.noResolveJson) return a8;
  try {
    return await a8.json();
  } catch (l8) {
    await ht(l8);
  }
}
function P(i12) {
  var e4;
  let t72 = null;
  Lt(i12) && (t72 = Object.assign({}, i12), i12.expires_at || (t72.expires_at = tt(i12.expires_in)));
  let r10 = (e4 = i12.user) !== null && e4 !== void 0 ? e4 : typeof i12?.id == "string" ? i12 : null;
  return { data: { session: t72, user: r10 }, error: null };
}
function xe(i12) {
  let e4 = P(i12);
  return !e4.error && i12.weak_password && typeof i12.weak_password == "object" && Array.isArray(i12.weak_password.reasons) && i12.weak_password.reasons.length && i12.weak_password.message && typeof i12.weak_password.message == "string" && i12.weak_password.reasons.reduce((t72, r10) => t72 && typeof r10 == "string", true) && (e4.data.weak_password = i12.weak_password), e4;
}
function L(i12) {
  var e4;
  return { data: { user: (e4 = i12.user) !== null && e4 !== void 0 ? e4 : i12 }, error: null };
}
function dt(i12) {
  return { data: i12, error: null };
}
function ft(i12) {
  let { action_link: e4, email_otp: t72, hashed_token: r10, redirect_to: s8, verification_type: n9 } = i12, o18 = S(i12, ["action_link", "email_otp", "hashed_token", "redirect_to", "verification_type"]), a8 = { action_link: e4, email_otp: t72, hashed_token: r10, redirect_to: s8, verification_type: n9 }, l8 = Object.assign({}, o18);
  return { data: { properties: a8, user: l8 }, error: null };
}
function Oe(i12) {
  return i12;
}
function Lt(i12) {
  return !!i12.access_token && !!i12.refresh_token && !!i12.expires_in;
}
var me = ["global", "local", "others"];
var z = class {
  constructor({ url: e4 = "", headers: t72 = {}, fetch: r10, experimental: s8 }) {
    this.url = e4, this.headers = t72, this.fetch = ve(r10), this.experimental = s8 ?? {}, this.mfa = { listFactors: this._listFactors.bind(this), deleteFactor: this._deleteFactor.bind(this) }, this.oauth = { listClients: this._listOAuthClients.bind(this), createClient: this._createOAuthClient.bind(this), getClient: this._getOAuthClient.bind(this), updateClient: this._updateOAuthClient.bind(this), deleteClient: this._deleteOAuthClient.bind(this), regenerateClientSecret: this._regenerateOAuthClientSecret.bind(this) }, this.customProviders = { listProviders: this._listCustomProviders.bind(this), createProvider: this._createCustomProvider.bind(this), getProvider: this._getCustomProvider.bind(this), updateProvider: this._updateCustomProvider.bind(this), deleteProvider: this._deleteCustomProvider.bind(this) }, this.passkey = { listPasskeys: this._adminListPasskeys.bind(this), deletePasskey: this._adminDeletePasskey.bind(this) };
  }
  async signOut(e4, t72 = me[0]) {
    if (me.indexOf(t72) < 0) throw new Error(`@supabase/auth-js: Parameter scope must be one of ${me.join(", ")}`);
    try {
      return await f(this.fetch, "POST", `${this.url}/logout?scope=${t72}`, { headers: this.headers, jwt: e4, noResolveJson: true }), { data: null, error: null };
    } catch (r10) {
      if (h(r10)) return { data: null, error: r10 };
      throw r10;
    }
  }
  async inviteUserByEmail(e4, t72 = {}) {
    try {
      return await f(this.fetch, "POST", `${this.url}/invite`, { body: { email: e4, data: t72.data }, headers: this.headers, redirectTo: t72.redirectTo, xform: L });
    } catch (r10) {
      if (h(r10)) return { data: { user: null }, error: r10 };
      throw r10;
    }
  }
  async generateLink(e4) {
    try {
      let { options: t72 } = e4, r10 = S(e4, ["options"]), s8 = Object.assign(Object.assign({}, r10), t72);
      return "newEmail" in r10 && (s8.new_email = r10?.newEmail, delete s8.newEmail), await f(this.fetch, "POST", `${this.url}/admin/generate_link`, { body: s8, headers: this.headers, xform: ft, redirectTo: t72?.redirectTo });
    } catch (t72) {
      if (h(t72)) return { data: { properties: null, user: null }, error: t72 };
      throw t72;
    }
  }
  async createUser(e4) {
    try {
      return await f(this.fetch, "POST", `${this.url}/admin/users`, { body: e4, headers: this.headers, xform: L });
    } catch (t72) {
      if (h(t72)) return { data: { user: null }, error: t72 };
      throw t72;
    }
  }
  async listUsers(e4) {
    var t72, r10, s8, n9, o18, a8, l8;
    try {
      let u8 = { nextPage: null, lastPage: 0, total: 0 }, c9 = await f(this.fetch, "GET", `${this.url}/admin/users`, { headers: this.headers, noResolveJson: true, query: { page: (r10 = (t72 = e4?.page) === null || t72 === void 0 ? void 0 : t72.toString()) !== null && r10 !== void 0 ? r10 : "", per_page: (n9 = (s8 = e4?.perPage) === null || s8 === void 0 ? void 0 : s8.toString()) !== null && n9 !== void 0 ? n9 : "" }, xform: Oe });
      if (c9.error) throw c9.error;
      let w12 = await c9.json(), d5 = (o18 = c9.headers.get("x-total-count")) !== null && o18 !== void 0 ? o18 : 0, _8 = (l8 = (a8 = c9.headers.get("link")) === null || a8 === void 0 ? void 0 : a8.split(",")) !== null && l8 !== void 0 ? l8 : [];
      return _8.length > 0 && (_8.forEach((v6) => {
        let b7 = parseInt(v6.split(";")[0].split("=")[1].substring(0, 1)), y11 = JSON.parse(v6.split(";")[1].split("=")[1]);
        u8[`${y11}Page`] = b7;
      }), u8.total = parseInt(d5)), { data: Object.assign(Object.assign({}, w12), u8), error: null };
    } catch (u8) {
      if (h(u8)) return { data: { users: [] }, error: u8 };
      throw u8;
    }
  }
  async getUserById(e4) {
    N(e4);
    try {
      return await f(this.fetch, "GET", `${this.url}/admin/users/${e4}`, { headers: this.headers, xform: L });
    } catch (t72) {
      if (h(t72)) return { data: { user: null }, error: t72 };
      throw t72;
    }
  }
  async updateUserById(e4, t72) {
    N(e4);
    try {
      return await f(this.fetch, "PUT", `${this.url}/admin/users/${e4}`, { body: t72, headers: this.headers, xform: L });
    } catch (r10) {
      if (h(r10)) return { data: { user: null }, error: r10 };
      throw r10;
    }
  }
  async deleteUser(e4, t72 = false) {
    N(e4);
    try {
      return await f(this.fetch, "DELETE", `${this.url}/admin/users/${e4}`, { headers: this.headers, body: { should_soft_delete: t72 }, xform: L });
    } catch (r10) {
      if (h(r10)) return { data: { user: null }, error: r10 };
      throw r10;
    }
  }
  async _listFactors(e4) {
    N(e4.userId);
    try {
      let { data: t72, error: r10 } = await f(this.fetch, "GET", `${this.url}/admin/users/${e4.userId}/factors`, { headers: this.headers, xform: (s8) => ({ data: { factors: s8 }, error: null }) });
      return { data: t72, error: r10 };
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _deleteFactor(e4) {
    N(e4.userId), N(e4.id);
    try {
      return { data: await f(this.fetch, "DELETE", `${this.url}/admin/users/${e4.userId}/factors/${e4.id}`, { headers: this.headers }), error: null };
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _listOAuthClients(e4) {
    var t72, r10, s8, n9, o18, a8, l8;
    try {
      let u8 = { nextPage: null, lastPage: 0, total: 0 }, c9 = await f(this.fetch, "GET", `${this.url}/admin/oauth/clients`, { headers: this.headers, noResolveJson: true, query: { page: (r10 = (t72 = e4?.page) === null || t72 === void 0 ? void 0 : t72.toString()) !== null && r10 !== void 0 ? r10 : "", per_page: (n9 = (s8 = e4?.perPage) === null || s8 === void 0 ? void 0 : s8.toString()) !== null && n9 !== void 0 ? n9 : "" }, xform: Oe });
      if (c9.error) throw c9.error;
      let w12 = await c9.json(), d5 = (o18 = c9.headers.get("x-total-count")) !== null && o18 !== void 0 ? o18 : 0, _8 = (l8 = (a8 = c9.headers.get("link")) === null || a8 === void 0 ? void 0 : a8.split(",")) !== null && l8 !== void 0 ? l8 : [];
      return _8.length > 0 && (_8.forEach((v6) => {
        let b7 = parseInt(v6.split(";")[0].split("=")[1].substring(0, 1)), y11 = JSON.parse(v6.split(";")[1].split("=")[1]);
        u8[`${y11}Page`] = b7;
      }), u8.total = parseInt(d5)), { data: Object.assign(Object.assign({}, w12), u8), error: null };
    } catch (u8) {
      if (h(u8)) return { data: { clients: [] }, error: u8 };
      throw u8;
    }
  }
  async _createOAuthClient(e4) {
    try {
      return await f(this.fetch, "POST", `${this.url}/admin/oauth/clients`, { body: e4, headers: this.headers, xform: (t72) => ({ data: t72, error: null }) });
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _getOAuthClient(e4) {
    try {
      return await f(this.fetch, "GET", `${this.url}/admin/oauth/clients/${e4}`, { headers: this.headers, xform: (t72) => ({ data: t72, error: null }) });
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _updateOAuthClient(e4, t72) {
    try {
      return await f(this.fetch, "PUT", `${this.url}/admin/oauth/clients/${e4}`, { body: t72, headers: this.headers, xform: (r10) => ({ data: r10, error: null }) });
    } catch (r10) {
      if (h(r10)) return { data: null, error: r10 };
      throw r10;
    }
  }
  async _deleteOAuthClient(e4) {
    try {
      return await f(this.fetch, "DELETE", `${this.url}/admin/oauth/clients/${e4}`, { headers: this.headers, noResolveJson: true }), { data: null, error: null };
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _regenerateOAuthClientSecret(e4) {
    try {
      return await f(this.fetch, "POST", `${this.url}/admin/oauth/clients/${e4}/regenerate_secret`, { headers: this.headers, xform: (t72) => ({ data: t72, error: null }) });
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _listCustomProviders(e4) {
    try {
      let t72 = {};
      return e4?.type && (t72.type = e4.type), await f(this.fetch, "GET", `${this.url}/admin/custom-providers`, { headers: this.headers, query: t72, xform: (r10) => {
        var s8;
        return { data: { providers: (s8 = r10?.providers) !== null && s8 !== void 0 ? s8 : [] }, error: null };
      } });
    } catch (t72) {
      if (h(t72)) return { data: { providers: [] }, error: t72 };
      throw t72;
    }
  }
  async _createCustomProvider(e4) {
    try {
      return await f(this.fetch, "POST", `${this.url}/admin/custom-providers`, { body: e4, headers: this.headers, xform: (t72) => ({ data: t72, error: null }) });
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _getCustomProvider(e4) {
    try {
      return await f(this.fetch, "GET", `${this.url}/admin/custom-providers/${e4}`, { headers: this.headers, xform: (t72) => ({ data: t72, error: null }) });
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _updateCustomProvider(e4, t72) {
    try {
      return await f(this.fetch, "PUT", `${this.url}/admin/custom-providers/${e4}`, { body: t72, headers: this.headers, xform: (r10) => ({ data: r10, error: null }) });
    } catch (r10) {
      if (h(r10)) return { data: null, error: r10 };
      throw r10;
    }
  }
  async _deleteCustomProvider(e4) {
    try {
      return await f(this.fetch, "DELETE", `${this.url}/admin/custom-providers/${e4}`, { headers: this.headers, noResolveJson: true }), { data: null, error: null };
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _adminListPasskeys(e4) {
    O(this.experimental), N(e4.userId);
    try {
      return await f(this.fetch, "GET", `${this.url}/admin/users/${e4.userId}/passkeys`, { headers: this.headers, xform: (t72) => ({ data: t72, error: null }) });
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
  async _adminDeletePasskey(e4) {
    O(this.experimental), N(e4.userId), N(e4.passkeyId);
    try {
      return await f(this.fetch, "DELETE", `${this.url}/admin/users/${e4.userId}/passkeys/${e4.passkeyId}`, { headers: this.headers, noResolveJson: true }), { data: null, error: null };
    } catch (t72) {
      if (h(t72)) return { data: null, error: t72 };
      throw t72;
    }
  }
};
function Pe(i12 = {}) {
  return { getItem: (e4) => i12[e4] || null, setItem: (e4, t72) => {
    i12[e4] = t72;
  }, removeItem: (e4) => {
    delete i12[e4];
  } };
}
var U = { debug: !!(globalThis && ye() && globalThis.localStorage && globalThis.localStorage.getItem("supabase.gotrue-js.locks.debug") === "true") };
var V = class extends Error {
  constructor(e4) {
    super(e4), this.isAcquireTimeout = true;
  }
};
function gt() {
  if (typeof globalThis != "object") try {
    Object.defineProperty(Object.prototype, "__magic__", { get: function() {
      return this;
    }, configurable: true }), __magic__.globalThis = __magic__, delete Object.prototype.__magic__;
  } catch {
    typeof self < "u" && (self.globalThis = self);
  }
}
function je(i12) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(i12)) throw new Error(`@supabase/auth-js: Address "${i12}" is invalid.`);
  return i12.toLowerCase();
}
function wt(i12) {
  return parseInt(i12, 16);
}
function pt(i12) {
  let e4 = new TextEncoder().encode(i12);
  return "0x" + Array.from(e4, (r10) => r10.toString(16).padStart(2, "0")).join("");
}
function yt(i12) {
  var e4;
  let { chainId: t72, domain: r10, expirationTime: s8, issuedAt: n9 = /* @__PURE__ */ new Date(), nonce: o18, notBefore: a8, requestId: l8, resources: u8, scheme: c9, uri: w12, version: d5 } = i12;
  {
    if (!Number.isInteger(t72)) throw new Error(`@supabase/auth-js: Invalid SIWE message field "chainId". Chain ID must be a EIP-155 chain ID. Provided value: ${t72}`);
    if (!r10) throw new Error('@supabase/auth-js: Invalid SIWE message field "domain". Domain must be provided.');
    if (o18 && o18.length < 8) throw new Error(`@supabase/auth-js: Invalid SIWE message field "nonce". Nonce must be at least 8 characters. Provided value: ${o18}`);
    if (!w12) throw new Error('@supabase/auth-js: Invalid SIWE message field "uri". URI must be provided.');
    if (d5 !== "1") throw new Error(`@supabase/auth-js: Invalid SIWE message field "version". Version must be '1'. Provided value: ${d5}`);
    if (!((e4 = i12.statement) === null || e4 === void 0) && e4.includes(`
`)) throw new Error(`@supabase/auth-js: Invalid SIWE message field "statement". Statement must not include '\\n'. Provided value: ${i12.statement}`);
  }
  let _8 = je(i12.address), v6 = c9 ? `${c9}://${r10}` : r10, b7 = i12.statement ? `${i12.statement}
` : "", y11 = `${v6} wants you to sign in with your Ethereum account:
${_8}

${b7}`, m8 = `URI: ${w12}
Version: ${d5}
Chain ID: ${t72}${o18 ? `
Nonce: ${o18}` : ""}
Issued At: ${n9.toISOString()}`;
  if (s8 && (m8 += `
Expiration Time: ${s8.toISOString()}`), a8 && (m8 += `
Not Before: ${a8.toISOString()}`), l8 && (m8 += `
Request ID: ${l8}`), u8) {
    let p9 = `
Resources:`;
    for (let g6 of u8) {
      if (!g6 || typeof g6 != "string") throw new Error(`@supabase/auth-js: Invalid SIWE message field "resources". Every resource must be a valid string. Provided value: ${g6}`);
      p9 += `
- ${g6}`;
    }
    m8 += p9;
  }
  return `${y11}
${m8}`;
}
var S2 = class extends Error {
  constructor({ message: e4, code: t72, cause: r10, name: s8 }) {
    var n9;
    super(e4, { cause: r10 }), this.__isWebAuthnError = true, this.name = (n9 = s8 ?? (r10 instanceof Error ? r10.name : void 0)) !== null && n9 !== void 0 ? n9 : "Unknown Error", this.code = t72;
  }
  toJSON() {
    return { name: this.name, message: this.message, code: this.code };
  }
};
var Q = class extends S2 {
  constructor(e4, t72) {
    super({ code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: t72, message: e4 }), this.name = "WebAuthnUnknownError", this.originalError = t72;
  }
};
function vt({ error: i12, options: e4 }) {
  var t72, r10, s8;
  let { publicKey: n9 } = e4;
  if (!n9) throw Error("options was missing required publicKey property");
  if (i12.name === "AbortError") {
    if (e4.signal instanceof AbortSignal) return new S2({ message: "Registration ceremony was sent an abort signal", code: "ERROR_CEREMONY_ABORTED", cause: i12 });
  } else if (i12.name === "ConstraintError") {
    if (((t72 = n9.authenticatorSelection) === null || t72 === void 0 ? void 0 : t72.requireResidentKey) === true) return new S2({ message: "Discoverable credentials were required but no available authenticator supported it", code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT", cause: i12 });
    if (e4.mediation === "conditional" && ((r10 = n9.authenticatorSelection) === null || r10 === void 0 ? void 0 : r10.userVerification) === "required") return new S2({ message: "User verification was required during automatic registration but it could not be performed", code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE", cause: i12 });
    if (((s8 = n9.authenticatorSelection) === null || s8 === void 0 ? void 0 : s8.userVerification) === "required") return new S2({ message: "User verification was required but no available authenticator supported it", code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT", cause: i12 });
  } else {
    if (i12.name === "InvalidStateError") return new S2({ message: "The authenticator was previously registered", code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", cause: i12 });
    if (i12.name === "NotAllowedError") return new S2({ message: i12.message, code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: i12 });
    if (i12.name === "NotSupportedError") return n9.pubKeyCredParams.filter((a8) => a8.type === "public-key").length === 0 ? new S2({ message: 'No entry in pubKeyCredParams was of type "public-key"', code: "ERROR_MALFORMED_PUBKEYCREDPARAMS", cause: i12 }) : new S2({ message: "No available authenticator supported any of the specified pubKeyCredParams algorithms", code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG", cause: i12 });
    if (i12.name === "SecurityError") {
      let o18 = globalThis.location.hostname;
      if (Ue(o18)) {
        if (n9.rp.id !== o18) return new S2({ message: `The RP ID "${n9.rp.id}" is invalid for this domain`, code: "ERROR_INVALID_RP_ID", cause: i12 });
      } else return new S2({ message: `${globalThis.location.hostname} is an invalid domain`, code: "ERROR_INVALID_DOMAIN", cause: i12 });
    } else if (i12.name === "TypeError") {
      if (n9.user.id.byteLength < 1 || n9.user.id.byteLength > 64) return new S2({ message: "User ID was not between 1 and 64 characters", code: "ERROR_INVALID_USER_ID_LENGTH", cause: i12 });
    } else if (i12.name === "UnknownError") return new S2({ message: "The authenticator was unable to process the specified options, or could not create a new credential", code: "ERROR_AUTHENTICATOR_GENERAL_ERROR", cause: i12 });
  }
  return new S2({ message: "a Non-Webauthn related error has occurred", code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: i12 });
}
function bt({ error: i12, options: e4 }) {
  let { publicKey: t72 } = e4;
  if (!t72) throw Error("options was missing required publicKey property");
  if (i12.name === "AbortError") {
    if (e4.signal instanceof AbortSignal) return new S2({ message: "Authentication ceremony was sent an abort signal", code: "ERROR_CEREMONY_ABORTED", cause: i12 });
  } else {
    if (i12.name === "NotAllowedError") return new S2({ message: i12.message, code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: i12 });
    if (i12.name === "SecurityError") {
      let r10 = globalThis.location.hostname;
      if (Ue(r10)) {
        if (t72.rpId !== r10) return new S2({ message: `The RP ID "${t72.rpId}" is invalid for this domain`, code: "ERROR_INVALID_RP_ID", cause: i12 });
      } else return new S2({ message: `${globalThis.location.hostname} is an invalid domain`, code: "ERROR_INVALID_DOMAIN", cause: i12 });
    } else if (i12.name === "UnknownError") return new S2({ message: "The authenticator was unable to process the specified options, or could not create a new assertion signature", code: "ERROR_AUTHENTICATOR_GENERAL_ERROR", cause: i12 });
  }
  return new S2({ message: "a Non-Webauthn related error has occurred", code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: i12 });
}
var $e = class {
  createNewAbortSignal() {
    if (this.controller) {
      let t72 = new Error("Cancelling existing WebAuthn API call for new one");
      t72.name = "AbortError", this.controller.abort(t72);
    }
    let e4 = new AbortController();
    return this.controller = e4, e4.signal;
  }
  cancelCeremony() {
    if (this.controller) {
      let e4 = new Error("Manually cancelling existing WebAuthn API call");
      e4.name = "AbortError", this.controller.abort(e4), this.controller = void 0;
    }
  }
};
var Se = new $e();
function Ne(i12) {
  if (!i12) throw new Error("Credential creation options are required");
  if (typeof PublicKeyCredential < "u" && "parseCreationOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseCreationOptionsFromJSON == "function") return PublicKeyCredential.parseCreationOptionsFromJSON(i12);
  let { challenge: e4, user: t72, excludeCredentials: r10 } = i12, s8 = S(i12, ["challenge", "user", "excludeCredentials"]), n9 = B(e4).buffer, o18 = Object.assign(Object.assign({}, t72), { id: B(t72.id).buffer }), a8 = Object.assign(Object.assign({}, s8), { challenge: n9, user: o18 });
  if (r10 && r10.length > 0) {
    a8.excludeCredentials = new Array(r10.length);
    for (let l8 = 0; l8 < r10.length; l8++) {
      let u8 = r10[l8];
      a8.excludeCredentials[l8] = Object.assign(Object.assign({}, u8), { id: B(u8.id).buffer, type: u8.type || "public-key", transports: u8.transports });
    }
  }
  return a8;
}
function Le(i12) {
  if (!i12) throw new Error("Credential request options are required");
  if (typeof PublicKeyCredential < "u" && "parseRequestOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseRequestOptionsFromJSON == "function") return PublicKeyCredential.parseRequestOptionsFromJSON(i12);
  let { challenge: e4, allowCredentials: t72 } = i12, r10 = S(i12, ["challenge", "allowCredentials"]), s8 = B(e4).buffer, n9 = Object.assign(Object.assign({}, r10), { challenge: s8 });
  if (t72 && t72.length > 0) {
    n9.allowCredentials = new Array(t72.length);
    for (let o18 = 0; o18 < t72.length; o18++) {
      let a8 = t72[o18];
      n9.allowCredentials[o18] = Object.assign(Object.assign({}, a8), { id: B(a8.id).buffer, type: a8.type || "public-key", transports: a8.transports });
    }
  }
  return n9;
}
function De(i12) {
  var e4;
  if ("toJSON" in i12 && typeof i12.toJSON == "function") return i12.toJSON();
  let t72 = i12;
  return { id: i12.id, rawId: i12.id, response: { attestationObject: W(new Uint8Array(i12.response.attestationObject)), clientDataJSON: W(new Uint8Array(i12.response.clientDataJSON)) }, type: "public-key", clientExtensionResults: i12.getClientExtensionResults(), authenticatorAttachment: (e4 = t72.authenticatorAttachment) !== null && e4 !== void 0 ? e4 : void 0 };
}
function qe(i12) {
  var e4;
  if ("toJSON" in i12 && typeof i12.toJSON == "function") return i12.toJSON();
  let t72 = i12, r10 = i12.getClientExtensionResults(), s8 = i12.response;
  return { id: i12.id, rawId: i12.id, response: { authenticatorData: W(new Uint8Array(s8.authenticatorData)), clientDataJSON: W(new Uint8Array(s8.clientDataJSON)), signature: W(new Uint8Array(s8.signature)), userHandle: s8.userHandle ? W(new Uint8Array(s8.userHandle)) : void 0 }, type: "public-key", clientExtensionResults: r10, authenticatorAttachment: (e4 = t72.authenticatorAttachment) !== null && e4 !== void 0 ? e4 : void 0 };
}
function Ue(i12) {
  return i12 === "localhost" || /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(i12);
}
function he() {
  var i12, e4;
  return !!(T() && "PublicKeyCredential" in globalThis && globalThis.PublicKeyCredential && "credentials" in navigator && typeof ((i12 = navigator?.credentials) === null || i12 === void 0 ? void 0 : i12.create) == "function" && typeof ((e4 = navigator?.credentials) === null || e4 === void 0 ? void 0 : e4.get) == "function");
}
async function Ke(i12) {
  try {
    let e4 = await navigator.credentials.create(i12);
    return e4 ? e4 instanceof PublicKeyCredential ? { data: e4, error: null } : { data: null, error: new Q("Browser returned unexpected credential type", e4) } : { data: null, error: new Q("Empty credential response", e4) };
  } catch (e4) {
    return { data: null, error: vt({ error: e4, options: i12 }) };
  }
}
async function We(i12) {
  try {
    let e4 = await navigator.credentials.get(i12);
    return e4 ? e4 instanceof PublicKeyCredential ? { data: e4, error: null } : { data: null, error: new Q("Browser returned unexpected credential type", e4) } : { data: null, error: new Q("Empty credential response", e4) };
  } catch (e4) {
    return { data: null, error: bt({ error: e4, options: i12 }) };
  }
}
var Wt = { hints: ["security-key"], authenticatorSelection: { authenticatorAttachment: "cross-platform", requireResidentKey: false, userVerification: "preferred", residentKey: "discouraged" }, attestation: "direct" };
var Mt = { userVerification: "preferred", hints: ["security-key"], attestation: "direct" };
function ke(...i12) {
  let e4 = (s8) => s8 !== null && typeof s8 == "object" && !Array.isArray(s8), t72 = (s8) => s8 instanceof ArrayBuffer || ArrayBuffer.isView(s8), r10 = {};
  for (let s8 of i12) if (s8) for (let n9 in s8) {
    let o18 = s8[n9];
    if (o18 !== void 0) if (Array.isArray(o18)) r10[n9] = o18;
    else if (t72(o18)) r10[n9] = o18;
    else if (e4(o18)) {
      let a8 = r10[n9];
      e4(a8) ? r10[n9] = ke(a8, o18) : r10[n9] = ke(o18);
    } else r10[n9] = o18;
  }
  return r10;
}
function Gt(i12, e4) {
  return ke(Wt, i12, e4 || {});
}
function Bt(i12, e4) {
  return ke(Mt, i12, e4 || {});
}
var Re = class {
  constructor(e4) {
    this.client = e4, this.enroll = this._enroll.bind(this), this.challenge = this._challenge.bind(this), this.verify = this._verify.bind(this), this.authenticate = this._authenticate.bind(this), this.register = this._register.bind(this);
  }
  async _enroll(e4) {
    return this.client.mfa.enroll(Object.assign(Object.assign({}, e4), { factorType: "webauthn" }));
  }
  async _challenge({ factorId: e4, webauthn: t72, friendlyName: r10, signal: s8 }, n9) {
    var o18;
    try {
      let { data: a8, error: l8 } = await this.client.mfa.challenge({ factorId: e4, webauthn: t72 });
      if (!a8) return { data: null, error: l8 };
      let u8 = s8 ?? Se.createNewAbortSignal();
      if (a8.webauthn.type === "create") {
        let { user: c9 } = a8.webauthn.credential_options.publicKey;
        if (!c9.name) {
          let w12 = r10;
          if (w12) c9.name = `${c9.id}:${w12}`;
          else {
            let _8 = (await this.client.getUser()).data.user, v6 = ((o18 = _8?.user_metadata) === null || o18 === void 0 ? void 0 : o18.name) || _8?.email || _8?.id || "User";
            c9.name = `${c9.id}:${v6}`;
          }
        }
        c9.displayName || (c9.displayName = c9.name);
      }
      switch (a8.webauthn.type) {
        case "create": {
          let c9 = Gt(a8.webauthn.credential_options.publicKey, n9?.create), { data: w12, error: d5 } = await Ke({ publicKey: c9, signal: u8 });
          return w12 ? { data: { factorId: e4, challengeId: a8.id, webauthn: { type: a8.webauthn.type, credential_response: w12 } }, error: null } : { data: null, error: d5 };
        }
        case "request": {
          let c9 = Bt(a8.webauthn.credential_options.publicKey, n9?.request), { data: w12, error: d5 } = await We(Object.assign(Object.assign({}, a8.webauthn.credential_options), { publicKey: c9, signal: u8 }));
          return w12 ? { data: { factorId: e4, challengeId: a8.id, webauthn: { type: a8.webauthn.type, credential_response: w12 } }, error: null } : { data: null, error: d5 };
        }
      }
    } catch (a8) {
      return h(a8) ? { data: null, error: a8 } : { data: null, error: new x("Unexpected error in challenge", a8) };
    }
  }
  async _verify({ challengeId: e4, factorId: t72, webauthn: r10 }) {
    return this.client.mfa.verify({ factorId: t72, challengeId: e4, webauthn: r10 });
  }
  async _authenticate({ factorId: e4, webauthn: { rpId: t72 = typeof globalThis < "u" ? globalThis.location.hostname : void 0, rpOrigins: r10 = typeof globalThis < "u" ? [globalThis.location.origin] : void 0, signal: s8 } = {} }, n9) {
    if (!t72) return { data: null, error: new M("rpId is required for WebAuthn authentication") };
    try {
      if (!he()) return { data: null, error: new x("Browser does not support WebAuthn", null) };
      let { data: o18, error: a8 } = await this.challenge({ factorId: e4, webauthn: { rpId: t72, rpOrigins: r10 }, signal: s8 }, { request: n9 });
      if (!o18) return { data: null, error: a8 };
      let { webauthn: l8 } = o18;
      return this._verify({ factorId: e4, challengeId: o18.challengeId, webauthn: { type: l8.type, rpId: t72, rpOrigins: r10, credential_response: l8.credential_response } });
    } catch (o18) {
      return h(o18) ? { data: null, error: o18 } : { data: null, error: new x("Unexpected error in authenticate", o18) };
    }
  }
  async _register({ friendlyName: e4, webauthn: { rpId: t72 = typeof globalThis < "u" ? globalThis.location.hostname : void 0, rpOrigins: r10 = typeof globalThis < "u" ? [globalThis.location.origin] : void 0, signal: s8 } = {} }, n9) {
    if (!t72) return { data: null, error: new M("rpId is required for WebAuthn registration") };
    try {
      if (!he()) return { data: null, error: new x("Browser does not support WebAuthn", null) };
      let { data: o18, error: a8 } = await this._enroll({ friendlyName: e4 });
      if (!o18) return await this.client.mfa.listFactors().then((c9) => {
        var w12;
        return (w12 = c9.data) === null || w12 === void 0 ? void 0 : w12.all.find((d5) => d5.factor_type === "webauthn" && d5.friendly_name === e4 && d5.status !== "unverified");
      }).then((c9) => c9 ? this.client.mfa.unenroll({ factorId: c9?.id }) : void 0), { data: null, error: a8 };
      let { data: l8, error: u8 } = await this._challenge({ factorId: o18.id, friendlyName: o18.friendly_name, webauthn: { rpId: t72, rpOrigins: r10 }, signal: s8 }, { create: n9 });
      return l8 ? this._verify({ factorId: o18.id, challengeId: l8.challengeId, webauthn: { rpId: t72, rpOrigins: r10, type: l8.webauthn.type, credential_response: l8.webauthn.credential_response } }) : { data: null, error: u8 };
    } catch (o18) {
      return h(o18) ? { data: null, error: o18 } : { data: null, error: new x("Unexpected error in register", o18) };
    }
  }
};
gt();
var Ft = { url: Ge, storageKey: Be, autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, headers: Fe, flowType: "implicit", debug: false, hasCustomAuthorizationHeader: false, throwOnError: false, lockAcquireTimeout: 5e3, skipAutoInitialize: false, experimental: {} };
var re = {};
var Ee = class i2 {
  get jwks() {
    var e4, t72;
    return (t72 = (e4 = re[this.storageKey]) === null || e4 === void 0 ? void 0 : e4.jwks) !== null && t72 !== void 0 ? t72 : { keys: [] };
  }
  set jwks(e4) {
    re[this.storageKey] = Object.assign(Object.assign({}, re[this.storageKey]), { jwks: e4 });
  }
  get jwks_cached_at() {
    var e4, t72;
    return (t72 = (e4 = re[this.storageKey]) === null || e4 === void 0 ? void 0 : e4.cachedAt) !== null && t72 !== void 0 ? t72 : Number.MIN_SAFE_INTEGER;
  }
  set jwks_cached_at(e4) {
    re[this.storageKey] = Object.assign(Object.assign({}, re[this.storageKey]), { cachedAt: e4 });
  }
  constructor(e4) {
    var t72, r10, s8;
    this.userStorage = null, this.memoryStorage = null, this.stateChangeEmitters = /* @__PURE__ */ new Map(), this.autoRefreshTicker = null, this.autoRefreshTickTimeout = null, this.visibilityChangedCallback = null, this.refreshingDeferred = null, this._sessionRemovalEpoch = 0, this.initializePromise = null, this.detectSessionInUrl = true, this.hasCustomAuthorizationHeader = false, this.suppressGetSessionWarning = false, this.lock = null, this.lockAcquired = false, this.pendingInLock = [], this.broadcastChannel = null, this.logger = console.log;
    let n9 = Object.assign(Object.assign({}, Ft), e4);
    if (this.storageKey = n9.storageKey, this.instanceID = (t72 = i2.nextInstanceID[this.storageKey]) !== null && t72 !== void 0 ? t72 : 0, i2.nextInstanceID[this.storageKey] = this.instanceID + 1, this.logDebugMessages = !!n9.debug, typeof n9.debug == "function" && (this.logger = n9.debug), this.instanceID > 0 && T()) {
      let o18 = `${this._logPrefix()} Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`;
      console.warn(o18), this.logDebugMessages && console.trace(o18);
    }
    if (this.persistSession = n9.persistSession, this.autoRefreshToken = n9.autoRefreshToken, this.experimental = (r10 = n9.experimental) !== null && r10 !== void 0 ? r10 : {}, this.admin = new z({ url: n9.url, headers: n9.headers, fetch: n9.fetch, experimental: this.experimental }), this.url = n9.url, this.headers = n9.headers, this.fetch = ve(n9.fetch), this.detectSessionInUrl = n9.detectSessionInUrl, this.flowType = n9.flowType, this.hasCustomAuthorizationHeader = n9.hasCustomAuthorizationHeader, this.throwOnError = n9.throwOnError, this.lockAcquireTimeout = n9.lockAcquireTimeout, n9.lock != null && (this.lock = n9.lock), this.jwks || (this.jwks = { keys: [] }, this.jwks_cached_at = Number.MIN_SAFE_INTEGER), this.mfa = { verify: this._verify.bind(this), enroll: this._enroll.bind(this), unenroll: this._unenroll.bind(this), challenge: this._challenge.bind(this), listFactors: this._listFactors.bind(this), challengeAndVerify: this._challengeAndVerify.bind(this), getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this), webauthn: new Re(this) }, this.oauth = { getAuthorizationDetails: this._getAuthorizationDetails.bind(this), approveAuthorization: this._approveAuthorization.bind(this), denyAuthorization: this._denyAuthorization.bind(this), listGrants: this._listOAuthGrants.bind(this), revokeGrant: this._revokeOAuthGrant.bind(this) }, this.passkey = { startRegistration: this._startPasskeyRegistration.bind(this), verifyRegistration: this._verifyPasskeyRegistration.bind(this), startAuthentication: this._startPasskeyAuthentication.bind(this), verifyAuthentication: this._verifyPasskeyAuthentication.bind(this), list: this._listPasskeys.bind(this), update: this._updatePasskey.bind(this), delete: this._deletePasskey.bind(this) }, this.persistSession ? (n9.storage ? this.storage = n9.storage : ye() ? this.storage = globalThis.localStorage : (this.memoryStorage = {}, this.storage = Pe(this.memoryStorage)), n9.userStorage && (this.userStorage = n9.userStorage)) : (this.memoryStorage = {}, this.storage = Pe(this.memoryStorage)), T() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
      try {
        this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
      } catch (o18) {
        console.error("Failed to create a new BroadcastChannel, multi-tab state changes will not be available", o18);
      }
      (s8 = this.broadcastChannel) === null || s8 === void 0 || s8.addEventListener("message", async (o18) => {
        this._debug("received broadcast notification from other tab or client", o18);
        try {
          await this._notifyAllSubscribers(o18.data.event, o18.data.session, false);
        } catch (a8) {
          this._debug("#broadcastChannel", "error", a8);
        }
      });
    }
    n9.skipAutoInitialize || this.initialize().catch((o18) => {
      this._debug("#initialize()", "error", o18);
    });
  }
  isThrowOnErrorEnabled() {
    return this.throwOnError;
  }
  _returnResult(e4) {
    if (this.throwOnError && e4 && e4.error) throw e4.error;
    return e4;
  }
  _logPrefix() {
    return `GoTrueClient@${this.storageKey}:${this.instanceID} (${de}) ${(/* @__PURE__ */ new Date()).toISOString()}`;
  }
  _debug(...e4) {
    return this.logDebugMessages && this.logger(this._logPrefix(), ...e4), this;
  }
  async initialize() {
    return this.initializePromise ? await this.initializePromise : (this.initializePromise = (async () => this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._initialize()) : await this._initialize())(), await this.initializePromise);
  }
  async _initialize() {
    var e4;
    try {
      let t72 = {}, r10 = "none";
      if (T() && (t72 = st(globalThis.location.href), this._isImplicitGrantCallback(t72) ? r10 = "implicit" : await this._isPKCECallback(t72) && (r10 = "pkce")), T() && this.detectSessionInUrl && r10 !== "none") {
        let { data: s8, error: n9 } = await this._getSessionFromURL(t72, r10);
        if (n9) {
          if (this._debug("#_initialize()", "error detecting session from URL", n9), He(n9)) {
            let l8 = (e4 = n9.details) === null || e4 === void 0 ? void 0 : e4.code;
            if (l8 === "identity_already_exists" || l8 === "identity_not_found" || l8 === "single_identity_not_deletable") return { error: n9 };
          }
          return { error: n9 };
        }
        let { session: o18, redirectType: a8 } = s8;
        return this._debug("#_initialize()", "detected session in URL", o18, "redirect type", a8), await this._saveSession(o18), setTimeout(async () => {
          a8 === "recovery" ? await this._notifyAllSubscribers("PASSWORD_RECOVERY", o18) : await this._notifyAllSubscribers("SIGNED_IN", o18);
        }, 0), { error: null };
      }
      return await this._recoverAndRefresh(), { error: null };
    } catch (t72) {
      return h(t72) ? this._returnResult({ error: t72 }) : this._returnResult({ error: new x("Unexpected error during initialization", t72) });
    } finally {
      await this._handleVisibilityChange(), this._debug("#_initialize()", "end");
    }
  }
  async signInAnonymously(e4) {
    var t72, r10, s8;
    try {
      let n9 = await f(this.fetch, "POST", `${this.url}/signup`, { headers: this.headers, body: { data: (r10 = (t72 = e4?.options) === null || t72 === void 0 ? void 0 : t72.data) !== null && r10 !== void 0 ? r10 : {}, gotrue_meta_security: { captcha_token: (s8 = e4?.options) === null || s8 === void 0 ? void 0 : s8.captchaToken } }, xform: P }), { data: o18, error: a8 } = n9;
      if (a8 || !o18) return this._returnResult({ data: { user: null, session: null }, error: a8 });
      let l8 = o18.session, u8 = o18.user;
      return o18.session && (await this._saveSession(o18.session), await this._notifyAllSubscribers("SIGNED_IN", l8)), this._returnResult({ data: { user: u8, session: l8 }, error: null });
    } catch (n9) {
      if (h(n9)) return this._returnResult({ data: { user: null, session: null }, error: n9 });
      throw n9;
    }
  }
  async signUp(e4) {
    var t72, r10, s8;
    try {
      let n9;
      if ("email" in e4) {
        let { email: c9, password: w12, options: d5 } = e4, _8 = null, v6 = null;
        this.flowType === "pkce" && ([_8, v6] = await F2(this.storage, this.storageKey)), n9 = await f(this.fetch, "POST", `${this.url}/signup`, { headers: this.headers, redirectTo: d5?.emailRedirectTo, body: { email: c9, password: w12, data: (t72 = d5?.data) !== null && t72 !== void 0 ? t72 : {}, gotrue_meta_security: { captcha_token: d5?.captchaToken }, code_challenge: _8, code_challenge_method: v6 }, xform: P });
      } else if ("phone" in e4) {
        let { phone: c9, password: w12, options: d5 } = e4;
        n9 = await f(this.fetch, "POST", `${this.url}/signup`, { headers: this.headers, body: { phone: c9, password: w12, data: (r10 = d5?.data) !== null && r10 !== void 0 ? r10 : {}, channel: (s8 = d5?.channel) !== null && s8 !== void 0 ? s8 : "sms", gotrue_meta_security: { captcha_token: d5?.captchaToken } }, xform: P });
      } else throw new J("You must provide either an email or phone number and a password");
      let { data: o18, error: a8 } = n9;
      if (a8 || !o18) return await A(this.storage, `${this.storageKey}-code-verifier`), this._returnResult({ data: { user: null, session: null }, error: a8 });
      let l8 = o18.session, u8 = o18.user;
      return o18.session && (await this._saveSession(o18.session), await this._notifyAllSubscribers("SIGNED_IN", l8)), this._returnResult({ data: { user: u8, session: l8 }, error: null });
    } catch (n9) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(n9)) return this._returnResult({ data: { user: null, session: null }, error: n9 });
      throw n9;
    }
  }
  async signInWithPassword(e4) {
    try {
      let t72;
      if ("email" in e4) {
        let { email: n9, password: o18, options: a8 } = e4;
        t72 = await f(this.fetch, "POST", `${this.url}/token?grant_type=password`, { headers: this.headers, body: { email: n9, password: o18, gotrue_meta_security: { captcha_token: a8?.captchaToken } }, xform: xe });
      } else if ("phone" in e4) {
        let { phone: n9, password: o18, options: a8 } = e4;
        t72 = await f(this.fetch, "POST", `${this.url}/token?grant_type=password`, { headers: this.headers, body: { phone: n9, password: o18, gotrue_meta_security: { captcha_token: a8?.captchaToken } }, xform: xe });
      } else throw new J("You must provide either an email or phone number and a password");
      let { data: r10, error: s8 } = t72;
      if (s8) return this._returnResult({ data: { user: null, session: null }, error: s8 });
      if (!r10 || !r10.session || !r10.user) {
        let n9 = new K();
        return this._returnResult({ data: { user: null, session: null }, error: n9 });
      }
      return r10.session && (await this._saveSession(r10.session), await this._notifyAllSubscribers("SIGNED_IN", r10.session)), this._returnResult({ data: Object.assign({ user: r10.user, session: r10.session }, r10.weak_password ? { weakPassword: r10.weak_password } : null), error: s8 });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: { user: null, session: null }, error: t72 });
      throw t72;
    }
  }
  async signInWithOAuth(e4) {
    var t72, r10, s8, n9;
    return await this._handleProviderSignIn(e4.provider, { redirectTo: (t72 = e4.options) === null || t72 === void 0 ? void 0 : t72.redirectTo, scopes: (r10 = e4.options) === null || r10 === void 0 ? void 0 : r10.scopes, queryParams: (s8 = e4.options) === null || s8 === void 0 ? void 0 : s8.queryParams, skipBrowserRedirect: (n9 = e4.options) === null || n9 === void 0 ? void 0 : n9.skipBrowserRedirect });
  }
  async exchangeCodeForSession(e4) {
    return await this.initializePromise, this.lock != null ? this._acquireLock(this.lockAcquireTimeout, async () => this._exchangeCodeForSession(e4)) : this._exchangeCodeForSession(e4);
  }
  async signInWithWeb3(e4) {
    let { chain: t72 } = e4;
    switch (t72) {
      case "ethereum":
        return await this.signInWithEthereum(e4);
      case "solana":
        return await this.signInWithSolana(e4);
      default:
        throw new Error(`@supabase/auth-js: Unsupported chain "${t72}"`);
    }
  }
  async signInWithEthereum(e4) {
    var t72, r10, s8, n9, o18, a8, l8, u8, c9, w12, d5;
    let _8, v6;
    if ("message" in e4) _8 = e4.message, v6 = e4.signature;
    else {
      let { chain: b7, wallet: y11, statement: m8, options: p9 } = e4, g6;
      if (T()) if (typeof y11 == "object") g6 = y11;
      else {
        let D10 = globalThis;
        if ("ethereum" in D10 && typeof D10.ethereum == "object" && "request" in D10.ethereum && typeof D10.ethereum.request == "function") g6 = D10.ethereum;
        else throw new Error("@supabase/auth-js: No compatible Ethereum wallet interface on the window object (window.ethereum) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'ethereum', wallet: resolvedUserWallet }) instead.");
      }
      else {
        if (typeof y11 != "object" || !p9?.url) throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
        g6 = y11;
      }
      let R8 = new URL((t72 = p9?.url) !== null && t72 !== void 0 ? t72 : globalThis.location.href), j10 = await g6.request({ method: "eth_requestAccounts" }).then((D10) => D10).catch(() => {
        throw new Error("@supabase/auth-js: Wallet method eth_requestAccounts is missing or invalid");
      });
      if (!j10 || j10.length === 0) throw new Error("@supabase/auth-js: No accounts available. Please ensure the wallet is connected.");
      let k6 = je(j10[0]), I9 = (r10 = p9?.signInWithEthereum) === null || r10 === void 0 ? void 0 : r10.chainId;
      if (!I9) {
        let D10 = await g6.request({ method: "eth_chainId" });
        I9 = wt(D10);
      }
      let kt3 = { domain: R8.host, address: k6, statement: m8, uri: R8.href, version: "1", chainId: I9, nonce: (s8 = p9?.signInWithEthereum) === null || s8 === void 0 ? void 0 : s8.nonce, issuedAt: (o18 = (n9 = p9?.signInWithEthereum) === null || n9 === void 0 ? void 0 : n9.issuedAt) !== null && o18 !== void 0 ? o18 : /* @__PURE__ */ new Date(), expirationTime: (a8 = p9?.signInWithEthereum) === null || a8 === void 0 ? void 0 : a8.expirationTime, notBefore: (l8 = p9?.signInWithEthereum) === null || l8 === void 0 ? void 0 : l8.notBefore, requestId: (u8 = p9?.signInWithEthereum) === null || u8 === void 0 ? void 0 : u8.requestId, resources: (c9 = p9?.signInWithEthereum) === null || c9 === void 0 ? void 0 : c9.resources };
      _8 = yt(kt3), v6 = await g6.request({ method: "personal_sign", params: [pt(_8), k6] });
    }
    try {
      let { data: b7, error: y11 } = await f(this.fetch, "POST", `${this.url}/token?grant_type=web3`, { headers: this.headers, body: Object.assign({ chain: "ethereum", message: _8, signature: v6 }, !((w12 = e4.options) === null || w12 === void 0) && w12.captchaToken ? { gotrue_meta_security: { captcha_token: (d5 = e4.options) === null || d5 === void 0 ? void 0 : d5.captchaToken } } : null), xform: P });
      if (y11) throw y11;
      if (!b7 || !b7.session || !b7.user) {
        let m8 = new K();
        return this._returnResult({ data: { user: null, session: null }, error: m8 });
      }
      return b7.session && (await this._saveSession(b7.session), await this._notifyAllSubscribers("SIGNED_IN", b7.session)), this._returnResult({ data: Object.assign({}, b7), error: y11 });
    } catch (b7) {
      if (h(b7)) return this._returnResult({ data: { user: null, session: null }, error: b7 });
      throw b7;
    }
  }
  async signInWithSolana(e4) {
    var t72, r10, s8, n9, o18, a8, l8, u8, c9, w12, d5, _8;
    let v6, b7;
    if ("message" in e4) v6 = e4.message, b7 = e4.signature;
    else {
      let { chain: y11, wallet: m8, statement: p9, options: g6 } = e4, R8;
      if (T()) if (typeof m8 == "object") R8 = m8;
      else {
        let k6 = globalThis;
        if ("solana" in k6 && typeof k6.solana == "object" && ("signIn" in k6.solana && typeof k6.solana.signIn == "function" || "signMessage" in k6.solana && typeof k6.solana.signMessage == "function")) R8 = k6.solana;
        else throw new Error("@supabase/auth-js: No compatible Solana wallet interface on the window object (window.solana) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'solana', wallet: resolvedUserWallet }) instead.");
      }
      else {
        if (typeof m8 != "object" || !g6?.url) throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
        R8 = m8;
      }
      let j10 = new URL((t72 = g6?.url) !== null && t72 !== void 0 ? t72 : globalThis.location.href);
      if ("signIn" in R8 && R8.signIn) {
        let k6 = await R8.signIn(Object.assign(Object.assign(Object.assign({ issuedAt: (/* @__PURE__ */ new Date()).toISOString() }, g6?.signInWithSolana), { version: "1", domain: j10.host, uri: j10.href }), p9 ? { statement: p9 } : null)), I9;
        if (Array.isArray(k6) && k6[0] && typeof k6[0] == "object") I9 = k6[0];
        else if (k6 && typeof k6 == "object" && "signedMessage" in k6 && "signature" in k6) I9 = k6;
        else throw new Error("@supabase/auth-js: Wallet method signIn() returned unrecognized value");
        if ("signedMessage" in I9 && "signature" in I9 && (typeof I9.signedMessage == "string" || I9.signedMessage instanceof Uint8Array) && I9.signature instanceof Uint8Array) v6 = typeof I9.signedMessage == "string" ? I9.signedMessage : new TextDecoder().decode(I9.signedMessage), b7 = I9.signature;
        else throw new Error("@supabase/auth-js: Wallet method signIn() API returned object without signedMessage and signature fields");
      } else {
        if (!("signMessage" in R8) || typeof R8.signMessage != "function" || !("publicKey" in R8) || typeof R8 != "object" || !R8.publicKey || !("toBase58" in R8.publicKey) || typeof R8.publicKey.toBase58 != "function") throw new Error("@supabase/auth-js: Wallet does not have a compatible signMessage() and publicKey.toBase58() API");
        v6 = [`${j10.host} wants you to sign in with your Solana account:`, R8.publicKey.toBase58(), ...p9 ? ["", p9, ""] : [""], "Version: 1", `URI: ${j10.href}`, `Issued At: ${(s8 = (r10 = g6?.signInWithSolana) === null || r10 === void 0 ? void 0 : r10.issuedAt) !== null && s8 !== void 0 ? s8 : (/* @__PURE__ */ new Date()).toISOString()}`, ...!((n9 = g6?.signInWithSolana) === null || n9 === void 0) && n9.notBefore ? [`Not Before: ${g6.signInWithSolana.notBefore}`] : [], ...!((o18 = g6?.signInWithSolana) === null || o18 === void 0) && o18.expirationTime ? [`Expiration Time: ${g6.signInWithSolana.expirationTime}`] : [], ...!((a8 = g6?.signInWithSolana) === null || a8 === void 0) && a8.chainId ? [`Chain ID: ${g6.signInWithSolana.chainId}`] : [], ...!((l8 = g6?.signInWithSolana) === null || l8 === void 0) && l8.nonce ? [`Nonce: ${g6.signInWithSolana.nonce}`] : [], ...!((u8 = g6?.signInWithSolana) === null || u8 === void 0) && u8.requestId ? [`Request ID: ${g6.signInWithSolana.requestId}`] : [], ...!((w12 = (c9 = g6?.signInWithSolana) === null || c9 === void 0 ? void 0 : c9.resources) === null || w12 === void 0) && w12.length ? ["Resources", ...g6.signInWithSolana.resources.map((I9) => `- ${I9}`)] : []].join(`
`);
        let k6 = await R8.signMessage(new TextEncoder().encode(v6), "utf8");
        if (!k6 || !(k6 instanceof Uint8Array)) throw new Error("@supabase/auth-js: Wallet signMessage() API returned an recognized value");
        b7 = k6;
      }
    }
    try {
      let { data: y11, error: m8 } = await f(this.fetch, "POST", `${this.url}/token?grant_type=web3`, { headers: this.headers, body: Object.assign({ chain: "solana", message: v6, signature: W(b7) }, !((d5 = e4.options) === null || d5 === void 0) && d5.captchaToken ? { gotrue_meta_security: { captcha_token: (_8 = e4.options) === null || _8 === void 0 ? void 0 : _8.captchaToken } } : null), xform: P });
      if (m8) throw m8;
      if (!y11 || !y11.session || !y11.user) {
        let p9 = new K();
        return this._returnResult({ data: { user: null, session: null }, error: p9 });
      }
      return y11.session && (await this._saveSession(y11.session), await this._notifyAllSubscribers("SIGNED_IN", y11.session)), this._returnResult({ data: Object.assign({}, y11), error: m8 });
    } catch (y11) {
      if (h(y11)) return this._returnResult({ data: { user: null, session: null }, error: y11 });
      throw y11;
    }
  }
  async _exchangeCodeForSession(e4) {
    let t72 = await $(this.storage, `${this.storageKey}-code-verifier`), [r10, s8] = (t72 ?? "").split("/");
    try {
      if (!r10 && this.flowType === "pkce") throw new ge();
      let { data: n9, error: o18 } = await f(this.fetch, "POST", `${this.url}/token?grant_type=pkce`, { headers: this.headers, body: { auth_code: e4, code_verifier: r10 }, xform: P });
      if (await A(this.storage, `${this.storageKey}-code-verifier`), o18) throw o18;
      if (!n9 || !n9.session || !n9.user) {
        let a8 = new K();
        return this._returnResult({ data: { user: null, session: null, redirectType: null }, error: a8 });
      }
      return n9.session && (await this._saveSession(n9.session), await this._notifyAllSubscribers(s8 === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", n9.session)), this._returnResult({ data: Object.assign(Object.assign({}, n9), { redirectType: s8 ?? null }), error: o18 });
    } catch (n9) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(n9)) return this._returnResult({ data: { user: null, session: null, redirectType: null }, error: n9 });
      throw n9;
    }
  }
  async signInWithIdToken(e4) {
    try {
      let { options: t72, provider: r10, token: s8, access_token: n9, nonce: o18 } = e4, a8 = await f(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, { headers: this.headers, body: { provider: r10, id_token: s8, access_token: n9, nonce: o18, gotrue_meta_security: { captcha_token: t72?.captchaToken } }, xform: P }), { data: l8, error: u8 } = a8;
      if (u8) return this._returnResult({ data: { user: null, session: null }, error: u8 });
      if (!l8 || !l8.session || !l8.user) {
        let c9 = new K();
        return this._returnResult({ data: { user: null, session: null }, error: c9 });
      }
      return l8.session && (await this._saveSession(l8.session), await this._notifyAllSubscribers("SIGNED_IN", l8.session)), this._returnResult({ data: l8, error: u8 });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: { user: null, session: null }, error: t72 });
      throw t72;
    }
  }
  async signInWithOtp(e4) {
    var t72, r10, s8, n9, o18;
    try {
      if ("email" in e4) {
        let { email: a8, options: l8 } = e4, u8 = null, c9 = null;
        this.flowType === "pkce" && ([u8, c9] = await F2(this.storage, this.storageKey));
        let { error: w12 } = await f(this.fetch, "POST", `${this.url}/otp`, { headers: this.headers, body: { email: a8, data: (t72 = l8?.data) !== null && t72 !== void 0 ? t72 : {}, create_user: (r10 = l8?.shouldCreateUser) !== null && r10 !== void 0 ? r10 : true, gotrue_meta_security: { captcha_token: l8?.captchaToken }, code_challenge: u8, code_challenge_method: c9 }, redirectTo: l8?.emailRedirectTo });
        return this._returnResult({ data: { user: null, session: null }, error: w12 });
      }
      if ("phone" in e4) {
        let { phone: a8, options: l8 } = e4, { data: u8, error: c9 } = await f(this.fetch, "POST", `${this.url}/otp`, { headers: this.headers, body: { phone: a8, data: (s8 = l8?.data) !== null && s8 !== void 0 ? s8 : {}, create_user: (n9 = l8?.shouldCreateUser) !== null && n9 !== void 0 ? n9 : true, gotrue_meta_security: { captcha_token: l8?.captchaToken }, channel: (o18 = l8?.channel) !== null && o18 !== void 0 ? o18 : "sms" } });
        return this._returnResult({ data: { user: null, session: null, messageId: u8?.message_id }, error: c9 });
      }
      throw new J("You must provide either an email or phone number.");
    } catch (a8) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(a8)) return this._returnResult({ data: { user: null, session: null }, error: a8 });
      throw a8;
    }
  }
  async verifyOtp(e4) {
    var t72, r10;
    try {
      let s8, n9;
      "options" in e4 && (s8 = (t72 = e4.options) === null || t72 === void 0 ? void 0 : t72.redirectTo, n9 = (r10 = e4.options) === null || r10 === void 0 ? void 0 : r10.captchaToken);
      let { data: o18, error: a8 } = await f(this.fetch, "POST", `${this.url}/verify`, { headers: this.headers, body: Object.assign(Object.assign({}, e4), { gotrue_meta_security: { captcha_token: n9 } }), redirectTo: s8, xform: P });
      if (a8) throw a8;
      if (!o18) throw new Error("An error occurred on token verification.");
      let l8 = o18.session, u8 = o18.user;
      return l8?.access_token && (await this._saveSession(l8), await this._notifyAllSubscribers(e4.type == "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", l8)), this._returnResult({ data: { user: u8, session: l8 }, error: null });
    } catch (s8) {
      if (h(s8)) return this._returnResult({ data: { user: null, session: null }, error: s8 });
      throw s8;
    }
  }
  async signInWithSSO(e4) {
    var t72, r10, s8, n9, o18;
    try {
      let a8 = null, l8 = null;
      this.flowType === "pkce" && ([a8, l8] = await F2(this.storage, this.storageKey));
      let u8 = await f(this.fetch, "POST", `${this.url}/sso`, { body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, "providerId" in e4 ? { provider_id: e4.providerId } : null), "domain" in e4 ? { domain: e4.domain } : null), { redirect_to: (r10 = (t72 = e4.options) === null || t72 === void 0 ? void 0 : t72.redirectTo) !== null && r10 !== void 0 ? r10 : void 0 }), !((s8 = e4?.options) === null || s8 === void 0) && s8.captchaToken ? { gotrue_meta_security: { captcha_token: e4.options.captchaToken } } : null), { skip_http_redirect: true, code_challenge: a8, code_challenge_method: l8 }), headers: this.headers, xform: dt });
      return !((n9 = u8.data) === null || n9 === void 0) && n9.url && T() && !(!((o18 = e4.options) === null || o18 === void 0) && o18.skipBrowserRedirect) && globalThis.location.assign(u8.data.url), this._returnResult(u8);
    } catch (a8) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(a8)) return this._returnResult({ data: null, error: a8 });
      throw a8;
    }
  }
  async reauthenticate() {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._reauthenticate()) : await this._reauthenticate();
  }
  async _reauthenticate() {
    try {
      return await this._useSession(async (e4) => {
        let { data: { session: t72 }, error: r10 } = e4;
        if (r10) throw r10;
        if (!t72) throw new E();
        let { error: s8 } = await f(this.fetch, "GET", `${this.url}/reauthenticate`, { headers: this.headers, jwt: t72.access_token });
        return this._returnResult({ data: { user: null, session: null }, error: s8 });
      });
    } catch (e4) {
      if (h(e4)) return this._returnResult({ data: { user: null, session: null }, error: e4 });
      throw e4;
    }
  }
  async resend(e4) {
    try {
      let t72 = `${this.url}/resend`;
      if ("email" in e4) {
        let { email: r10, type: s8, options: n9 } = e4, o18 = null, a8 = null;
        this.flowType === "pkce" && ([o18, a8] = await F2(this.storage, this.storageKey));
        let { error: l8 } = await f(this.fetch, "POST", t72, { headers: this.headers, body: { email: r10, type: s8, gotrue_meta_security: { captcha_token: n9?.captchaToken }, code_challenge: o18, code_challenge_method: a8 }, redirectTo: n9?.emailRedirectTo });
        return l8 && await A(this.storage, `${this.storageKey}-code-verifier`), this._returnResult({ data: { user: null, session: null }, error: l8 });
      } else if ("phone" in e4) {
        let { phone: r10, type: s8, options: n9 } = e4, { data: o18, error: a8 } = await f(this.fetch, "POST", t72, { headers: this.headers, body: { phone: r10, type: s8, gotrue_meta_security: { captcha_token: n9?.captchaToken } } });
        return this._returnResult({ data: { user: null, session: null, messageId: o18?.message_id }, error: a8 });
      }
      throw new J("You must provide either an email or phone number and a type");
    } catch (t72) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(t72)) return this._returnResult({ data: { user: null, session: null }, error: t72 });
      throw t72;
    }
  }
  async getSession() {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => this._useSession(async (e4) => e4)) : await this._useSession(async (e4) => e4);
  }
  async _acquireLock(e4, t72) {
    this._debug("#_acquireLock", "begin", e4);
    try {
      if (this.lockAcquired) {
        let r10 = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve(), s8 = (async () => (await r10, await t72()))();
        return this.pendingInLock.push((async () => {
          try {
            await s8;
          } catch {
          }
        })()), s8;
      }
      return await this.lock(`lock:${this.storageKey}`, e4, async () => {
        this._debug("#_acquireLock", "lock acquired for storage key", this.storageKey);
        try {
          this.lockAcquired = true;
          let r10 = t72();
          for (this.pendingInLock.push((async () => {
            try {
              await r10;
            } catch {
            }
          })()), await r10; this.pendingInLock.length; ) {
            let s8 = [...this.pendingInLock];
            await Promise.all(s8), this.pendingInLock.splice(0, s8.length);
          }
          return await r10;
        } finally {
          this._debug("#_acquireLock", "lock released for storage key", this.storageKey), this.lockAcquired = false;
        }
      });
    } finally {
      this._debug("#_acquireLock", "end");
    }
  }
  async _useSession(e4) {
    this._debug("#_useSession", "begin");
    try {
      let t72 = await this.__loadSession();
      return await e4(t72);
    } finally {
      this._debug("#_useSession", "end");
    }
  }
  async __loadSession() {
    this._debug("#__loadSession()", "begin"), this.lock != null && !this.lockAcquired && this._debug("#__loadSession()", "used outside of an acquired lock!", new Error().stack);
    try {
      let e4 = null, t72 = await $(this.storage, this.storageKey);
      if (this._debug("#getSession()", "session from storage", t72), t72 !== null && (this._isValidSession(t72) ? e4 = t72 : (this._debug("#getSession()", "session from storage is not valid"), await this._removeSession())), !e4) return { data: { session: null }, error: null };
      let r10 = e4.expires_at ? e4.expires_at * 1e3 - Date.now() < fe : false;
      if (this._debug("#__loadSession()", `session has${r10 ? "" : " not"} expired`, "expires_at", e4.expires_at), !r10) {
        if (this.userStorage) {
          let o18 = await $(this.userStorage, this.storageKey + "-user");
          o18?.user ? e4.user = o18.user : e4.user = be();
        }
        if (this.storage.isServer && e4.user && !e4.user.__isUserNotAvailableProxy) {
          let o18 = { value: this.suppressGetSessionWarning };
          e4.user = ct(e4.user, o18), o18.value && (this.suppressGetSessionWarning = true);
        }
        return { data: { session: e4 }, error: null };
      }
      let { data: s8, error: n9 } = await this._callRefreshToken(e4.refresh_token);
      return n9 ? this._returnResult({ data: { session: null }, error: n9 }) : this._returnResult({ data: { session: s8 }, error: null });
    } finally {
      this._debug("#__loadSession()", "end");
    }
  }
  async getUser(e4) {
    if (e4) return await this._getUser(e4);
    await this.initializePromise;
    let t72;
    return this.lock != null ? t72 = await this._acquireLock(this.lockAcquireTimeout, async () => await this._getUser()) : t72 = await this._getUser(), t72.data.user && (this.suppressGetSessionWarning = true), t72;
  }
  async _getUser(e4) {
    try {
      return e4 ? await f(this.fetch, "GET", `${this.url}/user`, { headers: this.headers, jwt: e4, xform: L }) : await this._useSession(async (t72) => {
        var r10, s8, n9;
        let { data: o18, error: a8 } = t72;
        if (a8) throw a8;
        return !(!((r10 = o18.session) === null || r10 === void 0) && r10.access_token) && !this.hasCustomAuthorizationHeader ? { data: { user: null }, error: new E() } : await f(this.fetch, "GET", `${this.url}/user`, { headers: this.headers, jwt: (n9 = (s8 = o18.session) === null || s8 === void 0 ? void 0 : s8.access_token) !== null && n9 !== void 0 ? n9 : void 0, xform: L });
      });
    } catch (t72) {
      if (h(t72)) return ae(t72) && (await this._removeSession(), await A(this.storage, `${this.storageKey}-code-verifier`)), this._returnResult({ data: { user: null }, error: t72 });
      throw t72;
    }
  }
  async updateUser(e4, t72 = {}) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._updateUser(e4, t72)) : await this._updateUser(e4, t72);
  }
  async _updateUser(e4, t72 = {}) {
    try {
      return await this._useSession(async (r10) => {
        let { data: s8, error: n9 } = r10;
        if (n9) throw n9;
        if (!s8.session) throw new E();
        let o18 = s8.session, a8 = null, l8 = null;
        this.flowType === "pkce" && e4.email != null && ([a8, l8] = await F2(this.storage, this.storageKey));
        let { data: u8, error: c9 } = await f(this.fetch, "PUT", `${this.url}/user`, { headers: this.headers, redirectTo: t72?.emailRedirectTo, body: Object.assign(Object.assign({}, e4), { code_challenge: a8, code_challenge_method: l8 }), jwt: o18.access_token, xform: L });
        if (c9) throw c9;
        return o18.user = u8.user, await this._saveSession(o18), await this._notifyAllSubscribers("USER_UPDATED", o18), this._returnResult({ data: { user: o18.user }, error: null });
      });
    } catch (r10) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(r10)) return this._returnResult({ data: { user: null }, error: r10 });
      throw r10;
    }
  }
  async setSession(e4) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._setSession(e4)) : await this._setSession(e4);
  }
  async _setSession(e4) {
    try {
      if (!e4.access_token || !e4.refresh_token) throw new E();
      let t72 = Date.now() / 1e3, r10 = t72, s8 = true, n9 = null, { payload: o18 } = ue(e4.access_token);
      if (o18.exp && (r10 = o18.exp, s8 = r10 <= t72), s8) {
        let { data: a8, error: l8 } = await this._callRefreshToken(e4.refresh_token);
        if (l8) return this._returnResult({ data: { user: null, session: null }, error: l8 });
        if (!a8) return { data: { user: null, session: null }, error: null };
        n9 = a8;
      } else {
        let { data: a8, error: l8 } = await this._getUser(e4.access_token);
        if (l8) return this._returnResult({ data: { user: null, session: null }, error: l8 });
        n9 = { access_token: e4.access_token, refresh_token: e4.refresh_token, user: a8.user, token_type: "bearer", expires_in: r10 - t72, expires_at: r10 }, await this._saveSession(n9), await this._notifyAllSubscribers("SIGNED_IN", n9);
      }
      return this._returnResult({ data: { user: n9.user, session: n9 }, error: null });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: { session: null, user: null }, error: t72 });
      throw t72;
    }
  }
  async refreshSession(e4) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._refreshSession(e4)) : await this._refreshSession(e4);
  }
  async _refreshSession(e4) {
    try {
      return await this._useSession(async (t72) => {
        var r10;
        if (!e4) {
          let { data: o18, error: a8 } = t72;
          if (a8) throw a8;
          e4 = (r10 = o18.session) !== null && r10 !== void 0 ? r10 : void 0;
        }
        if (!e4?.refresh_token) throw new E();
        let { data: s8, error: n9 } = await this._callRefreshToken(e4.refresh_token);
        return n9 ? this._returnResult({ data: { user: null, session: null }, error: n9 }) : s8 ? this._returnResult({ data: { user: s8.user, session: s8 }, error: null }) : this._returnResult({ data: { user: null, session: null }, error: null });
      });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: { user: null, session: null }, error: t72 });
      throw t72;
    }
  }
  async _getSessionFromURL(e4, t72) {
    var r10;
    try {
      if (!T()) throw new H("No browser detected.");
      if (e4.error || e4.error_description || e4.error_code) throw new H(e4.error_description || "Error in URL with unspecified error_description", { error: e4.error || "unspecified_error", code: e4.error_code || "unspecified_code" });
      switch (t72) {
        case "implicit":
          if (this.flowType === "pkce") throw new ie("Not a valid PKCE flow url.");
          break;
        case "pkce":
          if (this.flowType === "implicit") throw new H("Not a valid implicit grant flow url.");
          break;
        default:
      }
      if (t72 === "pkce") {
        if (this._debug("#_initialize()", "begin", "is PKCE flow", true), !e4.code) throw new ie("No code detected.");
        let { data: g6, error: R8 } = await this._exchangeCodeForSession(e4.code);
        if (R8) throw R8;
        let j10 = new URL(globalThis.location.href);
        return j10.searchParams.delete("code"), globalThis.history.replaceState(globalThis.history.state, "", j10.toString()), { data: { session: g6.session, redirectType: (r10 = g6.redirectType) !== null && r10 !== void 0 ? r10 : null }, error: null };
      }
      let { provider_token: s8, provider_refresh_token: n9, access_token: o18, refresh_token: a8, expires_in: l8, expires_at: u8, token_type: c9 } = e4;
      if (!o18 || !l8 || !a8 || !c9) throw new H("No session defined in URL");
      let w12 = Math.round(Date.now() / 1e3), d5 = parseInt(l8), _8 = w12 + d5;
      u8 && (_8 = parseInt(u8));
      let v6 = _8 - w12;
      v6 * 1e3 <= q && console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${v6}s, should have been closer to ${d5}s`);
      let b7 = _8 - d5;
      w12 - b7 >= 120 ? console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale", b7, _8, w12) : w12 - b7 < 0 && console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew", b7, _8, w12);
      let { data: y11, error: m8 } = await this._getUser(o18);
      if (m8) throw m8;
      let p9 = { provider_token: s8, provider_refresh_token: n9, access_token: o18, expires_in: d5, expires_at: _8, refresh_token: a8, token_type: c9, user: y11.user };
      return globalThis.location.hash = "", this._debug("#_getSessionFromURL()", "clearing window.location.hash"), this._returnResult({ data: { session: p9, redirectType: e4.type }, error: null });
    } catch (s8) {
      if (h(s8)) return this._returnResult({ data: { session: null, redirectType: null }, error: s8 });
      throw s8;
    }
  }
  _isImplicitGrantCallback(e4) {
    return typeof this.detectSessionInUrl == "function" ? this.detectSessionInUrl(new URL(globalThis.location.href), e4) : !!(e4.access_token || e4.error || e4.error_description || e4.error_code);
  }
  async _isPKCECallback(e4) {
    let t72 = await $(this.storage, `${this.storageKey}-code-verifier`);
    return !!(e4.code && t72);
  }
  async signOut(e4 = { scope: "global" }) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._signOut(e4)) : await this._signOut(e4);
  }
  async _signOut({ scope: e4 } = { scope: "global" }) {
    return await this._useSession(async (t72) => {
      var r10;
      let { data: s8, error: n9 } = t72;
      if (n9 && !ae(n9)) return this._returnResult({ error: n9 });
      let o18 = (r10 = s8.session) === null || r10 === void 0 ? void 0 : r10.access_token;
      if (o18) {
        let { error: a8 } = await this.admin.signOut(o18, e4);
        if (a8 && !(Je(a8) && (a8.status === 404 || a8.status === 401 || a8.status === 403) || ae(a8))) return this._returnResult({ error: a8 });
      }
      return e4 !== "others" && (await this._removeSession(), await A(this.storage, `${this.storageKey}-code-verifier`)), this._returnResult({ error: null });
    });
  }
  onAuthStateChange(e4) {
    let t72 = rt(), r10 = { id: t72, callback: e4, unsubscribe: () => {
      this._debug("#unsubscribe()", "state change callback with id removed", t72), this.stateChangeEmitters.delete(t72);
    } };
    return this._debug("#onAuthStateChange()", "registered callback with id", t72), this.stateChangeEmitters.set(t72, r10), (async () => (await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => {
      this._emitInitialSession(t72);
    }) : await this._emitInitialSession(t72)))(), { data: { subscription: r10 } };
  }
  async _emitInitialSession(e4) {
    return await this._useSession(async (t72) => {
      var r10, s8;
      try {
        let { data: { session: n9 }, error: o18 } = t72;
        if (o18) throw o18;
        await ((r10 = this.stateChangeEmitters.get(e4)) === null || r10 === void 0 ? void 0 : r10.callback("INITIAL_SESSION", n9)), this._debug("INITIAL_SESSION", "callback id", e4, "session", n9);
      } catch (n9) {
        await ((s8 = this.stateChangeEmitters.get(e4)) === null || s8 === void 0 ? void 0 : s8.callback("INITIAL_SESSION", null)), this._debug("INITIAL_SESSION", "callback id", e4, "error", n9), ae(n9) ? console.warn(n9) : console.error(n9);
      }
    });
  }
  async resetPasswordForEmail(e4, t72 = {}) {
    let r10 = null, s8 = null;
    this.flowType === "pkce" && ([r10, s8] = await F2(this.storage, this.storageKey, true));
    try {
      return await f(this.fetch, "POST", `${this.url}/recover`, { body: { email: e4, code_challenge: r10, code_challenge_method: s8, gotrue_meta_security: { captcha_token: t72.captchaToken } }, headers: this.headers, redirectTo: t72.redirectTo });
    } catch (n9) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(n9)) return this._returnResult({ data: null, error: n9 });
      throw n9;
    }
  }
  async getUserIdentities() {
    var e4;
    try {
      let { data: t72, error: r10 } = await this.getUser();
      if (r10) throw r10;
      return this._returnResult({ data: { identities: (e4 = t72.user.identities) !== null && e4 !== void 0 ? e4 : [] }, error: null });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
  async linkIdentity(e4) {
    return "token" in e4 ? this.linkIdentityIdToken(e4) : this.linkIdentityOAuth(e4);
  }
  async linkIdentityOAuth(e4) {
    var t72;
    try {
      let { data: r10, error: s8 } = await this._useSession(async (n9) => {
        var o18, a8, l8, u8, c9;
        let { data: w12, error: d5 } = n9;
        if (d5) throw d5;
        let _8 = await this._getUrlForProvider(`${this.url}/user/identities/authorize`, e4.provider, { redirectTo: (o18 = e4.options) === null || o18 === void 0 ? void 0 : o18.redirectTo, scopes: (a8 = e4.options) === null || a8 === void 0 ? void 0 : a8.scopes, queryParams: (l8 = e4.options) === null || l8 === void 0 ? void 0 : l8.queryParams, skipBrowserRedirect: true });
        return await f(this.fetch, "GET", _8, { headers: this.headers, jwt: (c9 = (u8 = w12.session) === null || u8 === void 0 ? void 0 : u8.access_token) !== null && c9 !== void 0 ? c9 : void 0 });
      });
      if (s8) throw s8;
      return T() && !(!((t72 = e4.options) === null || t72 === void 0) && t72.skipBrowserRedirect) && globalThis.location.assign(r10?.url), this._returnResult({ data: { provider: e4.provider, url: r10?.url }, error: null });
    } catch (r10) {
      if (h(r10)) return this._returnResult({ data: { provider: e4.provider, url: null }, error: r10 });
      throw r10;
    }
  }
  async linkIdentityIdToken(e4) {
    return await this._useSession(async (t72) => {
      var r10;
      try {
        let { error: s8, data: { session: n9 } } = t72;
        if (s8) throw s8;
        let { options: o18, provider: a8, token: l8, access_token: u8, nonce: c9 } = e4, w12 = await f(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, { headers: this.headers, jwt: (r10 = n9?.access_token) !== null && r10 !== void 0 ? r10 : void 0, body: { provider: a8, id_token: l8, access_token: u8, nonce: c9, link_identity: true, gotrue_meta_security: { captcha_token: o18?.captchaToken } }, xform: P }), { data: d5, error: _8 } = w12;
        return _8 ? this._returnResult({ data: { user: null, session: null }, error: _8 }) : !d5 || !d5.session || !d5.user ? this._returnResult({ data: { user: null, session: null }, error: new K() }) : (d5.session && (await this._saveSession(d5.session), await this._notifyAllSubscribers("USER_UPDATED", d5.session)), this._returnResult({ data: d5, error: _8 }));
      } catch (s8) {
        if (await A(this.storage, `${this.storageKey}-code-verifier`), h(s8)) return this._returnResult({ data: { user: null, session: null }, error: s8 });
        throw s8;
      }
    });
  }
  async unlinkIdentity(e4) {
    try {
      return await this._useSession(async (t72) => {
        var r10, s8;
        let { data: n9, error: o18 } = t72;
        if (o18) throw o18;
        return await f(this.fetch, "DELETE", `${this.url}/user/identities/${e4.identity_id}`, { headers: this.headers, jwt: (s8 = (r10 = n9.session) === null || r10 === void 0 ? void 0 : r10.access_token) !== null && s8 !== void 0 ? s8 : void 0 });
      });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
  async _refreshAccessToken(e4) {
    let t72 = "#_refreshAccessToken()";
    this._debug(t72, "begin");
    try {
      let r10 = Date.now();
      return await ot(async (s8) => (s8 > 0 && await nt(200 * Math.pow(2, s8 - 1)), this._debug(t72, "refreshing attempt", s8), await f(this.fetch, "POST", `${this.url}/token?grant_type=refresh_token`, { body: { refresh_token: e4 }, headers: this.headers, xform: P })), (s8, n9) => {
        let o18 = 200 * Math.pow(2, s8);
        return n9 && we(n9) && Date.now() + o18 - r10 < q;
      });
    } catch (r10) {
      if (this._debug(t72, "error", r10), h(r10)) return this._returnResult({ data: { session: null, user: null }, error: r10 });
      throw r10;
    } finally {
      this._debug(t72, "end");
    }
  }
  _isValidSession(e4) {
    return typeof e4 == "object" && e4 !== null && "access_token" in e4 && "refresh_token" in e4 && "expires_at" in e4;
  }
  async _handleProviderSignIn(e4, t72) {
    let r10 = await this._getUrlForProvider(`${this.url}/authorize`, e4, { redirectTo: t72.redirectTo, scopes: t72.scopes, queryParams: t72.queryParams });
    return this._debug("#_handleProviderSignIn()", "provider", e4, "options", t72, "url", r10), T() && !t72.skipBrowserRedirect && globalThis.location.assign(r10), { data: { provider: e4, url: r10 }, error: null };
  }
  async _recoverAndRefresh() {
    var e4, t72;
    let r10 = "#_recoverAndRefresh()";
    this._debug(r10, "begin");
    try {
      let s8 = await $(this.storage, this.storageKey);
      if (s8 && this.userStorage) {
        let o18 = await $(this.userStorage, this.storageKey + "-user");
        !this.storage.isServer && Object.is(this.storage, this.userStorage) && !o18 && (o18 = { user: s8.user }, await X(this.userStorage, this.storageKey + "-user", o18)), s8.user = (e4 = o18?.user) !== null && e4 !== void 0 ? e4 : be();
      } else if (s8 && !s8.user && !s8.user) {
        let o18 = await $(this.storage, this.storageKey + "-user");
        o18 && o18?.user ? (s8.user = o18.user, await A(this.storage, this.storageKey + "-user"), await X(this.storage, this.storageKey, s8)) : s8.user = be();
      }
      if (this._debug(r10, "session from storage", s8), !this._isValidSession(s8)) {
        this._debug(r10, "session is not valid"), s8 !== null && await this._removeSession();
        return;
      }
      let n9 = ((t72 = s8.expires_at) !== null && t72 !== void 0 ? t72 : 1 / 0) * 1e3 - Date.now() < fe;
      if (this._debug(r10, `session has${n9 ? "" : " not"} expired with margin of ${fe}s`), n9) {
        if (this.autoRefreshToken && s8.refresh_token) {
          let { error: o18 } = await this._callRefreshToken(s8.refresh_token);
          o18 && (Ye(o18) ? this._debug(r10, "refresh discarded by commit guard", o18) : (this._debug(r10, "refresh failed", o18), we(o18) || (this._debug(r10, "refresh failed with a non-retryable error, removing the session", o18), await this._removeSession())));
        }
      } else if (s8.user && s8.user.__isUserNotAvailableProxy === true) try {
        let { data: o18, error: a8 } = await this._getUser(s8.access_token);
        !a8 && o18?.user ? (s8.user = o18.user, await this._saveSession(s8), await this._notifyAllSubscribers("SIGNED_IN", s8)) : this._debug(r10, "could not get user data, skipping SIGNED_IN notification");
      } catch (o18) {
        console.error("Error getting user data:", o18), this._debug(r10, "error getting user data, skipping SIGNED_IN notification", o18);
      }
      else await this._notifyAllSubscribers("SIGNED_IN", s8);
    } catch (s8) {
      this._debug(r10, "error", s8), console.error(s8);
      return;
    } finally {
      this._debug(r10, "end");
    }
  }
  async _callRefreshToken(e4) {
    var t72, r10;
    if (!e4) throw new E();
    if (this.refreshingDeferred) return this.refreshingDeferred.promise;
    let s8 = "#_callRefreshToken()";
    this._debug(s8, "begin");
    try {
      this.refreshingDeferred = new le();
      let n9 = await $(this.storage, this.storageKey), { data: o18, error: a8 } = await this._refreshAccessToken(e4);
      if (a8) throw a8;
      if (!o18.session) throw new E();
      let l8 = await $(this.storage, this.storageKey);
      if (n9 !== null && (l8 === null || l8.refresh_token !== n9.refresh_token)) {
        this._debug(s8, "commit guard: storage changed since refresh started, discarding rotated tokens", { startedWith: "present", nowHolds: l8 ? "replaced" : "cleared" });
        let d5 = { data: null, error: new ne() };
        return this.refreshingDeferred.resolve(d5), d5;
      }
      let c9 = this._sessionRemovalEpoch;
      if (await this._saveSession(o18.session), this._sessionRemovalEpoch !== c9) {
        this._debug(s8, "commit guard (post-save): _removeSession ran during _saveSession, undoing write"), await A(this.storage, this.storageKey), this.userStorage && await A(this.userStorage, this.storageKey + "-user");
        let d5 = { data: null, error: new ne() };
        return this.refreshingDeferred.resolve(d5), d5;
      }
      await this._notifyAllSubscribers("TOKEN_REFRESHED", o18.session);
      let w12 = { data: o18.session, error: null };
      return this.refreshingDeferred.resolve(w12), w12;
    } catch (n9) {
      if (this._debug(s8, "error", n9), h(n9)) {
        let o18 = { data: null, error: n9 };
        return we(n9) || await this._removeSession(), (t72 = this.refreshingDeferred) === null || t72 === void 0 || t72.resolve(o18), o18;
      }
      throw (r10 = this.refreshingDeferred) === null || r10 === void 0 || r10.reject(n9), n9;
    } finally {
      this.refreshingDeferred = null, this._debug(s8, "end");
    }
  }
  async _notifyAllSubscribers(e4, t72, r10 = true) {
    let s8 = `#_notifyAllSubscribers(${e4})`;
    this._debug(s8, "begin", t72, `broadcast = ${r10}`);
    try {
      this.broadcastChannel && r10 && this.broadcastChannel.postMessage({ event: e4, session: t72 });
      let n9 = [], o18 = Array.from(this.stateChangeEmitters.values()).map(async (a8) => {
        try {
          await a8.callback(e4, t72);
        } catch (l8) {
          n9.push(l8);
        }
      });
      if (await Promise.all(o18), n9.length > 0) {
        for (let a8 = 0; a8 < n9.length; a8 += 1) console.error(n9[a8]);
        throw n9[0];
      }
    } finally {
      this._debug(s8, "end");
    }
  }
  async _saveSession(e4) {
    this._debug("#_saveSession()", e4), this.suppressGetSessionWarning = true, await A(this.storage, `${this.storageKey}-code-verifier`);
    let t72 = Object.assign({}, e4), r10 = t72.user && t72.user.__isUserNotAvailableProxy === true;
    if (this.userStorage) {
      !r10 && t72.user && await X(this.userStorage, this.storageKey + "-user", { user: t72.user });
      let s8 = Object.assign({}, t72);
      delete s8.user;
      let n9 = Ie(s8);
      await X(this.storage, this.storageKey, n9);
    } else {
      let s8 = Ie(t72);
      await X(this.storage, this.storageKey, s8);
    }
  }
  async _removeSession() {
    this._sessionRemovalEpoch += 1, this._debug("#_removeSession()"), this.suppressGetSessionWarning = false, await A(this.storage, this.storageKey), await A(this.storage, this.storageKey + "-code-verifier"), await A(this.storage, this.storageKey + "-user"), this.userStorage && await A(this.userStorage, this.storageKey + "-user"), await this._notifyAllSubscribers("SIGNED_OUT", null);
  }
  _removeVisibilityChangedCallback() {
    this._debug("#_removeVisibilityChangedCallback()");
    let e4 = this.visibilityChangedCallback;
    this.visibilityChangedCallback = null;
    try {
      e4 && T() && globalThis?.removeEventListener && globalThis.removeEventListener("visibilitychange", e4);
    } catch (t72) {
      console.error("removing visibilitychange callback failed", t72);
    }
  }
  async _startAutoRefresh() {
    await this._stopAutoRefresh(), this._debug("#_startAutoRefresh()");
    let e4 = setInterval(() => this._autoRefreshTokenTick(), q);
    this.autoRefreshTicker = e4, e4 && typeof e4 == "object" && typeof e4.unref == "function" ? e4.unref() : typeof Deno < "u" && typeof Deno.unrefTimer == "function" && Deno.unrefTimer(e4);
    let t72 = setTimeout(async () => {
      await this.initializePromise, await this._autoRefreshTokenTick();
    }, 0);
    this.autoRefreshTickTimeout = t72, t72 && typeof t72 == "object" && typeof t72.unref == "function" ? t72.unref() : typeof Deno < "u" && typeof Deno.unrefTimer == "function" && Deno.unrefTimer(t72);
  }
  async _stopAutoRefresh() {
    this._debug("#_stopAutoRefresh()");
    let e4 = this.autoRefreshTicker;
    this.autoRefreshTicker = null, e4 && clearInterval(e4);
    let t72 = this.autoRefreshTickTimeout;
    this.autoRefreshTickTimeout = null, t72 && clearTimeout(t72);
  }
  async startAutoRefresh() {
    this._removeVisibilityChangedCallback(), await this._startAutoRefresh();
  }
  async stopAutoRefresh() {
    this._removeVisibilityChangedCallback(), await this._stopAutoRefresh();
  }
  async dispose() {
    var e4;
    this._removeVisibilityChangedCallback(), await this._stopAutoRefresh(), (e4 = this.broadcastChannel) === null || e4 === void 0 || e4.close(), this.broadcastChannel = null, this.stateChangeEmitters.clear();
  }
  async _autoRefreshTokenTick() {
    if (this._debug("#_autoRefreshTokenTick()", "begin"), this.lock != null) {
      try {
        await this._acquireLock(0, async () => {
          try {
            let e4 = Date.now();
            try {
              return await this._useSession(async (t72) => {
                let { data: { session: r10 } } = t72;
                if (!r10 || !r10.refresh_token || !r10.expires_at) {
                  this._debug("#_autoRefreshTokenTick()", "no session");
                  return;
                }
                let s8 = Math.floor((r10.expires_at * 1e3 - e4) / q);
                this._debug("#_autoRefreshTokenTick()", `access token expires in ${s8} ticks, a tick lasts ${q}ms, refresh threshold is ${ee} ticks`), s8 <= ee && await this._callRefreshToken(r10.refresh_token);
              });
            } catch (t72) {
              console.error("Auto refresh tick failed with error. This is likely a transient error.", t72);
            }
          } finally {
            this._debug("#_autoRefreshTokenTick()", "end");
          }
        });
      } catch (e4) {
        if (e4 instanceof V) this._debug("auto refresh token tick lock not available");
        else throw e4;
      }
      return;
    }
    if (this.refreshingDeferred !== null) {
      this._debug("#_autoRefreshTokenTick()", "refresh already in flight, skipping");
      return;
    }
    try {
      let e4 = Date.now();
      try {
        await this._useSession(async (t72) => {
          let { data: { session: r10 } } = t72;
          if (!r10 || !r10.refresh_token || !r10.expires_at) {
            this._debug("#_autoRefreshTokenTick()", "no session");
            return;
          }
          let s8 = Math.floor((r10.expires_at * 1e3 - e4) / q);
          this._debug("#_autoRefreshTokenTick()", `access token expires in ${s8} ticks, a tick lasts ${q}ms, refresh threshold is ${ee} ticks`), s8 <= ee && await this._callRefreshToken(r10.refresh_token);
        });
      } catch (t72) {
        console.error("Auto refresh tick failed with error. This is likely a transient error.", t72);
      }
    } finally {
      this._debug("#_autoRefreshTokenTick()", "end");
    }
  }
  async _handleVisibilityChange() {
    if (this._debug("#_handleVisibilityChange()"), !T() || !globalThis?.addEventListener) return this.autoRefreshToken && this.startAutoRefresh(), false;
    try {
      this.visibilityChangedCallback = async () => {
        try {
          await this._onVisibilityChanged(false);
        } catch (e4) {
          this._debug("#visibilityChangedCallback", "error", e4);
        }
      }, globalThis?.addEventListener("visibilitychange", this.visibilityChangedCallback), await this._onVisibilityChanged(true);
    } catch (e4) {
      console.error("_handleVisibilityChange", e4);
    }
  }
  async _onVisibilityChanged(e4) {
    let t72 = `#_onVisibilityChanged(${e4})`;
    if (this._debug(t72, "visibilityState", document.visibilityState), document.visibilityState === "visible") {
      if (this.autoRefreshToken && this._startAutoRefresh(), !e4) if (await this.initializePromise, this.lock != null) await this._acquireLock(this.lockAcquireTimeout, async () => {
        if (document.visibilityState !== "visible") {
          this._debug(t72, "acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting");
          return;
        }
        await this._recoverAndRefresh();
      });
      else {
        if (document.visibilityState !== "visible") {
          this._debug(t72, "visibilityState is no longer visible, skipping recovery");
          return;
        }
        await this._recoverAndRefresh();
      }
    } else document.visibilityState === "hidden" && this.autoRefreshToken && this._stopAutoRefresh();
  }
  async _getUrlForProvider(e4, t72, r10) {
    let s8 = [`provider=${encodeURIComponent(t72)}`];
    if (r10?.redirectTo && s8.push(`redirect_to=${encodeURIComponent(r10.redirectTo)}`), r10?.scopes && s8.push(`scopes=${encodeURIComponent(r10.scopes)}`), this.flowType === "pkce") {
      let [n9, o18] = await F2(this.storage, this.storageKey), a8 = new URLSearchParams({ code_challenge: `${encodeURIComponent(n9)}`, code_challenge_method: `${encodeURIComponent(o18)}` });
      s8.push(a8.toString());
    }
    if (r10?.queryParams) {
      let n9 = new URLSearchParams(r10.queryParams);
      s8.push(n9.toString());
    }
    return r10?.skipBrowserRedirect && s8.push(`skip_http_redirect=${r10.skipBrowserRedirect}`), `${e4}?${s8.join("&")}`;
  }
  async _unenroll(e4) {
    try {
      return await this._useSession(async (t72) => {
        var r10;
        let { data: s8, error: n9 } = t72;
        return n9 ? this._returnResult({ data: null, error: n9 }) : await f(this.fetch, "DELETE", `${this.url}/factors/${e4.factorId}`, { headers: this.headers, jwt: (r10 = s8?.session) === null || r10 === void 0 ? void 0 : r10.access_token });
      });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
  async _enroll(e4) {
    try {
      return await this._useSession(async (t72) => {
        var r10, s8;
        let { data: n9, error: o18 } = t72;
        if (o18) return this._returnResult({ data: null, error: o18 });
        let a8 = Object.assign({ friendly_name: e4.friendlyName, factor_type: e4.factorType }, e4.factorType === "phone" ? { phone: e4.phone } : e4.factorType === "totp" ? { issuer: e4.issuer } : {}), { data: l8, error: u8 } = await f(this.fetch, "POST", `${this.url}/factors`, { body: a8, headers: this.headers, jwt: (r10 = n9?.session) === null || r10 === void 0 ? void 0 : r10.access_token });
        return u8 ? this._returnResult({ data: null, error: u8 }) : (e4.factorType === "totp" && l8.type === "totp" && (!((s8 = l8?.totp) === null || s8 === void 0) && s8.qr_code) && (l8.totp.qr_code = `data:image/svg+xml;utf-8,${l8.totp.qr_code}`), this._returnResult({ data: l8, error: null }));
      });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
  async _verify(e4) {
    let t72 = async () => {
      try {
        return await this._useSession(async (r10) => {
          var s8;
          let { data: n9, error: o18 } = r10;
          if (o18) return this._returnResult({ data: null, error: o18 });
          let a8 = Object.assign({ challenge_id: e4.challengeId }, "webauthn" in e4 ? { webauthn: Object.assign(Object.assign({}, e4.webauthn), { credential_response: e4.webauthn.type === "create" ? De(e4.webauthn.credential_response) : qe(e4.webauthn.credential_response) }) } : { code: e4.code }), { data: l8, error: u8 } = await f(this.fetch, "POST", `${this.url}/factors/${e4.factorId}/verify`, { body: a8, headers: this.headers, jwt: (s8 = n9?.session) === null || s8 === void 0 ? void 0 : s8.access_token });
          return u8 ? this._returnResult({ data: null, error: u8 }) : (await this._saveSession(Object.assign({ expires_at: Math.round(Date.now() / 1e3) + l8.expires_in }, l8)), await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", l8), this._returnResult({ data: l8, error: u8 }));
        });
      } catch (r10) {
        if (h(r10)) return this._returnResult({ data: null, error: r10 });
        throw r10;
      }
    };
    return this.lock != null ? this._acquireLock(this.lockAcquireTimeout, t72) : t72();
  }
  async _challenge(e4) {
    let t72 = async () => {
      try {
        return await this._useSession(async (r10) => {
          var s8;
          let { data: n9, error: o18 } = r10;
          if (o18) return this._returnResult({ data: null, error: o18 });
          let a8 = await f(this.fetch, "POST", `${this.url}/factors/${e4.factorId}/challenge`, { body: e4, headers: this.headers, jwt: (s8 = n9?.session) === null || s8 === void 0 ? void 0 : s8.access_token });
          if (a8.error) return a8;
          let { data: l8 } = a8;
          if (l8.type !== "webauthn") return { data: l8, error: null };
          switch (l8.webauthn.type) {
            case "create":
              return { data: Object.assign(Object.assign({}, l8), { webauthn: Object.assign(Object.assign({}, l8.webauthn), { credential_options: Object.assign(Object.assign({}, l8.webauthn.credential_options), { publicKey: Ne(l8.webauthn.credential_options.publicKey) }) }) }), error: null };
            case "request":
              return { data: Object.assign(Object.assign({}, l8), { webauthn: Object.assign(Object.assign({}, l8.webauthn), { credential_options: Object.assign(Object.assign({}, l8.webauthn.credential_options), { publicKey: Le(l8.webauthn.credential_options.publicKey) }) }) }), error: null };
          }
        });
      } catch (r10) {
        if (h(r10)) return this._returnResult({ data: null, error: r10 });
        throw r10;
      }
    };
    return this.lock != null ? this._acquireLock(this.lockAcquireTimeout, t72) : t72();
  }
  async _challengeAndVerify(e4) {
    let { data: t72, error: r10 } = await this._challenge({ factorId: e4.factorId });
    return r10 ? this._returnResult({ data: null, error: r10 }) : await this._verify({ factorId: e4.factorId, challengeId: t72.id, code: e4.code });
  }
  async _listFactors() {
    var e4;
    let { data: { user: t72 }, error: r10 } = await this.getUser();
    if (r10) return { data: null, error: r10 };
    let s8 = { all: [], phone: [], totp: [], webauthn: [] };
    for (let n9 of (e4 = t72?.factors) !== null && e4 !== void 0 ? e4 : []) s8.all.push(n9), n9.status === "verified" && s8[n9.factor_type].push(n9);
    return { data: s8, error: null };
  }
  async _getAuthenticatorAssuranceLevel(e4) {
    var t72, r10, s8, n9;
    if (e4) try {
      let { payload: _8 } = ue(e4), v6 = null;
      _8.aal && (v6 = _8.aal);
      let b7 = v6, { data: { user: y11 }, error: m8 } = await this.getUser(e4);
      if (m8) return this._returnResult({ data: null, error: m8 });
      ((r10 = (t72 = y11?.factors) === null || t72 === void 0 ? void 0 : t72.filter((R8) => R8.status === "verified")) !== null && r10 !== void 0 ? r10 : []).length > 0 && (b7 = "aal2");
      let g6 = _8.amr || [];
      return { data: { currentLevel: v6, nextLevel: b7, currentAuthenticationMethods: g6 }, error: null };
    } catch (_8) {
      if (h(_8)) return this._returnResult({ data: null, error: _8 });
      throw _8;
    }
    let { data: { session: o18 }, error: a8 } = await this.getSession();
    if (a8) return this._returnResult({ data: null, error: a8 });
    if (!o18) return { data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] }, error: null };
    let { payload: l8 } = ue(o18.access_token), u8 = null;
    l8.aal && (u8 = l8.aal);
    let c9 = u8;
    ((n9 = (s8 = o18.user.factors) === null || s8 === void 0 ? void 0 : s8.filter((_8) => _8.status === "verified")) !== null && n9 !== void 0 ? n9 : []).length > 0 && (c9 = "aal2");
    let d5 = l8.amr || [];
    return { data: { currentLevel: u8, nextLevel: c9, currentAuthenticationMethods: d5 }, error: null };
  }
  async _getAuthorizationDetails(e4) {
    try {
      return await this._useSession(async (t72) => {
        let { data: { session: r10 }, error: s8 } = t72;
        return s8 ? this._returnResult({ data: null, error: s8 }) : r10 ? await f(this.fetch, "GET", `${this.url}/oauth/authorizations/${e4}`, { headers: this.headers, jwt: r10.access_token, xform: (n9) => ({ data: n9, error: null }) }) : this._returnResult({ data: null, error: new E() });
      });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
  async _approveAuthorization(e4, t72) {
    try {
      return await this._useSession(async (r10) => {
        let { data: { session: s8 }, error: n9 } = r10;
        if (n9) return this._returnResult({ data: null, error: n9 });
        if (!s8) return this._returnResult({ data: null, error: new E() });
        let o18 = await f(this.fetch, "POST", `${this.url}/oauth/authorizations/${e4}/consent`, { headers: this.headers, jwt: s8.access_token, body: { action: "approve" }, xform: (a8) => ({ data: a8, error: null }) });
        return o18.data && o18.data.redirect_url && T() && !t72?.skipBrowserRedirect && globalThis.location.assign(o18.data.redirect_url), o18;
      });
    } catch (r10) {
      if (h(r10)) return this._returnResult({ data: null, error: r10 });
      throw r10;
    }
  }
  async _denyAuthorization(e4, t72) {
    try {
      return await this._useSession(async (r10) => {
        let { data: { session: s8 }, error: n9 } = r10;
        if (n9) return this._returnResult({ data: null, error: n9 });
        if (!s8) return this._returnResult({ data: null, error: new E() });
        let o18 = await f(this.fetch, "POST", `${this.url}/oauth/authorizations/${e4}/consent`, { headers: this.headers, jwt: s8.access_token, body: { action: "deny" }, xform: (a8) => ({ data: a8, error: null }) });
        return o18.data && o18.data.redirect_url && T() && !t72?.skipBrowserRedirect && globalThis.location.assign(o18.data.redirect_url), o18;
      });
    } catch (r10) {
      if (h(r10)) return this._returnResult({ data: null, error: r10 });
      throw r10;
    }
  }
  async _listOAuthGrants() {
    try {
      return await this._useSession(async (e4) => {
        let { data: { session: t72 }, error: r10 } = e4;
        return r10 ? this._returnResult({ data: null, error: r10 }) : t72 ? await f(this.fetch, "GET", `${this.url}/user/oauth/grants`, { headers: this.headers, jwt: t72.access_token, xform: (s8) => ({ data: s8, error: null }) }) : this._returnResult({ data: null, error: new E() });
      });
    } catch (e4) {
      if (h(e4)) return this._returnResult({ data: null, error: e4 });
      throw e4;
    }
  }
  async _revokeOAuthGrant(e4) {
    try {
      return await this._useSession(async (t72) => {
        let { data: { session: r10 }, error: s8 } = t72;
        return s8 ? this._returnResult({ data: null, error: s8 }) : r10 ? (await f(this.fetch, "DELETE", `${this.url}/user/oauth/grants`, { headers: this.headers, jwt: r10.access_token, query: { client_id: e4.clientId }, noResolveJson: true }), { data: {}, error: null }) : this._returnResult({ data: null, error: new E() });
      });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
  async fetchJwk(e4, t72 = { keys: [] }) {
    let r10 = t72.keys.find((a8) => a8.kid === e4);
    if (r10) return r10;
    let s8 = Date.now();
    if (r10 = this.jwks.keys.find((a8) => a8.kid === e4), r10 && this.jwks_cached_at + Ve > s8) return r10;
    let { data: n9, error: o18 } = await f(this.fetch, "GET", `${this.url}/.well-known/jwks.json`, { headers: this.headers });
    if (o18) throw o18;
    return !n9.keys || n9.keys.length === 0 || (this.jwks = n9, this.jwks_cached_at = s8, r10 = n9.keys.find((a8) => a8.kid === e4), !r10) ? null : r10;
  }
  async getClaims(e4, t72 = {}) {
    try {
      let r10 = e4;
      if (!r10) {
        let { data: _8, error: v6 } = await this.getSession();
        if (v6 || !_8.session) return this._returnResult({ data: null, error: v6 });
        r10 = _8.session.access_token;
      }
      let { header: s8, payload: n9, signature: o18, raw: { header: a8, payload: l8 } } = ue(r10);
      if (!t72?.allowExpired) try {
        lt(n9.exp);
      } catch (_8) {
        throw new G(_8 instanceof Error ? _8.message : "JWT validation failed");
      }
      let u8 = !s8.alg || s8.alg.startsWith("HS") || !s8.kid || !("crypto" in globalThis && "subtle" in globalThis.crypto) ? null : await this.fetchJwk(s8.kid, t72?.keys ? { keys: t72.keys } : t72?.jwks);
      if (!u8) {
        let { error: _8 } = await this.getUser(r10);
        if (_8) throw _8;
        return { data: { claims: n9, header: s8, signature: o18 }, error: null };
      }
      let c9 = ut(s8.alg), w12 = await crypto.subtle.importKey("jwk", u8, c9, true, ["verify"]);
      if (!await crypto.subtle.verify(c9, w12, o18, et(`${a8}.${l8}`))) throw new G("Invalid JWT signature");
      return { data: { claims: n9, header: s8, signature: o18 }, error: null };
    } catch (r10) {
      if (h(r10)) return this._returnResult({ data: null, error: r10 });
      throw r10;
    }
  }
  async signInWithPasskey(e4) {
    var t72, r10, s8;
    O(this.experimental);
    try {
      if (!he()) return this._returnResult({ data: null, error: new x("Browser does not support WebAuthn", null) });
      let { data: n9, error: o18 } = await this._startPasskeyAuthentication({ options: { captchaToken: (t72 = e4?.options) === null || t72 === void 0 ? void 0 : t72.captchaToken } });
      if (o18 || !n9) return this._returnResult({ data: null, error: o18 });
      let a8 = Le(n9.options), l8 = (s8 = (r10 = e4?.options) === null || r10 === void 0 ? void 0 : r10.signal) !== null && s8 !== void 0 ? s8 : Se.createNewAbortSignal(), { data: u8, error: c9 } = await We({ publicKey: a8, signal: l8 });
      if (c9 || !u8) return this._returnResult({ data: null, error: c9 ?? new x("WebAuthn ceremony failed", null) });
      let w12 = qe(u8);
      return this._verifyPasskeyAuthentication({ challengeId: n9.challenge_id, credential: w12 });
    } catch (n9) {
      if (h(n9)) return this._returnResult({ data: null, error: n9 });
      throw n9;
    }
  }
  async registerPasskey(e4) {
    var t72, r10;
    O(this.experimental);
    try {
      if (!he()) return this._returnResult({ data: null, error: new x("Browser does not support WebAuthn", null) });
      let { data: s8, error: n9 } = await this._startPasskeyRegistration();
      if (n9 || !s8) return this._returnResult({ data: null, error: n9 });
      let o18 = Ne(s8.options), a8 = (r10 = (t72 = e4?.options) === null || t72 === void 0 ? void 0 : t72.signal) !== null && r10 !== void 0 ? r10 : Se.createNewAbortSignal(), { data: l8, error: u8 } = await Ke({ publicKey: o18, signal: a8 });
      if (u8 || !l8) return this._returnResult({ data: null, error: u8 ?? new x("WebAuthn ceremony failed", null) });
      let c9 = De(l8);
      return this._verifyPasskeyRegistration({ challengeId: s8.challenge_id, credential: c9 });
    } catch (s8) {
      if (h(s8)) return this._returnResult({ data: null, error: s8 });
      throw s8;
    }
  }
  async _startPasskeyRegistration() {
    O(this.experimental);
    try {
      return await this._useSession(async (e4) => {
        let { data: { session: t72 }, error: r10 } = e4;
        if (r10) return this._returnResult({ data: null, error: r10 });
        if (!t72) return this._returnResult({ data: null, error: new E() });
        let { data: s8, error: n9 } = await f(this.fetch, "POST", `${this.url}/passkeys/registration/options`, { headers: this.headers, jwt: t72.access_token, body: {} });
        return n9 ? this._returnResult({ data: null, error: n9 }) : this._returnResult({ data: s8, error: null });
      });
    } catch (e4) {
      if (h(e4)) return this._returnResult({ data: null, error: e4 });
      throw e4;
    }
  }
  async _verifyPasskeyRegistration(e4) {
    O(this.experimental);
    try {
      return await this._useSession(async (t72) => {
        let { data: { session: r10 }, error: s8 } = t72;
        if (s8) return this._returnResult({ data: null, error: s8 });
        if (!r10) return this._returnResult({ data: null, error: new E() });
        let { data: n9, error: o18 } = await f(this.fetch, "POST", `${this.url}/passkeys/registration/verify`, { headers: this.headers, jwt: r10.access_token, body: { challenge_id: e4.challengeId, credential: e4.credential } });
        return o18 ? this._returnResult({ data: null, error: o18 }) : this._returnResult({ data: n9, error: null });
      });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
  async _startPasskeyAuthentication(e4) {
    var t72;
    O(this.experimental);
    try {
      let { data: r10, error: s8 } = await f(this.fetch, "POST", `${this.url}/passkeys/authentication/options`, { headers: this.headers, body: { gotrue_meta_security: { captcha_token: (t72 = e4?.options) === null || t72 === void 0 ? void 0 : t72.captchaToken } } });
      return s8 ? this._returnResult({ data: null, error: s8 }) : this._returnResult({ data: r10, error: null });
    } catch (r10) {
      if (h(r10)) return this._returnResult({ data: null, error: r10 });
      throw r10;
    }
  }
  async _verifyPasskeyAuthentication(e4) {
    O(this.experimental);
    try {
      let { data: t72, error: r10 } = await f(this.fetch, "POST", `${this.url}/passkeys/authentication/verify`, { headers: this.headers, body: { challenge_id: e4.challengeId, credential: e4.credential }, xform: P });
      return r10 ? this._returnResult({ data: null, error: r10 }) : (t72.session && (await this._saveSession(t72.session), await this._notifyAllSubscribers("SIGNED_IN", t72.session)), this._returnResult({ data: t72, error: null }));
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
  async _listPasskeys() {
    O(this.experimental);
    try {
      return await this._useSession(async (e4) => {
        let { data: { session: t72 }, error: r10 } = e4;
        if (r10) return this._returnResult({ data: null, error: r10 });
        if (!t72) return this._returnResult({ data: null, error: new E() });
        let { data: s8, error: n9 } = await f(this.fetch, "GET", `${this.url}/passkeys`, { headers: this.headers, jwt: t72.access_token, xform: (o18) => ({ data: o18, error: null }) });
        return n9 ? this._returnResult({ data: null, error: n9 }) : this._returnResult({ data: s8, error: null });
      });
    } catch (e4) {
      if (h(e4)) return this._returnResult({ data: null, error: e4 });
      throw e4;
    }
  }
  async _updatePasskey(e4) {
    O(this.experimental);
    try {
      return await this._useSession(async (t72) => {
        let { data: { session: r10 }, error: s8 } = t72;
        if (s8) return this._returnResult({ data: null, error: s8 });
        if (!r10) return this._returnResult({ data: null, error: new E() });
        let { data: n9, error: o18 } = await f(this.fetch, "PATCH", `${this.url}/passkeys/${e4.passkeyId}`, { headers: this.headers, jwt: r10.access_token, body: { friendly_name: e4.friendlyName } });
        return o18 ? this._returnResult({ data: null, error: o18 }) : this._returnResult({ data: n9, error: null });
      });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
  async _deletePasskey(e4) {
    O(this.experimental);
    try {
      return await this._useSession(async (t72) => {
        let { data: { session: r10 }, error: s8 } = t72;
        if (s8) return this._returnResult({ data: null, error: s8 });
        if (!r10) return this._returnResult({ data: null, error: new E() });
        let { error: n9 } = await f(this.fetch, "DELETE", `${this.url}/passkeys/${e4.passkeyId}`, { headers: this.headers, jwt: r10.access_token, noResolveJson: true });
        return n9 ? this._returnResult({ data: null, error: n9 }) : this._returnResult({ data: null, error: null });
      });
    } catch (t72) {
      if (h(t72)) return this._returnResult({ data: null, error: t72 });
      throw t72;
    }
  }
};
Ee.nextInstanceID = {};
var Me = Ee;
var Jt = Me;
var Ht = Jt;

// supabase/functions/_vendor/esm.sh/@supabase/functions-js@2.108.1/denonext/functions-js.mjs
var O2 = (e4) => e4 ? (...t72) => e4(...t72) : (...t72) => fetch(...t72);
var c = class extends Error {
  constructor(t72, p9 = "FunctionsError", n9) {
    super(t72), this.name = p9, this.context = n9;
  }
  toJSON() {
    return { name: this.name, message: this.message, context: this.context };
  }
};
var x2 = class extends c {
  constructor(t72) {
    super("Failed to send a request to the Edge Function", "FunctionsFetchError", t72);
  }
};
var f2 = class extends c {
  constructor(t72) {
    super("Relay Error invoking the Edge Function", "FunctionsRelayError", t72);
  }
};
var u = class extends c {
  constructor(t72) {
    super("Edge Function returned a non-2xx status code", "FunctionsHttpError", t72);
  }
};
var E2;
(function(e4) {
  e4.Any = "any", e4.ApNortheast1 = "ap-northeast-1", e4.ApNortheast2 = "ap-northeast-2", e4.ApSouth1 = "ap-south-1", e4.ApSoutheast1 = "ap-southeast-1", e4.ApSoutheast2 = "ap-southeast-2", e4.CaCentral1 = "ca-central-1", e4.EuCentral1 = "eu-central-1", e4.EuWest1 = "eu-west-1", e4.EuWest2 = "eu-west-2", e4.EuWest3 = "eu-west-3", e4.SaEast1 = "sa-east-1", e4.UsEast1 = "us-east-1", e4.UsWest1 = "us-west-1", e4.UsWest2 = "us-west-2";
})(E2 || (E2 = {}));
var A2 = class {
  constructor(t72, { headers: p9 = {}, customFetch: n9, region: h11 = E2.Any } = {}) {
    this.url = t72, this.headers = p9, this.region = h11, this.fetch = O2(n9);
  }
  setAuth(t72) {
    this.headers.Authorization = `Bearer ${t72}`;
  }
  invoke(t72) {
    return F(this, arguments, void 0, function* (p9, n9 = {}) {
      var h11;
      let g6, d5;
      try {
        let { headers: o18, method: T13, body: r10, signal: b7, timeout: v6 } = n9, y11 = {}, { region: i12 } = n9;
        i12 || (i12 = this.region);
        let C8 = new URL(`${this.url}/${p9}`);
        i12 && i12 !== "any" && (y11["x-region"] = i12, C8.searchParams.set("forceFunctionRegion", i12));
        let a8;
        r10 && (o18 && !Object.prototype.hasOwnProperty.call(o18, "Content-Type") || !o18) ? typeof Blob < "u" && r10 instanceof Blob || r10 instanceof ArrayBuffer ? (y11["Content-Type"] = "application/octet-stream", a8 = r10) : typeof r10 == "string" ? (y11["Content-Type"] = "text/plain", a8 = r10) : typeof FormData < "u" && r10 instanceof FormData ? a8 = r10 : (y11["Content-Type"] = "application/json", a8 = JSON.stringify(r10)) : r10 && typeof r10 != "string" && !(typeof Blob < "u" && r10 instanceof Blob) && !(r10 instanceof ArrayBuffer) && !(typeof FormData < "u" && r10 instanceof FormData) ? a8 = JSON.stringify(r10) : a8 = r10;
        let w12 = b7;
        v6 && (d5 = new AbortController(), g6 = setTimeout(() => d5.abort(), v6), b7 ? (w12 = d5.signal, b7.addEventListener("abort", () => d5.abort())) : w12 = d5.signal);
        let s8 = yield this.fetch(C8.toString(), { method: T13 || "POST", headers: Object.assign(Object.assign(Object.assign({}, y11), this.headers), o18), body: a8, signal: w12 }).catch((F8) => {
          throw new x2(F8);
        }), S12 = s8.headers.get("x-relay-error");
        if (S12 && S12 === "true") throw new f2(s8);
        if (!s8.ok) throw new u(s8);
        let m8 = ((h11 = s8.headers.get("Content-Type")) !== null && h11 !== void 0 ? h11 : "text/plain").split(";")[0].trim(), l8;
        return m8 === "application/json" ? l8 = yield s8.json() : m8 === "application/octet-stream" || m8 === "application/pdf" ? l8 = yield s8.blob() : m8 === "text/event-stream" ? l8 = s8 : m8 === "multipart/form-data" ? l8 = yield s8.formData() : l8 = yield s8.text(), { data: l8, error: null, response: s8 };
      } catch (o18) {
        return { data: null, error: o18, response: o18 instanceof u || o18 instanceof f2 ? o18.context : void 0 };
      } finally {
        g6 && clearTimeout(g6);
      }
    });
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/postgrest-js@2.108.1/denonext/postgrest-js.mjs
var L2 = (t72) => Math.min(1e3 * 2 ** t72, 3e4);
var D = [520, 503];
var j = ["GET", "HEAD", "OPTIONS"];
var b = class extends Error {
  constructor(t72) {
    super(t72.message), this.name = "PostgrestError", this.details = t72.details, this.hint = t72.hint, this.code = t72.code;
  }
  toJSON() {
    return { name: this.name, message: this.message, details: this.details, hint: this.hint, code: this.code };
  }
};
function A3(t72, e4) {
  return new Promise((r10) => {
    if (e4?.aborted) {
      r10();
      return;
    }
    let s8 = setTimeout(() => {
      e4?.removeEventListener("abort", l8), r10();
    }, t72);
    function l8() {
      clearTimeout(s8), r10();
    }
    e4?.addEventListener("abort", l8);
  });
}
function N2(t72, e4, r10, s8) {
  return !(!s8 || r10 >= 3 || !j.includes(t72) || !D.includes(e4));
}
var E3 = class {
  constructor(t72) {
    var e4, r10, s8, l8, a8;
    this.shouldThrowOnError = false, this.retryEnabled = true, this.method = t72.method, this.url = t72.url, this.headers = new Headers(t72.headers), this.schema = t72.schema, this.body = t72.body, this.shouldThrowOnError = (e4 = t72.shouldThrowOnError) !== null && e4 !== void 0 ? e4 : false, this.signal = t72.signal, this.isMaybeSingle = (r10 = t72.isMaybeSingle) !== null && r10 !== void 0 ? r10 : false, this.shouldStripNulls = (s8 = t72.shouldStripNulls) !== null && s8 !== void 0 ? s8 : false, this.urlLengthLimit = (l8 = t72.urlLengthLimit) !== null && l8 !== void 0 ? l8 : 8e3, this.retryEnabled = (a8 = t72.retry) !== null && a8 !== void 0 ? a8 : true, t72.fetch ? this.fetch = t72.fetch : this.fetch = fetch;
  }
  throwOnError() {
    return this.shouldThrowOnError = true, this;
  }
  stripNulls() {
    if (this.headers.get("Accept") === "text/csv") throw new Error("stripNulls() cannot be used with csv()");
    return this.shouldStripNulls = true, this;
  }
  setHeader(t72, e4) {
    return this.headers = new Headers(this.headers), this.headers.set(t72, e4), this;
  }
  retry(t72) {
    return this.retryEnabled = t72, this;
  }
  then(t72, e4) {
    var r10 = this;
    if (this.schema === void 0 || (["GET", "HEAD"].includes(this.method) ? this.headers.set("Accept-Profile", this.schema) : this.headers.set("Content-Profile", this.schema)), this.method !== "GET" && this.method !== "HEAD" && this.headers.set("Content-Type", "application/json"), this.shouldStripNulls) {
      let i12 = this.headers.get("Accept");
      i12 === "application/vnd.pgrst.object+json" ? this.headers.set("Accept", "application/vnd.pgrst.object+json;nulls=stripped") : (!i12 || i12 === "application/json") && this.headers.set("Accept", "application/vnd.pgrst.array+json;nulls=stripped");
    }
    let s8 = this.fetch, a8 = (async () => {
      let i12 = 0;
      for (; ; ) {
        let o18 = {};
        r10.headers.forEach((n9, d5) => {
          o18[d5] = n9;
        }), i12 > 0 && (o18["X-Retry-Count"] = String(i12));
        let c9;
        try {
          c9 = await s8(r10.url.toString(), { method: r10.method, headers: o18, body: JSON.stringify(r10.body, (n9, d5) => typeof d5 == "bigint" ? d5.toString() : d5), signal: r10.signal });
        } catch (n9) {
          if (n9?.name === "AbortError" || n9?.code === "ABORT_ERR" || !j.includes(r10.method)) throw n9;
          if (r10.retryEnabled && i12 < 3) {
            let d5 = L2(i12);
            i12++, await A3(d5, r10.signal);
            continue;
          }
          throw n9;
        }
        if (N2(r10.method, c9.status, i12, r10.retryEnabled)) {
          var u8, h11;
          let n9 = (u8 = (h11 = c9.headers) === null || h11 === void 0 ? void 0 : h11.get("Retry-After")) !== null && u8 !== void 0 ? u8 : null, d5 = n9 !== null ? Math.max(0, parseInt(n9, 10) || 0) * 1e3 : L2(i12);
          await c9.text(), i12++, await A3(d5, r10.signal);
          continue;
        }
        return await r10.processResponse(c9);
      }
    })();
    return this.shouldThrowOnError || (a8 = a8.catch((i12) => {
      var u8;
      let h11 = "", o18 = "", c9 = "", n9 = i12?.cause;
      if (n9) {
        var d5, p9, f11, P9;
        let k6 = (d5 = n9?.message) !== null && d5 !== void 0 ? d5 : "", $10 = (p9 = n9?.code) !== null && p9 !== void 0 ? p9 : "";
        h11 = `${(f11 = i12?.name) !== null && f11 !== void 0 ? f11 : "FetchError"}: ${i12?.message}`, h11 += `

Caused by: ${(P9 = n9?.name) !== null && P9 !== void 0 ? P9 : "Error"}: ${k6}`, $10 && (h11 += ` (${$10})`), n9?.stack && (h11 += `
${n9.stack}`);
      } else {
        var w12;
        h11 = (w12 = i12?.stack) !== null && w12 !== void 0 ? w12 : "";
      }
      let g6 = this.url.toString().length;
      return i12?.name === "AbortError" || i12?.code === "ABORT_ERR" ? (c9 = "", o18 = "Request was aborted (timeout or manual cancellation)", g6 > this.urlLengthLimit && (o18 += `. Note: Your request URL is ${g6} characters, which may exceed server limits. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [many IDs])), consider using an RPC function to pass values server-side.`)) : (n9?.name === "HeadersOverflowError" || n9?.code === "UND_ERR_HEADERS_OVERFLOW") && (c9 = "", o18 = "HTTP headers exceeded server limits (typically 16KB)", g6 > this.urlLengthLimit && (o18 += `. Your request URL is ${g6} characters. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [200+ IDs])), consider using an RPC function instead.`)), { success: false, error: { message: `${(u8 = i12?.name) !== null && u8 !== void 0 ? u8 : "FetchError"}: ${i12?.message}`, details: h11, hint: o18, code: c9 }, data: null, count: null, status: 0, statusText: "" };
    })), a8.then(t72, e4);
  }
  async processResponse(t72) {
    var e4 = this;
    let r10 = null, s8 = null, l8 = null, a8 = t72.status, i12 = t72.statusText;
    if (t72.ok) {
      var u8, h11;
      if (e4.method !== "HEAD") {
        var o18;
        let d5 = await t72.text();
        if (d5 !== "") if (e4.headers.get("Accept") === "text/csv") s8 = d5;
        else if (e4.headers.get("Accept") && (!((o18 = e4.headers.get("Accept")) === null || o18 === void 0) && o18.includes("application/vnd.pgrst.plan+text"))) s8 = d5;
        else try {
          s8 = JSON.parse(d5);
        } catch {
          if (r10 = { message: d5 }, s8 = null, e4.shouldThrowOnError) throw new b({ message: d5, details: "", hint: "", code: "" });
        }
      }
      let c9 = (u8 = e4.headers.get("Prefer")) === null || u8 === void 0 ? void 0 : u8.match(/count=(exact|planned|estimated)/), n9 = (h11 = t72.headers.get("content-range")) === null || h11 === void 0 ? void 0 : h11.split("/");
      c9 && n9 && n9.length > 1 && (l8 = parseInt(n9[1])), e4.isMaybeSingle && Array.isArray(s8) && (s8.length > 1 ? (r10 = { code: "PGRST116", details: `Results contain ${s8.length} rows, application/vnd.pgrst.object+json requires 1 row`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }, s8 = null, l8 = null, a8 = 406, i12 = "Not Acceptable") : s8.length === 1 ? s8 = s8[0] : s8 = null);
    } else {
      let c9 = await t72.text();
      try {
        r10 = JSON.parse(c9), Array.isArray(r10) && t72.status === 404 && (s8 = [], r10 = null, a8 = 200, i12 = "OK");
      } catch {
        t72.status === 404 && c9 === "" ? (a8 = 204, i12 = "No Content") : r10 = { message: c9 };
      }
      if (r10 && e4.shouldThrowOnError) throw new b(r10);
    }
    return { success: r10 === null, error: r10, data: s8, count: l8, status: a8, statusText: i12 };
  }
  returns() {
    return this;
  }
  overrideTypes() {
    return this;
  }
};
var R = class extends E3 {
  throwOnError() {
    return super.throwOnError();
  }
  select(t72) {
    let e4 = false, r10 = (t72 ?? "*").split("").map((s8) => /\s/.test(s8) && !e4 ? "" : (s8 === '"' && (e4 = !e4), s8)).join("");
    return this.url.searchParams.set("select", r10), this.headers.append("Prefer", "return=representation"), this;
  }
  order(t72, { ascending: e4 = true, nullsFirst: r10, foreignTable: s8, referencedTable: l8 = s8 } = {}) {
    let a8 = l8 ? `${l8}.order` : "order", i12 = this.url.searchParams.get(a8);
    return this.url.searchParams.set(a8, `${i12 ? `${i12},` : ""}${t72}.${e4 ? "asc" : "desc"}${r10 === void 0 ? "" : r10 ? ".nullsfirst" : ".nullslast"}`), this;
  }
  limit(t72, { foreignTable: e4, referencedTable: r10 = e4 } = {}) {
    let s8 = typeof r10 > "u" ? "limit" : `${r10}.limit`;
    return this.url.searchParams.set(s8, `${t72}`), this;
  }
  range(t72, e4, { foreignTable: r10, referencedTable: s8 = r10 } = {}) {
    let l8 = typeof s8 > "u" ? "offset" : `${s8}.offset`, a8 = typeof s8 > "u" ? "limit" : `${s8}.limit`;
    return this.url.searchParams.set(l8, `${t72}`), this.url.searchParams.set(a8, `${e4 - t72 + 1}`), this;
  }
  abortSignal(t72) {
    return this.signal = t72, this;
  }
  single() {
    return this.headers.set("Accept", "application/vnd.pgrst.object+json"), this;
  }
  maybeSingle() {
    return this.isMaybeSingle = true, this;
  }
  csv() {
    return this.headers.set("Accept", "text/csv"), this;
  }
  geojson() {
    return this.headers.set("Accept", "application/geo+json"), this;
  }
  explain({ analyze: t72 = false, verbose: e4 = false, settings: r10 = false, buffers: s8 = false, wal: l8 = false, format: a8 = "text" } = {}) {
    var i12;
    let u8 = [t72 ? "analyze" : null, e4 ? "verbose" : null, r10 ? "settings" : null, s8 ? "buffers" : null, l8 ? "wal" : null].filter(Boolean).join("|"), h11 = (i12 = this.headers.get("Accept")) !== null && i12 !== void 0 ? i12 : "application/json";
    return this.headers.set("Accept", `application/vnd.pgrst.plan+${a8}; for="${h11}"; options=${u8};`), a8 === "json" ? this : this;
  }
  rollback() {
    return this.headers.append("Prefer", "tx=rollback"), this;
  }
  returns() {
    return this;
  }
  maxAffected(t72) {
    return this.headers.append("Prefer", "handling=strict"), this.headers.append("Prefer", `max-affected=${t72}`), this;
  }
};
var O3 = new RegExp("[,()]");
var m = class extends R {
  throwOnError() {
    return super.throwOnError();
  }
  eq(t72, e4) {
    return this.url.searchParams.append(t72, `eq.${e4}`), this;
  }
  neq(t72, e4) {
    return this.url.searchParams.append(t72, `neq.${e4}`), this;
  }
  gt(t72, e4) {
    return this.url.searchParams.append(t72, `gt.${e4}`), this;
  }
  gte(t72, e4) {
    return this.url.searchParams.append(t72, `gte.${e4}`), this;
  }
  lt(t72, e4) {
    return this.url.searchParams.append(t72, `lt.${e4}`), this;
  }
  lte(t72, e4) {
    return this.url.searchParams.append(t72, `lte.${e4}`), this;
  }
  like(t72, e4) {
    return this.url.searchParams.append(t72, `like.${e4}`), this;
  }
  likeAllOf(t72, e4) {
    return this.url.searchParams.append(t72, `like(all).{${e4.join(",")}}`), this;
  }
  likeAnyOf(t72, e4) {
    return this.url.searchParams.append(t72, `like(any).{${e4.join(",")}}`), this;
  }
  ilike(t72, e4) {
    return this.url.searchParams.append(t72, `ilike.${e4}`), this;
  }
  ilikeAllOf(t72, e4) {
    return this.url.searchParams.append(t72, `ilike(all).{${e4.join(",")}}`), this;
  }
  ilikeAnyOf(t72, e4) {
    return this.url.searchParams.append(t72, `ilike(any).{${e4.join(",")}}`), this;
  }
  regexMatch(t72, e4) {
    return this.url.searchParams.append(t72, `match.${e4}`), this;
  }
  regexIMatch(t72, e4) {
    return this.url.searchParams.append(t72, `imatch.${e4}`), this;
  }
  is(t72, e4) {
    return this.url.searchParams.append(t72, `is.${e4}`), this;
  }
  isDistinct(t72, e4) {
    return this.url.searchParams.append(t72, `isdistinct.${e4}`), this;
  }
  in(t72, e4) {
    let r10 = Array.from(new Set(e4)).map((s8) => typeof s8 == "string" && O3.test(s8) ? `"${s8}"` : `${s8}`).join(",");
    return this.url.searchParams.append(t72, `in.(${r10})`), this;
  }
  notIn(t72, e4) {
    let r10 = Array.from(new Set(e4)).map((s8) => typeof s8 == "string" && O3.test(s8) ? `"${s8}"` : `${s8}`).join(",");
    return this.url.searchParams.append(t72, `not.in.(${r10})`), this;
  }
  contains(t72, e4) {
    return typeof e4 == "string" ? this.url.searchParams.append(t72, `cs.${e4}`) : Array.isArray(e4) ? this.url.searchParams.append(t72, `cs.{${e4.join(",")}}`) : this.url.searchParams.append(t72, `cs.${JSON.stringify(e4)}`), this;
  }
  containedBy(t72, e4) {
    return typeof e4 == "string" ? this.url.searchParams.append(t72, `cd.${e4}`) : Array.isArray(e4) ? this.url.searchParams.append(t72, `cd.{${e4.join(",")}}`) : this.url.searchParams.append(t72, `cd.${JSON.stringify(e4)}`), this;
  }
  rangeGt(t72, e4) {
    return this.url.searchParams.append(t72, `sr.${e4}`), this;
  }
  rangeGte(t72, e4) {
    return this.url.searchParams.append(t72, `nxl.${e4}`), this;
  }
  rangeLt(t72, e4) {
    return this.url.searchParams.append(t72, `sl.${e4}`), this;
  }
  rangeLte(t72, e4) {
    return this.url.searchParams.append(t72, `nxr.${e4}`), this;
  }
  rangeAdjacent(t72, e4) {
    return this.url.searchParams.append(t72, `adj.${e4}`), this;
  }
  overlaps(t72, e4) {
    return typeof e4 == "string" ? this.url.searchParams.append(t72, `ov.${e4}`) : this.url.searchParams.append(t72, `ov.{${e4.join(",")}}`), this;
  }
  textSearch(t72, e4, { config: r10, type: s8 } = {}) {
    let l8 = "";
    s8 === "plain" ? l8 = "pl" : s8 === "phrase" ? l8 = "ph" : s8 === "websearch" && (l8 = "w");
    let a8 = r10 === void 0 ? "" : `(${r10})`;
    return this.url.searchParams.append(t72, `${l8}fts${a8}.${e4}`), this;
  }
  match(t72) {
    return Object.entries(t72).filter(([e4, r10]) => r10 !== void 0).forEach(([e4, r10]) => {
      this.url.searchParams.append(e4, `eq.${r10}`);
    }), this;
  }
  not(t72, e4, r10) {
    return this.url.searchParams.append(t72, `not.${e4}.${r10}`), this;
  }
  or(t72, { foreignTable: e4, referencedTable: r10 = e4 } = {}) {
    let s8 = r10 ? `${r10}.or` : "or";
    return this.url.searchParams.append(s8, `(${t72})`), this;
  }
  filter(t72, e4, r10) {
    return this.url.searchParams.append(t72, `${e4}.${r10}`), this;
  }
};
var T2 = class {
  constructor(t72, { headers: e4 = {}, schema: r10, fetch: s8, urlLengthLimit: l8 = 8e3, retry: a8 }) {
    this.url = t72, this.headers = new Headers(e4), this.schema = r10, this.fetch = s8, this.urlLengthLimit = l8, this.retry = a8;
  }
  cloneRequestState() {
    return { url: new URL(this.url.toString()), headers: new Headers(this.headers) };
  }
  select(t72, e4) {
    let { head: r10 = false, count: s8 } = e4 ?? {}, l8 = r10 ? "HEAD" : "GET", a8 = false, i12 = (t72 ?? "*").split("").map((o18) => /\s/.test(o18) && !a8 ? "" : (o18 === '"' && (a8 = !a8), o18)).join(""), { url: u8, headers: h11 } = this.cloneRequestState();
    return u8.searchParams.set("select", i12), s8 && h11.append("Prefer", `count=${s8}`), new m({ method: l8, url: u8, headers: h11, schema: this.schema, fetch: this.fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  insert(t72, { count: e4, defaultToNull: r10 = true } = {}) {
    var s8;
    let l8 = "POST", { url: a8, headers: i12 } = this.cloneRequestState();
    if (e4 && i12.append("Prefer", `count=${e4}`), r10 || i12.append("Prefer", "missing=default"), Array.isArray(t72)) {
      let u8 = t72.reduce((h11, o18) => h11.concat(Object.keys(o18)), []);
      if (u8.length > 0) {
        let h11 = [...new Set(u8)].map((o18) => `"${o18}"`);
        a8.searchParams.set("columns", h11.join(","));
      }
    }
    return new m({ method: l8, url: a8, headers: i12, schema: this.schema, body: t72, fetch: (s8 = this.fetch) !== null && s8 !== void 0 ? s8 : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  upsert(t72, { onConflict: e4, ignoreDuplicates: r10 = false, count: s8, defaultToNull: l8 = true } = {}) {
    var a8;
    let i12 = "POST", { url: u8, headers: h11 } = this.cloneRequestState();
    if (h11.append("Prefer", `resolution=${r10 ? "ignore" : "merge"}-duplicates`), e4 !== void 0 && u8.searchParams.set("on_conflict", e4), s8 && h11.append("Prefer", `count=${s8}`), l8 || h11.append("Prefer", "missing=default"), Array.isArray(t72)) {
      let o18 = t72.reduce((c9, n9) => c9.concat(Object.keys(n9)), []);
      if (o18.length > 0) {
        let c9 = [...new Set(o18)].map((n9) => `"${n9}"`);
        u8.searchParams.set("columns", c9.join(","));
      }
    }
    return new m({ method: i12, url: u8, headers: h11, schema: this.schema, body: t72, fetch: (a8 = this.fetch) !== null && a8 !== void 0 ? a8 : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  update(t72, { count: e4 } = {}) {
    var r10;
    let s8 = "PATCH", { url: l8, headers: a8 } = this.cloneRequestState();
    return e4 && a8.append("Prefer", `count=${e4}`), new m({ method: s8, url: l8, headers: a8, schema: this.schema, body: t72, fetch: (r10 = this.fetch) !== null && r10 !== void 0 ? r10 : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  delete({ count: t72 } = {}) {
    var e4;
    let r10 = "DELETE", { url: s8, headers: l8 } = this.cloneRequestState();
    return t72 && l8.append("Prefer", `count=${t72}`), new m({ method: r10, url: s8, headers: l8, schema: this.schema, fetch: (e4 = this.fetch) !== null && e4 !== void 0 ? e4 : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
};
function y(t72) {
  "@babel/helpers - typeof";
  return y = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e4) {
    return typeof e4;
  } : function(e4) {
    return e4 && typeof Symbol == "function" && e4.constructor === Symbol && e4 !== Symbol.prototype ? "symbol" : typeof e4;
  }, y(t72);
}
function H2(t72, e4) {
  if (y(t72) != "object" || !t72) return t72;
  var r10 = t72[Symbol.toPrimitive];
  if (r10 !== void 0) {
    var s8 = r10.call(t72, e4 || "default");
    if (y(s8) != "object") return s8;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e4 === "string" ? String : Number)(t72);
}
function q2(t72) {
  var e4 = H2(t72, "string");
  return y(e4) == "symbol" ? e4 : e4 + "";
}
function _(t72, e4, r10) {
  return (e4 = q2(e4)) in t72 ? Object.defineProperty(t72, e4, { value: r10, enumerable: true, configurable: true, writable: true }) : t72[e4] = r10, t72;
}
function S3(t72, e4) {
  var r10 = Object.keys(t72);
  if (Object.getOwnPropertySymbols) {
    var s8 = Object.getOwnPropertySymbols(t72);
    e4 && (s8 = s8.filter(function(l8) {
      return Object.getOwnPropertyDescriptor(t72, l8).enumerable;
    })), r10.push.apply(r10, s8);
  }
  return r10;
}
function v(t72) {
  for (var e4 = 1; e4 < arguments.length; e4++) {
    var r10 = arguments[e4] != null ? arguments[e4] : {};
    e4 % 2 ? S3(Object(r10), true).forEach(function(s8) {
      _(t72, s8, r10[s8]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t72, Object.getOwnPropertyDescriptors(r10)) : S3(Object(r10)).forEach(function(s8) {
      Object.defineProperty(t72, s8, Object.getOwnPropertyDescriptor(r10, s8));
    });
  }
  return t72;
}
var C2 = class x3 {
  constructor(e4, { headers: r10 = {}, schema: s8, fetch: l8, timeout: a8, urlLengthLimit: i12 = 8e3, retry: u8 } = {}) {
    this.url = e4, this.headers = new Headers(r10), this.schemaName = s8, this.urlLengthLimit = i12;
    let h11 = l8 ?? globalThis.fetch;
    a8 !== void 0 && a8 > 0 ? this.fetch = (o18, c9) => {
      let n9 = new AbortController(), d5 = setTimeout(() => n9.abort(), a8), p9 = c9?.signal;
      if (p9) {
        if (p9.aborted) return clearTimeout(d5), h11(o18, c9);
        let f11 = () => {
          clearTimeout(d5), n9.abort();
        };
        return p9.addEventListener("abort", f11, { once: true }), h11(o18, v(v({}, c9), {}, { signal: n9.signal })).finally(() => {
          clearTimeout(d5), p9.removeEventListener("abort", f11);
        });
      }
      return h11(o18, v(v({}, c9), {}, { signal: n9.signal })).finally(() => clearTimeout(d5));
    } : this.fetch = h11, this.retry = u8;
  }
  from(e4) {
    if (!e4 || typeof e4 != "string" || e4.trim() === "") throw new Error("Invalid relation name: relation must be a non-empty string.");
    return new T2(new URL(`${this.url}/${e4}`), { headers: new Headers(this.headers), schema: this.schemaName, fetch: this.fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  schema(e4) {
    return new x3(this.url, { headers: this.headers, schema: e4, fetch: this.fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  rpc(e4, r10 = {}, { head: s8 = false, get: l8 = false, count: a8 } = {}) {
    var i12;
    let u8, h11 = new URL(`${this.url}/rpc/${e4}`), o18, c9 = (p9) => p9 !== null && typeof p9 == "object" && (!Array.isArray(p9) || p9.some(c9)), n9 = s8 && Object.values(r10).some(c9);
    n9 ? (u8 = "POST", o18 = r10) : s8 || l8 ? (u8 = s8 ? "HEAD" : "GET", Object.entries(r10).filter(([p9, f11]) => f11 !== void 0).map(([p9, f11]) => [p9, Array.isArray(f11) ? `{${f11.join(",")}}` : `${f11}`]).forEach(([p9, f11]) => {
      h11.searchParams.append(p9, f11);
    })) : (u8 = "POST", o18 = r10);
    let d5 = new Headers(this.headers);
    return n9 ? d5.set("Prefer", a8 ? `count=${a8},return=minimal` : "return=minimal") : a8 && d5.set("Prefer", `count=${a8}`), new m({ method: u8, url: h11, headers: d5, schema: this.schemaName, body: o18, fetch: (i12 = this.fetch) !== null && i12 !== void 0 ? i12 : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/realtime-js@2.108.1/denonext/realtime-js.mjs
import __Process$ from "node:process";

// supabase/functions/_vendor/esm.sh/@supabase/phoenix@0.4.5/denonext/phoenix.mjs
var k = (e4) => typeof e4 == "function" ? e4 : function() {
  return e4;
};
var _2 = typeof self < "u" ? self : null;
var C3 = typeof globalThis < "u" ? globalThis : null;
var m2 = _2 || C3 || globalThis;
var B2 = "2.0.0";
var O4 = 1e4;
var P2 = 1e3;
var N3 = 100;
var b2 = { connecting: 0, open: 1, closing: 2, closed: 3 };
var f3 = { closed: "closed", errored: "errored", joined: "joined", joining: "joining", leaving: "leaving" };
var T3 = { close: "phx_close", error: "phx_error", join: "phx_join", reply: "phx_reply", leave: "phx_leave" };
var w = { longpoll: "longpoll", websocket: "websocket" };
var x4 = { complete: 4 };
var A4 = "base64url.bearer.phx.";
var E4 = class {
  constructor(e4, t72, i12, s8) {
    this.channel = e4, this.event = t72, this.payload = i12 || function() {
      return {};
    }, this.receivedResp = null, this.timeout = s8, this.timeoutTimer = null, this.recHooks = [], this.sent = false, this.ref = void 0;
  }
  resend(e4) {
    this.timeout = e4, this.reset(), this.send();
  }
  send() {
    this.hasReceived("timeout") || (this.startTimeout(), this.sent = true, this.channel.socket.push({ topic: this.channel.topic, event: this.event, payload: this.payload(), ref: this.ref, join_ref: this.channel.joinRef() }));
  }
  receive(e4, t72) {
    return this.hasReceived(e4) && t72(this.receivedResp.response), this.recHooks.push({ status: e4, callback: t72 }), this;
  }
  reset() {
    this.cancelRefEvent(), this.ref = null, this.refEvent = null, this.receivedResp = null, this.sent = false;
  }
  destroy() {
    this.cancelRefEvent(), this.cancelTimeout();
  }
  matchReceive({ status: e4, response: t72, _ref: i12 }) {
    this.recHooks.filter((s8) => s8.status === e4).forEach((s8) => s8.callback(t72));
  }
  cancelRefEvent() {
    this.refEvent && this.channel.off(this.refEvent);
  }
  cancelTimeout() {
    clearTimeout(this.timeoutTimer), this.timeoutTimer = null;
  }
  startTimeout() {
    this.timeoutTimer && this.cancelTimeout(), this.ref = this.channel.socket.makeRef(), this.refEvent = this.channel.replyEventName(this.ref), this.channel.on(this.refEvent, (e4) => {
      this.cancelRefEvent(), this.cancelTimeout(), this.receivedResp = e4, this.matchReceive(e4);
    }), this.timeoutTimer = setTimeout(() => {
      this.trigger("timeout", {});
    }, this.timeout);
  }
  hasReceived(e4) {
    return this.receivedResp && this.receivedResp.status === e4;
  }
  trigger(e4, t72) {
    this.channel.trigger(this.refEvent, { status: e4, response: t72 });
  }
};
var H3 = class {
  constructor(e4, t72) {
    this.callback = e4, this.timerCalc = t72, this.timer = void 0, this.tries = 0;
  }
  reset() {
    this.tries = 0, clearTimeout(this.timer);
  }
  scheduleTimeout() {
    clearTimeout(this.timer), this.timer = setTimeout(() => {
      this.tries = this.tries + 1, this.callback();
    }, this.timerCalc(this.tries + 1));
  }
};
var $2 = class {
  constructor(e4, t72, i12) {
    this.state = f3.closed, this.topic = e4, this.params = k(t72 || {}), this.socket = i12, this.bindings = [], this.bindingRef = 0, this.timeout = this.socket.timeout, this.joinedOnce = false, this.joinPush = new E4(this, T3.join, this.params, this.timeout), this.pushBuffer = [], this.stateChangeRefs = [], this.rejoinTimer = new H3(() => {
      this.socket.isConnected() && this.rejoin();
    }, this.socket.rejoinAfterMs), this.stateChangeRefs.push(this.socket.onError(() => this.rejoinTimer.reset())), this.stateChangeRefs.push(this.socket.onOpen(() => {
      this.rejoinTimer.reset(), this.isErrored() && this.rejoin();
    })), this.joinPush.receive("ok", () => {
      this.state = f3.joined, this.rejoinTimer.reset(), this.pushBuffer.forEach((s8) => s8.send()), this.pushBuffer = [];
    }), this.joinPush.receive("error", (s8) => {
      this.state = f3.errored, this.socket.hasLogger() && this.socket.log("channel", `error ${this.topic}`, s8), this.socket.isConnected() && this.rejoinTimer.scheduleTimeout();
    }), this.onClose(() => {
      this.rejoinTimer.reset(), this.socket.hasLogger() && this.socket.log("channel", `close ${this.topic}`), this.state = f3.closed, this.socket.remove(this);
    }), this.onError((s8) => {
      this.socket.hasLogger() && this.socket.log("channel", `error ${this.topic}`, s8), this.isJoining() && this.joinPush.reset(), this.state = f3.errored, this.socket.isConnected() && this.rejoinTimer.scheduleTimeout();
    }), this.joinPush.receive("timeout", () => {
      this.socket.hasLogger() && this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout), new E4(this, T3.leave, k({}), this.timeout).send(), this.state = f3.errored, this.joinPush.reset(), this.socket.isConnected() && this.rejoinTimer.scheduleTimeout();
    }), this.on(T3.reply, (s8, n9) => {
      this.trigger(this.replyEventName(n9), s8);
    });
  }
  join(e4 = this.timeout) {
    if (this.joinedOnce) throw new Error("tried to join multiple times. 'join' can only be called a single time per channel instance");
    return this.timeout = e4, this.joinedOnce = true, this.rejoin(), this.joinPush;
  }
  teardown() {
    this.pushBuffer.forEach((e4) => e4.destroy()), this.pushBuffer = [], this.rejoinTimer.reset(), this.joinPush.destroy(), this.state = f3.closed, this.bindings = [];
  }
  onClose(e4) {
    this.on(T3.close, e4);
  }
  onError(e4) {
    return this.on(T3.error, (t72) => e4(t72));
  }
  on(e4, t72) {
    let i12 = this.bindingRef++;
    return this.bindings.push({ event: e4, ref: i12, callback: t72 }), i12;
  }
  off(e4, t72) {
    this.bindings = this.bindings.filter((i12) => !(i12.event === e4 && (typeof t72 > "u" || t72 === i12.ref)));
  }
  canPush() {
    return this.socket.isConnected() && this.isJoined();
  }
  push(e4, t72, i12 = this.timeout) {
    if (t72 = t72 || {}, !this.joinedOnce) throw new Error(`tried to push '${e4}' to '${this.topic}' before joining. Use channel.join() before pushing events`);
    let s8 = new E4(this, e4, function() {
      return t72;
    }, i12);
    return this.canPush() ? s8.send() : (s8.startTimeout(), this.pushBuffer.push(s8)), s8;
  }
  leave(e4 = this.timeout) {
    this.rejoinTimer.reset(), this.joinPush.cancelTimeout(), this.state = f3.leaving;
    let t72 = () => {
      this.socket.hasLogger() && this.socket.log("channel", `leave ${this.topic}`), this.trigger(T3.close, "leave");
    }, i12 = new E4(this, T3.leave, k({}), e4);
    return i12.receive("ok", () => t72()).receive("timeout", () => t72()), i12.send(), this.canPush() || i12.trigger("ok", {}), i12;
  }
  onMessage(e4, t72, i12) {
    return t72;
  }
  filterBindings(e4, t72, i12) {
    return true;
  }
  isMember(e4, t72, i12, s8) {
    return this.topic !== e4 ? false : s8 && s8 !== this.joinRef() ? (this.socket.hasLogger() && this.socket.log("channel", "dropping outdated message", { topic: e4, event: t72, payload: i12, joinRef: s8 }), false) : true;
  }
  joinRef() {
    return this.joinPush.ref;
  }
  rejoin(e4 = this.timeout) {
    this.isLeaving() || (this.socket.leaveOpenTopic(this.topic), this.state = f3.joining, this.joinPush.resend(e4));
  }
  trigger(e4, t72, i12, s8) {
    let n9 = this.onMessage(e4, t72, i12, s8);
    if (t72 && !n9) throw new Error("channel onMessage callbacks must return the payload, modified or unmodified");
    let o18 = this.bindings.filter((h11) => h11.event === e4 && this.filterBindings(h11, t72, i12));
    for (let h11 = 0; h11 < o18.length; h11++) o18[h11].callback(n9, i12, s8 || this.joinRef());
  }
  replyEventName(e4) {
    return `chan_reply_${e4}`;
  }
  isClosed() {
    return this.state === f3.closed;
  }
  isErrored() {
    return this.state === f3.errored;
  }
  isJoined() {
    return this.state === f3.joined;
  }
  isJoining() {
    return this.state === f3.joining;
  }
  isLeaving() {
    return this.state === f3.leaving;
  }
};
var j2 = class {
  static request(e4, t72, i12, s8, n9, o18, h11) {
    if (m2.XDomainRequest) {
      let r10 = new m2.XDomainRequest();
      return this.xdomainRequest(r10, e4, t72, s8, n9, o18, h11);
    } else if (m2.XMLHttpRequest) {
      let r10 = new m2.XMLHttpRequest();
      return this.xhrRequest(r10, e4, t72, i12, s8, n9, o18, h11);
    } else {
      if (m2.fetch && m2.AbortController) return this.fetchRequest(e4, t72, i12, s8, n9, o18, h11);
      throw new Error("No suitable XMLHttpRequest implementation found");
    }
  }
  static fetchRequest(e4, t72, i12, s8, n9, o18, h11) {
    let r10 = { method: e4, headers: i12, body: s8 }, a8 = null;
    if (n9) {
      a8 = new AbortController();
      let l8 = setTimeout(() => a8.abort(), n9);
      r10.signal = a8.signal;
    }
    return m2.fetch(t72, r10).then((l8) => l8.text()).then((l8) => this.parseJSON(l8)).then((l8) => h11 && h11(l8)).catch((l8) => {
      l8.name === "AbortError" && o18 ? o18() : h11 && h11(null);
    }), a8;
  }
  static xdomainRequest(e4, t72, i12, s8, n9, o18, h11) {
    return e4.timeout = n9, e4.open(t72, i12), e4.onload = () => {
      let r10 = this.parseJSON(e4.responseText);
      h11 && h11(r10);
    }, o18 && (e4.ontimeout = o18), e4.onprogress = () => {
    }, e4.send(s8), e4;
  }
  static xhrRequest(e4, t72, i12, s8, n9, o18, h11, r10) {
    e4.open(t72, i12, true), e4.timeout = o18;
    for (let [a8, l8] of Object.entries(s8)) e4.setRequestHeader(a8, l8);
    return e4.onerror = () => r10 && r10(null), e4.onreadystatechange = () => {
      if (e4.readyState === x4.complete && r10) {
        let a8 = this.parseJSON(e4.responseText);
        r10(a8);
      }
    }, h11 && (e4.ontimeout = h11), e4.send(n9), e4;
  }
  static parseJSON(e4) {
    if (!e4 || e4 === "") return null;
    try {
      return JSON.parse(e4);
    } catch {
      return console && console.log("failed to parse JSON response", e4), null;
    }
  }
  static serialize(e4, t72) {
    let i12 = [];
    for (var s8 in e4) {
      if (!Object.prototype.hasOwnProperty.call(e4, s8)) continue;
      let n9 = t72 ? `${t72}[${s8}]` : s8, o18 = e4[s8];
      typeof o18 == "object" ? i12.push(this.serialize(o18, n9)) : i12.push(encodeURIComponent(n9) + "=" + encodeURIComponent(o18));
    }
    return i12.join("&");
  }
  static appendParams(e4, t72) {
    if (Object.keys(t72).length === 0) return e4;
    let i12 = e4.match(/\?/) ? "&" : "?";
    return `${e4}${i12}${this.serialize(t72)}`;
  }
};
var M2 = (e4) => {
  let t72 = "", i12 = new Uint8Array(e4), s8 = i12.byteLength;
  for (let n9 = 0; n9 < s8; n9++) t72 += String.fromCharCode(i12[n9]);
  return btoa(t72);
};
var y2 = class {
  constructor(e4, t72) {
    t72 && t72.length === 2 && t72[1].startsWith(A4) && (this.authToken = atob(t72[1].slice(A4.length))), this.endPoint = null, this.token = null, this.skipHeartbeat = true, this.reqs = /* @__PURE__ */ new Set(), this.awaitingBatchAck = false, this.currentBatch = null, this.currentBatchTimer = null, this.batchBuffer = [], this.onopen = function() {
    }, this.onerror = function() {
    }, this.onmessage = function() {
    }, this.onclose = function() {
    }, this.pollEndpoint = this.normalizeEndpoint(e4), this.readyState = b2.connecting, setTimeout(() => this.poll(), 0);
  }
  normalizeEndpoint(e4) {
    return e4.replace("ws://", "http://").replace("wss://", "https://").replace(new RegExp("(.*)/" + w.websocket), "$1/" + w.longpoll);
  }
  endpointURL() {
    return j2.appendParams(this.pollEndpoint, { token: this.token });
  }
  closeAndRetry(e4, t72, i12) {
    this.close(e4, t72, i12), this.readyState = b2.connecting;
  }
  ontimeout() {
    this.onerror("timeout"), this.closeAndRetry(1005, "timeout", false);
  }
  isActive() {
    return this.readyState === b2.open || this.readyState === b2.connecting;
  }
  poll() {
    let e4 = { Accept: "application/json" };
    this.authToken && (e4["X-Phoenix-AuthToken"] = this.authToken), this.ajax("GET", e4, null, () => this.ontimeout(), (t72) => {
      if (t72) {
        var { status: i12, token: s8, messages: n9 } = t72;
        if (i12 === 410 && this.token !== null) {
          this.onerror(410), this.closeAndRetry(3410, "session_gone", false);
          return;
        }
        this.token = s8;
      } else i12 = 0;
      switch (i12) {
        case 200:
          n9.forEach((o18) => {
            setTimeout(() => this.onmessage({ data: o18 }), 0);
          }), this.poll();
          break;
        case 204:
          this.poll();
          break;
        case 410:
          this.readyState = b2.open, this.onopen({}), this.poll();
          break;
        case 403:
          this.onerror(403), this.close(1008, "forbidden", false);
          break;
        case 0:
        case 500:
          this.onerror(500), this.closeAndRetry(1011, "internal server error", 500);
          break;
        default:
          throw new Error(`unhandled poll status ${i12}`);
      }
    });
  }
  send(e4) {
    typeof e4 != "string" && (e4 = M2(e4)), this.currentBatch ? this.currentBatch.push(e4) : this.awaitingBatchAck ? this.batchBuffer.push(e4) : (this.currentBatch = [e4], this.currentBatchTimer = setTimeout(() => {
      this.batchSend(this.currentBatch), this.currentBatch = null;
    }, 0));
  }
  batchSend(e4, t72 = 0) {
    this.awaitingBatchAck = true;
    let i12 = t72 + N3, s8 = e4.slice(t72, i12);
    this.ajax("POST", { "Content-Type": "application/x-ndjson" }, s8.join(`
`), () => this.onerror("timeout"), (n9) => {
      !n9 || n9.status !== 200 ? (this.awaitingBatchAck = false, this.onerror(n9 && n9.status), this.closeAndRetry(1011, "internal server error", false)) : i12 < e4.length ? this.batchSend(e4, i12) : this.batchBuffer.length > 0 ? (this.batchSend(this.batchBuffer), this.batchBuffer = []) : this.awaitingBatchAck = false;
    });
  }
  close(e4, t72, i12) {
    for (let n9 of this.reqs) n9.abort();
    this.readyState = b2.closed;
    let s8 = Object.assign({ code: 1e3, reason: void 0, wasClean: true }, { code: e4, reason: t72, wasClean: i12 });
    this.batchBuffer = [], clearTimeout(this.currentBatchTimer), this.currentBatchTimer = null, typeof CloseEvent < "u" ? this.onclose(new CloseEvent("close", s8)) : this.onclose(s8);
  }
  ajax(e4, t72, i12, s8, n9) {
    let o18, h11 = () => {
      this.reqs.delete(o18), s8();
    };
    o18 = j2.request(e4, this.endpointURL(), t72, i12, this.timeout, h11, (r10) => {
      this.reqs.delete(o18), this.isActive() && n9(r10);
    }), this.reqs.add(o18);
  }
};
var D2 = class S4 {
  constructor(t72, i12 = {}) {
    let s8 = i12.events || { state: "presence_state", diff: "presence_diff" };
    this.state = /* @__PURE__ */ Object.create(null), this.pendingDiffs = [], this.channel = t72, this.joinRef = null, this.caller = { onJoin: function() {
    }, onLeave: function() {
    }, onSync: function() {
    } }, this.channel.on(s8.state, (n9) => {
      let { onJoin: o18, onLeave: h11, onSync: r10 } = this.caller;
      this.joinRef = this.channel.joinRef(), this.state = S4.syncState(this.state, n9, o18, h11), this.pendingDiffs.forEach((a8) => {
        this.state = S4.syncDiff(this.state, a8, o18, h11);
      }), this.pendingDiffs = [], r10();
    }), this.channel.on(s8.diff, (n9) => {
      let { onJoin: o18, onLeave: h11, onSync: r10 } = this.caller;
      this.inPendingSyncState() ? this.pendingDiffs.push(n9) : (this.state = S4.syncDiff(this.state, n9, o18, h11), r10());
    });
  }
  onJoin(t72) {
    this.caller.onJoin = t72;
  }
  onLeave(t72) {
    this.caller.onLeave = t72;
  }
  onSync(t72) {
    this.caller.onSync = t72;
  }
  list(t72) {
    return S4.list(this.state, t72);
  }
  inPendingSyncState() {
    return !this.joinRef || this.joinRef !== this.channel.joinRef();
  }
  static syncState(t72, i12, s8, n9) {
    let o18 = this.toNullProtoObj(this.clone(t72));
    i12 = this.toNullProtoObj(i12);
    let h11 = /* @__PURE__ */ Object.create(null), r10 = /* @__PURE__ */ Object.create(null);
    return this.map(o18, (a8, l8) => {
      i12[a8] || (r10[a8] = l8);
    }), this.map(i12, (a8, l8) => {
      let u8 = o18[a8];
      if (u8) {
        let g6 = l8.metas.map((c9) => c9.phx_ref), d5 = u8.metas.map((c9) => c9.phx_ref), p9 = l8.metas.filter((c9) => d5.indexOf(c9.phx_ref) < 0), v6 = u8.metas.filter((c9) => g6.indexOf(c9.phx_ref) < 0);
        p9.length > 0 && (h11[a8] = l8, h11[a8].metas = p9), v6.length > 0 && (r10[a8] = this.clone(u8), r10[a8].metas = v6);
      } else h11[a8] = l8;
    }), this.syncDiff(o18, { joins: h11, leaves: r10 }, s8, n9);
  }
  static syncDiff(t72, i12, s8, n9) {
    t72 = this.toNullProtoObj(t72);
    let { joins: o18, leaves: h11 } = this.clone(i12);
    return s8 || (s8 = function() {
    }), n9 || (n9 = function() {
    }), this.map(o18, (r10, a8) => {
      let l8 = t72[r10];
      if (t72[r10] = this.clone(a8), l8) {
        let u8 = t72[r10].metas.map((d5) => d5.phx_ref), g6 = l8.metas.filter((d5) => u8.indexOf(d5.phx_ref) < 0);
        t72[r10].metas.unshift(...g6);
      }
      s8(r10, l8, a8);
    }), this.map(h11, (r10, a8) => {
      let l8 = t72[r10];
      if (!l8) return;
      let u8 = a8.metas.map((g6) => g6.phx_ref);
      l8.metas = l8.metas.filter((g6) => u8.indexOf(g6.phx_ref) < 0), n9(r10, l8, a8), l8.metas.length === 0 && delete t72[r10];
    }), t72;
  }
  static list(t72, i12) {
    return i12 || (i12 = function(s8, n9) {
      return n9;
    }), this.map(t72, (s8, n9) => i12(s8, n9));
  }
  static map(t72, i12) {
    return Object.getOwnPropertyNames(t72).map((s8) => i12(s8, t72[s8]));
  }
  static toNullProtoObj(t72) {
    if (Object.getPrototypeOf(t72) === null) return t72;
    let i12 = /* @__PURE__ */ Object.create(null);
    return Object.getOwnPropertyNames(t72).forEach((s8) => {
      i12[s8] = t72[s8];
    }), i12;
  }
  static clone(t72) {
    return JSON.parse(JSON.stringify(t72));
  }
};
var R2 = { HEADER_LENGTH: 1, META_LENGTH: 4, KINDS: { push: 0, reply: 1, broadcast: 2 }, encode(e4, t72) {
  if (e4.payload.constructor === ArrayBuffer) return t72(this.binaryEncode(e4));
  {
    let i12 = [e4.join_ref, e4.ref, e4.topic, e4.event, e4.payload];
    return t72(JSON.stringify(i12));
  }
}, decode(e4, t72) {
  if (e4.constructor === ArrayBuffer) return t72(this.binaryDecode(e4));
  {
    let [i12, s8, n9, o18, h11] = JSON.parse(e4);
    return t72({ join_ref: i12, ref: s8, topic: n9, event: o18, payload: h11 });
  }
}, binaryEncode(e4) {
  let { join_ref: t72, ref: i12, event: s8, topic: n9, payload: o18 } = e4, h11 = new TextEncoder(), r10 = h11.encode(t72), a8 = h11.encode(i12), l8 = h11.encode(n9), u8 = h11.encode(s8);
  this.assertFieldSize(r10.byteLength, "join_ref"), this.assertFieldSize(a8.byteLength, "ref"), this.assertFieldSize(l8.byteLength, "topic"), this.assertFieldSize(u8.byteLength, "event");
  let g6 = this.META_LENGTH + r10.byteLength + a8.byteLength + l8.byteLength + u8.byteLength, d5 = new ArrayBuffer(this.HEADER_LENGTH + g6), p9 = new Uint8Array(d5), v6 = new DataView(d5), c9 = 0;
  v6.setUint8(c9++, this.KINDS.push), v6.setUint8(c9++, r10.byteLength), v6.setUint8(c9++, a8.byteLength), v6.setUint8(c9++, l8.byteLength), v6.setUint8(c9++, u8.byteLength), p9.set(r10, c9), c9 += r10.byteLength, p9.set(a8, c9), c9 += a8.byteLength, p9.set(l8, c9), c9 += l8.byteLength, p9.set(u8, c9), c9 += u8.byteLength;
  var L10 = new Uint8Array(d5.byteLength + o18.byteLength);
  return L10.set(p9, 0), L10.set(new Uint8Array(o18), d5.byteLength), L10.buffer;
}, assertFieldSize(e4, t72) {
  if (e4 > 255) throw new Error(`unable to convert ${t72} to binary: must be less than or equal to 255 bytes, but is ${e4} bytes`);
}, binaryDecode(e4) {
  let t72 = new DataView(e4), i12 = t72.getUint8(0), s8 = new TextDecoder();
  switch (i12) {
    case this.KINDS.push:
      return this.decodePush(e4, t72, s8);
    case this.KINDS.reply:
      return this.decodeReply(e4, t72, s8);
    case this.KINDS.broadcast:
      return this.decodeBroadcast(e4, t72, s8);
  }
}, decodePush(e4, t72, i12) {
  let s8 = t72.getUint8(1), n9 = t72.getUint8(2), o18 = t72.getUint8(3), h11 = this.HEADER_LENGTH + this.META_LENGTH - 1, r10 = i12.decode(e4.slice(h11, h11 + s8));
  h11 = h11 + s8;
  let a8 = i12.decode(e4.slice(h11, h11 + n9));
  h11 = h11 + n9;
  let l8 = i12.decode(e4.slice(h11, h11 + o18));
  h11 = h11 + o18;
  let u8 = e4.slice(h11, e4.byteLength);
  return { join_ref: r10, ref: null, topic: a8, event: l8, payload: u8 };
}, decodeReply(e4, t72, i12) {
  let s8 = t72.getUint8(1), n9 = t72.getUint8(2), o18 = t72.getUint8(3), h11 = t72.getUint8(4), r10 = this.HEADER_LENGTH + this.META_LENGTH, a8 = i12.decode(e4.slice(r10, r10 + s8));
  r10 = r10 + s8;
  let l8 = i12.decode(e4.slice(r10, r10 + n9));
  r10 = r10 + n9;
  let u8 = i12.decode(e4.slice(r10, r10 + o18));
  r10 = r10 + o18;
  let g6 = i12.decode(e4.slice(r10, r10 + h11));
  r10 = r10 + h11;
  let d5 = e4.slice(r10, e4.byteLength), p9 = { status: g6, response: d5 };
  return { join_ref: a8, ref: l8, topic: u8, event: T3.reply, payload: p9 };
}, decodeBroadcast(e4, t72, i12) {
  let s8 = t72.getUint8(1), n9 = t72.getUint8(2), o18 = this.HEADER_LENGTH + 2, h11 = i12.decode(e4.slice(o18, o18 + s8));
  o18 = o18 + s8;
  let r10 = i12.decode(e4.slice(o18, o18 + n9));
  o18 = o18 + n9;
  let a8 = e4.slice(o18, e4.byteLength);
  return { join_ref: null, ref: null, topic: h11, event: r10, payload: a8 };
} };
var U2 = class {
  constructor(e4, t72 = {}) {
    this.stateChangeCallbacks = { open: [], close: [], error: [], message: [] }, this.channels = [], this.sendBuffer = [], this.ref = 0, this.fallbackRef = null, this.timeout = t72.timeout || O4, this.transport = t72.transport || m2.WebSocket || y2, this.conn = void 0, this.primaryPassedHealthCheck = false, this.longPollFallbackMs = t72.longPollFallbackMs, this.fallbackTimer = null;
    let i12 = null;
    try {
      i12 = m2 && m2.sessionStorage;
    } catch {
    }
    this.sessionStore = t72.sessionStorage || i12, this.establishedConnections = 0, this.defaultEncoder = R2.encode.bind(R2), this.defaultDecoder = R2.decode.bind(R2), this.closeWasClean = true, this.disconnecting = false, this.binaryType = t72.binaryType || "arraybuffer", this.connectClock = 1, this.pageHidden = false, this.encode = void 0, this.decode = void 0, this.transport !== y2 ? (this.encode = t72.encode || this.defaultEncoder, this.decode = t72.decode || this.defaultDecoder) : (this.encode = this.defaultEncoder, this.decode = this.defaultDecoder);
    let s8 = null;
    C3 && C3.addEventListener && (C3.addEventListener("pagehide", (n9) => {
      this.conn && (this.disconnect(), s8 = this.connectClock);
    }), C3.addEventListener("pageshow", (n9) => {
      s8 === this.connectClock && (s8 = null, this.connect());
    }), C3.addEventListener("visibilitychange", () => {
      document.visibilityState === "hidden" ? this.pageHidden = true : (this.pageHidden = false, !this.isConnected() && !this.closeWasClean && this.teardown(() => this.connect()));
    })), this.heartbeatIntervalMs = t72.heartbeatIntervalMs || 3e4, this.autoSendHeartbeat = t72.autoSendHeartbeat ?? true, this.heartbeatCallback = t72.heartbeatCallback ?? (() => {
    }), this.rejoinAfterMs = (n9) => t72.rejoinAfterMs ? t72.rejoinAfterMs(n9) : [1e3, 2e3, 5e3][n9 - 1] || 1e4, this.reconnectAfterMs = (n9) => t72.reconnectAfterMs ? t72.reconnectAfterMs(n9) : [10, 50, 100, 150, 200, 250, 500, 1e3, 2e3][n9 - 1] || 5e3, this.logger = t72.logger || null, !this.logger && t72.debug && (this.logger = (n9, o18, h11) => {
      console.log(`${n9}: ${o18}`, h11);
    }), this.longpollerTimeout = t72.longpollerTimeout || 2e4, this.params = k(t72.params || {}), this.endPoint = `${e4}/${w.websocket}`, this.vsn = t72.vsn || B2, this.heartbeatTimeoutTimer = null, this.heartbeatTimer = null, this.heartbeatSentAt = null, this.pendingHeartbeatRef = null, this.reconnectTimer = new H3(() => {
      if (this.pageHidden) {
        this.log("Not reconnecting as page is hidden!"), this.teardown();
        return;
      }
      this.teardown(async () => {
        t72.beforeReconnect && await t72.beforeReconnect(), this.connect();
      });
    }, this.reconnectAfterMs), this.authToken = t72.authToken && k(t72.authToken);
  }
  getLongPollTransport() {
    return y2;
  }
  replaceTransport(e4) {
    this.connectClock++, this.closeWasClean = true, clearTimeout(this.fallbackTimer), this.reconnectTimer.reset(), this.conn && (this.conn.close(), this.conn = null), this.transport = e4;
  }
  protocol() {
    return location.protocol.match(/^https/) ? "wss" : "ws";
  }
  endPointURL() {
    let e4 = j2.appendParams(j2.appendParams(this.endPoint, this.params()), { vsn: this.vsn });
    return e4.charAt(0) !== "/" ? e4 : e4.charAt(1) === "/" ? `${this.protocol()}:${e4}` : `${this.protocol()}://${location.host}${e4}`;
  }
  disconnect(e4, t72, i12) {
    this.connectClock++, this.disconnecting = true, this.closeWasClean = true, clearTimeout(this.fallbackTimer), this.reconnectTimer.reset(), this.teardown(() => {
      this.disconnecting = false, e4 && e4();
    }, t72, i12);
  }
  connect(e4) {
    e4 && (console && console.log("passing params to connect is deprecated. Instead pass :params to the Socket constructor"), this.params = k(e4)), !(this.conn && !this.disconnecting) && (this.longPollFallbackMs && this.transport !== y2 ? this.connectWithFallback(y2, this.longPollFallbackMs) : this.transportConnect());
  }
  log(e4, t72, i12) {
    this.logger && this.logger(e4, t72, i12);
  }
  hasLogger() {
    return this.logger !== null;
  }
  onOpen(e4) {
    let t72 = this.makeRef();
    return this.stateChangeCallbacks.open.push([t72, e4]), t72;
  }
  onClose(e4) {
    let t72 = this.makeRef();
    return this.stateChangeCallbacks.close.push([t72, e4]), t72;
  }
  onError(e4) {
    let t72 = this.makeRef();
    return this.stateChangeCallbacks.error.push([t72, e4]), t72;
  }
  onMessage(e4) {
    let t72 = this.makeRef();
    return this.stateChangeCallbacks.message.push([t72, e4]), t72;
  }
  onHeartbeat(e4) {
    this.heartbeatCallback = e4;
  }
  ping(e4) {
    if (!this.isConnected()) return false;
    let t72 = this.makeRef(), i12 = Date.now();
    this.push({ topic: "phoenix", event: "heartbeat", payload: {}, ref: t72 });
    let s8 = this.onMessage((n9) => {
      n9.ref === t72 && (this.off([s8]), e4(Date.now() - i12));
    });
    return true;
  }
  transportName(e4) {
    return e4 === y2 ? "LongPoll" : e4.name;
  }
  transportConnect() {
    this.connectClock++, this.closeWasClean = false;
    let e4;
    this.authToken && (e4 = ["phoenix", `${A4}${btoa(this.authToken()).replace(/=/g, "")}`]), this.conn = new this.transport(this.endPointURL(), e4), this.conn.binaryType = this.binaryType, this.conn.timeout = this.longpollerTimeout, this.conn.onopen = () => this.onConnOpen(), this.conn.onerror = (t72) => this.onConnError(t72), this.conn.onmessage = (t72) => this.onConnMessage(t72), this.conn.onclose = (t72) => this.onConnClose(t72);
  }
  getSession(e4) {
    return this.sessionStore && this.sessionStore.getItem(e4);
  }
  storeSession(e4, t72) {
    this.sessionStore && this.sessionStore.setItem(e4, t72);
  }
  connectWithFallback(e4, t72 = 2500) {
    clearTimeout(this.fallbackTimer);
    let i12 = false, s8 = true, n9, o18, h11 = this.transportName(e4), r10 = (a8) => {
      this.log("transport", `falling back to ${h11}...`, a8), this.off([n9, o18]), s8 = false, this.replaceTransport(e4), this.transportConnect();
    };
    if (this.getSession(`phx:fallback:${h11}`)) return r10("memorized");
    this.fallbackTimer = setTimeout(r10, t72), o18 = this.onError((a8) => {
      this.log("transport", "error", a8), s8 && !i12 && (clearTimeout(this.fallbackTimer), r10(a8));
    }), this.fallbackRef && this.off([this.fallbackRef]), this.fallbackRef = this.onOpen(() => {
      if (i12 = true, !s8) {
        let a8 = this.transportName(e4);
        return this.primaryPassedHealthCheck || this.storeSession(`phx:fallback:${a8}`, "true"), this.log("transport", `established ${a8} fallback`);
      }
      clearTimeout(this.fallbackTimer), this.fallbackTimer = setTimeout(r10, t72), this.ping((a8) => {
        this.log("transport", "connected to primary after", a8), this.primaryPassedHealthCheck = true, clearTimeout(this.fallbackTimer);
      });
    }), this.transportConnect();
  }
  clearHeartbeats() {
    clearTimeout(this.heartbeatTimer), clearTimeout(this.heartbeatTimeoutTimer);
  }
  onConnOpen() {
    this.hasLogger() && this.log("transport", `connected to ${this.endPointURL()}`), this.closeWasClean = false, this.disconnecting = false, this.establishedConnections++, this.flushSendBuffer(), this.reconnectTimer.reset(), this.autoSendHeartbeat && this.resetHeartbeat(), this.triggerStateCallbacks("open");
  }
  heartbeatTimeout() {
    if (this.pendingHeartbeatRef) {
      this.pendingHeartbeatRef = null, this.heartbeatSentAt = null, this.hasLogger() && this.log("transport", "heartbeat timeout. Attempting to re-establish connection");
      try {
        this.heartbeatCallback("timeout");
      } catch (e4) {
        this.log("error", "error in heartbeat callback", e4);
      }
      this.triggerChanError(new Error("heartbeat timeout")), this.closeWasClean = false, this.teardown(() => this.reconnectTimer.scheduleTimeout(), P2, "heartbeat timeout");
    }
  }
  resetHeartbeat() {
    this.conn && this.conn.skipHeartbeat || (this.pendingHeartbeatRef = null, this.clearHeartbeats(), this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs));
  }
  teardown(e4, t72, i12) {
    if (!this.conn) return e4 && e4();
    let s8 = this.conn;
    this.waitForBufferDone(s8, () => {
      t72 ? s8.close(t72, i12 || "") : s8.close(), this.waitForSocketClosed(s8, () => {
        this.conn === s8 && (this.conn.onopen = function() {
        }, this.conn.onerror = function() {
        }, this.conn.onmessage = function() {
        }, this.conn.onclose = function() {
        }, this.conn = null), e4 && e4();
      });
    });
  }
  waitForBufferDone(e4, t72, i12 = 1) {
    if (i12 === 5 || !e4.bufferedAmount) {
      t72();
      return;
    }
    setTimeout(() => {
      this.waitForBufferDone(e4, t72, i12 + 1);
    }, 150 * i12);
  }
  waitForSocketClosed(e4, t72, i12 = 1) {
    if (i12 === 5 || e4.readyState === b2.closed) {
      t72();
      return;
    }
    setTimeout(() => {
      this.waitForSocketClosed(e4, t72, i12 + 1);
    }, 150 * i12);
  }
  onConnClose(e4) {
    this.conn && (this.conn.onclose = () => {
    }), this.hasLogger() && this.log("transport", "close", e4), this.triggerChanError(e4), this.clearHeartbeats(), this.closeWasClean || this.reconnectTimer.scheduleTimeout(), this.triggerStateCallbacks("close", e4);
  }
  onConnError(e4) {
    this.hasLogger() && this.log("transport", "error", e4);
    let t72 = this.transport, i12 = this.establishedConnections;
    this.triggerStateCallbacks("error", e4, t72, i12), (t72 === this.transport || i12 > 0) && this.triggerChanError(e4);
  }
  triggerChanError(e4) {
    this.channels.forEach((t72) => {
      t72.isErrored() || t72.isLeaving() || t72.isClosed() || t72.trigger(T3.error, e4);
    });
  }
  connectionState() {
    switch (this.conn && this.conn.readyState) {
      case b2.connecting:
        return "connecting";
      case b2.open:
        return "open";
      case b2.closing:
        return "closing";
      default:
        return "closed";
    }
  }
  isConnected() {
    return this.connectionState() === "open";
  }
  remove(e4) {
    this.off(e4.stateChangeRefs), this.channels = this.channels.filter((t72) => t72 !== e4);
  }
  off(e4) {
    for (let t72 in this.stateChangeCallbacks) this.stateChangeCallbacks[t72] = this.stateChangeCallbacks[t72].filter(([i12]) => e4.indexOf(i12) === -1);
  }
  channel(e4, t72 = {}) {
    let i12 = new $2(e4, t72, this);
    return this.channels.push(i12), i12;
  }
  push(e4) {
    if (this.hasLogger()) {
      let { topic: t72, event: i12, payload: s8, ref: n9, join_ref: o18 } = e4;
      this.log("push", `${t72} ${i12} (${o18}, ${n9})`, s8);
    }
    this.isConnected() ? this.encode(e4, (t72) => this.conn.send(t72)) : this.sendBuffer.push(() => this.encode(e4, (t72) => this.conn.send(t72)));
  }
  makeRef() {
    let e4 = this.ref + 1;
    return e4 === this.ref ? this.ref = 0 : this.ref = e4, this.ref.toString();
  }
  sendHeartbeat() {
    if (!this.isConnected()) {
      try {
        this.heartbeatCallback("disconnected");
      } catch (e4) {
        this.log("error", "error in heartbeat callback", e4);
      }
      return;
    }
    if (this.pendingHeartbeatRef) {
      this.heartbeatTimeout();
      return;
    }
    this.pendingHeartbeatRef = this.makeRef(), this.heartbeatSentAt = Date.now(), this.push({ topic: "phoenix", event: "heartbeat", payload: {}, ref: this.pendingHeartbeatRef });
    try {
      this.heartbeatCallback("sent");
    } catch (e4) {
      this.log("error", "error in heartbeat callback", e4);
    }
    this.heartbeatTimeoutTimer = setTimeout(() => this.heartbeatTimeout(), this.heartbeatIntervalMs);
  }
  flushSendBuffer() {
    this.isConnected() && this.sendBuffer.length > 0 && (this.sendBuffer.forEach((e4) => e4()), this.sendBuffer = []);
  }
  onConnMessage(e4) {
    this.decode(e4.data, (t72) => {
      let { topic: i12, event: s8, payload: n9, ref: o18, join_ref: h11 } = t72;
      if (o18 && o18 === this.pendingHeartbeatRef) {
        let r10 = this.heartbeatSentAt ? Date.now() - this.heartbeatSentAt : void 0;
        this.clearHeartbeats();
        try {
          this.heartbeatCallback(n9.status === "ok" ? "ok" : "error", r10);
        } catch (a8) {
          this.log("error", "error in heartbeat callback", a8);
        }
        this.pendingHeartbeatRef = null, this.heartbeatSentAt = null, this.autoSendHeartbeat && (this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs));
      }
      this.hasLogger() && this.log("receive", `${n9.status || ""} ${i12} ${s8} ${o18 && "(" + o18 + ")" || ""}`.trim(), n9);
      for (let r10 = 0; r10 < this.channels.length; r10++) {
        let a8 = this.channels[r10];
        a8.isMember(i12, s8, n9, h11) && a8.trigger(s8, n9, o18, h11);
      }
      this.triggerStateCallbacks("message", t72);
    });
  }
  triggerStateCallbacks(e4, ...t72) {
    try {
      this.stateChangeCallbacks[e4].forEach(([i12, s8]) => {
        try {
          s8(...t72);
        } catch (n9) {
          this.log("error", `error in ${e4} callback`, n9);
        }
      });
    } catch (i12) {
      this.log("error", `error triggering ${e4} callbacks`, i12);
    }
  }
  leaveOpenTopic(e4) {
    let t72 = this.channels.find((i12) => i12.topic === e4 && (i12.isJoined() || i12.isJoining()));
    t72 && (this.hasLogger() && this.log("transport", `leaving duplicate topic "${e4}"`), t72.leave());
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/realtime-js@2.108.1/denonext/realtime-js.mjs
var B3 = class {
  constructor() {
  }
  static detectEnvironment() {
    var e4;
    if (typeof WebSocket < "u") return { type: "native", wsConstructor: WebSocket };
    let t72 = globalThis;
    if (typeof globalThis < "u" && typeof t72.WebSocket < "u") return { type: "native", wsConstructor: t72.WebSocket };
    let r10 = typeof globalThis < "u" ? globalThis : void 0;
    if (r10 && typeof r10.WebSocket < "u") return { type: "native", wsConstructor: r10.WebSocket };
    if (typeof globalThis < "u" && typeof t72.WebSocketPair < "u" && typeof globalThis.WebSocket > "u") return { type: "cloudflare", error: "Cloudflare Workers detected. WebSocket clients are not supported in Cloudflare Workers.", workaround: "Use Cloudflare Workers WebSocket API for server-side WebSocket handling, or deploy to a different runtime." };
    if (typeof globalThis < "u" && t72.EdgeRuntime || typeof navigator < "u" && (!((e4 = navigator.userAgent) === null || e4 === void 0) && e4.includes("Vercel-Edge"))) return { type: "unsupported", error: "Edge runtime detected (Vercel Edge/Netlify Edge). WebSockets are not supported in edge functions.", workaround: "Use serverless functions or a different deployment target for WebSocket functionality." };
    let s8 = __Process$;
    if (s8) {
      let i12 = s8.versions;
      if (i12 && i12.node) {
        let o18 = i12.node, a8 = parseInt(o18.replace(/^v/, "").split(".")[0]);
        return a8 >= 22 ? typeof globalThis.WebSocket < "u" ? { type: "native", wsConstructor: globalThis.WebSocket } : { type: "unsupported", error: `Node.js ${a8} detected but native WebSocket not found.`, workaround: "Provide a WebSocket implementation via the transport option." } : { type: "unsupported", error: `Node.js ${a8} detected without native WebSocket support.`, workaround: `For Node.js < 22, install "ws" package and provide it via the transport option:
import ws from "ws"
new RealtimeClient(url, { transport: ws })` };
      }
    }
    return { type: "unsupported", error: "Unknown JavaScript runtime without WebSocket support.", workaround: "Ensure you're running in a supported environment (browser, Node.js, Deno) or provide a custom WebSocket implementation." };
  }
  static getWebSocketConstructor() {
    let e4 = this.detectEnvironment();
    if (e4.wsConstructor) return e4.wsConstructor;
    let t72 = e4.error || "WebSocket not supported in this environment.";
    throw e4.workaround && (t72 += `

Suggested solution: ${e4.workaround}`), new Error(t72);
  }
  static isWebSocketSupported() {
    try {
      let e4 = this.detectEnvironment();
      return e4.type === "native" || e4.type === "ws";
    } catch {
      return false;
    }
  }
};
var x5 = B3;
var V2 = "2.108.1";
var J2 = `realtime-js/${V2}`;
var $3 = "1.0.0";
var D3 = "2.0.0";
var F3 = D3;
var z2 = 1e4;
var K2 = 100;
var k2 = { closed: "closed", errored: "errored", joined: "joined", joining: "joining", leaving: "leaving" };
var O5 = { close: "phx_close", error: "phx_error", join: "phx_join", reply: "phx_reply", leave: "phx_leave", access_token: "access_token" };
var T4 = { connecting: "connecting", open: "open", closing: "closing", closed: "closed" };
var C4 = class {
  constructor(e4) {
    this.HEADER_LENGTH = 1, this.USER_BROADCAST_PUSH_META_LENGTH = 6, this.KINDS = { userBroadcastPush: 3, userBroadcast: 4 }, this.BINARY_ENCODING = 0, this.JSON_ENCODING = 1, this.BROADCAST_EVENT = "broadcast", this.allowedMetadataKeys = [], this.allowedMetadataKeys = e4 ?? [];
  }
  encode(e4, t72) {
    if (e4.event === this.BROADCAST_EVENT && !(e4.payload instanceof ArrayBuffer) && typeof e4.payload.event == "string") return t72(this._binaryEncodeUserBroadcastPush(e4));
    let r10 = [e4.join_ref, e4.ref, e4.topic, e4.event, e4.payload];
    return t72(JSON.stringify(r10));
  }
  _binaryEncodeUserBroadcastPush(e4) {
    var t72;
    return this._isArrayBuffer((t72 = e4.payload) === null || t72 === void 0 ? void 0 : t72.payload) ? this._encodeBinaryUserBroadcastPush(e4) : this._encodeJsonUserBroadcastPush(e4);
  }
  _encodeBinaryUserBroadcastPush(e4) {
    var t72, r10;
    let s8 = (r10 = (t72 = e4.payload) === null || t72 === void 0 ? void 0 : t72.payload) !== null && r10 !== void 0 ? r10 : new ArrayBuffer(0);
    return this._encodeUserBroadcastPush(e4, this.BINARY_ENCODING, s8);
  }
  _encodeJsonUserBroadcastPush(e4) {
    var t72, r10;
    let s8 = (r10 = (t72 = e4.payload) === null || t72 === void 0 ? void 0 : t72.payload) !== null && r10 !== void 0 ? r10 : {}, o18 = new TextEncoder().encode(JSON.stringify(s8)).buffer;
    return this._encodeUserBroadcastPush(e4, this.JSON_ENCODING, o18);
  }
  _encodeUserBroadcastPush(e4, t72, r10) {
    var s8, i12;
    let o18 = e4.topic, a8 = (s8 = e4.ref) !== null && s8 !== void 0 ? s8 : "", c9 = (i12 = e4.join_ref) !== null && i12 !== void 0 ? i12 : "", d5 = e4.payload.event, f11 = this.allowedMetadataKeys ? this._pick(e4.payload, this.allowedMetadataKeys) : {}, p9 = Object.keys(f11).length === 0 ? "" : JSON.stringify(f11);
    if (c9.length > 255) throw new Error(`joinRef length ${c9.length} exceeds maximum of 255`);
    if (a8.length > 255) throw new Error(`ref length ${a8.length} exceeds maximum of 255`);
    if (o18.length > 255) throw new Error(`topic length ${o18.length} exceeds maximum of 255`);
    if (d5.length > 255) throw new Error(`userEvent length ${d5.length} exceeds maximum of 255`);
    if (p9.length > 255) throw new Error(`metadata length ${p9.length} exceeds maximum of 255`);
    let g6 = this.USER_BROADCAST_PUSH_META_LENGTH + c9.length + a8.length + o18.length + d5.length + p9.length, h11 = new ArrayBuffer(this.HEADER_LENGTH + g6), l8 = new DataView(h11), m8 = 0;
    l8.setUint8(m8++, this.KINDS.userBroadcastPush), l8.setUint8(m8++, c9.length), l8.setUint8(m8++, a8.length), l8.setUint8(m8++, o18.length), l8.setUint8(m8++, d5.length), l8.setUint8(m8++, p9.length), l8.setUint8(m8++, t72), Array.from(c9, (v6) => l8.setUint8(m8++, v6.charCodeAt(0))), Array.from(a8, (v6) => l8.setUint8(m8++, v6.charCodeAt(0))), Array.from(o18, (v6) => l8.setUint8(m8++, v6.charCodeAt(0))), Array.from(d5, (v6) => l8.setUint8(m8++, v6.charCodeAt(0))), Array.from(p9, (v6) => l8.setUint8(m8++, v6.charCodeAt(0)));
    var b7 = new Uint8Array(h11.byteLength + r10.byteLength);
    return b7.set(new Uint8Array(h11), 0), b7.set(new Uint8Array(r10), h11.byteLength), b7.buffer;
  }
  decode(e4, t72) {
    if (this._isArrayBuffer(e4)) {
      let r10 = this._binaryDecode(e4);
      return t72(r10);
    }
    if (typeof e4 == "string") {
      let r10 = JSON.parse(e4), [s8, i12, o18, a8, c9] = r10;
      return t72({ join_ref: s8, ref: i12, topic: o18, event: a8, payload: c9 });
    }
    return t72({});
  }
  _binaryDecode(e4) {
    let t72 = new DataView(e4), r10 = t72.getUint8(0), s8 = new TextDecoder();
    if (r10 === this.KINDS.userBroadcast) return this._decodeUserBroadcast(e4, t72, s8);
  }
  _decodeUserBroadcast(e4, t72, r10) {
    let s8 = t72.getUint8(1), i12 = t72.getUint8(2), o18 = t72.getUint8(3), a8 = t72.getUint8(4), c9 = this.HEADER_LENGTH + 4, d5 = r10.decode(e4.slice(c9, c9 + s8));
    c9 = c9 + s8;
    let f11 = r10.decode(e4.slice(c9, c9 + i12));
    c9 = c9 + i12;
    let p9 = r10.decode(e4.slice(c9, c9 + o18));
    c9 = c9 + o18;
    let g6 = e4.slice(c9, e4.byteLength), h11 = a8 === this.JSON_ENCODING ? JSON.parse(r10.decode(g6)) : g6, l8 = { type: this.BROADCAST_EVENT, event: f11, payload: h11 };
    return o18 > 0 && (l8.meta = JSON.parse(p9)), { join_ref: null, ref: null, topic: d5, event: this.BROADCAST_EVENT, payload: l8 };
  }
  _isArrayBuffer(e4) {
    var t72;
    return e4 instanceof ArrayBuffer || ((t72 = e4?.constructor) === null || t72 === void 0 ? void 0 : t72.name) === "ArrayBuffer";
  }
  _pick(e4, t72) {
    return !e4 || typeof e4 != "object" ? {} : Object.fromEntries(Object.entries(e4).filter(([r10]) => t72.includes(r10)));
  }
};
var u2;
(function(n9) {
  n9.abstime = "abstime", n9.bool = "bool", n9.date = "date", n9.daterange = "daterange", n9.float4 = "float4", n9.float8 = "float8", n9.int2 = "int2", n9.int4 = "int4", n9.int4range = "int4range", n9.int8 = "int8", n9.int8range = "int8range", n9.json = "json", n9.jsonb = "jsonb", n9.money = "money", n9.numeric = "numeric", n9.oid = "oid", n9.reltime = "reltime", n9.text = "text", n9.time = "time", n9.timestamp = "timestamp", n9.timestamptz = "timestamptz", n9.timetz = "timetz", n9.tsrange = "tsrange", n9.tstzrange = "tstzrange";
})(u2 || (u2 = {}));
var H4 = (n9, e4, t72 = {}) => {
  var r10;
  let s8 = (r10 = t72.skipTypes) !== null && r10 !== void 0 ? r10 : [];
  return e4 ? Object.keys(e4).reduce((i12, o18) => (i12[o18] = Z2(o18, n9, e4, s8), i12), {}) : {};
};
var Z2 = (n9, e4, t72, r10) => {
  let s8 = e4.find((a8) => a8.name === n9), i12 = s8?.type, o18 = t72[n9];
  return i12 && !r10.includes(i12) ? G2(i12, o18) : I(o18);
};
var G2 = (n9, e4) => {
  if (n9.charAt(0) === "_") {
    let t72 = n9.slice(1, n9.length);
    return ne2(e4, t72);
  }
  switch (n9) {
    case u2.bool:
      return Q2(e4);
    case u2.float4:
    case u2.float8:
    case u2.int2:
    case u2.int4:
    case u2.int8:
    case u2.numeric:
    case u2.oid:
      return ee2(e4);
    case u2.json:
    case u2.jsonb:
      return te2(e4);
    case u2.timestamp:
      return re2(e4);
    case u2.abstime:
    case u2.date:
    case u2.daterange:
    case u2.int4range:
    case u2.int8range:
    case u2.money:
    case u2.reltime:
    case u2.text:
    case u2.time:
    case u2.timestamptz:
    case u2.timetz:
    case u2.tsrange:
    case u2.tstzrange:
      return I(e4);
    default:
      return I(e4);
  }
};
var I = (n9) => n9;
var Q2 = (n9) => {
  switch (n9) {
    case "t":
      return true;
    case "f":
      return false;
    default:
      return n9;
  }
};
var ee2 = (n9) => {
  if (typeof n9 == "string") {
    let e4 = parseFloat(n9);
    if (!Number.isNaN(e4)) return e4;
  }
  return n9;
};
var te2 = (n9) => {
  if (typeof n9 == "string") try {
    return JSON.parse(n9);
  } catch {
    return n9;
  }
  return n9;
};
var ne2 = (n9, e4) => {
  if (typeof n9 != "string") return n9;
  let t72 = n9.length - 1, r10 = n9[t72];
  if (n9[0] === "{" && r10 === "}") {
    let i12, o18 = n9.slice(1, t72);
    try {
      i12 = JSON.parse("[" + o18 + "]");
    } catch {
      i12 = o18 ? o18.split(",") : [];
    }
    return i12.map((a8) => G2(e4, a8));
  }
  return n9;
};
var re2 = (n9) => typeof n9 == "string" ? n9.replace(" ", "T") : n9;
var U3 = (n9) => {
  let e4 = new URL(n9);
  return e4.protocol = e4.protocol.replace(/^ws/i, "http"), e4.pathname = e4.pathname.replace(/\/+$/, "").replace(/\/socket\/websocket$/i, "").replace(/\/socket$/i, "").replace(/\/websocket$/i, ""), e4.pathname === "" || e4.pathname === "/" ? e4.pathname = "/api/broadcast" : e4.pathname = e4.pathname + "/api/broadcast", e4.href;
};
var S5 = class n {
  constructor(e4, t72) {
    let r10 = ae2(t72);
    this.presence = new D2(e4.getChannel(), r10), this.presence.onJoin((s8, i12, o18) => {
      let a8 = n.onJoinPayload(s8, i12, o18);
      e4.getChannel().trigger("presence", a8);
    }), this.presence.onLeave((s8, i12, o18) => {
      let a8 = n.onLeavePayload(s8, i12, o18);
      e4.getChannel().trigger("presence", a8);
    }), this.presence.onSync(() => {
      e4.getChannel().trigger("presence", { event: "sync" });
    });
  }
  get state() {
    return n.transformState(this.presence.state);
  }
  static transformState(e4) {
    return e4 = oe2(e4), Object.getOwnPropertyNames(e4).reduce((t72, r10) => {
      let s8 = e4[r10];
      return t72[r10] = L3(s8), t72;
    }, {});
  }
  static onJoinPayload(e4, t72, r10) {
    let s8 = q3(t72), i12 = L3(r10);
    return { event: "join", key: e4, currentPresences: s8, newPresences: i12 };
  }
  static onLeavePayload(e4, t72, r10) {
    let s8 = q3(t72), i12 = L3(r10);
    return { event: "leave", key: e4, currentPresences: s8, leftPresences: i12 };
  }
};
function L3(n9) {
  return n9.metas.map((e4) => (e4.presence_ref = e4.phx_ref, delete e4.phx_ref, delete e4.phx_ref_prev, e4));
}
function oe2(n9) {
  return JSON.parse(JSON.stringify(n9));
}
function ae2(n9) {
  return n9?.events && { events: n9.events };
}
function q3(n9) {
  return n9?.metas ? L3(n9) : [];
}
var M3;
(function(n9) {
  n9.SYNC = "sync", n9.JOIN = "join", n9.LEAVE = "leave";
})(M3 || (M3 = {}));
var A5 = class {
  get state() {
    return this.presenceAdapter.state;
  }
  constructor(e4, t72) {
    this.channel = e4, this.presenceAdapter = new S5(this.channel.channelAdapter, t72);
  }
};
function Y2(n9) {
  if (n9 instanceof Error) return n9;
  if (typeof n9 == "string") return new Error(n9);
  if (n9 && typeof n9 == "object") {
    let e4 = n9;
    if (typeof e4.code == "number") {
      let t72 = typeof e4.reason == "string" && e4.reason ? ` (${e4.reason})` : "";
      return new Error(`socket closed: ${e4.code}${t72}`, { cause: n9 });
    }
    return new Error("channel error: transport failure", { cause: n9 });
  }
  return new Error("channel error: connection lost");
}
var N4 = class {
  constructor(e4, t72, r10) {
    let s8 = ce(r10);
    this.channel = e4.getSocket().channel(t72, s8), this.socket = e4;
  }
  get state() {
    return this.channel.state;
  }
  set state(e4) {
    this.channel.state = e4;
  }
  get joinedOnce() {
    return this.channel.joinedOnce;
  }
  get joinPush() {
    return this.channel.joinPush;
  }
  get rejoinTimer() {
    return this.channel.rejoinTimer;
  }
  on(e4, t72) {
    return this.channel.on(e4, t72);
  }
  off(e4, t72) {
    this.channel.off(e4, t72);
  }
  subscribe(e4) {
    return this.channel.join(e4);
  }
  unsubscribe(e4) {
    return this.channel.leave(e4);
  }
  teardown() {
    this.channel.teardown();
  }
  onClose(e4) {
    this.channel.onClose(e4);
  }
  onError(e4) {
    return this.channel.onError(e4);
  }
  push(e4, t72, r10) {
    let s8;
    try {
      s8 = this.channel.push(e4, t72, r10);
    } catch {
      throw new Error(`tried to push '${e4}' to '${this.channel.topic}' before joining. Use channel.subscribe() before pushing events`);
    }
    if (this.channel.pushBuffer.length > K2) {
      let i12 = this.channel.pushBuffer.shift();
      i12.cancelTimeout(), this.socket.log("channel", `discarded push due to buffer overflow: ${i12.event}`, i12.payload());
    }
    return s8;
  }
  updateJoinPayload(e4) {
    let t72 = this.channel.joinPush.payload();
    this.channel.joinPush.payload = () => Object.assign(Object.assign({}, t72), e4);
  }
  canPush() {
    return this.socket.isConnected() && this.state === k2.joined;
  }
  isJoined() {
    return this.state === k2.joined;
  }
  isJoining() {
    return this.state === k2.joining;
  }
  isClosed() {
    return this.state === k2.closed;
  }
  isLeaving() {
    return this.state === k2.leaving;
  }
  updateFilterBindings(e4) {
    this.channel.filterBindings = e4;
  }
  updatePayloadTransform(e4) {
    this.channel.onMessage = e4;
  }
  getChannel() {
    return this.channel;
  }
};
function ce(n9) {
  return { config: Object.assign({ broadcast: { ack: false, self: false }, presence: { key: "", enabled: false }, private: false }, n9.config) };
}
var W2;
(function(n9) {
  n9.ALL = "*", n9.INSERT = "INSERT", n9.UPDATE = "UPDATE", n9.DELETE = "DELETE";
})(W2 || (W2 = {}));
var E5;
(function(n9) {
  n9.BROADCAST = "broadcast", n9.PRESENCE = "presence", n9.POSTGRES_CHANGES = "postgres_changes", n9.SYSTEM = "system";
})(E5 || (E5 = {}));
var _3;
(function(n9) {
  n9.SUBSCRIBED = "SUBSCRIBED", n9.TIMED_OUT = "TIMED_OUT", n9.CLOSED = "CLOSED", n9.CHANNEL_ERROR = "CHANNEL_ERROR";
})(_3 || (_3 = {}));
var w2 = class n2 {
  get state() {
    return this.channelAdapter.state;
  }
  set state(e4) {
    this.channelAdapter.state = e4;
  }
  get joinedOnce() {
    return this.channelAdapter.joinedOnce;
  }
  get timeout() {
    return this.socket.timeout;
  }
  get joinPush() {
    return this.channelAdapter.joinPush;
  }
  get rejoinTimer() {
    return this.channelAdapter.rejoinTimer;
  }
  constructor(e4, t72 = { config: {} }, r10) {
    var s8, i12;
    if (this.topic = e4, this.params = t72, this.socket = r10, this.bindings = {}, this.subTopic = e4.replace(/^realtime:/i, ""), this.params.config = Object.assign({ broadcast: { ack: false, self: false }, presence: { key: "", enabled: false }, private: false }, t72.config), this.channelAdapter = new N4(this.socket.socketAdapter, e4, this.params), this.presence = new A5(this), this._onClose(() => {
      this.socket._remove(this);
    }), this._updateFilterTransform(), this.broadcastEndpointURL = U3(this.socket.socketAdapter.endPointURL()), this.private = this.params.config.private || false, !this.private && (!((i12 = (s8 = this.params.config) === null || s8 === void 0 ? void 0 : s8.broadcast) === null || i12 === void 0) && i12.replay)) throw new Error(`tried to use replay on public channel '${this.topic}'. It must be a private channel.`);
  }
  subscribe(e4, t72 = this.timeout) {
    var r10, s8, i12;
    if (this.socket.isConnected() || this.socket.connect(), this.channelAdapter.isClosed()) {
      let { config: { broadcast: o18, presence: a8, private: c9 } } = this.params, d5 = (s8 = (r10 = this.bindings.postgres_changes) === null || r10 === void 0 ? void 0 : r10.map((h11) => h11.filter)) !== null && s8 !== void 0 ? s8 : [], f11 = !!this.bindings[E5.PRESENCE] && this.bindings[E5.PRESENCE].length > 0 || ((i12 = this.params.config.presence) === null || i12 === void 0 ? void 0 : i12.enabled) === true, p9 = {}, g6 = { broadcast: o18, presence: Object.assign(Object.assign({}, a8), { enabled: f11 }), postgres_changes: d5, private: c9 };
      this.socket.accessTokenValue && (p9.access_token = this.socket.accessTokenValue), this._onError((h11) => {
        e4?.(_3.CHANNEL_ERROR, Y2(h11));
      }), this._onClose(() => e4?.(_3.CLOSED)), this.updateJoinPayload(Object.assign({ config: g6 }, p9)), this._updateFilterMessage(), this.channelAdapter.subscribe(t72).receive("ok", async ({ postgres_changes: h11 }) => {
        if (this.socket._isManualToken() || this.socket.setAuth(), h11 === void 0) {
          e4?.(_3.SUBSCRIBED);
          return;
        }
        this._updatePostgresBindings(h11, e4);
      }).receive("error", (h11) => {
        this.state = k2.errored;
        let l8 = Object.values(h11).join(", ") || "error";
        e4?.(_3.CHANNEL_ERROR, new Error(l8, { cause: h11 }));
      }).receive("timeout", () => {
        e4?.(_3.TIMED_OUT);
      });
    }
    return this;
  }
  _updatePostgresBindings(e4, t72) {
    var r10;
    let s8 = this.bindings.postgres_changes, i12 = (r10 = s8?.length) !== null && r10 !== void 0 ? r10 : 0, o18 = [];
    for (let a8 = 0; a8 < i12; a8++) {
      let c9 = s8[a8], { filter: { event: d5, schema: f11, table: p9, filter: g6 } } = c9, h11 = e4 && e4[a8];
      if (h11 && h11.event === d5 && n2.isFilterValueEqual(h11.schema, f11) && n2.isFilterValueEqual(h11.table, p9) && n2.isFilterValueEqual(h11.filter, g6)) o18.push(Object.assign(Object.assign({}, c9), { id: h11.id }));
      else {
        this.unsubscribe(), this.state = k2.errored, t72?.(_3.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
        return;
      }
    }
    this.bindings.postgres_changes = o18, this.state != k2.errored && t72 && t72(_3.SUBSCRIBED);
  }
  presenceState() {
    return this.presence.state;
  }
  async track(e4, t72 = {}) {
    return await this.send({ type: "presence", event: "track", payload: e4 }, t72.timeout || this.timeout);
  }
  async untrack(e4 = {}) {
    return await this.send({ type: "presence", event: "untrack" }, e4);
  }
  on(e4, t72, r10) {
    let s8 = this.channelAdapter.isJoined() || this.channelAdapter.isJoining(), i12 = e4 === E5.PRESENCE || e4 === E5.POSTGRES_CHANGES;
    if (s8 && i12) throw this.socket.log("channel", `cannot add \`${e4}\` callbacks for ${this.topic} after \`subscribe()\`.`), new Error(`cannot add \`${e4}\` callbacks for ${this.topic} after \`subscribe()\`.`);
    return this._on(e4, t72, r10);
  }
  async httpSend(e4, t72, r10 = {}) {
    var s8;
    if (t72 == null) return Promise.reject(new Error("Payload is required for httpSend()"));
    let i12 = t72 instanceof ArrayBuffer || ArrayBuffer.isView(t72), o18 = { apikey: this.socket.apiKey ? this.socket.apiKey : "", "Content-Type": i12 ? "application/octet-stream" : "application/json" };
    this.socket.accessTokenValue && (o18.Authorization = `Bearer ${this.socket.accessTokenValue}`);
    let a8 = new URL(this.broadcastEndpointURL);
    a8.pathname += `/${encodeURIComponent(this.subTopic)}/events/${encodeURIComponent(e4)}`, this.private && a8.searchParams.set("private", "true");
    let c9 = { method: "POST", headers: o18, body: i12 ? t72 : JSON.stringify(t72) }, d5 = await this._fetchWithTimeout(a8.toString(), c9, (s8 = r10.timeout) !== null && s8 !== void 0 ? s8 : this.timeout);
    if (d5.status === 202) return { success: true };
    let f11 = d5.statusText;
    try {
      let p9 = await d5.json();
      f11 = p9.error || p9.message || f11;
    } catch {
    }
    return Promise.reject(new Error(f11));
  }
  async send(e4, t72 = {}) {
    var r10, s8;
    if (!this.channelAdapter.canPush() && e4.type === "broadcast") {
      console.warn("Realtime send() is automatically falling back to REST API. This behavior will be deprecated in the future. Please use httpSend() explicitly for REST delivery.");
      let { event: i12, payload: o18 } = e4, a8 = { apikey: this.socket.apiKey ? this.socket.apiKey : "", "Content-Type": "application/json" };
      this.socket.accessTokenValue && (a8.Authorization = `Bearer ${this.socket.accessTokenValue}`);
      let c9 = { method: "POST", headers: a8, body: JSON.stringify({ messages: [{ topic: this.subTopic, event: i12, payload: o18, private: this.private }] }) };
      try {
        let d5 = await this._fetchWithTimeout(this.broadcastEndpointURL, c9, (r10 = t72.timeout) !== null && r10 !== void 0 ? r10 : this.timeout);
        return await ((s8 = d5.body) === null || s8 === void 0 ? void 0 : s8.cancel()), d5.ok ? "ok" : "error";
      } catch (d5) {
        return d5 instanceof Error && d5.name === "AbortError" ? "timed out" : "error";
      }
    } else return new Promise((i12) => {
      var o18, a8, c9;
      let d5 = this.channelAdapter.push(e4.type, e4, t72.timeout || this.timeout);
      e4.type === "broadcast" && !(!((c9 = (a8 = (o18 = this.params) === null || o18 === void 0 ? void 0 : o18.config) === null || a8 === void 0 ? void 0 : a8.broadcast) === null || c9 === void 0) && c9.ack) && i12("ok"), d5.receive("ok", () => i12("ok")), d5.receive("error", () => i12("error")), d5.receive("timeout", () => i12("timed out"));
    });
  }
  updateJoinPayload(e4) {
    this.channelAdapter.updateJoinPayload(e4);
  }
  async unsubscribe(e4 = this.timeout) {
    return new Promise((t72) => {
      this.channelAdapter.unsubscribe(e4).receive("ok", () => t72("ok")).receive("timeout", () => t72("timed out")).receive("error", () => t72("error"));
    });
  }
  teardown() {
    this.channelAdapter.teardown();
  }
  async _fetchWithTimeout(e4, t72, r10) {
    let s8 = new AbortController(), i12 = setTimeout(() => s8.abort(), r10), o18 = await this.socket.fetch(e4, Object.assign(Object.assign({}, t72), { signal: s8.signal }));
    return clearTimeout(i12), o18;
  }
  _on(e4, t72, r10) {
    let s8 = e4.toLocaleLowerCase(), i12 = this.channelAdapter.on(e4, r10), o18 = { type: s8, filter: t72, callback: r10, ref: i12 };
    return this.bindings[s8] ? this.bindings[s8].push(o18) : this.bindings[s8] = [o18], this._updateFilterMessage(), this;
  }
  _onClose(e4) {
    this.channelAdapter.onClose(e4);
  }
  _onError(e4) {
    this.channelAdapter.onError(e4);
  }
  _updateFilterMessage() {
    this.channelAdapter.updateFilterBindings((e4, t72, r10) => {
      var s8, i12, o18, a8, c9, d5, f11;
      let p9 = e4.event.toLocaleLowerCase();
      if (this._notThisChannelEvent(p9, r10)) return false;
      let g6 = (s8 = this.bindings[p9]) === null || s8 === void 0 ? void 0 : s8.find((h11) => h11.ref === e4.ref);
      if (!g6) return true;
      if (["broadcast", "presence", "postgres_changes"].includes(p9)) if ("id" in g6) {
        let h11 = g6.id, l8 = (i12 = g6.filter) === null || i12 === void 0 ? void 0 : i12.event;
        return h11 && ((o18 = t72.ids) === null || o18 === void 0 ? void 0 : o18.includes(h11)) && (l8 === "*" || l8?.toLocaleLowerCase() === ((a8 = t72.data) === null || a8 === void 0 ? void 0 : a8.type.toLocaleLowerCase()));
      } else {
        let h11 = (d5 = (c9 = g6?.filter) === null || c9 === void 0 ? void 0 : c9.event) === null || d5 === void 0 ? void 0 : d5.toLocaleLowerCase();
        return h11 === "*" || h11 === ((f11 = t72?.event) === null || f11 === void 0 ? void 0 : f11.toLocaleLowerCase());
      }
      else return g6.type.toLocaleLowerCase() === p9;
    });
  }
  _notThisChannelEvent(e4, t72) {
    let { close: r10, error: s8, leave: i12, join: o18 } = O5;
    return t72 && [r10, s8, i12, o18].includes(e4) && t72 !== this.joinPush.ref;
  }
  _updateFilterTransform() {
    this.channelAdapter.updatePayloadTransform((e4, t72, r10) => {
      if (typeof t72 == "object" && "ids" in t72) {
        let s8 = t72.data, { schema: i12, table: o18, commit_timestamp: a8, type: c9, errors: d5 } = s8;
        return Object.assign(Object.assign({}, { schema: i12, table: o18, commit_timestamp: a8, eventType: c9, new: {}, old: {}, errors: d5 }), this._getPayloadRecords(s8));
      }
      return t72;
    });
  }
  copyBindings(e4) {
    if (this.joinedOnce) throw new Error("cannot copy bindings into joined channel");
    for (let t72 in e4.bindings) for (let r10 of e4.bindings[t72]) this._on(r10.type, r10.filter, r10.callback);
  }
  static isFilterValueEqual(e4, t72) {
    return (e4 ?? void 0) === (t72 ?? void 0);
  }
  _getPayloadRecords(e4) {
    let t72 = { new: {}, old: {} };
    return (e4.type === "INSERT" || e4.type === "UPDATE") && (t72.new = H4(e4.columns, e4.record)), (e4.type === "UPDATE" || e4.type === "DELETE") && (t72.old = H4(e4.columns, e4.old_record)), t72;
  }
};
var R3 = class {
  constructor(e4, t72) {
    this.socket = new U2(e4, t72);
  }
  get timeout() {
    return this.socket.timeout;
  }
  get endPoint() {
    return this.socket.endPoint;
  }
  get transport() {
    return this.socket.transport;
  }
  get heartbeatIntervalMs() {
    return this.socket.heartbeatIntervalMs;
  }
  get heartbeatCallback() {
    return this.socket.heartbeatCallback;
  }
  set heartbeatCallback(e4) {
    this.socket.heartbeatCallback = e4;
  }
  get heartbeatTimer() {
    return this.socket.heartbeatTimer;
  }
  get pendingHeartbeatRef() {
    return this.socket.pendingHeartbeatRef;
  }
  get reconnectTimer() {
    return this.socket.reconnectTimer;
  }
  get vsn() {
    return this.socket.vsn;
  }
  get encode() {
    return this.socket.encode;
  }
  get decode() {
    return this.socket.decode;
  }
  get reconnectAfterMs() {
    return this.socket.reconnectAfterMs;
  }
  get sendBuffer() {
    return this.socket.sendBuffer;
  }
  get stateChangeCallbacks() {
    return this.socket.stateChangeCallbacks;
  }
  connect() {
    this.socket.connect();
  }
  disconnect(e4, t72, r10, s8 = 1e4) {
    return new Promise((i12) => {
      setTimeout(() => i12("timeout"), s8), this.socket.disconnect(() => {
        e4(), i12("ok");
      }, t72, r10);
    });
  }
  push(e4) {
    this.socket.push(e4);
  }
  log(e4, t72, r10) {
    this.socket.log(e4, t72, r10);
  }
  makeRef() {
    return this.socket.makeRef();
  }
  onOpen(e4) {
    this.socket.onOpen(e4);
  }
  onClose(e4) {
    this.socket.onClose(e4);
  }
  onError(e4) {
    this.socket.onError(e4);
  }
  onMessage(e4) {
    this.socket.onMessage(e4);
  }
  isConnected() {
    return this.socket.isConnected();
  }
  isConnecting() {
    return this.socket.connectionState() == T4.connecting;
  }
  isDisconnecting() {
    return this.socket.connectionState() == T4.closing;
  }
  connectionState() {
    return this.socket.connectionState();
  }
  endPointURL() {
    return this.socket.endPointURL();
  }
  sendHeartbeat() {
    this.socket.sendHeartbeat();
  }
  getSocket() {
    return this.socket;
  }
};
var X2 = { HEARTBEAT_INTERVAL: 25e3, RECONNECT_DELAY: 10, HEARTBEAT_TIMEOUT_FALLBACK: 100 };
var he2 = [1e3, 2e3, 5e3, 1e4];
var ue2 = 1e4;
function pe2() {
  let n9 = /* @__PURE__ */ new Map();
  return { get length() {
    return n9.size;
  }, clear() {
    n9.clear();
  }, getItem(e4) {
    return n9.has(e4) ? n9.get(e4) : null;
  }, key(e4) {
    var t72;
    return (t72 = Array.from(n9.keys())[e4]) !== null && t72 !== void 0 ? t72 : null;
  }, removeItem(e4) {
    n9.delete(e4);
  }, setItem(e4, t72) {
    n9.set(e4, String(t72));
  } };
}
function fe2() {
  try {
    if (typeof globalThis < "u" && globalThis.sessionStorage) return globalThis.sessionStorage;
  } catch {
  }
  return pe2();
}
var ge2 = `
  addEventListener("message", (e) => {
    if (e.data.event === "start") {
      setInterval(() => postMessage({ event: "keepAlive" }), e.data.interval);
    }
  });`;
var j3 = class {
  get endPoint() {
    return this.socketAdapter.endPoint;
  }
  get timeout() {
    return this.socketAdapter.timeout;
  }
  get transport() {
    return this.socketAdapter.transport;
  }
  get heartbeatCallback() {
    return this.socketAdapter.heartbeatCallback;
  }
  get heartbeatIntervalMs() {
    return this.socketAdapter.heartbeatIntervalMs;
  }
  get heartbeatTimer() {
    return this.worker ? this._workerHeartbeatTimer : this.socketAdapter.heartbeatTimer;
  }
  get pendingHeartbeatRef() {
    return this.worker ? this._pendingWorkerHeartbeatRef : this.socketAdapter.pendingHeartbeatRef;
  }
  get reconnectTimer() {
    return this.socketAdapter.reconnectTimer;
  }
  get vsn() {
    return this.socketAdapter.vsn;
  }
  get encode() {
    return this.socketAdapter.encode;
  }
  get decode() {
    return this.socketAdapter.decode;
  }
  get reconnectAfterMs() {
    return this.socketAdapter.reconnectAfterMs;
  }
  get sendBuffer() {
    return this.socketAdapter.sendBuffer;
  }
  get stateChangeCallbacks() {
    return this.socketAdapter.stateChangeCallbacks;
  }
  constructor(e4, t72) {
    var r10;
    if (this.channels = new Array(), this.accessTokenValue = null, this.accessToken = null, this.apiKey = null, this.httpEndpoint = "", this.headers = {}, this.params = {}, this.ref = 0, this.serializer = new C4(), this._manuallySetToken = false, this._authPromise = null, this._workerHeartbeatTimer = void 0, this._pendingWorkerHeartbeatRef = null, this._pendingDisconnectTimer = null, this._disconnectOnEmptyChannelsAfterMs = 0, this._resolveFetch = (i12) => i12 ? (...o18) => i12(...o18) : (...o18) => fetch(...o18), !(!((r10 = t72?.params) === null || r10 === void 0) && r10.apikey)) throw new Error("API key is required to connect to Realtime");
    this.apiKey = t72.params.apikey;
    let s8 = this._initializeOptions(t72);
    this.socketAdapter = new R3(e4, s8), this.httpEndpoint = U3(e4), this.fetch = this._resolveFetch(t72?.fetch);
  }
  connect() {
    if (!(this.isConnecting() || this.isDisconnecting() || this.isConnected())) {
      this.accessToken && !this._authPromise && this._setAuthSafely("connect"), this._setupConnectionHandlers();
      try {
        this.socketAdapter.connect();
      } catch (e4) {
        let t72 = e4.message;
        throw t72.includes("Node.js") ? new Error(`${t72}

To use Realtime in Node.js, you need to provide a WebSocket implementation:

Option 1: Use Node.js 22+ which has native WebSocket support
Option 2: Install and provide the "ws" package:

  npm install ws

  import ws from "ws"
  const client = new RealtimeClient(url, {
    ...options,
    transport: ws
  })`) : new Error(`WebSocket not available: ${t72}`);
      }
      this._handleNodeJsRaceCondition();
    }
  }
  endpointURL() {
    return this.socketAdapter.endPointURL();
  }
  async disconnect(e4, t72) {
    return this._cancelPendingDisconnect(), this.isDisconnecting() ? "ok" : await this.socketAdapter.disconnect(() => {
      clearInterval(this._workerHeartbeatTimer), this._terminateWorker();
    }, e4, t72);
  }
  getChannels() {
    return this.channels;
  }
  async removeChannel(e4) {
    let t72 = await e4.unsubscribe();
    return t72 === "ok" && e4.teardown(), t72;
  }
  async removeAllChannels() {
    let e4 = this.channels.map(async (r10) => {
      let s8 = await r10.unsubscribe();
      return r10.teardown(), s8;
    }), t72 = await Promise.all(e4);
    return await this.disconnect(), t72;
  }
  log(e4, t72, r10) {
    this.socketAdapter.log(e4, t72, r10);
  }
  connectionState() {
    return this.socketAdapter.connectionState() || T4.closed;
  }
  isConnected() {
    return this.socketAdapter.isConnected();
  }
  isConnecting() {
    return this.socketAdapter.isConnecting();
  }
  isDisconnecting() {
    return this.socketAdapter.isDisconnecting();
  }
  channel(e4, t72 = { config: {} }) {
    let r10 = `realtime:${e4}`, s8 = this.getChannels().find((i12) => i12.topic === r10);
    if (s8) return s8;
    {
      let i12 = new w2(`realtime:${e4}`, t72, this);
      return this._cancelPendingDisconnect(), this.channels.push(i12), i12;
    }
  }
  push(e4) {
    this.socketAdapter.push(e4);
  }
  async setAuth(e4 = null) {
    this._authPromise = this._performAuth(e4);
    try {
      await this._authPromise;
    } finally {
      this._authPromise = null;
    }
  }
  _isManualToken() {
    return this._manuallySetToken;
  }
  async sendHeartbeat() {
    this.socketAdapter.sendHeartbeat();
  }
  onHeartbeat(e4) {
    this.socketAdapter.heartbeatCallback = this._wrapHeartbeatCallback(e4);
  }
  _makeRef() {
    return this.socketAdapter.makeRef();
  }
  _remove(e4) {
    this.channels = this.channels.filter((t72) => t72.topic !== e4.topic), this.channels.length === 0 && (this.log("transport", "no channels remaining, scheduling disconnect"), this._schedulePendingDisconnect());
  }
  _schedulePendingDisconnect() {
    if (this._cancelPendingDisconnect(), this._disconnectOnEmptyChannelsAfterMs === 0) {
      this.log("transport", "disconnecting immediately - no channels"), this.disconnect();
      return;
    }
    this._pendingDisconnectTimer = setTimeout(() => {
      this._pendingDisconnectTimer = null, this.channels.length === 0 && (this.log("transport", "deferred disconnect fired - no channels, disconnecting"), this.disconnect());
    }, this._disconnectOnEmptyChannelsAfterMs), this.log("transport", `deferred disconnect scheduled in ${this._disconnectOnEmptyChannelsAfterMs}ms`);
  }
  _cancelPendingDisconnect() {
    this._pendingDisconnectTimer !== null && (this.log("transport", "pending disconnect cancelled - channel activity detected"), clearTimeout(this._pendingDisconnectTimer), this._pendingDisconnectTimer = null);
  }
  async _performAuth(e4 = null) {
    let t72, r10 = false;
    if (e4) t72 = e4, r10 = true;
    else if (this.accessToken) try {
      t72 = await this.accessToken();
    } catch (s8) {
      this.log("error", "Error fetching access token from callback", s8), t72 = this.accessTokenValue;
    }
    else t72 = this.accessTokenValue;
    r10 ? this._manuallySetToken = true : this.accessToken && (this._manuallySetToken = false), this.accessTokenValue != t72 && (this.accessTokenValue = t72, this.channels.forEach((s8) => {
      let i12 = { access_token: t72, version: J2 };
      t72 && s8.updateJoinPayload(i12), s8.joinedOnce && s8.channelAdapter.isJoined() && s8.channelAdapter.push(O5.access_token, { access_token: t72 });
    }));
  }
  async _waitForAuthIfNeeded() {
    this._authPromise && await this._authPromise;
  }
  _setAuthSafely(e4 = "general") {
    this._isManualToken() || this.setAuth().catch((t72) => {
      this.log("error", `Error setting auth in ${e4}`, t72);
    });
  }
  _setupConnectionHandlers() {
    this.socketAdapter.onOpen(() => {
      (this._authPromise || (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve())).catch((t72) => {
        this.log("error", "error waiting for auth on connect", t72);
      }), this.worker && !this.workerRef && this._startWorkerHeartbeat();
    }), this.socketAdapter.onClose(() => {
      this.worker && this.workerRef && this._terminateWorker();
    }), this.socketAdapter.onMessage((e4) => {
      e4.ref && e4.ref === this._pendingWorkerHeartbeatRef && (this._pendingWorkerHeartbeatRef = null);
    });
  }
  _handleNodeJsRaceCondition() {
    this.socketAdapter.isConnected() && this.socketAdapter.getSocket().onConnOpen();
  }
  _wrapHeartbeatCallback(e4) {
    return (t72, r10) => {
      t72 == "sent" && this._setAuthSafely(), e4 && e4(t72, r10);
    };
  }
  _startWorkerHeartbeat() {
    this.workerUrl ? this.log("worker", `starting worker for from ${this.workerUrl}`) : this.log("worker", "starting default worker");
    let e4 = this._workerObjectUrl(this.workerUrl);
    this.workerRef = new Worker(e4), this.workerRef.onerror = (t72) => {
      this.log("worker", "worker error", t72.message), this._terminateWorker(), this.disconnect();
    }, this.workerRef.onmessage = (t72) => {
      t72.data.event === "keepAlive" && this.sendHeartbeat();
    }, this.workerRef.postMessage({ event: "start", interval: this.heartbeatIntervalMs });
  }
  _terminateWorker() {
    this.workerRef && (this.log("worker", "terminating worker"), this.workerRef.terminate(), this.workerRef = void 0);
  }
  _workerObjectUrl(e4) {
    let t72;
    if (e4) t72 = e4;
    else {
      let r10 = new Blob([ge2], { type: "application/javascript" });
      t72 = URL.createObjectURL(r10);
    }
    return t72;
  }
  _initializeOptions(e4) {
    var t72, r10, s8, i12, o18, a8, c9, d5, f11, p9, g6, h11;
    this.worker = (t72 = e4?.worker) !== null && t72 !== void 0 ? t72 : false, this.accessToken = (r10 = e4?.accessToken) !== null && r10 !== void 0 ? r10 : null;
    let l8 = {};
    l8.timeout = (s8 = e4?.timeout) !== null && s8 !== void 0 ? s8 : z2, l8.heartbeatIntervalMs = (i12 = e4?.heartbeatIntervalMs) !== null && i12 !== void 0 ? i12 : X2.HEARTBEAT_INTERVAL, this._disconnectOnEmptyChannelsAfterMs = (o18 = e4?.disconnectOnEmptyChannelsAfterMs) !== null && o18 !== void 0 ? o18 : 2 * ((a8 = e4?.heartbeatIntervalMs) !== null && a8 !== void 0 ? a8 : X2.HEARTBEAT_INTERVAL), l8.transport = (c9 = e4?.transport) !== null && c9 !== void 0 ? c9 : x5.getWebSocketConstructor(), l8.params = e4?.params, l8.logger = e4?.logger, l8.heartbeatCallback = this._wrapHeartbeatCallback(e4?.heartbeatCallback), l8.sessionStorage = (d5 = e4?.sessionStorage) !== null && d5 !== void 0 ? d5 : fe2(), l8.reconnectAfterMs = (f11 = e4?.reconnectAfterMs) !== null && f11 !== void 0 ? f11 : (y11) => he2[y11 - 1] || ue2;
    let m8, b7, v6 = (p9 = e4?.vsn) !== null && p9 !== void 0 ? p9 : F3;
    switch (v6) {
      case $3:
        m8 = (y11, P9) => P9(JSON.stringify(y11)), b7 = (y11, P9) => P9(JSON.parse(y11));
        break;
      case D3:
        m8 = this.serializer.encode.bind(this.serializer), b7 = this.serializer.decode.bind(this.serializer);
        break;
      default:
        throw new Error(`Unsupported serializer version: ${l8.vsn}`);
    }
    if (l8.vsn = v6, l8.encode = (g6 = e4?.encode) !== null && g6 !== void 0 ? g6 : m8, l8.decode = (h11 = e4?.decode) !== null && h11 !== void 0 ? h11 : b7, l8.beforeReconnect = this._reconnectAuth.bind(this), (e4?.logLevel || e4?.log_level) && (this.logLevel = e4.logLevel || e4.log_level, l8.params = Object.assign(Object.assign({}, l8.params), { log_level: this.logLevel })), this.worker) {
      if (typeof globalThis < "u" && !globalThis.Worker) throw new Error("Web Worker is not supported");
      this.workerUrl = e4?.workerUrl, l8.autoSendHeartbeat = !this.worker;
    }
    return l8;
  }
  async _reconnectAuth() {
    await this._waitForAuthIfNeeded(), this.isConnected() || this.connect();
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/storage-js@2.108.1/denonext/storage-js.mjs
import { Buffer as __Buffer$ } from "node:buffer";

// supabase/functions/_vendor/esm.sh/iceberg-js@0.8.1/denonext/iceberg-js.mjs
var o = class extends Error {
  constructor(e4, t72) {
    super(e4), this.name = "IcebergError", this.status = t72.status, this.icebergType = t72.icebergType, this.icebergCode = t72.icebergCode, this.details = t72.details, this.isCommitStateUnknown = t72.icebergType === "CommitStateUnknownException" || [500, 502, 504].includes(t72.status) && t72.icebergType?.includes("CommitState") === true;
  }
  isNotFound() {
    return this.status === 404;
  }
  isConflict() {
    return this.status === 409;
  }
  isAuthenticationTimeout() {
    return this.status === 419;
  }
};
function w3(e4, t72, a8) {
  let s8 = new URL(t72, e4);
  if (a8) for (let [c9, r10] of Object.entries(a8)) r10 !== void 0 && s8.searchParams.set(c9, r10);
  return s8.toString();
}
async function $4(e4) {
  return !e4 || e4.type === "none" ? {} : e4.type === "bearer" ? { Authorization: `Bearer ${e4.token}` } : e4.type === "header" ? { [e4.name]: e4.value } : e4.type === "custom" ? await e4.getHeaders() : {};
}
function N5(e4) {
  let t72 = e4.fetchImpl ?? globalThis.fetch;
  return { async request({ method: a8, path: s8, query: c9, body: r10, headers: g6 }) {
    let x13 = w3(e4.baseUrl, s8, c9), E12 = await $4(e4.auth), n9 = await t72(x13, { method: a8, headers: { ...r10 ? { "Content-Type": "application/json" } : {}, ...E12, ...g6 }, body: r10 ? JSON.stringify(r10) : void 0 }), l8 = await n9.text(), u8 = (n9.headers.get("content-type") || "").includes("application/json"), m8 = u8 && l8 ? JSON.parse(l8) : l8;
    if (!n9.ok) {
      let d5 = u8 ? m8 : void 0, h11 = d5?.error;
      throw new o(h11?.message ?? `Request failed with status ${n9.status}`, { status: n9.status, icebergType: h11?.type, icebergCode: h11?.code, details: d5 });
    }
    return { status: n9.status, headers: n9.headers, data: m8 };
  } };
}
function p(e4) {
  return e4.join("");
}
var O6 = class {
  constructor(e4, t72 = "") {
    this.client = e4, this.prefix = t72;
  }
  async listNamespaces(e4) {
    let t72 = e4 ? { parent: p(e4.namespace) } : void 0;
    return (await this.client.request({ method: "GET", path: `${this.prefix}/namespaces`, query: t72 })).data.namespaces.map((s8) => ({ namespace: s8 }));
  }
  async createNamespace(e4, t72) {
    let a8 = { namespace: e4.namespace, properties: t72?.properties };
    return (await this.client.request({ method: "POST", path: `${this.prefix}/namespaces`, body: a8 })).data;
  }
  async dropNamespace(e4) {
    await this.client.request({ method: "DELETE", path: `${this.prefix}/namespaces/${p(e4.namespace)}` });
  }
  async loadNamespaceMetadata(e4) {
    return { properties: (await this.client.request({ method: "GET", path: `${this.prefix}/namespaces/${p(e4.namespace)}` })).data.properties };
  }
  async namespaceExists(e4) {
    try {
      return await this.client.request({ method: "HEAD", path: `${this.prefix}/namespaces/${p(e4.namespace)}` }), true;
    } catch (t72) {
      if (t72 instanceof o && t72.status === 404) return false;
      throw t72;
    }
  }
  async createNamespaceIfNotExists(e4, t72) {
    try {
      return await this.createNamespace(e4, t72);
    } catch (a8) {
      if (a8 instanceof o && a8.status === 409) return;
      throw a8;
    }
  }
};
function i3(e4) {
  return e4.join("");
}
var D4 = class {
  constructor(e4, t72 = "", a8) {
    this.client = e4, this.prefix = t72, this.accessDelegation = a8;
  }
  async listTables(e4) {
    return (await this.client.request({ method: "GET", path: `${this.prefix}/namespaces/${i3(e4.namespace)}/tables` })).data.identifiers;
  }
  async createTable(e4, t72) {
    let a8 = {};
    return this.accessDelegation && (a8["X-Iceberg-Access-Delegation"] = this.accessDelegation), (await this.client.request({ method: "POST", path: `${this.prefix}/namespaces/${i3(e4.namespace)}/tables`, body: t72, headers: a8 })).data.metadata;
  }
  async updateTable(e4, t72) {
    let a8 = await this.client.request({ method: "POST", path: `${this.prefix}/namespaces/${i3(e4.namespace)}/tables/${e4.name}`, body: t72 });
    return { "metadata-location": a8.data["metadata-location"], metadata: a8.data.metadata };
  }
  async dropTable(e4, t72) {
    await this.client.request({ method: "DELETE", path: `${this.prefix}/namespaces/${i3(e4.namespace)}/tables/${e4.name}`, query: { purgeRequested: String(t72?.purge ?? false) } });
  }
  async loadTable(e4) {
    let t72 = {};
    return this.accessDelegation && (t72["X-Iceberg-Access-Delegation"] = this.accessDelegation), (await this.client.request({ method: "GET", path: `${this.prefix}/namespaces/${i3(e4.namespace)}/tables/${e4.name}`, headers: t72 })).data.metadata;
  }
  async tableExists(e4) {
    let t72 = {};
    this.accessDelegation && (t72["X-Iceberg-Access-Delegation"] = this.accessDelegation);
    try {
      return await this.client.request({ method: "HEAD", path: `${this.prefix}/namespaces/${i3(e4.namespace)}/tables/${e4.name}`, headers: t72 }), true;
    } catch (a8) {
      if (a8 instanceof o && a8.status === 404) return false;
      throw a8;
    }
  }
  async createTableIfNotExists(e4, t72) {
    try {
      return await this.createTable(e4, t72);
    } catch (a8) {
      if (a8 instanceof o && a8.status === 409) return await this.loadTable({ namespace: e4.namespace, name: t72.name });
      throw a8;
    }
  }
};
var I2 = class {
  constructor(e4) {
    let t72 = "v1";
    e4.catalogName && (t72 += `/${e4.catalogName}`);
    let a8 = e4.baseUrl.endsWith("/") ? e4.baseUrl : `${e4.baseUrl}/`;
    this.client = N5({ baseUrl: a8, auth: e4.auth, fetchImpl: e4.fetch }), this.accessDelegation = e4.accessDelegation?.join(","), this.namespaceOps = new O6(this.client, t72), this.tableOps = new D4(this.client, t72, this.accessDelegation);
  }
  async listNamespaces(e4) {
    return this.namespaceOps.listNamespaces(e4);
  }
  async createNamespace(e4, t72) {
    return this.namespaceOps.createNamespace(e4, t72);
  }
  async dropNamespace(e4) {
    await this.namespaceOps.dropNamespace(e4);
  }
  async loadNamespaceMetadata(e4) {
    return this.namespaceOps.loadNamespaceMetadata(e4);
  }
  async listTables(e4) {
    return this.tableOps.listTables(e4);
  }
  async createTable(e4, t72) {
    return this.tableOps.createTable(e4, t72);
  }
  async updateTable(e4, t72) {
    return this.tableOps.updateTable(e4, t72);
  }
  async dropTable(e4, t72) {
    await this.tableOps.dropTable(e4, t72);
  }
  async loadTable(e4) {
    return this.tableOps.loadTable(e4);
  }
  async namespaceExists(e4) {
    return this.namespaceOps.namespaceExists(e4);
  }
  async tableExists(e4) {
    return this.tableOps.tableExists(e4);
  }
  async createNamespaceIfNotExists(e4, t72) {
    return this.namespaceOps.createNamespaceIfNotExists(e4, t72);
  }
  async createTableIfNotExists(e4, t72) {
    return this.tableOps.createTableIfNotExists(e4, t72);
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/storage-js@2.108.1/denonext/storage-js.mjs
function g(t72) {
  "@babel/helpers - typeof";
  return g = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e4) {
    return typeof e4;
  } : function(e4) {
    return e4 && typeof Symbol == "function" && e4.constructor === Symbol && e4 !== Symbol.prototype ? "symbol" : typeof e4;
  }, g(t72);
}
function F4(t72, e4) {
  if (g(t72) != "object" || !t72) return t72;
  var r10 = t72[Symbol.toPrimitive];
  if (r10 !== void 0) {
    var a8 = r10.call(t72, e4 || "default");
    if (g(a8) != "object") return a8;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e4 === "string" ? String : Number)(t72);
}
function L4(t72) {
  var e4 = F4(t72, "string");
  return g(e4) == "symbol" ? e4 : e4 + "";
}
function D5(t72, e4, r10) {
  return (e4 = L4(e4)) in t72 ? Object.defineProperty(t72, e4, { value: r10, enumerable: true, configurable: true, writable: true }) : t72[e4] = r10, t72;
}
function j4(t72, e4) {
  var r10 = Object.keys(t72);
  if (Object.getOwnPropertySymbols) {
    var a8 = Object.getOwnPropertySymbols(t72);
    e4 && (a8 = a8.filter(function(n9) {
      return Object.getOwnPropertyDescriptor(t72, n9).enumerable;
    })), r10.push.apply(r10, a8);
  }
  return r10;
}
function c2(t72) {
  for (var e4 = 1; e4 < arguments.length; e4++) {
    var r10 = arguments[e4] != null ? arguments[e4] : {};
    e4 % 2 ? j4(Object(r10), true).forEach(function(a8) {
      D5(t72, a8, r10[a8]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t72, Object.getOwnPropertyDescriptors(r10)) : j4(Object(r10)).forEach(function(a8) {
      Object.defineProperty(t72, a8, Object.getOwnPropertyDescriptor(r10, a8));
    });
  }
  return t72;
}
var w4 = class extends Error {
  constructor(t72, e4 = "storage", r10, a8) {
    super(t72), this.__isStorageError = true, this.namespace = e4, this.name = e4 === "vectors" ? "StorageVectorsError" : "StorageError", this.status = r10, this.statusCode = a8;
  }
  toJSON() {
    return { name: this.name, message: this.message, status: this.status, statusCode: this.statusCode };
  }
};
function b3(t72) {
  return typeof t72 == "object" && t72 !== null && "__isStorageError" in t72;
}
var S6 = class extends w4 {
  constructor(t72, e4, r10, a8 = "storage") {
    super(t72, a8, e4, r10), this.name = a8 === "vectors" ? "StorageVectorsApiError" : "StorageApiError", this.status = e4, this.statusCode = r10;
  }
  toJSON() {
    return c2({}, super.toJSON());
  }
};
var E6 = class extends w4 {
  constructor(t72, e4, r10 = "storage") {
    super(t72, r10), this.name = r10 === "vectors" ? "StorageVectorsUnknownError" : "StorageUnknownError", this.originalError = e4;
  }
};
var de2 = function(t72) {
  return t72.InternalError = "InternalError", t72.S3VectorConflictException = "S3VectorConflictException", t72.S3VectorNotFoundException = "S3VectorNotFoundException", t72.S3VectorBucketNotEmpty = "S3VectorBucketNotEmpty", t72.S3VectorMaxBucketsExceeded = "S3VectorMaxBucketsExceeded", t72.S3VectorMaxIndexesExceeded = "S3VectorMaxIndexesExceeded", t72;
}({});
function O7(t72, e4, r10) {
  let a8 = c2({}, t72), n9 = e4.toLowerCase();
  for (let s8 of Object.keys(a8)) s8.toLowerCase() === n9 && delete a8[s8];
  return a8[n9] = r10, a8;
}
function R4(t72) {
  let e4 = {};
  for (let [r10, a8] of Object.entries(t72)) e4[r10.toLowerCase()] = a8;
  return e4;
}
var A6 = (t72) => t72 ? (...e4) => t72(...e4) : (...e4) => fetch(...e4);
var H5 = (t72) => {
  if (typeof t72 != "object" || t72 === null) return false;
  let e4 = Object.getPrototypeOf(t72);
  return (e4 === null || e4 === Object.prototype || Object.getPrototypeOf(e4) === null) && !(Symbol.toStringTag in t72) && !(Symbol.iterator in t72);
};
var $5 = (t72) => {
  if (Array.isArray(t72)) return t72.map((r10) => $5(r10));
  if (typeof t72 == "function" || t72 !== Object(t72)) return t72;
  let e4 = {};
  return Object.entries(t72).forEach(([r10, a8]) => {
    let n9 = r10.replace(/([-_][a-z])/gi, (s8) => s8.toUpperCase().replace(/[-_]/g, ""));
    e4[n9] = $5(a8);
  }), e4;
};
var q4 = (t72) => !t72 || typeof t72 != "string" || t72.length === 0 || t72.length > 100 || t72.trim() !== t72 || t72.includes("/") || t72.includes("\\") ? false : /^[\w!.\*'() &$@=;:+,?-]+$/.test(t72);
var T5 = (t72) => {
  if (typeof t72 == "object" && t72 !== null) {
    let e4 = t72;
    if (typeof e4.msg == "string") return e4.msg;
    if (typeof e4.message == "string") return e4.message;
    if (typeof e4.error_description == "string") return e4.error_description;
    if (typeof e4.error == "string") return e4.error;
    if (typeof e4.error == "object" && e4.error !== null) {
      let r10 = e4.error;
      if (typeof r10.message == "string") return r10.message;
    }
  }
  return JSON.stringify(t72);
};
var M4 = async (t72, e4, r10, a8) => {
  if (t72 !== null && typeof t72 == "object" && "json" in t72 && typeof t72.json == "function") {
    let n9 = t72, s8 = parseInt(String(n9.status), 10);
    Number.isFinite(s8) || (s8 = 500), n9.json().then((o18) => {
      let u8 = o18?.statusCode || o18?.code || s8 + "";
      e4(new S6(T5(o18), s8, u8, a8));
    }).catch(() => {
      let o18 = s8 + "";
      e4(new S6(n9.statusText || `HTTP ${s8} error`, s8, o18, a8));
    });
  } else e4(new E6(T5(t72), t72, a8));
};
var z3 = (t72, e4, r10, a8) => {
  let n9 = { method: t72, headers: e4?.headers || {} };
  if (t72 === "GET" || t72 === "HEAD" || !a8) return c2(c2({}, n9), r10);
  if (H5(a8)) {
    var s8;
    let o18 = e4?.headers || {}, u8;
    for (let [i12, l8] of Object.entries(o18)) i12.toLowerCase() === "content-type" && (u8 = l8);
    n9.headers = O7(o18, "Content-Type", (s8 = u8) !== null && s8 !== void 0 ? s8 : "application/json"), n9.body = JSON.stringify(a8);
  } else n9.body = a8;
  return e4?.duplex && (n9.duplex = e4.duplex), c2(c2({}, n9), r10);
};
async function v2(t72, e4, r10, a8, n9, s8, o18) {
  return new Promise((u8, i12) => {
    t72(r10, z3(e4, a8, n9, s8)).then((l8) => {
      if (!l8.ok) throw l8;
      if (a8?.noResolveJson) return l8;
      if (o18 === "vectors") {
        let d5 = l8.headers.get("content-type");
        if (l8.headers.get("content-length") === "0" || l8.status === 204) return {};
        if (!d5 || !d5.includes("application/json")) return {};
      }
      return l8.json();
    }).then((l8) => u8(l8)).catch((l8) => M4(l8, i12, a8, o18));
  });
}
function N6(t72 = "storage") {
  return { get: async (e4, r10, a8, n9) => v2(e4, "GET", r10, a8, n9, void 0, t72), post: async (e4, r10, a8, n9, s8) => v2(e4, "POST", r10, n9, s8, a8, t72), put: async (e4, r10, a8, n9, s8) => v2(e4, "PUT", r10, n9, s8, a8, t72), head: async (e4, r10, a8, n9) => v2(e4, "HEAD", r10, c2(c2({}, a8), {}, { noResolveJson: true }), n9, void 0, t72), remove: async (e4, r10, a8, n9, s8) => v2(e4, "DELETE", r10, n9, s8, a8, t72) };
}
var K3 = N6("storage");
var { get: m3, post: f4, put: B4, head: J3, remove: P3 } = K3;
var h2 = N6("vectors");
var p2 = class {
  constructor(t72, e4 = {}, r10, a8 = "storage") {
    this.shouldThrowOnError = false, this.url = t72, this.headers = R4(e4), this.fetch = A6(r10), this.namespace = a8;
  }
  throwOnError() {
    return this.shouldThrowOnError = true, this;
  }
  setHeader(t72, e4) {
    return this.headers = O7(this.headers, t72, e4), this;
  }
  async handleOperation(t72) {
    var e4 = this;
    try {
      return { data: await t72(), error: null };
    } catch (r10) {
      if (e4.shouldThrowOnError) throw r10;
      if (b3(r10)) return { data: null, error: r10 };
      throw r10;
    }
  }
};
var V3;
V3 = Symbol.toStringTag;
var G3 = class {
  constructor(t72, e4) {
    this.downloadFn = t72, this.shouldThrowOnError = e4, this[V3] = "StreamDownloadBuilder", this.promise = null;
  }
  then(t72, e4) {
    return this.getPromise().then(t72, e4);
  }
  catch(t72) {
    return this.getPromise().catch(t72);
  }
  finally(t72) {
    return this.getPromise().finally(t72);
  }
  getPromise() {
    return this.promise || (this.promise = this.execute()), this.promise;
  }
  async execute() {
    var t72 = this;
    try {
      return { data: (await t72.downloadFn()).body, error: null };
    } catch (e4) {
      if (t72.shouldThrowOnError) throw e4;
      if (b3(e4)) return { data: null, error: e4 };
      throw e4;
    }
  }
};
var C5;
C5 = Symbol.toStringTag;
var Q3 = class {
  constructor(t72, e4) {
    this.downloadFn = t72, this.shouldThrowOnError = e4, this[C5] = "BlobDownloadBuilder", this.promise = null;
  }
  asStream() {
    return new G3(this.downloadFn, this.shouldThrowOnError);
  }
  then(t72, e4) {
    return this.getPromise().then(t72, e4);
  }
  catch(t72) {
    return this.getPromise().catch(t72);
  }
  finally(t72) {
    return this.getPromise().finally(t72);
  }
  getPromise() {
    return this.promise || (this.promise = this.execute()), this.promise;
  }
  async execute() {
    var t72 = this;
    try {
      return { data: await (await t72.downloadFn()).blob(), error: null };
    } catch (e4) {
      if (t72.shouldThrowOnError) throw e4;
      if (b3(e4)) return { data: null, error: e4 };
      throw e4;
    }
  }
};
var W3 = { limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } };
var I3 = { cacheControl: "3600", contentType: "text/plain;charset=UTF-8", upsert: false };
var X3 = class extends p2 {
  constructor(t72, e4 = {}, r10, a8) {
    super(t72, e4, a8, "storage"), this.bucketId = r10;
  }
  async uploadOrUpdate(t72, e4, r10, a8) {
    var n9 = this;
    return n9.handleOperation(async () => {
      let s8, o18 = c2(c2({}, I3), a8), u8 = c2(c2({}, n9.headers), t72 === "POST" && { "x-upsert": String(o18.upsert) }), i12 = o18.metadata;
      if (typeof Blob < "u" && r10 instanceof Blob ? (s8 = new FormData(), s8.append("cacheControl", o18.cacheControl), i12 && s8.append("metadata", n9.encodeMetadata(i12)), s8.append("", r10)) : typeof FormData < "u" && r10 instanceof FormData ? (s8 = r10, s8.has("cacheControl") || s8.append("cacheControl", o18.cacheControl), i12 && !s8.has("metadata") && s8.append("metadata", n9.encodeMetadata(i12))) : (s8 = r10, u8["cache-control"] = `max-age=${o18.cacheControl}`, u8["content-type"] = o18.contentType, i12 && (u8["x-metadata"] = n9.toBase64(n9.encodeMetadata(i12))), (typeof ReadableStream < "u" && s8 instanceof ReadableStream || s8 && typeof s8 == "object" && "pipe" in s8 && typeof s8.pipe == "function") && !o18.duplex && (o18.duplex = "half")), a8?.headers) for (let [x13, k6] of Object.entries(a8.headers)) u8 = O7(u8, x13, k6);
      let l8 = n9._removeEmptyFolders(e4), d5 = n9._getFinalPath(l8), y11 = await (t72 == "PUT" ? B4 : f4)(n9.fetch, `${n9.url}/object/${d5}`, s8, c2({ headers: u8 }, o18?.duplex ? { duplex: o18.duplex } : {}));
      return { path: l8, id: y11.Id, fullPath: y11.Key };
    });
  }
  async upload(t72, e4, r10) {
    return this.uploadOrUpdate("POST", t72, e4, r10);
  }
  async uploadToSignedUrl(t72, e4, r10, a8) {
    var n9 = this;
    let s8 = n9._removeEmptyFolders(t72), o18 = n9._getFinalPath(s8), u8 = new URL(n9.url + `/object/upload/sign/${o18}`);
    return u8.searchParams.set("token", e4), n9.handleOperation(async () => {
      let i12, l8 = c2(c2({}, I3), a8), d5 = c2(c2({}, n9.headers), { "x-upsert": String(l8.upsert) }), y11 = l8.metadata;
      if (typeof Blob < "u" && r10 instanceof Blob ? (i12 = new FormData(), i12.append("cacheControl", l8.cacheControl), y11 && i12.append("metadata", n9.encodeMetadata(y11)), i12.append("", r10)) : typeof FormData < "u" && r10 instanceof FormData ? (i12 = r10, i12.has("cacheControl") || i12.append("cacheControl", l8.cacheControl), y11 && !i12.has("metadata") && i12.append("metadata", n9.encodeMetadata(y11))) : (i12 = r10, d5["cache-control"] = `max-age=${l8.cacheControl}`, d5["content-type"] = l8.contentType, y11 && (d5["x-metadata"] = n9.toBase64(n9.encodeMetadata(y11))), (typeof ReadableStream < "u" && i12 instanceof ReadableStream || i12 && typeof i12 == "object" && "pipe" in i12 && typeof i12.pipe == "function") && !l8.duplex && (l8.duplex = "half")), a8?.headers) for (let [x13, k6] of Object.entries(a8.headers)) d5 = O7(d5, x13, k6);
      return { path: s8, fullPath: (await B4(n9.fetch, u8.toString(), i12, c2({ headers: d5 }, l8?.duplex ? { duplex: l8.duplex } : {}))).Key };
    });
  }
  async createSignedUploadUrl(t72, e4) {
    var r10 = this;
    return r10.handleOperation(async () => {
      let a8 = r10._getFinalPath(t72), n9 = c2({}, r10.headers);
      e4?.upsert && (n9["x-upsert"] = "true");
      let s8 = await f4(r10.fetch, `${r10.url}/object/upload/sign/${a8}`, {}, { headers: n9 }), o18 = new URL(r10.url + s8.url), u8 = o18.searchParams.get("token");
      if (!u8) throw new w4("No token returned by API");
      return { signedUrl: o18.toString(), path: t72, token: u8 };
    });
  }
  async update(t72, e4, r10) {
    return this.uploadOrUpdate("PUT", t72, e4, r10);
  }
  async move(t72, e4, r10) {
    var a8 = this;
    return a8.handleOperation(async () => await f4(a8.fetch, `${a8.url}/object/move`, { bucketId: a8.bucketId, sourceKey: t72, destinationKey: e4, destinationBucket: r10?.destinationBucket }, { headers: a8.headers }));
  }
  async copy(t72, e4, r10) {
    var a8 = this;
    return a8.handleOperation(async () => ({ path: (await f4(a8.fetch, `${a8.url}/object/copy`, { bucketId: a8.bucketId, sourceKey: t72, destinationKey: e4, destinationBucket: r10?.destinationBucket }, { headers: a8.headers })).Key }));
  }
  async createSignedUrl(t72, e4, r10) {
    var a8 = this;
    return a8.handleOperation(async () => {
      let n9 = a8._getFinalPath(t72), s8 = typeof r10?.transform == "object" && r10.transform !== null && Object.keys(r10.transform).length > 0, o18 = await f4(a8.fetch, `${a8.url}/object/sign/${n9}`, c2({ expiresIn: e4 }, s8 ? { transform: r10.transform } : {}), { headers: a8.headers }), u8 = new URLSearchParams();
      r10?.download && u8.set("download", r10.download === true ? "" : r10.download), r10?.cacheNonce != null && u8.set("cacheNonce", String(r10.cacheNonce));
      let i12 = u8.toString();
      return { signedUrl: encodeURI(`${a8.url}${o18.signedURL}${i12 ? `&${i12}` : ""}`) };
    });
  }
  async createSignedUrls(t72, e4, r10) {
    var a8 = this;
    return a8.handleOperation(async () => {
      let n9 = await f4(a8.fetch, `${a8.url}/object/sign/${a8.bucketId}`, { expiresIn: e4, paths: t72 }, { headers: a8.headers }), s8 = new URLSearchParams();
      r10?.download && s8.set("download", r10.download === true ? "" : r10.download), r10?.cacheNonce != null && s8.set("cacheNonce", String(r10.cacheNonce));
      let o18 = s8.toString();
      return n9.map((u8) => c2(c2({}, u8), {}, { signedUrl: u8.signedURL ? encodeURI(`${a8.url}${u8.signedURL}${o18 ? `&${o18}` : ""}`) : null }));
    });
  }
  download(t72, e4, r10) {
    let a8 = typeof e4?.transform == "object" && e4.transform !== null && Object.keys(e4.transform).length > 0 ? "render/image/authenticated" : "object", n9 = new URLSearchParams();
    e4?.transform && this.applyTransformOptsToQuery(n9, e4.transform), e4?.cacheNonce != null && n9.set("cacheNonce", String(e4.cacheNonce));
    let s8 = n9.toString(), o18 = this._getFinalPath(t72), u8 = () => m3(this.fetch, `${this.url}/${a8}/${o18}${s8 ? `?${s8}` : ""}`, { headers: this.headers, noResolveJson: true }, r10);
    return new Q3(u8, this.shouldThrowOnError);
  }
  async info(t72) {
    var e4 = this;
    let r10 = e4._getFinalPath(t72);
    return e4.handleOperation(async () => $5(await m3(e4.fetch, `${e4.url}/object/info/${r10}`, { headers: e4.headers })));
  }
  async exists(t72) {
    var e4 = this;
    let r10 = e4._getFinalPath(t72);
    try {
      return await J3(e4.fetch, `${e4.url}/object/${r10}`, { headers: e4.headers }), { data: true, error: null };
    } catch (n9) {
      if (e4.shouldThrowOnError) throw n9;
      if (b3(n9)) {
        var a8;
        let s8 = n9 instanceof S6 ? n9.status : n9 instanceof E6 ? (a8 = n9.originalError) === null || a8 === void 0 ? void 0 : a8.status : void 0;
        if (s8 !== void 0 && [400, 404].includes(s8)) return { data: false, error: n9 };
      }
      throw n9;
    }
  }
  getPublicUrl(t72, e4) {
    let r10 = this._getFinalPath(t72), a8 = new URLSearchParams();
    e4?.download && a8.set("download", e4.download === true ? "" : e4.download), e4?.transform && this.applyTransformOptsToQuery(a8, e4.transform), e4?.cacheNonce != null && a8.set("cacheNonce", String(e4.cacheNonce));
    let n9 = a8.toString(), s8 = typeof e4?.transform == "object" && e4.transform !== null && Object.keys(e4.transform).length > 0 ? "render/image" : "object";
    return { data: { publicUrl: encodeURI(`${this.url}/${s8}/public/${r10}`) + (n9 ? `?${n9}` : "") } };
  }
  async remove(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await P3(e4.fetch, `${e4.url}/object/${e4.bucketId}`, { prefixes: t72 }, { headers: e4.headers }));
  }
  async list(t72, e4, r10) {
    var a8 = this;
    return a8.handleOperation(async () => {
      let n9 = c2(c2(c2({}, W3), e4), {}, { prefix: t72 || "" });
      return await f4(a8.fetch, `${a8.url}/object/list/${a8.bucketId}`, n9, { headers: a8.headers }, r10);
    });
  }
  async listV2(t72, e4) {
    var r10 = this;
    return r10.handleOperation(async () => {
      let a8 = c2({}, t72);
      return await f4(r10.fetch, `${r10.url}/object/list-v2/${r10.bucketId}`, a8, { headers: r10.headers }, e4);
    });
  }
  encodeMetadata(t72) {
    return JSON.stringify(t72);
  }
  toBase64(t72) {
    return typeof __Buffer$ < "u" ? __Buffer$.from(t72).toString("base64") : btoa(t72);
  }
  _getFinalPath(t72) {
    return `${this.bucketId}/${t72.replace(/^\/+/, "")}`;
  }
  _removeEmptyFolders(t72) {
    return t72.replace(/^\/|\/$/g, "").replace(/\/+/g, "/");
  }
  applyTransformOptsToQuery(t72, e4) {
    return e4.width && t72.set("width", e4.width.toString()), e4.height && t72.set("height", e4.height.toString()), e4.resize && t72.set("resize", e4.resize), e4.format && t72.set("format", e4.format), e4.quality && t72.set("quality", e4.quality.toString()), t72;
  }
};
var Y3 = "2.108.1";
var _4 = { "X-Client-Info": `storage-js/${Y3}` };
var Z3 = class extends p2 {
  constructor(t72, e4 = {}, r10, a8) {
    let n9 = new URL(t72);
    a8?.useNewHostname && /supabase\.(co|in|red)$/.test(n9.hostname) && !n9.hostname.includes("storage.supabase.") && (n9.hostname = n9.hostname.replace("supabase.", "storage.supabase."));
    let s8 = n9.href.replace(/\/$/, ""), o18 = c2(c2({}, _4), e4);
    super(s8, o18, r10, "storage");
  }
  async listBuckets(t72) {
    var e4 = this;
    return e4.handleOperation(async () => {
      let r10 = e4.listBucketOptionsToQueryString(t72);
      return await m3(e4.fetch, `${e4.url}/bucket${r10}`, { headers: e4.headers });
    });
  }
  async getBucket(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await m3(e4.fetch, `${e4.url}/bucket/${t72}`, { headers: e4.headers }));
  }
  async createBucket(t72, e4 = { public: false }) {
    var r10 = this;
    return r10.handleOperation(async () => await f4(r10.fetch, `${r10.url}/bucket`, { id: t72, name: t72, type: e4.type, public: e4.public, file_size_limit: e4.fileSizeLimit, allowed_mime_types: e4.allowedMimeTypes }, { headers: r10.headers }));
  }
  async updateBucket(t72, e4) {
    var r10 = this;
    return r10.handleOperation(async () => await B4(r10.fetch, `${r10.url}/bucket/${t72}`, { id: t72, name: t72, public: e4.public, file_size_limit: e4.fileSizeLimit, allowed_mime_types: e4.allowedMimeTypes }, { headers: r10.headers }));
  }
  async emptyBucket(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await f4(e4.fetch, `${e4.url}/bucket/${t72}/empty`, {}, { headers: e4.headers }));
  }
  async deleteBucket(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await P3(e4.fetch, `${e4.url}/bucket/${t72}`, {}, { headers: e4.headers }));
  }
  listBucketOptionsToQueryString(t72) {
    let e4 = {};
    return t72 && ("limit" in t72 && (e4.limit = String(t72.limit)), "offset" in t72 && (e4.offset = String(t72.offset)), t72.search && (e4.search = t72.search), t72.sortColumn && (e4.sortColumn = t72.sortColumn), t72.sortOrder && (e4.sortOrder = t72.sortOrder)), Object.keys(e4).length > 0 ? "?" + new URLSearchParams(e4).toString() : "";
  }
};
var ee3 = class extends p2 {
  constructor(t72, e4 = {}, r10) {
    let a8 = t72.replace(/\/$/, ""), n9 = c2(c2({}, _4), e4);
    super(a8, n9, r10, "storage");
  }
  async createBucket(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await f4(e4.fetch, `${e4.url}/bucket`, { name: t72 }, { headers: e4.headers }));
  }
  async listBuckets(t72) {
    var e4 = this;
    return e4.handleOperation(async () => {
      let r10 = new URLSearchParams();
      t72?.limit !== void 0 && r10.set("limit", t72.limit.toString()), t72?.offset !== void 0 && r10.set("offset", t72.offset.toString()), t72?.sortColumn && r10.set("sortColumn", t72.sortColumn), t72?.sortOrder && r10.set("sortOrder", t72.sortOrder), t72?.search && r10.set("search", t72.search);
      let a8 = r10.toString(), n9 = a8 ? `${e4.url}/bucket?${a8}` : `${e4.url}/bucket`;
      return await m3(e4.fetch, n9, { headers: e4.headers });
    });
  }
  async deleteBucket(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await P3(e4.fetch, `${e4.url}/bucket/${t72}`, {}, { headers: e4.headers }));
  }
  from(t72) {
    var e4 = this;
    if (!q4(t72)) throw new w4("Invalid bucket name: File, folder, and bucket names must follow AWS object key naming guidelines and should avoid the use of any other characters.");
    let r10 = new I2({ baseUrl: this.url, catalogName: t72, auth: { type: "custom", getHeaders: async () => e4.headers }, fetch: this.fetch }), a8 = this.shouldThrowOnError;
    return new Proxy(r10, { get(n9, s8) {
      let o18 = n9[s8];
      return typeof o18 != "function" ? o18 : async (...u8) => {
        try {
          return { data: await o18.apply(n9, u8), error: null };
        } catch (i12) {
          if (a8) throw i12;
          return { data: null, error: i12 };
        }
      };
    } });
  }
};
var te3 = class extends p2 {
  constructor(t72, e4 = {}, r10) {
    let a8 = t72.replace(/\/$/, ""), n9 = c2(c2({}, _4), {}, { "Content-Type": "application/json" }, e4);
    super(a8, n9, r10, "vectors");
  }
  async createIndex(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/CreateIndex`, t72, { headers: e4.headers }) || {});
  }
  async getIndex(t72, e4) {
    var r10 = this;
    return r10.handleOperation(async () => await h2.post(r10.fetch, `${r10.url}/GetIndex`, { vectorBucketName: t72, indexName: e4 }, { headers: r10.headers }));
  }
  async listIndexes(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/ListIndexes`, t72, { headers: e4.headers }));
  }
  async deleteIndex(t72, e4) {
    var r10 = this;
    return r10.handleOperation(async () => await h2.post(r10.fetch, `${r10.url}/DeleteIndex`, { vectorBucketName: t72, indexName: e4 }, { headers: r10.headers }) || {});
  }
};
var re3 = class extends p2 {
  constructor(t72, e4 = {}, r10) {
    let a8 = t72.replace(/\/$/, ""), n9 = c2(c2({}, _4), {}, { "Content-Type": "application/json" }, e4);
    super(a8, n9, r10, "vectors");
  }
  async putVectors(t72) {
    var e4 = this;
    if (t72.vectors.length < 1 || t72.vectors.length > 500) throw new Error("Vector batch size must be between 1 and 500 items");
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/PutVectors`, t72, { headers: e4.headers }) || {});
  }
  async getVectors(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/GetVectors`, t72, { headers: e4.headers }));
  }
  async listVectors(t72) {
    var e4 = this;
    if (t72.segmentCount !== void 0) {
      if (t72.segmentCount < 1 || t72.segmentCount > 16) throw new Error("segmentCount must be between 1 and 16");
      if (t72.segmentIndex !== void 0 && (t72.segmentIndex < 0 || t72.segmentIndex >= t72.segmentCount)) throw new Error(`segmentIndex must be between 0 and ${t72.segmentCount - 1}`);
    }
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/ListVectors`, t72, { headers: e4.headers }));
  }
  async queryVectors(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/QueryVectors`, t72, { headers: e4.headers }));
  }
  async deleteVectors(t72) {
    var e4 = this;
    if (t72.keys.length < 1 || t72.keys.length > 500) throw new Error("Keys batch size must be between 1 and 500 items");
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/DeleteVectors`, t72, { headers: e4.headers }) || {});
  }
};
var ae3 = class extends p2 {
  constructor(t72, e4 = {}, r10) {
    let a8 = t72.replace(/\/$/, ""), n9 = c2(c2({}, _4), {}, { "Content-Type": "application/json" }, e4);
    super(a8, n9, r10, "vectors");
  }
  async createBucket(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/CreateVectorBucket`, { vectorBucketName: t72 }, { headers: e4.headers }) || {});
  }
  async getBucket(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/GetVectorBucket`, { vectorBucketName: t72 }, { headers: e4.headers }));
  }
  async listBuckets(t72 = {}) {
    var e4 = this;
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/ListVectorBuckets`, t72, { headers: e4.headers }));
  }
  async deleteBucket(t72) {
    var e4 = this;
    return e4.handleOperation(async () => await h2.post(e4.fetch, `${e4.url}/DeleteVectorBucket`, { vectorBucketName: t72 }, { headers: e4.headers }) || {});
  }
};
var ne3 = class extends ae3 {
  constructor(t72, e4 = {}) {
    super(t72, e4.headers || {}, e4.fetch);
  }
  from(t72) {
    return new se2(this.url, this.headers, t72, this.fetch);
  }
  async createBucket(t72) {
    var e4 = () => super.createBucket, r10 = this;
    return e4().call(r10, t72);
  }
  async getBucket(t72) {
    var e4 = () => super.getBucket, r10 = this;
    return e4().call(r10, t72);
  }
  async listBuckets(t72 = {}) {
    var e4 = () => super.listBuckets, r10 = this;
    return e4().call(r10, t72);
  }
  async deleteBucket(t72) {
    var e4 = () => super.deleteBucket, r10 = this;
    return e4().call(r10, t72);
  }
};
var se2 = class extends te3 {
  constructor(t72, e4, r10, a8) {
    super(t72, e4, a8), this.vectorBucketName = r10;
  }
  async createIndex(t72) {
    var e4 = () => super.createIndex, r10 = this;
    return e4().call(r10, c2(c2({}, t72), {}, { vectorBucketName: r10.vectorBucketName }));
  }
  async listIndexes(t72 = {}) {
    var e4 = () => super.listIndexes, r10 = this;
    return e4().call(r10, c2(c2({}, t72), {}, { vectorBucketName: r10.vectorBucketName }));
  }
  async getIndex(t72) {
    var e4 = () => super.getIndex, r10 = this;
    return e4().call(r10, r10.vectorBucketName, t72);
  }
  async deleteIndex(t72) {
    var e4 = () => super.deleteIndex, r10 = this;
    return e4().call(r10, r10.vectorBucketName, t72);
  }
  index(t72) {
    return new ce2(this.url, this.headers, this.vectorBucketName, t72, this.fetch);
  }
};
var ce2 = class extends re3 {
  constructor(t72, e4, r10, a8, n9) {
    super(t72, e4, n9), this.vectorBucketName = r10, this.indexName = a8;
  }
  async putVectors(t72) {
    var e4 = () => super.putVectors, r10 = this;
    return e4().call(r10, c2(c2({}, t72), {}, { vectorBucketName: r10.vectorBucketName, indexName: r10.indexName }));
  }
  async getVectors(t72) {
    var e4 = () => super.getVectors, r10 = this;
    return e4().call(r10, c2(c2({}, t72), {}, { vectorBucketName: r10.vectorBucketName, indexName: r10.indexName }));
  }
  async listVectors(t72 = {}) {
    var e4 = () => super.listVectors, r10 = this;
    return e4().call(r10, c2(c2({}, t72), {}, { vectorBucketName: r10.vectorBucketName, indexName: r10.indexName }));
  }
  async queryVectors(t72) {
    var e4 = () => super.queryVectors, r10 = this;
    return e4().call(r10, c2(c2({}, t72), {}, { vectorBucketName: r10.vectorBucketName, indexName: r10.indexName }));
  }
  async deleteVectors(t72) {
    var e4 = () => super.deleteVectors, r10 = this;
    return e4().call(r10, c2(c2({}, t72), {}, { vectorBucketName: r10.vectorBucketName, indexName: r10.indexName }));
  }
};
var fe3 = class extends Z3 {
  constructor(t72, e4 = {}, r10, a8) {
    super(t72, e4, r10, a8);
  }
  from(t72) {
    return new X3(this.url, this.headers, t72, this.fetch);
  }
  get vectors() {
    return new ne3(this.url + "/vector", { headers: this.headers, fetch: this.fetch });
  }
  get analytics() {
    return new ee3(this.url + "/iceberg", this.headers, this.fetch);
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/supabase-js@2.108.1/denonext/supabase-js.mjs
import __Process$2 from "node:process";
var I4 = "2.108.1";
var T6 = "";
var w5;
typeof Deno < "u" ? (T6 = "deno", w5 = (O8 = Deno.version) === null || O8 === void 0 ? void 0 : O8.deno) : typeof document < "u" ? T6 = "web" : typeof navigator < "u" && navigator.product === "ReactNative" ? T6 = "react-native" : (T6 = "node", w5 = typeof __Process$2 < "u" ? (_5 = __Process$2.version) === null || _5 === void 0 ? void 0 : _5.replace(/^v/, "") : void 0);
var O8;
var _5;
var L5 = [`runtime=${T6}`];
w5 && L5.push(`runtime-version=${w5}`);
var F5 = { "X-Client-Info": `supabase-js/${I4}; ${L5.join("; ")}` };
var N7 = { headers: F5 };
var j5 = { schema: "public" };
var x6 = { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: "implicit" };
var H6 = {};
var K4 = { enabled: false, respectSamplingDecision: true };
function $6(e4, t72, r10, n9) {
  function s8(i12) {
    return i12 instanceof r10 ? i12 : new r10(function(l8) {
      l8(i12);
    });
  }
  return new (r10 || (r10 = Promise))(function(i12, l8) {
    function p9(c9) {
      try {
        f11(n9.next(c9));
      } catch (u8) {
        l8(u8);
      }
    }
    function a8(c9) {
      try {
        f11(n9.throw(c9));
      } catch (u8) {
        l8(u8);
      }
    }
    function f11(c9) {
      c9.done ? i12(c9.value) : s8(c9.value).then(p9, a8);
    }
    f11((n9 = n9.apply(e4, t72 || [])).next());
  });
}
var A7 = null;
var G4 = "@opentelemetry/api";
function B5() {
  return A7 === null && (A7 = import(G4).catch(() => null)), A7;
}
function M5() {
  return $6(this, void 0, void 0, function* () {
    try {
      let e4 = yield B5();
      if (!e4 || !e4.propagation || !e4.context) return null;
      let t72 = {};
      e4.propagation.inject(e4.context.active(), t72);
      let r10 = t72.traceparent;
      return r10 ? { traceparent: r10, tracestate: t72.tracestate, baggage: t72.baggage } : null;
    } catch {
      return null;
    }
  });
}
function z4(e4) {
  if (!e4 || typeof e4 != "string") return null;
  let t72 = e4.split("-");
  if (t72.length !== 4) return null;
  let [r10, n9, s8, i12] = t72;
  if (r10.length !== 2 || n9.length !== 32 || s8.length !== 16 || i12.length !== 2) return null;
  let l8 = /^[0-9a-f]+$/i;
  return !l8.test(r10) || !l8.test(n9) || !l8.test(s8) || !l8.test(i12) || n9 === "00000000000000000000000000000000" || s8 === "0000000000000000" ? null : { version: r10, traceId: n9, parentId: s8, traceFlags: i12, isSampled: (parseInt(i12, 16) & 1) === 1 };
}
function W4(e4, t72) {
  if (!e4 || !t72 || t72.length === 0) return false;
  let r10;
  if (e4 instanceof URL) r10 = e4;
  else try {
    r10 = new URL(e4);
  } catch {
    return false;
  }
  for (let n9 of t72) try {
    if (typeof n9 == "string") {
      if (V4(r10.hostname, n9)) return true;
    } else if (n9 instanceof RegExp) {
      if (n9.test(r10.hostname)) return true;
    } else if (typeof n9 == "function" && n9(r10)) return true;
  } catch {
    continue;
  }
  return false;
}
function V4(e4, t72) {
  if (t72 === e4) return true;
  if (t72.startsWith("*.")) {
    let r10 = t72.slice(2);
    if (e4.endsWith(r10) && (e4 === r10 || e4.endsWith("." + r10))) return true;
  }
  return false;
}
function q5(e4) {
  let t72 = [];
  try {
    let r10 = new URL(e4);
    t72.push(r10.hostname);
  } catch {
  }
  return t72.push("*.supabase.co", "*.supabase.in"), t72.push("localhost", "127.0.0.1", "[::1]"), t72;
}
function y3(e4) {
  "@babel/helpers - typeof";
  return y3 = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(t72) {
    return typeof t72;
  } : function(t72) {
    return t72 && typeof Symbol == "function" && t72.constructor === Symbol && t72 !== Symbol.prototype ? "symbol" : typeof t72;
  }, y3(e4);
}
function J4(e4, t72) {
  if (y3(e4) != "object" || !e4) return e4;
  var r10 = e4[Symbol.toPrimitive];
  if (r10 !== void 0) {
    var n9 = r10.call(e4, t72 || "default");
    if (y3(n9) != "object") return n9;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (t72 === "string" ? String : Number)(e4);
}
function X4(e4) {
  var t72 = J4(e4, "string");
  return y3(t72) == "symbol" ? t72 : t72 + "";
}
function Q4(e4, t72, r10) {
  return (t72 = X4(t72)) in e4 ? Object.defineProperty(e4, t72, { value: r10, enumerable: true, configurable: true, writable: true }) : e4[t72] = r10, e4;
}
function E7(e4, t72) {
  var r10 = Object.keys(e4);
  if (Object.getOwnPropertySymbols) {
    var n9 = Object.getOwnPropertySymbols(e4);
    t72 && (n9 = n9.filter(function(s8) {
      return Object.getOwnPropertyDescriptor(e4, s8).enumerable;
    })), r10.push.apply(r10, n9);
  }
  return r10;
}
function o2(e4) {
  for (var t72 = 1; t72 < arguments.length; t72++) {
    var r10 = arguments[t72] != null ? arguments[t72] : {};
    t72 % 2 ? E7(Object(r10), true).forEach(function(n9) {
      Q4(e4, n9, r10[n9]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e4, Object.getOwnPropertyDescriptors(r10)) : E7(Object(r10)).forEach(function(n9) {
      Object.defineProperty(e4, n9, Object.getOwnPropertyDescriptor(r10, n9));
    });
  }
  return e4;
}
var Y4 = (e4) => e4 ? (...t72) => e4(...t72) : (...t72) => fetch(...t72);
var Z4 = () => Headers;
var ee4 = (e4, t72, r10, n9, s8) => {
  let i12 = Y4(n9), l8 = Z4(), p9 = s8?.enabled === true, a8 = s8?.respectSamplingDecision !== false, f11 = p9 ? q5(t72) : null;
  return async (c9, u8) => {
    var m8;
    let b7 = (m8 = await r10()) !== null && m8 !== void 0 ? m8 : e4, h11 = new l8(u8?.headers);
    if (h11.has("apikey") || h11.set("apikey", e4), h11.has("Authorization") || h11.set("Authorization", `Bearer ${b7}`), f11) {
      let d5 = await te4(c9, f11, a8);
      d5 && (d5.traceparent && !h11.has("traceparent") && h11.set("traceparent", d5.traceparent), d5.tracestate && !h11.has("tracestate") && h11.set("tracestate", d5.tracestate), d5.baggage && !h11.has("baggage") && h11.set("baggage", d5.baggage));
    }
    return i12(c9, o2(o2({}, u8), {}, { headers: h11 }));
  };
};
async function te4(e4, t72, r10) {
  if (!W4(typeof e4 == "string" || e4 instanceof URL ? e4 : e4.url, t72)) return null;
  let n9 = await M5();
  if (!n9 || !n9.traceparent) return null;
  if (r10) {
    let s8 = z4(n9.traceparent);
    if (s8 && !s8.isSampled) return null;
  }
  return n9;
}
function P4(e4) {
  return typeof e4 == "boolean" ? { enabled: e4 } : e4;
}
function re4(e4) {
  return e4.endsWith("/") ? e4 : e4 + "/";
}
function ne4(e4, t72) {
  var r10, n9, s8, i12, l8, p9;
  let { db: a8, auth: f11, realtime: c9, global: u8 } = e4, { db: m8, auth: b7, realtime: h11, global: d5 } = t72, g6 = P4(e4.tracePropagation), v6 = P4(t72.tracePropagation), S12 = { db: o2(o2({}, m8), a8), auth: o2(o2({}, b7), f11), realtime: o2(o2({}, h11), c9), storage: {}, global: o2(o2(o2({}, d5), u8), {}, { headers: o2(o2({}, (r10 = d5?.headers) !== null && r10 !== void 0 ? r10 : {}), (n9 = u8?.headers) !== null && n9 !== void 0 ? n9 : {}) }), tracePropagation: { enabled: (s8 = (i12 = g6?.enabled) !== null && i12 !== void 0 ? i12 : v6?.enabled) !== null && s8 !== void 0 ? s8 : false, respectSamplingDecision: (l8 = (p9 = g6?.respectSamplingDecision) !== null && p9 !== void 0 ? p9 : v6?.respectSamplingDecision) !== null && l8 !== void 0 ? l8 : true }, accessToken: async () => "" };
  return e4.accessToken ? S12.accessToken = e4.accessToken : delete S12.accessToken, S12;
}
function se3(e4) {
  let t72 = e4?.trim();
  if (!t72) throw new Error("supabaseUrl is required.");
  if (!t72.match(/^https?:\/\//i)) throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
  try {
    return new URL(re4(t72));
  } catch {
    throw Error("Invalid supabaseUrl: Provided URL is malformed.");
  }
}
var ie2 = class extends Ht {
  constructor(e4) {
    super(e4);
  }
};
var ae4 = class {
  constructor(e4, t72, r10) {
    var n9, s8;
    this.supabaseUrl = e4, this.supabaseKey = t72;
    let i12 = se3(e4);
    if (!t72) throw new Error("supabaseKey is required.");
    this.realtimeUrl = new URL("realtime/v1", i12), this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws"), this.authUrl = new URL("auth/v1", i12), this.storageUrl = new URL("storage/v1", i12), this.functionsUrl = new URL("functions/v1", i12);
    let l8 = `sb-${i12.hostname.split(".")[0]}-auth-token`, p9 = { db: j5, realtime: H6, auth: o2(o2({}, x6), {}, { storageKey: l8 }), global: N7, tracePropagation: K4 }, a8 = ne4(r10 ?? {}, p9);
    if (this.settings = a8, this.storageKey = (n9 = a8.auth.storageKey) !== null && n9 !== void 0 ? n9 : "", this.headers = (s8 = a8.global.headers) !== null && s8 !== void 0 ? s8 : {}, a8.accessToken) this.accessToken = a8.accessToken, this.auth = new Proxy({}, { get: (c9, u8) => {
      throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(u8)} is not possible`);
    } });
    else {
      var f11;
      this.auth = this._initSupabaseAuthClient((f11 = a8.auth) !== null && f11 !== void 0 ? f11 : {}, this.headers, a8.global.fetch);
    }
    this.fetch = ee4(t72, e4, this._getAccessToken.bind(this), a8.global.fetch, a8.tracePropagation), this.realtime = this._initRealtimeClient(o2({ headers: this.headers, accessToken: this._getAccessToken.bind(this), fetch: this.fetch }, a8.realtime)), this.accessToken && Promise.resolve(this.accessToken()).then((c9) => this.realtime.setAuth(c9)).catch((c9) => console.warn("Failed to set initial Realtime auth token:", c9)), this.rest = new C2(new URL("rest/v1", i12).href, { headers: this.headers, schema: a8.db.schema, fetch: this.fetch, timeout: a8.db.timeout, urlLengthLimit: a8.db.urlLengthLimit }), this.storage = new fe3(this.storageUrl.href, this.headers, this.fetch, r10?.storage), a8.accessToken || this._listenForAuthEvents();
  }
  get functions() {
    return new A2(this.functionsUrl.href, { headers: this.headers, customFetch: this.fetch });
  }
  from(e4) {
    return this.rest.from(e4);
  }
  schema(e4) {
    return this.rest.schema(e4);
  }
  rpc(e4, t72 = {}, r10 = { head: false, get: false, count: void 0 }) {
    return this.rest.rpc(e4, t72, r10);
  }
  channel(e4, t72 = { config: {} }) {
    return this.realtime.channel(e4, t72);
  }
  getChannels() {
    return this.realtime.getChannels();
  }
  removeChannel(e4) {
    return this.realtime.removeChannel(e4);
  }
  removeAllChannels() {
    return this.realtime.removeAllChannels();
  }
  async _getAccessToken() {
    var e4 = this, t72, r10;
    if (e4.accessToken) return await e4.accessToken();
    let { data: n9 } = await e4.auth.getSession();
    return (t72 = (r10 = n9.session) === null || r10 === void 0 ? void 0 : r10.access_token) !== null && t72 !== void 0 ? t72 : e4.supabaseKey;
  }
  _initSupabaseAuthClient({ autoRefreshToken: e4, persistSession: t72, detectSessionInUrl: r10, storage: n9, userStorage: s8, storageKey: i12, flowType: l8, lock: p9, debug: a8, throwOnError: f11, experimental: c9, lockAcquireTimeout: u8, skipAutoInitialize: m8 }, b7, h11) {
    let d5 = { Authorization: `Bearer ${this.supabaseKey}`, apikey: `${this.supabaseKey}` };
    return new ie2({ url: this.authUrl.href, headers: o2(o2({}, d5), b7), storageKey: i12, autoRefreshToken: e4, persistSession: t72, detectSessionInUrl: r10, storage: n9, userStorage: s8, flowType: l8, lock: p9, debug: a8, throwOnError: f11, experimental: c9, fetch: h11, lockAcquireTimeout: u8, skipAutoInitialize: m8, hasCustomAuthorizationHeader: Object.keys(this.headers).some((g6) => g6.toLowerCase() === "authorization") });
  }
  _initRealtimeClient(e4) {
    return new j3(this.realtimeUrl.href, o2(o2({}, e4), {}, { params: o2(o2({}, { apikey: this.supabaseKey }), e4?.params) }));
  }
  _listenForAuthEvents() {
    return this.auth.onAuthStateChange((e4, t72) => {
      this._handleTokenChanged(e4, "CLIENT", t72?.access_token);
    });
  }
  _handleTokenChanged(e4, t72, r10) {
    (e4 === "TOKEN_REFRESHED" || e4 === "SIGNED_IN") && this.changedAccessToken !== r10 ? (this.changedAccessToken = r10, this.realtime.setAuth(r10)) : e4 === "SIGNED_OUT" && (this.realtime.setAuth(), t72 == "STORAGE" && this.auth.signOut(), this.changedAccessToken = void 0);
  }
};
var ye2 = (e4, t72, r10) => new ae4(e4, t72, r10);
function oe3() {
  if (typeof globalThis < "u") return false;
  let e4 = __Process$2;
  if (!e4) return false;
  let t72 = e4.version;
  if (t72 == null) return false;
  let r10 = t72.match(/^v(\d+)\./);
  return r10 ? parseInt(r10[1], 10) <= 18 : false;
}
oe3() && console.warn("\u26A0\uFE0F  Node.js 18 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 20 or later. For more information, visit: https://github.com/orgs/supabase/discussions/37217");

// supabase/functions/_vendor/esm.sh/@bufbuild/protobuf@1.10.1/denonext/protobuf.mjs
import __Process$3 from "node:process";
function T7(t72, e4) {
  if (!t72) throw new Error(e4);
}
var rr = 34028234663852886e22;
var or = -34028234663852886e22;
var sr = 4294967295;
var ir = 2147483647;
var ar = -2147483648;
function Te2(t72) {
  if (typeof t72 != "number") throw new Error("invalid int 32: " + typeof t72);
  if (!Number.isInteger(t72) || t72 > ir || t72 < ar) throw new Error("invalid int 32: " + t72);
}
function tt2(t72) {
  if (typeof t72 != "number") throw new Error("invalid uint 32: " + typeof t72);
  if (!Number.isInteger(t72) || t72 > sr || t72 < 0) throw new Error("invalid uint 32: " + t72);
}
function Et2(t72) {
  if (typeof t72 != "number") throw new Error("invalid float 32: " + typeof t72);
  if (Number.isFinite(t72) && (t72 > rr || t72 < or)) throw new Error("invalid float 32: " + t72);
}
var gn = Symbol("@bufbuild/protobuf/enum-type");
function Nt2(t72) {
  let e4 = t72[gn];
  return T7(e4, "missing enum type on enum object"), e4;
}
function Wt2(t72, e4, n9, r10) {
  t72[gn] = Kt(e4, n9.map((o18) => ({ no: o18.no, name: o18.name, localName: t72[o18.no] })), r10);
}
function Kt(t72, e4, n9) {
  let r10 = /* @__PURE__ */ Object.create(null), o18 = /* @__PURE__ */ Object.create(null), s8 = [];
  for (let i12 of e4) {
    let u8 = Tn(i12);
    s8.push(u8), r10[i12.name] = u8, o18[i12.no] = u8;
  }
  return { typeName: t72, values: s8, findName(i12) {
    return r10[i12];
  }, findNumber(i12) {
    return o18[i12];
  } };
}
function hn(t72, e4, n9) {
  let r10 = {};
  for (let o18 of e4) {
    let s8 = Tn(o18);
    r10[s8.localName] = s8.no, r10[s8.no] = s8.localName;
  }
  return Wt2(r10, t72, e4, n9), r10;
}
function Tn(t72) {
  return "localName" in t72 ? t72 : Object.assign(Object.assign({}, t72), { localName: t72.name });
}
var g2 = class {
  equals(e4) {
    return this.getType().runtime.util.equals(this.getType(), this, e4);
  }
  clone() {
    return this.getType().runtime.util.clone(this);
  }
  fromBinary(e4, n9) {
    let r10 = this.getType(), o18 = r10.runtime.bin, s8 = o18.makeReadOptions(n9);
    return o18.readMessage(this, s8.readerFactory(e4), e4.byteLength, s8), this;
  }
  fromJson(e4, n9) {
    let r10 = this.getType(), o18 = r10.runtime.json, s8 = o18.makeReadOptions(n9);
    return o18.readMessage(r10, e4, s8, this), this;
  }
  fromJsonString(e4, n9) {
    let r10;
    try {
      r10 = JSON.parse(e4);
    } catch (o18) {
      throw new Error(`cannot decode ${this.getType().typeName} from JSON: ${o18 instanceof Error ? o18.message : String(o18)}`);
    }
    return this.fromJson(r10, n9);
  }
  toBinary(e4) {
    let n9 = this.getType(), r10 = n9.runtime.bin, o18 = r10.makeWriteOptions(e4), s8 = o18.writerFactory();
    return r10.writeMessage(this, s8, o18), s8.finish();
  }
  toJson(e4) {
    let n9 = this.getType(), r10 = n9.runtime.json, o18 = r10.makeWriteOptions(e4);
    return r10.writeMessage(this, o18);
  }
  toJsonString(e4) {
    var n9;
    let r10 = this.toJson(e4);
    return JSON.stringify(r10, null, (n9 = e4?.prettySpaces) !== null && n9 !== void 0 ? n9 : 0);
  }
  toJSON() {
    return this.toJson({ emitDefaultValues: true });
  }
  getType() {
    return Object.getPrototypeOf(this).constructor;
  }
};
function En(t72, e4, n9, r10) {
  var o18;
  let s8 = (o18 = r10?.localName) !== null && o18 !== void 0 ? o18 : e4.substring(e4.lastIndexOf(".") + 1), i12 = { [s8]: function(u8) {
    t72.util.initFields(this), t72.util.initPartial(u8, this);
  } }[s8];
  return Object.setPrototypeOf(i12.prototype, new g2()), Object.assign(i12, { runtime: t72, typeName: e4, fields: t72.util.newFieldList(n9), fromBinary(u8, a8) {
    return new i12().fromBinary(u8, a8);
  }, fromJson(u8, a8) {
    return new i12().fromJson(u8, a8);
  }, fromJsonString(u8, a8) {
    return new i12().fromJsonString(u8, a8);
  }, equals(u8, a8) {
    return t72.util.equals(i12, u8, a8);
  } }), i12;
}
function yn() {
  let t72 = 0, e4 = 0;
  for (let r10 = 0; r10 < 28; r10 += 7) {
    let o18 = this.buf[this.pos++];
    if (t72 |= (o18 & 127) << r10, (o18 & 128) == 0) return this.assertBounds(), [t72, e4];
  }
  let n9 = this.buf[this.pos++];
  if (t72 |= (n9 & 15) << 28, e4 = (n9 & 112) >> 4, (n9 & 128) == 0) return this.assertBounds(), [t72, e4];
  for (let r10 = 3; r10 <= 31; r10 += 7) {
    let o18 = this.buf[this.pos++];
    if (e4 |= (o18 & 127) << r10, (o18 & 128) == 0) return this.assertBounds(), [t72, e4];
  }
  throw new Error("invalid varint");
}
function wt2(t72, e4, n9) {
  for (let s8 = 0; s8 < 28; s8 = s8 + 7) {
    let i12 = t72 >>> s8, u8 = !(!(i12 >>> 7) && e4 == 0), a8 = (u8 ? i12 | 128 : i12) & 255;
    if (n9.push(a8), !u8) return;
  }
  let r10 = t72 >>> 28 & 15 | (e4 & 7) << 4, o18 = e4 >> 3 != 0;
  if (n9.push((o18 ? r10 | 128 : r10) & 255), !!o18) {
    for (let s8 = 3; s8 < 31; s8 = s8 + 7) {
      let i12 = e4 >>> s8, u8 = !!(i12 >>> 7), a8 = (u8 ? i12 | 128 : i12) & 255;
      if (n9.push(a8), !u8) return;
    }
    n9.push(e4 >>> 31 & 1);
  }
}
var yt2 = 4294967296;
function Zt(t72) {
  let e4 = t72[0] === "-";
  e4 && (t72 = t72.slice(1));
  let n9 = 1e6, r10 = 0, o18 = 0;
  function s8(i12, u8) {
    let a8 = Number(t72.slice(i12, u8));
    o18 *= n9, r10 = r10 * n9 + a8, r10 >= yt2 && (o18 = o18 + (r10 / yt2 | 0), r10 = r10 % yt2);
  }
  return s8(-24, -18), s8(-18, -12), s8(-12, -6), s8(-6), e4 ? bn(r10, o18) : Qt(r10, o18);
}
function wn(t72, e4) {
  let n9 = Qt(t72, e4), r10 = n9.hi & 2147483648;
  r10 && (n9 = bn(n9.lo, n9.hi));
  let o18 = zt(n9.lo, n9.hi);
  return r10 ? "-" + o18 : o18;
}
function zt(t72, e4) {
  if ({ lo: t72, hi: e4 } = ur(t72, e4), e4 <= 2097151) return String(yt2 * e4 + t72);
  let n9 = t72 & 16777215, r10 = (t72 >>> 24 | e4 << 8) & 16777215, o18 = e4 >> 16 & 65535, s8 = n9 + r10 * 6777216 + o18 * 6710656, i12 = r10 + o18 * 8147497, u8 = o18 * 2, a8 = 1e7;
  return s8 >= a8 && (i12 += Math.floor(s8 / a8), s8 %= a8), i12 >= a8 && (u8 += Math.floor(i12 / a8), i12 %= a8), u8.toString() + Nn(i12) + Nn(s8);
}
function ur(t72, e4) {
  return { lo: t72 >>> 0, hi: e4 >>> 0 };
}
function Qt(t72, e4) {
  return { lo: t72 | 0, hi: e4 | 0 };
}
function bn(t72, e4) {
  return e4 = ~e4, t72 ? t72 = ~t72 + 1 : e4 += 1, Qt(t72, e4);
}
var Nn = (t72) => {
  let e4 = String(t72);
  return "0000000".slice(e4.length) + e4;
};
function Ht2(t72, e4) {
  if (t72 >= 0) {
    for (; t72 > 127; ) e4.push(t72 & 127 | 128), t72 = t72 >>> 7;
    e4.push(t72);
  } else {
    for (let n9 = 0; n9 < 9; n9++) e4.push(t72 & 127 | 128), t72 = t72 >> 7;
    e4.push(1);
  }
}
function In() {
  let t72 = this.buf[this.pos++], e4 = t72 & 127;
  if ((t72 & 128) == 0) return this.assertBounds(), e4;
  if (t72 = this.buf[this.pos++], e4 |= (t72 & 127) << 7, (t72 & 128) == 0) return this.assertBounds(), e4;
  if (t72 = this.buf[this.pos++], e4 |= (t72 & 127) << 14, (t72 & 128) == 0) return this.assertBounds(), e4;
  if (t72 = this.buf[this.pos++], e4 |= (t72 & 127) << 21, (t72 & 128) == 0) return this.assertBounds(), e4;
  t72 = this.buf[this.pos++], e4 |= (t72 & 15) << 28;
  for (let n9 = 5; (t72 & 128) !== 0 && n9 < 10; n9++) t72 = this.buf[this.pos++];
  if ((t72 & 128) != 0) throw new Error("invalid varint");
  return this.assertBounds(), e4 >>> 0;
}
function lr() {
  let t72 = new DataView(new ArrayBuffer(8));
  if (typeof BigInt == "function" && typeof t72.getBigInt64 == "function" && typeof t72.getBigUint64 == "function" && typeof t72.setBigInt64 == "function" && typeof t72.setBigUint64 == "function" && (typeof __Process$3 != "object" || typeof __Process$3.env != "object" || __Process$3.env.BUF_BIGINT_DISABLE !== "1")) {
    let o18 = BigInt("-9223372036854775808"), s8 = BigInt("9223372036854775807"), i12 = BigInt("0"), u8 = BigInt("18446744073709551615");
    return { zero: BigInt(0), supported: true, parse(a8) {
      let f11 = typeof a8 == "bigint" ? a8 : BigInt(a8);
      if (f11 > s8 || f11 < o18) throw new Error(`int64 invalid: ${a8}`);
      return f11;
    }, uParse(a8) {
      let f11 = typeof a8 == "bigint" ? a8 : BigInt(a8);
      if (f11 > u8 || f11 < i12) throw new Error(`uint64 invalid: ${a8}`);
      return f11;
    }, enc(a8) {
      return t72.setBigInt64(0, this.parse(a8), true), { lo: t72.getInt32(0, true), hi: t72.getInt32(4, true) };
    }, uEnc(a8) {
      return t72.setBigInt64(0, this.uParse(a8), true), { lo: t72.getInt32(0, true), hi: t72.getInt32(4, true) };
    }, dec(a8, f11) {
      return t72.setInt32(0, a8, true), t72.setInt32(4, f11, true), t72.getBigInt64(0, true);
    }, uDec(a8, f11) {
      return t72.setInt32(0, a8, true), t72.setInt32(4, f11, true), t72.getBigUint64(0, true);
    } };
  }
  let n9 = (o18) => T7(/^-?[0-9]+$/.test(o18), `int64 invalid: ${o18}`), r10 = (o18) => T7(/^[0-9]+$/.test(o18), `uint64 invalid: ${o18}`);
  return { zero: "0", supported: false, parse(o18) {
    return typeof o18 != "string" && (o18 = o18.toString()), n9(o18), o18;
  }, uParse(o18) {
    return typeof o18 != "string" && (o18 = o18.toString()), r10(o18), o18;
  }, enc(o18) {
    return typeof o18 != "string" && (o18 = o18.toString()), n9(o18), Zt(o18);
  }, uEnc(o18) {
    return typeof o18 != "string" && (o18 = o18.toString()), r10(o18), Zt(o18);
  }, dec(o18, s8) {
    return wn(o18, s8);
  }, uDec(o18, s8) {
    return zt(o18, s8);
  } };
}
var y4 = lr();
var c3;
(function(t72) {
  t72[t72.DOUBLE = 1] = "DOUBLE", t72[t72.FLOAT = 2] = "FLOAT", t72[t72.INT64 = 3] = "INT64", t72[t72.UINT64 = 4] = "UINT64", t72[t72.INT32 = 5] = "INT32", t72[t72.FIXED64 = 6] = "FIXED64", t72[t72.FIXED32 = 7] = "FIXED32", t72[t72.BOOL = 8] = "BOOL", t72[t72.STRING = 9] = "STRING", t72[t72.BYTES = 12] = "BYTES", t72[t72.UINT32 = 13] = "UINT32", t72[t72.SFIXED32 = 15] = "SFIXED32", t72[t72.SFIXED64 = 16] = "SFIXED64", t72[t72.SINT32 = 17] = "SINT32", t72[t72.SINT64 = 18] = "SINT64";
})(c3 || (c3 = {}));
var x7;
(function(t72) {
  t72[t72.BIGINT = 0] = "BIGINT", t72[t72.STRING = 1] = "STRING";
})(x7 || (x7 = {}));
function Y5(t72, e4, n9) {
  if (e4 === n9) return true;
  if (t72 == c3.BYTES) {
    if (!(e4 instanceof Uint8Array) || !(n9 instanceof Uint8Array) || e4.length !== n9.length) return false;
    for (let r10 = 0; r10 < e4.length; r10++) if (e4[r10] !== n9[r10]) return false;
    return true;
  }
  switch (t72) {
    case c3.UINT64:
    case c3.FIXED64:
    case c3.INT64:
    case c3.SFIXED64:
    case c3.SINT64:
      return e4 == n9;
  }
  return false;
}
function P5(t72, e4) {
  switch (t72) {
    case c3.BOOL:
      return false;
    case c3.UINT64:
    case c3.FIXED64:
    case c3.INT64:
    case c3.SFIXED64:
    case c3.SINT64:
      return e4 == 0 ? y4.zero : "0";
    case c3.DOUBLE:
    case c3.FLOAT:
      return 0;
    case c3.BYTES:
      return new Uint8Array(0);
    case c3.STRING:
      return "";
    default:
      return 0;
  }
}
function bt2(t72, e4) {
  switch (t72) {
    case c3.BOOL:
      return e4 === false;
    case c3.STRING:
      return e4 === "";
    case c3.BYTES:
      return e4 instanceof Uint8Array && !e4.byteLength;
    default:
      return e4 == 0;
  }
}
var I5;
(function(t72) {
  t72[t72.Varint = 0] = "Varint", t72[t72.Bit64 = 1] = "Bit64", t72[t72.LengthDelimited = 2] = "LengthDelimited", t72[t72.StartGroup = 3] = "StartGroup", t72[t72.EndGroup = 4] = "EndGroup", t72[t72.Bit32 = 5] = "Bit32";
})(I5 || (I5 = {}));
var nt2 = class {
  constructor(e4) {
    this.stack = [], this.textEncoder = e4 ?? new TextEncoder(), this.chunks = [], this.buf = [];
  }
  finish() {
    this.chunks.push(new Uint8Array(this.buf));
    let e4 = 0;
    for (let o18 = 0; o18 < this.chunks.length; o18++) e4 += this.chunks[o18].length;
    let n9 = new Uint8Array(e4), r10 = 0;
    for (let o18 = 0; o18 < this.chunks.length; o18++) n9.set(this.chunks[o18], r10), r10 += this.chunks[o18].length;
    return this.chunks = [], n9;
  }
  fork() {
    return this.stack.push({ chunks: this.chunks, buf: this.buf }), this.chunks = [], this.buf = [], this;
  }
  join() {
    let e4 = this.finish(), n9 = this.stack.pop();
    if (!n9) throw new Error("invalid state, fork stack empty");
    return this.chunks = n9.chunks, this.buf = n9.buf, this.uint32(e4.byteLength), this.raw(e4);
  }
  tag(e4, n9) {
    return this.uint32((e4 << 3 | n9) >>> 0);
  }
  raw(e4) {
    return this.buf.length && (this.chunks.push(new Uint8Array(this.buf)), this.buf = []), this.chunks.push(e4), this;
  }
  uint32(e4) {
    for (tt2(e4); e4 > 127; ) this.buf.push(e4 & 127 | 128), e4 = e4 >>> 7;
    return this.buf.push(e4), this;
  }
  int32(e4) {
    return Te2(e4), Ht2(e4, this.buf), this;
  }
  bool(e4) {
    return this.buf.push(e4 ? 1 : 0), this;
  }
  bytes(e4) {
    return this.uint32(e4.byteLength), this.raw(e4);
  }
  string(e4) {
    let n9 = this.textEncoder.encode(e4);
    return this.uint32(n9.byteLength), this.raw(n9);
  }
  float(e4) {
    Et2(e4);
    let n9 = new Uint8Array(4);
    return new DataView(n9.buffer).setFloat32(0, e4, true), this.raw(n9);
  }
  double(e4) {
    let n9 = new Uint8Array(8);
    return new DataView(n9.buffer).setFloat64(0, e4, true), this.raw(n9);
  }
  fixed32(e4) {
    tt2(e4);
    let n9 = new Uint8Array(4);
    return new DataView(n9.buffer).setUint32(0, e4, true), this.raw(n9);
  }
  sfixed32(e4) {
    Te2(e4);
    let n9 = new Uint8Array(4);
    return new DataView(n9.buffer).setInt32(0, e4, true), this.raw(n9);
  }
  sint32(e4) {
    return Te2(e4), e4 = (e4 << 1 ^ e4 >> 31) >>> 0, Ht2(e4, this.buf), this;
  }
  sfixed64(e4) {
    let n9 = new Uint8Array(8), r10 = new DataView(n9.buffer), o18 = y4.enc(e4);
    return r10.setInt32(0, o18.lo, true), r10.setInt32(4, o18.hi, true), this.raw(n9);
  }
  fixed64(e4) {
    let n9 = new Uint8Array(8), r10 = new DataView(n9.buffer), o18 = y4.uEnc(e4);
    return r10.setInt32(0, o18.lo, true), r10.setInt32(4, o18.hi, true), this.raw(n9);
  }
  int64(e4) {
    let n9 = y4.enc(e4);
    return wt2(n9.lo, n9.hi, this.buf), this;
  }
  sint64(e4) {
    let n9 = y4.enc(e4), r10 = n9.hi >> 31, o18 = n9.lo << 1 ^ r10, s8 = (n9.hi << 1 | n9.lo >>> 31) ^ r10;
    return wt2(o18, s8, this.buf), this;
  }
  uint64(e4) {
    let n9 = y4.uEnc(e4);
    return wt2(n9.lo, n9.hi, this.buf), this;
  }
};
var se4 = class {
  constructor(e4, n9) {
    this.varint64 = yn, this.uint32 = In, this.buf = e4, this.len = e4.length, this.pos = 0, this.view = new DataView(e4.buffer, e4.byteOffset, e4.byteLength), this.textDecoder = n9 ?? new TextDecoder();
  }
  tag() {
    let e4 = this.uint32(), n9 = e4 >>> 3, r10 = e4 & 7;
    if (n9 <= 0 || r10 < 0 || r10 > 5) throw new Error("illegal tag: field no " + n9 + " wire type " + r10);
    return [n9, r10];
  }
  skip(e4, n9) {
    let r10 = this.pos;
    switch (e4) {
      case I5.Varint:
        for (; this.buf[this.pos++] & 128; ) ;
        break;
      case I5.Bit64:
        this.pos += 4;
      case I5.Bit32:
        this.pos += 4;
        break;
      case I5.LengthDelimited:
        let o18 = this.uint32();
        this.pos += o18;
        break;
      case I5.StartGroup:
        for (; ; ) {
          let [s8, i12] = this.tag();
          if (i12 === I5.EndGroup) {
            if (n9 !== void 0 && s8 !== n9) throw new Error("invalid end group tag");
            break;
          }
          this.skip(i12, s8);
        }
        break;
      default:
        throw new Error("cant skip wire type " + e4);
    }
    return this.assertBounds(), this.buf.subarray(r10, this.pos);
  }
  assertBounds() {
    if (this.pos > this.len) throw new RangeError("premature EOF");
  }
  int32() {
    return this.uint32() | 0;
  }
  sint32() {
    let e4 = this.uint32();
    return e4 >>> 1 ^ -(e4 & 1);
  }
  int64() {
    return y4.dec(...this.varint64());
  }
  uint64() {
    return y4.uDec(...this.varint64());
  }
  sint64() {
    let [e4, n9] = this.varint64(), r10 = -(e4 & 1);
    return e4 = (e4 >>> 1 | (n9 & 1) << 31) ^ r10, n9 = n9 >>> 1 ^ r10, y4.dec(e4, n9);
  }
  bool() {
    let [e4, n9] = this.varint64();
    return e4 !== 0 || n9 !== 0;
  }
  fixed32() {
    return this.view.getUint32((this.pos += 4) - 4, true);
  }
  sfixed32() {
    return this.view.getInt32((this.pos += 4) - 4, true);
  }
  fixed64() {
    return y4.uDec(this.sfixed32(), this.sfixed32());
  }
  sfixed64() {
    return y4.dec(this.sfixed32(), this.sfixed32());
  }
  float() {
    return this.view.getFloat32((this.pos += 4) - 4, true);
  }
  double() {
    return this.view.getFloat64((this.pos += 8) - 8, true);
  }
  bytes() {
    let e4 = this.uint32(), n9 = this.pos;
    return this.pos += e4, this.assertBounds(), this.buf.subarray(n9, n9 + e4);
  }
  string() {
    return this.textDecoder.decode(this.bytes());
  }
};
function kn(t72, e4, n9, r10) {
  let o18;
  return { typeName: e4, extendee: n9, get field() {
    if (!o18) {
      let s8 = typeof r10 == "function" ? r10() : r10;
      s8.name = e4.split(".").pop(), s8.jsonName = `[${e4}]`, o18 = t72.util.newFieldList([s8]).list()[0];
    }
    return o18;
  }, runtime: t72 };
}
function It2(t72) {
  let e4 = t72.field.localName, n9 = /* @__PURE__ */ Object.create(null);
  return n9[e4] = cr(t72), [n9, () => n9[e4]];
}
function cr(t72) {
  let e4 = t72.field;
  if (e4.repeated) return [];
  if (e4.default !== void 0) return e4.default;
  switch (e4.kind) {
    case "enum":
      return e4.T.values[0].no;
    case "scalar":
      return P5(e4.T, e4.L);
    case "message":
      let n9 = e4.T, r10 = new n9();
      return n9.fieldWrapper ? n9.fieldWrapper.unwrapField(r10) : r10;
    case "map":
      throw "map fields are not allowed to be extensions";
  }
}
function Sn(t72, e4) {
  if (!e4.repeated && (e4.kind == "enum" || e4.kind == "scalar")) {
    for (let n9 = t72.length - 1; n9 >= 0; --n9) if (t72[n9].no == e4.no) return [t72[n9]];
    return [];
  }
  return t72.filter((n9) => n9.no === e4.no);
}
var M6 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
var kt = [];
for (let t72 = 0; t72 < M6.length; t72++) kt[M6[t72].charCodeAt(0)] = t72;
kt[45] = M6.indexOf("+");
kt[95] = M6.indexOf("/");
var Ee2 = { dec(t72) {
  let e4 = t72.length * 3 / 4;
  t72[t72.length - 2] == "=" ? e4 -= 2 : t72[t72.length - 1] == "=" && (e4 -= 1);
  let n9 = new Uint8Array(e4), r10 = 0, o18 = 0, s8, i12 = 0;
  for (let u8 = 0; u8 < t72.length; u8++) {
    if (s8 = kt[t72.charCodeAt(u8)], s8 === void 0) switch (t72[u8]) {
      case "=":
        o18 = 0;
      case `
`:
      case "\r":
      case "	":
      case " ":
        continue;
      default:
        throw Error("invalid base64 string.");
    }
    switch (o18) {
      case 0:
        i12 = s8, o18 = 1;
        break;
      case 1:
        n9[r10++] = i12 << 2 | (s8 & 48) >> 4, i12 = s8, o18 = 2;
        break;
      case 2:
        n9[r10++] = (i12 & 15) << 4 | (s8 & 60) >> 2, i12 = s8, o18 = 3;
        break;
      case 3:
        n9[r10++] = (i12 & 3) << 6 | s8, o18 = 0;
        break;
    }
  }
  if (o18 == 1) throw Error("invalid base64 string.");
  return n9.subarray(0, r10);
}, enc(t72) {
  let e4 = "", n9 = 0, r10, o18 = 0;
  for (let s8 = 0; s8 < t72.length; s8++) switch (r10 = t72[s8], n9) {
    case 0:
      e4 += M6[r10 >> 2], o18 = (r10 & 3) << 4, n9 = 1;
      break;
    case 1:
      e4 += M6[o18 | r10 >> 4], o18 = (r10 & 15) << 2, n9 = 2;
      break;
    case 2:
      e4 += M6[o18 | r10 >> 6], e4 += M6[r10 & 63], n9 = 0;
      break;
  }
  return n9 && (e4 += M6[o18], e4 += "=", n9 == 1 && (e4 += "=")), e4;
} };
function en(t72, e4, n9) {
  nn(e4, t72);
  let r10 = e4.runtime.bin.makeReadOptions(n9), o18 = Sn(t72.getType().runtime.bin.listUnknownFields(t72), e4.field), [s8, i12] = It2(e4);
  for (let u8 of o18) e4.runtime.bin.readField(s8, r10.readerFactory(u8.data), e4.field, u8.wireType, r10);
  return i12();
}
function tn(t72, e4, n9, r10) {
  nn(e4, t72);
  let o18 = e4.runtime.bin.makeReadOptions(r10), s8 = e4.runtime.bin.makeWriteOptions(r10);
  if (rt2(t72, e4)) {
    let f11 = t72.getType().runtime.bin.listUnknownFields(t72).filter((p9) => p9.no != e4.field.no);
    t72.getType().runtime.bin.discardUnknownFields(t72);
    for (let p9 of f11) t72.getType().runtime.bin.onUnknownField(t72, p9.no, p9.wireType, p9.data);
  }
  let i12 = s8.writerFactory(), u8 = e4.field;
  !u8.opt && !u8.repeated && (u8.kind == "enum" || u8.kind == "scalar") && (u8 = Object.assign(Object.assign({}, e4.field), { opt: true })), e4.runtime.bin.writeField(u8, n9, i12, s8);
  let a8 = o18.readerFactory(i12.finish());
  for (; a8.pos < a8.len; ) {
    let [f11, p9] = a8.tag(), d5 = a8.skip(p9, f11);
    t72.getType().runtime.bin.onUnknownField(t72, f11, p9, d5);
  }
}
function rt2(t72, e4) {
  let n9 = t72.getType();
  return e4.extendee.typeName === n9.typeName && !!n9.runtime.bin.listUnknownFields(t72).find((r10) => r10.no == e4.field.no);
}
function nn(t72, e4) {
  T7(t72.extendee.typeName == e4.getType().typeName, `extension ${t72.typeName} can only be applied to message ${t72.extendee.typeName}`);
}
function St2(t72, e4) {
  let n9 = t72.localName;
  if (t72.repeated) return e4[n9].length > 0;
  if (t72.oneof) return e4[t72.oneof.localName].case === n9;
  switch (t72.kind) {
    case "enum":
    case "scalar":
      return t72.opt || t72.req ? e4[n9] !== void 0 : t72.kind == "enum" ? e4[n9] !== t72.T.values[0].no : !bt2(t72.T, e4[n9]);
    case "message":
      return e4[n9] !== void 0;
    case "map":
      return Object.keys(e4[n9]).length > 0;
  }
}
function rn(t72, e4) {
  let n9 = t72.localName, r10 = !t72.opt && !t72.req;
  if (t72.repeated) e4[n9] = [];
  else if (t72.oneof) e4[t72.oneof.localName] = { case: void 0 };
  else switch (t72.kind) {
    case "map":
      e4[n9] = {};
      break;
    case "enum":
      e4[n9] = r10 ? t72.T.values[0].no : void 0;
      break;
    case "scalar":
      e4[n9] = r10 ? P5(t72.T, t72.L) : void 0;
      break;
    case "message":
      e4[n9] = void 0;
      break;
  }
}
function k3(t72, e4) {
  if (t72 === null || typeof t72 != "object" || !Object.getOwnPropertyNames(g2.prototype).every((r10) => r10 in t72 && typeof t72[r10] == "function")) return false;
  let n9 = t72.getType();
  return n9 === null || typeof n9 != "function" || !("typeName" in n9) || typeof n9.typeName != "string" ? false : e4 === void 0 ? true : n9.typeName == e4.typeName;
}
function Ot2(t72, e4) {
  return k3(e4) || !t72.fieldWrapper ? e4 : t72.fieldWrapper.wrapField(e4);
}
var fr = { "google.protobuf.DoubleValue": c3.DOUBLE, "google.protobuf.FloatValue": c3.FLOAT, "google.protobuf.Int64Value": c3.INT64, "google.protobuf.UInt64Value": c3.UINT64, "google.protobuf.Int32Value": c3.INT32, "google.protobuf.UInt32Value": c3.UINT32, "google.protobuf.BoolValue": c3.BOOL, "google.protobuf.StringValue": c3.STRING, "google.protobuf.BytesValue": c3.BYTES };
var xn = { ignoreUnknownFields: false };
var vn = { emitDefaultValues: false, enumAsInteger: false, useProtoFieldName: false, prettySpaces: 0 };
function pr(t72) {
  return t72 ? Object.assign(Object.assign({}, xn), t72) : xn;
}
function dr(t72) {
  return t72 ? Object.assign(Object.assign({}, vn), t72) : vn;
}
var Pt2 = Symbol();
var xt2 = Symbol();
function Jn() {
  return { makeReadOptions: pr, makeWriteOptions: dr, readMessage(t72, e4, n9, r10) {
    if (e4 == null || Array.isArray(e4) || typeof e4 != "object") throw new Error(`cannot decode message ${t72.typeName} from JSON: ${L6(e4)}`);
    r10 = r10 ?? new t72();
    let o18 = /* @__PURE__ */ new Map(), s8 = n9.typeRegistry;
    for (let [i12, u8] of Object.entries(e4)) {
      let a8 = t72.fields.findJsonName(i12);
      if (a8) {
        if (a8.oneof) {
          if (u8 === null && a8.kind == "scalar") continue;
          let f11 = o18.get(a8.oneof);
          if (f11 !== void 0) throw new Error(`cannot decode message ${t72.typeName} from JSON: multiple keys for oneof "${a8.oneof.name}" present: "${f11}", "${i12}"`);
          o18.set(a8.oneof, i12);
        }
        Pn(r10, u8, a8, n9, t72);
      } else {
        let f11 = false;
        if (s8?.findExtension && i12.startsWith("[") && i12.endsWith("]")) {
          let p9 = s8.findExtension(i12.substring(1, i12.length - 1));
          if (p9 && p9.extendee.typeName == t72.typeName) {
            f11 = true;
            let [d5, h11] = It2(p9);
            Pn(d5, u8, p9.field, n9, p9), tn(r10, p9, h11(), n9);
          }
        }
        if (!f11 && !n9.ignoreUnknownFields) throw new Error(`cannot decode message ${t72.typeName} from JSON: key "${i12}" is unknown`);
      }
    }
    return r10;
  }, writeMessage(t72, e4) {
    let n9 = t72.getType(), r10 = {}, o18;
    try {
      for (o18 of n9.fields.byNumber()) {
        if (!St2(o18, t72)) {
          if (o18.req) throw "required field not set";
          if (!e4.emitDefaultValues || !hr(o18)) continue;
        }
        let i12 = o18.oneof ? t72[o18.oneof.localName].value : t72[o18.localName], u8 = Dn(o18, i12, e4);
        u8 !== void 0 && (r10[e4.useProtoFieldName ? o18.name : o18.jsonName] = u8);
      }
      let s8 = e4.typeRegistry;
      if (s8?.findExtensionFor) for (let i12 of n9.runtime.bin.listUnknownFields(t72)) {
        let u8 = s8.findExtensionFor(n9.typeName, i12.no);
        if (u8 && rt2(t72, u8)) {
          let a8 = en(t72, u8, e4), f11 = Dn(u8.field, a8, e4);
          f11 !== void 0 && (r10[u8.field.jsonName] = f11);
        }
      }
    } catch (s8) {
      let i12 = o18 ? `cannot encode field ${n9.typeName}.${o18.name} to JSON` : `cannot encode message ${n9.typeName} to JSON`, u8 = s8 instanceof Error ? s8.message : String(s8);
      throw new Error(i12 + (u8.length > 0 ? `: ${u8}` : ""));
    }
    return r10;
  }, readScalar(t72, e4, n9) {
    return ot2(t72, e4, n9 ?? x7.BIGINT, true);
  }, writeScalar(t72, e4, n9) {
    if (e4 !== void 0 && (n9 || bt2(t72, e4))) return vt2(t72, e4);
  }, debug: L6 };
}
function L6(t72) {
  if (t72 === null) return "null";
  switch (typeof t72) {
    case "object":
      return Array.isArray(t72) ? "array" : "object";
    case "string":
      return t72.length > 100 ? "string" : `"${t72.split('"').join('\\"')}"`;
    default:
      return String(t72);
  }
}
function Pn(t72, e4, n9, r10, o18) {
  let s8 = n9.localName;
  if (n9.repeated) {
    if (T7(n9.kind != "map"), e4 === null) return;
    if (!Array.isArray(e4)) throw new Error(`cannot decode field ${o18.typeName}.${n9.name} from JSON: ${L6(e4)}`);
    let i12 = t72[s8];
    for (let u8 of e4) {
      if (u8 === null) throw new Error(`cannot decode field ${o18.typeName}.${n9.name} from JSON: ${L6(u8)}`);
      switch (n9.kind) {
        case "message":
          i12.push(n9.T.fromJson(u8, r10));
          break;
        case "enum":
          let a8 = on(n9.T, u8, r10.ignoreUnknownFields, true);
          a8 !== xt2 && i12.push(a8);
          break;
        case "scalar":
          try {
            i12.push(ot2(n9.T, u8, n9.L, true));
          } catch (f11) {
            let p9 = `cannot decode field ${o18.typeName}.${n9.name} from JSON: ${L6(u8)}`;
            throw f11 instanceof Error && f11.message.length > 0 && (p9 += `: ${f11.message}`), new Error(p9);
          }
          break;
      }
    }
  } else if (n9.kind == "map") {
    if (e4 === null) return;
    if (typeof e4 != "object" || Array.isArray(e4)) throw new Error(`cannot decode field ${o18.typeName}.${n9.name} from JSON: ${L6(e4)}`);
    let i12 = t72[s8];
    for (let [u8, a8] of Object.entries(e4)) {
      if (a8 === null) throw new Error(`cannot decode field ${o18.typeName}.${n9.name} from JSON: map value null`);
      let f11;
      try {
        f11 = gr(n9.K, u8);
      } catch (p9) {
        let d5 = `cannot decode map key for field ${o18.typeName}.${n9.name} from JSON: ${L6(e4)}`;
        throw p9 instanceof Error && p9.message.length > 0 && (d5 += `: ${p9.message}`), new Error(d5);
      }
      switch (n9.V.kind) {
        case "message":
          i12[f11] = n9.V.T.fromJson(a8, r10);
          break;
        case "enum":
          let p9 = on(n9.V.T, a8, r10.ignoreUnknownFields, true);
          p9 !== xt2 && (i12[f11] = p9);
          break;
        case "scalar":
          try {
            i12[f11] = ot2(n9.V.T, a8, x7.BIGINT, true);
          } catch (d5) {
            let h11 = `cannot decode map value for field ${o18.typeName}.${n9.name} from JSON: ${L6(e4)}`;
            throw d5 instanceof Error && d5.message.length > 0 && (h11 += `: ${d5.message}`), new Error(h11);
          }
          break;
      }
    }
  } else switch (n9.oneof && (t72 = t72[n9.oneof.localName] = { case: s8 }, s8 = "value"), n9.kind) {
    case "message":
      let i12 = n9.T;
      if (e4 === null && i12.typeName != "google.protobuf.Value") return;
      let u8 = t72[s8];
      k3(u8) ? u8.fromJson(e4, r10) : (t72[s8] = u8 = i12.fromJson(e4, r10), i12.fieldWrapper && !n9.oneof && (t72[s8] = i12.fieldWrapper.unwrapField(u8)));
      break;
    case "enum":
      let a8 = on(n9.T, e4, r10.ignoreUnknownFields, false);
      switch (a8) {
        case Pt2:
          rn(n9, t72);
          break;
        case xt2:
          break;
        default:
          t72[s8] = a8;
          break;
      }
      break;
    case "scalar":
      try {
        let f11 = ot2(n9.T, e4, n9.L, false);
        switch (f11) {
          case Pt2:
            rn(n9, t72);
            break;
          default:
            t72[s8] = f11;
            break;
        }
      } catch (f11) {
        let p9 = `cannot decode field ${o18.typeName}.${n9.name} from JSON: ${L6(e4)}`;
        throw f11 instanceof Error && f11.message.length > 0 && (p9 += `: ${f11.message}`), new Error(p9);
      }
      break;
  }
}
function gr(t72, e4) {
  if (t72 === c3.BOOL) switch (e4) {
    case "true":
      e4 = true;
      break;
    case "false":
      e4 = false;
      break;
  }
  return ot2(t72, e4, x7.BIGINT, true).toString();
}
function ot2(t72, e4, n9, r10) {
  if (e4 === null) return r10 ? P5(t72, n9) : Pt2;
  switch (t72) {
    case c3.DOUBLE:
    case c3.FLOAT:
      if (e4 === "NaN") return Number.NaN;
      if (e4 === "Infinity") return Number.POSITIVE_INFINITY;
      if (e4 === "-Infinity") return Number.NEGATIVE_INFINITY;
      if (e4 === "" || typeof e4 == "string" && e4.trim().length !== e4.length || typeof e4 != "string" && typeof e4 != "number") break;
      let o18 = Number(e4);
      if (Number.isNaN(o18) || !Number.isFinite(o18)) break;
      return t72 == c3.FLOAT && Et2(o18), o18;
    case c3.INT32:
    case c3.FIXED32:
    case c3.SFIXED32:
    case c3.SINT32:
    case c3.UINT32:
      let s8;
      if (typeof e4 == "number" ? s8 = e4 : typeof e4 == "string" && e4.length > 0 && e4.trim().length === e4.length && (s8 = Number(e4)), s8 === void 0) break;
      return t72 == c3.UINT32 || t72 == c3.FIXED32 ? tt2(s8) : Te2(s8), s8;
    case c3.INT64:
    case c3.SFIXED64:
    case c3.SINT64:
      if (typeof e4 != "number" && typeof e4 != "string") break;
      let i12 = y4.parse(e4);
      return n9 ? i12.toString() : i12;
    case c3.FIXED64:
    case c3.UINT64:
      if (typeof e4 != "number" && typeof e4 != "string") break;
      let u8 = y4.uParse(e4);
      return n9 ? u8.toString() : u8;
    case c3.BOOL:
      if (typeof e4 != "boolean") break;
      return e4;
    case c3.STRING:
      if (typeof e4 != "string") break;
      try {
        encodeURIComponent(e4);
      } catch {
        throw new Error("invalid UTF8");
      }
      return e4;
    case c3.BYTES:
      if (e4 === "") return new Uint8Array(0);
      if (typeof e4 != "string") break;
      return Ee2.dec(e4);
  }
  throw new Error();
}
function on(t72, e4, n9, r10) {
  if (e4 === null) return t72.typeName == "google.protobuf.NullValue" ? 0 : r10 ? t72.values[0].no : Pt2;
  switch (typeof e4) {
    case "number":
      if (Number.isInteger(e4)) return e4;
      break;
    case "string":
      let o18 = t72.findName(e4);
      if (o18 !== void 0) return o18.no;
      if (n9) return xt2;
      break;
  }
  throw new Error(`cannot decode enum ${t72.typeName} from JSON: ${L6(e4)}`);
}
function hr(t72) {
  return t72.repeated || t72.kind == "map" ? true : !(t72.oneof || t72.kind == "message" || t72.opt || t72.req);
}
function Dn(t72, e4, n9) {
  if (t72.kind == "map") {
    T7(typeof e4 == "object" && e4 != null);
    let r10 = {}, o18 = Object.entries(e4);
    switch (t72.V.kind) {
      case "scalar":
        for (let [i12, u8] of o18) r10[i12.toString()] = vt2(t72.V.T, u8);
        break;
      case "message":
        for (let [i12, u8] of o18) r10[i12.toString()] = u8.toJson(n9);
        break;
      case "enum":
        let s8 = t72.V.T;
        for (let [i12, u8] of o18) r10[i12.toString()] = sn(s8, u8, n9.enumAsInteger);
        break;
    }
    return n9.emitDefaultValues || o18.length > 0 ? r10 : void 0;
  }
  if (t72.repeated) {
    T7(Array.isArray(e4));
    let r10 = [];
    switch (t72.kind) {
      case "scalar":
        for (let o18 = 0; o18 < e4.length; o18++) r10.push(vt2(t72.T, e4[o18]));
        break;
      case "enum":
        for (let o18 = 0; o18 < e4.length; o18++) r10.push(sn(t72.T, e4[o18], n9.enumAsInteger));
        break;
      case "message":
        for (let o18 = 0; o18 < e4.length; o18++) r10.push(e4[o18].toJson(n9));
        break;
    }
    return n9.emitDefaultValues || r10.length > 0 ? r10 : void 0;
  }
  switch (t72.kind) {
    case "scalar":
      return vt2(t72.T, e4);
    case "enum":
      return sn(t72.T, e4, n9.enumAsInteger);
    case "message":
      return Ot2(t72.T, e4).toJson(n9);
  }
}
function sn(t72, e4, n9) {
  var r10;
  if (T7(typeof e4 == "number"), t72.typeName == "google.protobuf.NullValue") return null;
  if (n9) return e4;
  let o18 = t72.findNumber(e4);
  return (r10 = o18?.name) !== null && r10 !== void 0 ? r10 : e4;
}
function vt2(t72, e4) {
  switch (t72) {
    case c3.INT32:
    case c3.SFIXED32:
    case c3.SINT32:
    case c3.FIXED32:
    case c3.UINT32:
      return T7(typeof e4 == "number"), e4;
    case c3.FLOAT:
    case c3.DOUBLE:
      return T7(typeof e4 == "number"), Number.isNaN(e4) ? "NaN" : e4 === Number.POSITIVE_INFINITY ? "Infinity" : e4 === Number.NEGATIVE_INFINITY ? "-Infinity" : e4;
    case c3.STRING:
      return T7(typeof e4 == "string"), e4;
    case c3.BOOL:
      return T7(typeof e4 == "boolean"), e4;
    case c3.UINT64:
    case c3.FIXED64:
    case c3.INT64:
    case c3.SFIXED64:
    case c3.SINT64:
      return T7(typeof e4 == "bigint" || typeof e4 == "string" || typeof e4 == "number"), e4.toString();
    case c3.BYTES:
      return T7(e4 instanceof Uint8Array), Ee2.enc(e4);
  }
}
var Ne2 = Symbol("@bufbuild/protobuf/unknown-fields");
var Bn = { readUnknownFields: true, readerFactory: (t72) => new se4(t72) };
var Fn = { writeUnknownFields: true, writerFactory: () => new nt2() };
function Tr(t72) {
  return t72 ? Object.assign(Object.assign({}, Bn), t72) : Bn;
}
function Er(t72) {
  return t72 ? Object.assign(Object.assign({}, Fn), t72) : Fn;
}
function _n() {
  return { makeReadOptions: Tr, makeWriteOptions: Er, listUnknownFields(t72) {
    var e4;
    return (e4 = t72[Ne2]) !== null && e4 !== void 0 ? e4 : [];
  }, discardUnknownFields(t72) {
    delete t72[Ne2];
  }, writeUnknownFields(t72, e4) {
    let r10 = t72[Ne2];
    if (r10) for (let o18 of r10) e4.tag(o18.no, o18.wireType).raw(o18.data);
  }, onUnknownField(t72, e4, n9, r10) {
    let o18 = t72;
    Array.isArray(o18[Ne2]) || (o18[Ne2] = []), o18[Ne2].push({ no: e4, wireType: n9, data: r10 });
  }, readMessage(t72, e4, n9, r10, o18) {
    let s8 = t72.getType(), i12 = o18 ? e4.len : e4.pos + n9, u8, a8;
    for (; e4.pos < i12 && ([u8, a8] = e4.tag(), !(o18 === true && a8 == I5.EndGroup)); ) {
      let f11 = s8.fields.find(u8);
      if (!f11) {
        let p9 = e4.skip(a8, u8);
        r10.readUnknownFields && this.onUnknownField(t72, u8, a8, p9);
        continue;
      }
      Ln(t72, e4, f11, a8, r10);
    }
    if (o18 && (a8 != I5.EndGroup || u8 !== n9)) throw new Error("invalid end group tag");
  }, readField: Ln, writeMessage(t72, e4, n9) {
    let r10 = t72.getType();
    for (let o18 of r10.fields.byNumber()) {
      if (!St2(o18, t72)) {
        if (o18.req) throw new Error(`cannot encode field ${r10.typeName}.${o18.name} to binary: required field not set`);
        continue;
      }
      let s8 = o18.oneof ? t72[o18.oneof.localName].value : t72[o18.localName];
      Un(o18, s8, e4, n9);
    }
    return n9.writeUnknownFields && this.writeUnknownFields(t72, e4), e4;
  }, writeField(t72, e4, n9, r10) {
    e4 !== void 0 && Un(t72, e4, n9, r10);
  } };
}
function Ln(t72, e4, n9, r10, o18) {
  let { repeated: s8, localName: i12 } = n9;
  switch (n9.oneof && (t72 = t72[n9.oneof.localName], t72.case != i12 && delete t72.value, t72.case = i12, i12 = "value"), n9.kind) {
    case "scalar":
    case "enum":
      let u8 = n9.kind == "enum" ? c3.INT32 : n9.T, a8 = Jt2;
      if (n9.kind == "scalar" && n9.L > 0 && (a8 = yr), s8) {
        let h11 = t72[i12];
        if (r10 == I5.LengthDelimited && u8 != c3.STRING && u8 != c3.BYTES) {
          let b7 = e4.uint32() + e4.pos;
          for (; e4.pos < b7; ) h11.push(a8(e4, u8));
        } else h11.push(a8(e4, u8));
      } else t72[i12] = a8(e4, u8);
      break;
    case "message":
      let f11 = n9.T;
      s8 ? t72[i12].push(Dt(e4, new f11(), o18, n9)) : k3(t72[i12]) ? Dt(e4, t72[i12], o18, n9) : (t72[i12] = Dt(e4, new f11(), o18, n9), f11.fieldWrapper && !n9.oneof && !n9.repeated && (t72[i12] = f11.fieldWrapper.unwrapField(t72[i12])));
      break;
    case "map":
      let [p9, d5] = Nr(n9, e4, o18);
      t72[i12][p9] = d5;
      break;
  }
}
function Dt(t72, e4, n9, r10) {
  let o18 = e4.getType().runtime.bin, s8 = r10?.delimited;
  return o18.readMessage(e4, t72, s8 ? r10.no : t72.uint32(), n9, s8), e4;
}
function Nr(t72, e4, n9) {
  let r10 = e4.uint32(), o18 = e4.pos + r10, s8, i12;
  for (; e4.pos < o18; ) {
    let [u8] = e4.tag();
    switch (u8) {
      case 1:
        s8 = Jt2(e4, t72.K);
        break;
      case 2:
        switch (t72.V.kind) {
          case "scalar":
            i12 = Jt2(e4, t72.V.T);
            break;
          case "enum":
            i12 = e4.int32();
            break;
          case "message":
            i12 = Dt(e4, new t72.V.T(), n9, void 0);
            break;
        }
        break;
    }
  }
  if (s8 === void 0 && (s8 = P5(t72.K, x7.BIGINT)), typeof s8 != "string" && typeof s8 != "number" && (s8 = s8.toString()), i12 === void 0) switch (t72.V.kind) {
    case "scalar":
      i12 = P5(t72.V.T, x7.BIGINT);
      break;
    case "enum":
      i12 = t72.V.T.values[0].no;
      break;
    case "message":
      i12 = new t72.V.T();
      break;
  }
  return [s8, i12];
}
function yr(t72, e4) {
  let n9 = Jt2(t72, e4);
  return typeof n9 == "bigint" ? n9.toString() : n9;
}
function Jt2(t72, e4) {
  switch (e4) {
    case c3.STRING:
      return t72.string();
    case c3.BOOL:
      return t72.bool();
    case c3.DOUBLE:
      return t72.double();
    case c3.FLOAT:
      return t72.float();
    case c3.INT32:
      return t72.int32();
    case c3.INT64:
      return t72.int64();
    case c3.UINT64:
      return t72.uint64();
    case c3.FIXED64:
      return t72.fixed64();
    case c3.BYTES:
      return t72.bytes();
    case c3.FIXED32:
      return t72.fixed32();
    case c3.SFIXED32:
      return t72.sfixed32();
    case c3.SFIXED64:
      return t72.sfixed64();
    case c3.SINT64:
      return t72.sint64();
    case c3.UINT32:
      return t72.uint32();
    case c3.SINT32:
      return t72.sint32();
  }
}
function Un(t72, e4, n9, r10) {
  T7(e4 !== void 0);
  let o18 = t72.repeated;
  switch (t72.kind) {
    case "scalar":
    case "enum":
      let s8 = t72.kind == "enum" ? c3.INT32 : t72.T;
      if (o18) if (T7(Array.isArray(e4)), t72.packed) br(n9, s8, t72.no, e4);
      else for (let i12 of e4) st2(n9, s8, t72.no, i12);
      else st2(n9, s8, t72.no, e4);
      break;
    case "message":
      if (o18) {
        T7(Array.isArray(e4));
        for (let i12 of e4) An(n9, r10, t72, i12);
      } else An(n9, r10, t72, e4);
      break;
    case "map":
      T7(typeof e4 == "object" && e4 != null);
      for (let [i12, u8] of Object.entries(e4)) wr(n9, r10, t72, i12, u8);
      break;
  }
}
function wr(t72, e4, n9, r10, o18) {
  t72.tag(n9.no, I5.LengthDelimited), t72.fork();
  let s8 = r10;
  switch (n9.K) {
    case c3.INT32:
    case c3.FIXED32:
    case c3.UINT32:
    case c3.SFIXED32:
    case c3.SINT32:
      s8 = Number.parseInt(r10);
      break;
    case c3.BOOL:
      T7(r10 == "true" || r10 == "false"), s8 = r10 == "true";
      break;
  }
  switch (st2(t72, n9.K, 1, s8), n9.V.kind) {
    case "scalar":
      st2(t72, n9.V.T, 2, o18);
      break;
    case "enum":
      st2(t72, c3.INT32, 2, o18);
      break;
    case "message":
      T7(o18 !== void 0), t72.tag(2, I5.LengthDelimited).bytes(o18.toBinary(e4));
      break;
  }
  t72.join();
}
function An(t72, e4, n9, r10) {
  let o18 = Ot2(n9.T, r10);
  n9.delimited ? t72.tag(n9.no, I5.StartGroup).raw(o18.toBinary(e4)).tag(n9.no, I5.EndGroup) : t72.tag(n9.no, I5.LengthDelimited).bytes(o18.toBinary(e4));
}
function st2(t72, e4, n9, r10) {
  T7(r10 !== void 0);
  let [o18, s8] = Rn(e4);
  t72.tag(n9, o18)[s8](r10);
}
function br(t72, e4, n9, r10) {
  if (!r10.length) return;
  t72.tag(n9, I5.LengthDelimited).fork();
  let [, o18] = Rn(e4);
  for (let s8 = 0; s8 < r10.length; s8++) t72[o18](r10[s8]);
  t72.join();
}
function Rn(t72) {
  let e4 = I5.Varint;
  switch (t72) {
    case c3.BYTES:
    case c3.STRING:
      e4 = I5.LengthDelimited;
      break;
    case c3.DOUBLE:
    case c3.FIXED64:
    case c3.SFIXED64:
      e4 = I5.Bit64;
      break;
    case c3.FIXED32:
    case c3.SFIXED32:
    case c3.FLOAT:
      e4 = I5.Bit32;
      break;
  }
  let n9 = c3[t72].toLowerCase();
  return [e4, n9];
}
function Yn() {
  return { setEnumType: Wt2, initPartial(t72, e4) {
    if (t72 === void 0) return;
    let n9 = e4.getType();
    for (let r10 of n9.fields.byMember()) {
      let o18 = r10.localName, s8 = e4, i12 = t72;
      if (i12[o18] != null) switch (r10.kind) {
        case "oneof":
          let u8 = i12[o18].case;
          if (u8 === void 0) continue;
          let a8 = r10.findField(u8), f11 = i12[o18].value;
          a8 && a8.kind == "message" && !k3(f11, a8.T) ? f11 = new a8.T(f11) : a8 && a8.kind === "scalar" && a8.T === c3.BYTES && (f11 = it2(f11)), s8[o18] = { case: u8, value: f11 };
          break;
        case "scalar":
        case "enum":
          let p9 = i12[o18];
          r10.T === c3.BYTES && (p9 = r10.repeated ? p9.map(it2) : it2(p9)), s8[o18] = p9;
          break;
        case "map":
          switch (r10.V.kind) {
            case "scalar":
            case "enum":
              if (r10.V.T === c3.BYTES) for (let [E12, b7] of Object.entries(i12[o18])) s8[o18][E12] = it2(b7);
              else Object.assign(s8[o18], i12[o18]);
              break;
            case "message":
              let h11 = r10.V.T;
              for (let E12 of Object.keys(i12[o18])) {
                let b7 = i12[o18][E12];
                h11.fieldWrapper || (b7 = new h11(b7)), s8[o18][E12] = b7;
              }
              break;
          }
          break;
        case "message":
          let d5 = r10.T;
          if (r10.repeated) s8[o18] = i12[o18].map((h11) => k3(h11, d5) ? h11 : new d5(h11));
          else {
            let h11 = i12[o18];
            d5.fieldWrapper ? d5.typeName === "google.protobuf.BytesValue" ? s8[o18] = it2(h11) : s8[o18] = h11 : s8[o18] = k3(h11, d5) ? h11 : new d5(h11);
          }
          break;
      }
    }
  }, equals(t72, e4, n9) {
    return e4 === n9 ? true : !e4 || !n9 ? false : t72.fields.byMember().every((r10) => {
      let o18 = e4[r10.localName], s8 = n9[r10.localName];
      if (r10.repeated) {
        if (o18.length !== s8.length) return false;
        switch (r10.kind) {
          case "message":
            return o18.every((i12, u8) => r10.T.equals(i12, s8[u8]));
          case "scalar":
            return o18.every((i12, u8) => Y5(r10.T, i12, s8[u8]));
          case "enum":
            return o18.every((i12, u8) => Y5(c3.INT32, i12, s8[u8]));
        }
        throw new Error(`repeated cannot contain ${r10.kind}`);
      }
      switch (r10.kind) {
        case "message":
          let i12 = o18, u8 = s8;
          return r10.T.fieldWrapper && (i12 !== void 0 && !k3(i12) && (i12 = r10.T.fieldWrapper.wrapField(i12)), u8 !== void 0 && !k3(u8) && (u8 = r10.T.fieldWrapper.wrapField(u8))), r10.T.equals(i12, u8);
        case "enum":
          return Y5(c3.INT32, o18, s8);
        case "scalar":
          return Y5(r10.T, o18, s8);
        case "oneof":
          if (o18.case !== s8.case) return false;
          let a8 = r10.findField(o18.case);
          if (a8 === void 0) return true;
          switch (a8.kind) {
            case "message":
              return a8.T.equals(o18.value, s8.value);
            case "enum":
              return Y5(c3.INT32, o18.value, s8.value);
            case "scalar":
              return Y5(a8.T, o18.value, s8.value);
          }
          throw new Error(`oneof cannot contain ${a8.kind}`);
        case "map":
          let f11 = Object.keys(o18).concat(Object.keys(s8));
          switch (r10.V.kind) {
            case "message":
              let p9 = r10.V.T;
              return f11.every((h11) => p9.equals(o18[h11], s8[h11]));
            case "enum":
              return f11.every((h11) => Y5(c3.INT32, o18[h11], s8[h11]));
            case "scalar":
              let d5 = r10.V.T;
              return f11.every((h11) => Y5(d5, o18[h11], s8[h11]));
          }
          break;
      }
    });
  }, clone(t72) {
    let e4 = t72.getType(), n9 = new e4(), r10 = n9;
    for (let o18 of e4.fields.byMember()) {
      let s8 = t72[o18.localName], i12;
      if (o18.repeated) i12 = s8.map(Bt2);
      else if (o18.kind == "map") {
        i12 = r10[o18.localName];
        for (let [u8, a8] of Object.entries(s8)) i12[u8] = Bt2(a8);
      } else o18.kind == "oneof" ? i12 = o18.findField(s8.case) ? { case: s8.case, value: Bt2(s8.value) } : { case: void 0 } : i12 = Bt2(s8);
      r10[o18.localName] = i12;
    }
    for (let o18 of e4.runtime.bin.listUnknownFields(t72)) e4.runtime.bin.onUnknownField(r10, o18.no, o18.wireType, o18.data);
    return n9;
  } };
}
function Bt2(t72) {
  if (t72 === void 0) return t72;
  if (k3(t72)) return t72.clone();
  if (t72 instanceof Uint8Array) {
    let e4 = new Uint8Array(t72.byteLength);
    return e4.set(t72), e4;
  }
  return t72;
}
function it2(t72) {
  return t72 instanceof Uint8Array ? t72 : new Uint8Array(t72);
}
function Ft2(t72, e4, n9) {
  return { syntax: t72, json: Jn(), bin: _n(), util: Object.assign(Object.assign({}, Yn()), { newFieldList: e4, initFields: n9 }), makeMessageType(r10, o18, s8) {
    return En(this, r10, o18, s8);
  }, makeEnum: hn, makeEnumType: Kt, getEnumType: Nt2, makeExtension(r10, o18, s8) {
    return kn(this, r10, o18, s8);
  } };
}
var ye3 = class {
  constructor(e4, n9) {
    this._fields = e4, this._normalizer = n9;
  }
  findJsonName(e4) {
    if (!this.jsonNames) {
      let n9 = {};
      for (let r10 of this.list()) n9[r10.jsonName] = n9[r10.name] = r10;
      this.jsonNames = n9;
    }
    return this.jsonNames[e4];
  }
  find(e4) {
    if (!this.numbers) {
      let n9 = {};
      for (let r10 of this.list()) n9[r10.no] = r10;
      this.numbers = n9;
    }
    return this.numbers[e4];
  }
  list() {
    return this.all || (this.all = this._normalizer(this._fields)), this.all;
  }
  byNumber() {
    return this.numbersAsc || (this.numbersAsc = this.list().concat().sort((e4, n9) => e4.no - n9.no)), this.numbersAsc;
  }
  byMember() {
    if (!this.members) {
      this.members = [];
      let e4 = this.members, n9;
      for (let r10 of this.list()) r10.oneof ? r10.oneof !== n9 && (n9 = r10.oneof, e4.push(n9)) : e4.push(r10);
    }
    return this.members;
  }
};
function Lt2(t72, e4) {
  let n9 = Vn(t72);
  return e4 ? n9 : we2(xr(n9));
}
function an(t72) {
  return Lt2(t72, false);
}
var Ut2 = Vn;
function Vn(t72) {
  let e4 = false, n9 = [];
  for (let r10 = 0; r10 < t72.length; r10++) {
    let o18 = t72.charAt(r10);
    switch (o18) {
      case "_":
        e4 = true;
        break;
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        n9.push(o18), e4 = false;
        break;
      default:
        e4 && (e4 = false, o18 = o18.toUpperCase()), n9.push(o18);
        break;
    }
  }
  return n9.join("");
}
var Sr = /* @__PURE__ */ new Set(["constructor", "toString", "toJSON", "valueOf"]);
var Or = /* @__PURE__ */ new Set(["getType", "clone", "equals", "fromBinary", "fromJson", "fromJsonString", "toBinary", "toJson", "toJsonString", "toObject"]);
var un = (t72) => `${t72}$`;
var xr = (t72) => Or.has(t72) ? un(t72) : t72;
var we2 = (t72) => Sr.has(t72) ? un(t72) : t72;
var At2 = class {
  constructor(e4) {
    this.kind = "oneof", this.repeated = false, this.packed = false, this.opt = false, this.req = false, this.default = void 0, this.fields = [], this.name = e4, this.localName = an(e4);
  }
  addField(e4) {
    T7(e4.oneof === this, `field ${e4.name} not one of ${this.name}`), this.fields.push(e4);
  }
  findField(e4) {
    if (!this._lookup) {
      this._lookup = /* @__PURE__ */ Object.create(null);
      for (let n9 = 0; n9 < this.fields.length; n9++) this._lookup[this.fields[n9].localName] = this.fields[n9];
    }
    return this._lookup[e4];
  }
};
function _t(t72, e4) {
  var n9, r10, o18, s8, i12, u8;
  let a8 = [], f11;
  for (let p9 of typeof t72 == "function" ? t72() : t72) {
    let d5 = p9;
    if (d5.localName = Lt2(p9.name, p9.oneof !== void 0), d5.jsonName = (n9 = p9.jsonName) !== null && n9 !== void 0 ? n9 : Ut2(p9.name), d5.repeated = (r10 = p9.repeated) !== null && r10 !== void 0 ? r10 : false, p9.kind == "scalar" && (d5.L = (o18 = p9.L) !== null && o18 !== void 0 ? o18 : x7.BIGINT), d5.delimited = (s8 = p9.delimited) !== null && s8 !== void 0 ? s8 : false, d5.req = (i12 = p9.req) !== null && i12 !== void 0 ? i12 : false, d5.opt = (u8 = p9.opt) !== null && u8 !== void 0 ? u8 : false, p9.packed === void 0 && (e4 ? d5.packed = p9.kind == "enum" || p9.kind == "scalar" && p9.T != c3.BYTES && p9.T != c3.STRING : d5.packed = false), p9.oneof !== void 0) {
      let h11 = typeof p9.oneof == "string" ? p9.oneof : p9.oneof.name;
      (!f11 || f11.name != h11) && (f11 = new At2(h11)), d5.oneof = f11, f11.addField(d5);
    }
    a8.push(d5);
  }
  return a8;
}
var m4 = Ft2("proto3", (t72) => new ye3(t72, (e4) => _t(e4, true)), (t72) => {
  for (let e4 of t72.getType().fields.byMember()) {
    if (e4.opt) continue;
    let n9 = e4.localName, r10 = t72;
    if (e4.repeated) {
      r10[n9] = [];
      continue;
    }
    switch (e4.kind) {
      case "oneof":
        r10[n9] = { case: void 0 };
        break;
      case "enum":
        r10[n9] = 0;
        break;
      case "map":
        r10[n9] = {};
        break;
      case "scalar":
        r10[n9] = P5(e4.T, e4.L);
        break;
      case "message":
        break;
    }
  }
});
var l = Ft2("proto2", (t72) => new ye3(t72, (e4) => _t(e4, false)), (t72) => {
  for (let e4 of t72.getType().fields.byMember()) {
    let n9 = e4.localName, r10 = t72;
    if (e4.repeated) {
      r10[n9] = [];
      continue;
    }
    switch (e4.kind) {
      case "oneof":
        r10[n9] = { case: void 0 };
        break;
      case "map":
        r10[n9] = {};
        break;
      case "scalar":
      case "enum":
      case "message":
        break;
    }
  }
});
var vr = { NaN: Number.NaN, POSITIVE_INFINITY: Number.POSITIVE_INFINITY, NEGATIVE_INFINITY: Number.NEGATIVE_INFINITY };
var te5;
(function(t72) {
  t72[t72.Unary = 0] = "Unary", t72[t72.ServerStreaming = 1] = "ServerStreaming", t72[t72.ClientStreaming = 2] = "ClientStreaming", t72[t72.BiDiStreaming = 3] = "BiDiStreaming";
})(te5 || (te5 = {}));
var ke2;
(function(t72) {
  t72[t72.NoSideEffects = 1] = "NoSideEffects", t72[t72.Idempotent = 2] = "Idempotent";
})(ke2 || (ke2 = {}));
var w6;
(function(t72) {
  t72[t72.EDITION_UNKNOWN = 0] = "EDITION_UNKNOWN", t72[t72.EDITION_LEGACY = 900] = "EDITION_LEGACY", t72[t72.EDITION_PROTO2 = 998] = "EDITION_PROTO2", t72[t72.EDITION_PROTO3 = 999] = "EDITION_PROTO3", t72[t72.EDITION_2023 = 1e3] = "EDITION_2023", t72[t72.EDITION_2024 = 1001] = "EDITION_2024", t72[t72.EDITION_1_TEST_ONLY = 1] = "EDITION_1_TEST_ONLY", t72[t72.EDITION_2_TEST_ONLY = 2] = "EDITION_2_TEST_ONLY", t72[t72.EDITION_99997_TEST_ONLY = 99997] = "EDITION_99997_TEST_ONLY", t72[t72.EDITION_99998_TEST_ONLY = 99998] = "EDITION_99998_TEST_ONLY", t72[t72.EDITION_99999_TEST_ONLY = 99999] = "EDITION_99999_TEST_ONLY", t72[t72.EDITION_MAX = 2147483647] = "EDITION_MAX";
})(w6 || (w6 = {}));
l.util.setEnumType(w6, "google.protobuf.Edition", [{ no: 0, name: "EDITION_UNKNOWN" }, { no: 900, name: "EDITION_LEGACY" }, { no: 998, name: "EDITION_PROTO2" }, { no: 999, name: "EDITION_PROTO3" }, { no: 1e3, name: "EDITION_2023" }, { no: 1001, name: "EDITION_2024" }, { no: 1, name: "EDITION_1_TEST_ONLY" }, { no: 2, name: "EDITION_2_TEST_ONLY" }, { no: 99997, name: "EDITION_99997_TEST_ONLY" }, { no: 99998, name: "EDITION_99998_TEST_ONLY" }, { no: 99999, name: "EDITION_99999_TEST_ONLY" }, { no: 2147483647, name: "EDITION_MAX" }]);
var U4 = class t extends g2 {
  constructor(e4) {
    super(), this.file = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t, e4, n9);
  }
};
U4.runtime = l;
U4.typeName = "google.protobuf.FileDescriptorSet";
U4.fields = l.util.newFieldList(() => [{ no: 1, name: "file", kind: "message", T: V5, repeated: true }]);
var V5 = class t2 extends g2 {
  constructor(e4) {
    super(), this.dependency = [], this.publicDependency = [], this.weakDependency = [], this.messageType = [], this.enumType = [], this.service = [], this.extension = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t2().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t2().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t2().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t2, e4, n9);
  }
};
V5.runtime = l;
V5.typeName = "google.protobuf.FileDescriptorProto";
V5.fields = l.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "package", kind: "scalar", T: 9, opt: true }, { no: 3, name: "dependency", kind: "scalar", T: 9, repeated: true }, { no: 10, name: "public_dependency", kind: "scalar", T: 5, repeated: true }, { no: 11, name: "weak_dependency", kind: "scalar", T: 5, repeated: true }, { no: 4, name: "message_type", kind: "message", T: ie3, repeated: true }, { no: 5, name: "enum_type", kind: "message", T: ae5, repeated: true }, { no: 6, name: "service", kind: "message", T: Be2, repeated: true }, { no: 7, name: "extension", kind: "message", T: ne5, repeated: true }, { no: 8, name: "options", kind: "message", T: Le2, opt: true }, { no: 9, name: "source_code_info", kind: "message", T: Ce, opt: true }, { no: 12, name: "syntax", kind: "scalar", T: 9, opt: true }, { no: 14, name: "edition", kind: "enum", T: l.getEnumType(w6), opt: true }]);
var ie3 = class t3 extends g2 {
  constructor(e4) {
    super(), this.field = [], this.extension = [], this.nestedType = [], this.enumType = [], this.extensionRange = [], this.oneofDecl = [], this.reservedRange = [], this.reservedName = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t3().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t3().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t3().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t3, e4, n9);
  }
};
ie3.runtime = l;
ie3.typeName = "google.protobuf.DescriptorProto";
ie3.fields = l.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "field", kind: "message", T: ne5, repeated: true }, { no: 6, name: "extension", kind: "message", T: ne5, repeated: true }, { no: 3, name: "nested_type", kind: "message", T: ie3, repeated: true }, { no: 4, name: "enum_type", kind: "message", T: ae5, repeated: true }, { no: 5, name: "extension_range", kind: "message", T: Se2, repeated: true }, { no: 8, name: "oneof_decl", kind: "message", T: Pe2, repeated: true }, { no: 7, name: "options", kind: "message", T: Ue2, opt: true }, { no: 9, name: "reserved_range", kind: "message", T: Oe2, repeated: true }, { no: 10, name: "reserved_name", kind: "scalar", T: 9, repeated: true }]);
var Se2 = class t4 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t4().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t4().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t4().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t4, e4, n9);
  }
};
Se2.runtime = l;
Se2.typeName = "google.protobuf.DescriptorProto.ExtensionRange";
Se2.fields = l.util.newFieldList(() => [{ no: 1, name: "start", kind: "scalar", T: 5, opt: true }, { no: 2, name: "end", kind: "scalar", T: 5, opt: true }, { no: 3, name: "options", kind: "message", T: xe2, opt: true }]);
var Oe2 = class t5 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t5().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t5().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t5().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t5, e4, n9);
  }
};
Oe2.runtime = l;
Oe2.typeName = "google.protobuf.DescriptorProto.ReservedRange";
Oe2.fields = l.util.newFieldList(() => [{ no: 1, name: "start", kind: "scalar", T: 5, opt: true }, { no: 2, name: "end", kind: "scalar", T: 5, opt: true }]);
var xe2 = class t6 extends g2 {
  constructor(e4) {
    super(), this.uninterpretedOption = [], this.declaration = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t6().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t6().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t6().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t6, e4, n9);
  }
};
xe2.runtime = l;
xe2.typeName = "google.protobuf.ExtensionRangeOptions";
xe2.fields = l.util.newFieldList(() => [{ no: 999, name: "uninterpreted_option", kind: "message", T: D6, repeated: true }, { no: 2, name: "declaration", kind: "message", T: ve2, repeated: true }, { no: 50, name: "features", kind: "message", T: O9, opt: true }, { no: 3, name: "verification", kind: "enum", T: l.getEnumType(at2), opt: true, default: at2.UNVERIFIED }]);
var at2;
(function(t72) {
  t72[t72.DECLARATION = 0] = "DECLARATION", t72[t72.UNVERIFIED = 1] = "UNVERIFIED";
})(at2 || (at2 = {}));
l.util.setEnumType(at2, "google.protobuf.ExtensionRangeOptions.VerificationState", [{ no: 0, name: "DECLARATION" }, { no: 1, name: "UNVERIFIED" }]);
var ve2 = class t7 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t7().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t7().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t7().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t7, e4, n9);
  }
};
ve2.runtime = l;
ve2.typeName = "google.protobuf.ExtensionRangeOptions.Declaration";
ve2.fields = l.util.newFieldList(() => [{ no: 1, name: "number", kind: "scalar", T: 5, opt: true }, { no: 2, name: "full_name", kind: "scalar", T: 9, opt: true }, { no: 3, name: "type", kind: "scalar", T: 9, opt: true }, { no: 5, name: "reserved", kind: "scalar", T: 8, opt: true }, { no: 6, name: "repeated", kind: "scalar", T: 8, opt: true }]);
var ne5 = class t8 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t8().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t8().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t8().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t8, e4, n9);
  }
};
ne5.runtime = l;
ne5.typeName = "google.protobuf.FieldDescriptorProto";
ne5.fields = l.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9, opt: true }, { no: 3, name: "number", kind: "scalar", T: 5, opt: true }, { no: 4, name: "label", kind: "enum", T: l.getEnumType(A8), opt: true }, { no: 5, name: "type", kind: "enum", T: l.getEnumType(N8), opt: true }, { no: 6, name: "type_name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "extendee", kind: "scalar", T: 9, opt: true }, { no: 7, name: "default_value", kind: "scalar", T: 9, opt: true }, { no: 9, name: "oneof_index", kind: "scalar", T: 5, opt: true }, { no: 10, name: "json_name", kind: "scalar", T: 9, opt: true }, { no: 8, name: "options", kind: "message", T: Ae2, opt: true }, { no: 17, name: "proto3_optional", kind: "scalar", T: 8, opt: true }]);
var N8;
(function(t72) {
  t72[t72.DOUBLE = 1] = "DOUBLE", t72[t72.FLOAT = 2] = "FLOAT", t72[t72.INT64 = 3] = "INT64", t72[t72.UINT64 = 4] = "UINT64", t72[t72.INT32 = 5] = "INT32", t72[t72.FIXED64 = 6] = "FIXED64", t72[t72.FIXED32 = 7] = "FIXED32", t72[t72.BOOL = 8] = "BOOL", t72[t72.STRING = 9] = "STRING", t72[t72.GROUP = 10] = "GROUP", t72[t72.MESSAGE = 11] = "MESSAGE", t72[t72.BYTES = 12] = "BYTES", t72[t72.UINT32 = 13] = "UINT32", t72[t72.ENUM = 14] = "ENUM", t72[t72.SFIXED32 = 15] = "SFIXED32", t72[t72.SFIXED64 = 16] = "SFIXED64", t72[t72.SINT32 = 17] = "SINT32", t72[t72.SINT64 = 18] = "SINT64";
})(N8 || (N8 = {}));
l.util.setEnumType(N8, "google.protobuf.FieldDescriptorProto.Type", [{ no: 1, name: "TYPE_DOUBLE" }, { no: 2, name: "TYPE_FLOAT" }, { no: 3, name: "TYPE_INT64" }, { no: 4, name: "TYPE_UINT64" }, { no: 5, name: "TYPE_INT32" }, { no: 6, name: "TYPE_FIXED64" }, { no: 7, name: "TYPE_FIXED32" }, { no: 8, name: "TYPE_BOOL" }, { no: 9, name: "TYPE_STRING" }, { no: 10, name: "TYPE_GROUP" }, { no: 11, name: "TYPE_MESSAGE" }, { no: 12, name: "TYPE_BYTES" }, { no: 13, name: "TYPE_UINT32" }, { no: 14, name: "TYPE_ENUM" }, { no: 15, name: "TYPE_SFIXED32" }, { no: 16, name: "TYPE_SFIXED64" }, { no: 17, name: "TYPE_SINT32" }, { no: 18, name: "TYPE_SINT64" }]);
var A8;
(function(t72) {
  t72[t72.OPTIONAL = 1] = "OPTIONAL", t72[t72.REPEATED = 3] = "REPEATED", t72[t72.REQUIRED = 2] = "REQUIRED";
})(A8 || (A8 = {}));
l.util.setEnumType(A8, "google.protobuf.FieldDescriptorProto.Label", [{ no: 1, name: "LABEL_OPTIONAL" }, { no: 3, name: "LABEL_REPEATED" }, { no: 2, name: "LABEL_REQUIRED" }]);
var Pe2 = class t9 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t9().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t9().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t9().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t9, e4, n9);
  }
};
Pe2.runtime = l;
Pe2.typeName = "google.protobuf.OneofDescriptorProto";
Pe2.fields = l.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "options", kind: "message", T: Re2, opt: true }]);
var ae5 = class t10 extends g2 {
  constructor(e4) {
    super(), this.value = [], this.reservedRange = [], this.reservedName = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t10().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t10().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t10().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t10, e4, n9);
  }
};
ae5.runtime = l;
ae5.typeName = "google.protobuf.EnumDescriptorProto";
ae5.fields = l.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "value", kind: "message", T: Je2, repeated: true }, { no: 3, name: "options", kind: "message", T: Ye2, opt: true }, { no: 4, name: "reserved_range", kind: "message", T: De2, repeated: true }, { no: 5, name: "reserved_name", kind: "scalar", T: 9, repeated: true }]);
var De2 = class t11 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t11().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t11().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t11().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t11, e4, n9);
  }
};
De2.runtime = l;
De2.typeName = "google.protobuf.EnumDescriptorProto.EnumReservedRange";
De2.fields = l.util.newFieldList(() => [{ no: 1, name: "start", kind: "scalar", T: 5, opt: true }, { no: 2, name: "end", kind: "scalar", T: 5, opt: true }]);
var Je2 = class t12 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t12().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t12().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t12().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t12, e4, n9);
  }
};
Je2.runtime = l;
Je2.typeName = "google.protobuf.EnumValueDescriptorProto";
Je2.fields = l.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "number", kind: "scalar", T: 5, opt: true }, { no: 3, name: "options", kind: "message", T: Me2, opt: true }]);
var Be2 = class t13 extends g2 {
  constructor(e4) {
    super(), this.method = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t13().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t13().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t13().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t13, e4, n9);
  }
};
Be2.runtime = l;
Be2.typeName = "google.protobuf.ServiceDescriptorProto";
Be2.fields = l.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "method", kind: "message", T: Fe2, repeated: true }, { no: 3, name: "options", kind: "message", T: Ve2, opt: true }]);
var Fe2 = class t14 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t14().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t14().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t14().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t14, e4, n9);
  }
};
Fe2.runtime = l;
Fe2.typeName = "google.protobuf.MethodDescriptorProto";
Fe2.fields = l.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "input_type", kind: "scalar", T: 9, opt: true }, { no: 3, name: "output_type", kind: "scalar", T: 9, opt: true }, { no: 4, name: "options", kind: "message", T: qe2, opt: true }, { no: 5, name: "client_streaming", kind: "scalar", T: 8, opt: true, default: false }, { no: 6, name: "server_streaming", kind: "scalar", T: 8, opt: true, default: false }]);
var Le2 = class t15 extends g2 {
  constructor(e4) {
    super(), this.uninterpretedOption = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t15().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t15().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t15().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t15, e4, n9);
  }
};
Le2.runtime = l;
Le2.typeName = "google.protobuf.FileOptions";
Le2.fields = l.util.newFieldList(() => [{ no: 1, name: "java_package", kind: "scalar", T: 9, opt: true }, { no: 8, name: "java_outer_classname", kind: "scalar", T: 9, opt: true }, { no: 10, name: "java_multiple_files", kind: "scalar", T: 8, opt: true, default: false }, { no: 20, name: "java_generate_equals_and_hash", kind: "scalar", T: 8, opt: true }, { no: 27, name: "java_string_check_utf8", kind: "scalar", T: 8, opt: true, default: false }, { no: 9, name: "optimize_for", kind: "enum", T: l.getEnumType(ut2), opt: true, default: ut2.SPEED }, { no: 11, name: "go_package", kind: "scalar", T: 9, opt: true }, { no: 16, name: "cc_generic_services", kind: "scalar", T: 8, opt: true, default: false }, { no: 17, name: "java_generic_services", kind: "scalar", T: 8, opt: true, default: false }, { no: 18, name: "py_generic_services", kind: "scalar", T: 8, opt: true, default: false }, { no: 23, name: "deprecated", kind: "scalar", T: 8, opt: true, default: false }, { no: 31, name: "cc_enable_arenas", kind: "scalar", T: 8, opt: true, default: true }, { no: 36, name: "objc_class_prefix", kind: "scalar", T: 9, opt: true }, { no: 37, name: "csharp_namespace", kind: "scalar", T: 9, opt: true }, { no: 39, name: "swift_prefix", kind: "scalar", T: 9, opt: true }, { no: 40, name: "php_class_prefix", kind: "scalar", T: 9, opt: true }, { no: 41, name: "php_namespace", kind: "scalar", T: 9, opt: true }, { no: 44, name: "php_metadata_namespace", kind: "scalar", T: 9, opt: true }, { no: 45, name: "ruby_package", kind: "scalar", T: 9, opt: true }, { no: 50, name: "features", kind: "message", T: O9, opt: true }, { no: 999, name: "uninterpreted_option", kind: "message", T: D6, repeated: true }]);
var ut2;
(function(t72) {
  t72[t72.SPEED = 1] = "SPEED", t72[t72.CODE_SIZE = 2] = "CODE_SIZE", t72[t72.LITE_RUNTIME = 3] = "LITE_RUNTIME";
})(ut2 || (ut2 = {}));
l.util.setEnumType(ut2, "google.protobuf.FileOptions.OptimizeMode", [{ no: 1, name: "SPEED" }, { no: 2, name: "CODE_SIZE" }, { no: 3, name: "LITE_RUNTIME" }]);
var Ue2 = class t16 extends g2 {
  constructor(e4) {
    super(), this.uninterpretedOption = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t16().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t16().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t16().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t16, e4, n9);
  }
};
Ue2.runtime = l;
Ue2.typeName = "google.protobuf.MessageOptions";
Ue2.fields = l.util.newFieldList(() => [{ no: 1, name: "message_set_wire_format", kind: "scalar", T: 8, opt: true, default: false }, { no: 2, name: "no_standard_descriptor_accessor", kind: "scalar", T: 8, opt: true, default: false }, { no: 3, name: "deprecated", kind: "scalar", T: 8, opt: true, default: false }, { no: 7, name: "map_entry", kind: "scalar", T: 8, opt: true }, { no: 11, name: "deprecated_legacy_json_field_conflicts", kind: "scalar", T: 8, opt: true }, { no: 12, name: "features", kind: "message", T: O9, opt: true }, { no: 999, name: "uninterpreted_option", kind: "message", T: D6, repeated: true }]);
var Ae2 = class t17 extends g2 {
  constructor(e4) {
    super(), this.targets = [], this.editionDefaults = [], this.uninterpretedOption = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t17().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t17().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t17().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t17, e4, n9);
  }
};
Ae2.runtime = l;
Ae2.typeName = "google.protobuf.FieldOptions";
Ae2.fields = l.util.newFieldList(() => [{ no: 1, name: "ctype", kind: "enum", T: l.getEnumType(lt2), opt: true, default: lt2.STRING }, { no: 2, name: "packed", kind: "scalar", T: 8, opt: true }, { no: 6, name: "jstype", kind: "enum", T: l.getEnumType(re5), opt: true, default: re5.JS_NORMAL }, { no: 5, name: "lazy", kind: "scalar", T: 8, opt: true, default: false }, { no: 15, name: "unverified_lazy", kind: "scalar", T: 8, opt: true, default: false }, { no: 3, name: "deprecated", kind: "scalar", T: 8, opt: true, default: false }, { no: 10, name: "weak", kind: "scalar", T: 8, opt: true, default: false }, { no: 16, name: "debug_redact", kind: "scalar", T: 8, opt: true, default: false }, { no: 17, name: "retention", kind: "enum", T: l.getEnumType(Rt2), opt: true }, { no: 19, name: "targets", kind: "enum", T: l.getEnumType(Yt), repeated: true }, { no: 20, name: "edition_defaults", kind: "message", T: _e2, repeated: true }, { no: 21, name: "features", kind: "message", T: O9, opt: true }, { no: 22, name: "feature_support", kind: "message", T: ue3, opt: true }, { no: 999, name: "uninterpreted_option", kind: "message", T: D6, repeated: true }]);
var lt2;
(function(t72) {
  t72[t72.STRING = 0] = "STRING", t72[t72.CORD = 1] = "CORD", t72[t72.STRING_PIECE = 2] = "STRING_PIECE";
})(lt2 || (lt2 = {}));
l.util.setEnumType(lt2, "google.protobuf.FieldOptions.CType", [{ no: 0, name: "STRING" }, { no: 1, name: "CORD" }, { no: 2, name: "STRING_PIECE" }]);
var re5;
(function(t72) {
  t72[t72.JS_NORMAL = 0] = "JS_NORMAL", t72[t72.JS_STRING = 1] = "JS_STRING", t72[t72.JS_NUMBER = 2] = "JS_NUMBER";
})(re5 || (re5 = {}));
l.util.setEnumType(re5, "google.protobuf.FieldOptions.JSType", [{ no: 0, name: "JS_NORMAL" }, { no: 1, name: "JS_STRING" }, { no: 2, name: "JS_NUMBER" }]);
var Rt2;
(function(t72) {
  t72[t72.RETENTION_UNKNOWN = 0] = "RETENTION_UNKNOWN", t72[t72.RETENTION_RUNTIME = 1] = "RETENTION_RUNTIME", t72[t72.RETENTION_SOURCE = 2] = "RETENTION_SOURCE";
})(Rt2 || (Rt2 = {}));
l.util.setEnumType(Rt2, "google.protobuf.FieldOptions.OptionRetention", [{ no: 0, name: "RETENTION_UNKNOWN" }, { no: 1, name: "RETENTION_RUNTIME" }, { no: 2, name: "RETENTION_SOURCE" }]);
var Yt;
(function(t72) {
  t72[t72.TARGET_TYPE_UNKNOWN = 0] = "TARGET_TYPE_UNKNOWN", t72[t72.TARGET_TYPE_FILE = 1] = "TARGET_TYPE_FILE", t72[t72.TARGET_TYPE_EXTENSION_RANGE = 2] = "TARGET_TYPE_EXTENSION_RANGE", t72[t72.TARGET_TYPE_MESSAGE = 3] = "TARGET_TYPE_MESSAGE", t72[t72.TARGET_TYPE_FIELD = 4] = "TARGET_TYPE_FIELD", t72[t72.TARGET_TYPE_ONEOF = 5] = "TARGET_TYPE_ONEOF", t72[t72.TARGET_TYPE_ENUM = 6] = "TARGET_TYPE_ENUM", t72[t72.TARGET_TYPE_ENUM_ENTRY = 7] = "TARGET_TYPE_ENUM_ENTRY", t72[t72.TARGET_TYPE_SERVICE = 8] = "TARGET_TYPE_SERVICE", t72[t72.TARGET_TYPE_METHOD = 9] = "TARGET_TYPE_METHOD";
})(Yt || (Yt = {}));
l.util.setEnumType(Yt, "google.protobuf.FieldOptions.OptionTargetType", [{ no: 0, name: "TARGET_TYPE_UNKNOWN" }, { no: 1, name: "TARGET_TYPE_FILE" }, { no: 2, name: "TARGET_TYPE_EXTENSION_RANGE" }, { no: 3, name: "TARGET_TYPE_MESSAGE" }, { no: 4, name: "TARGET_TYPE_FIELD" }, { no: 5, name: "TARGET_TYPE_ONEOF" }, { no: 6, name: "TARGET_TYPE_ENUM" }, { no: 7, name: "TARGET_TYPE_ENUM_ENTRY" }, { no: 8, name: "TARGET_TYPE_SERVICE" }, { no: 9, name: "TARGET_TYPE_METHOD" }]);
var _e2 = class t18 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t18().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t18().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t18().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t18, e4, n9);
  }
};
_e2.runtime = l;
_e2.typeName = "google.protobuf.FieldOptions.EditionDefault";
_e2.fields = l.util.newFieldList(() => [{ no: 3, name: "edition", kind: "enum", T: l.getEnumType(w6), opt: true }, { no: 2, name: "value", kind: "scalar", T: 9, opt: true }]);
var ue3 = class t19 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t19().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t19().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t19().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t19, e4, n9);
  }
};
ue3.runtime = l;
ue3.typeName = "google.protobuf.FieldOptions.FeatureSupport";
ue3.fields = l.util.newFieldList(() => [{ no: 1, name: "edition_introduced", kind: "enum", T: l.getEnumType(w6), opt: true }, { no: 2, name: "edition_deprecated", kind: "enum", T: l.getEnumType(w6), opt: true }, { no: 3, name: "deprecation_warning", kind: "scalar", T: 9, opt: true }, { no: 4, name: "edition_removed", kind: "enum", T: l.getEnumType(w6), opt: true }]);
var Re2 = class t20 extends g2 {
  constructor(e4) {
    super(), this.uninterpretedOption = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t20().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t20().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t20().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t20, e4, n9);
  }
};
Re2.runtime = l;
Re2.typeName = "google.protobuf.OneofOptions";
Re2.fields = l.util.newFieldList(() => [{ no: 1, name: "features", kind: "message", T: O9, opt: true }, { no: 999, name: "uninterpreted_option", kind: "message", T: D6, repeated: true }]);
var Ye2 = class t21 extends g2 {
  constructor(e4) {
    super(), this.uninterpretedOption = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t21().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t21().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t21().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t21, e4, n9);
  }
};
Ye2.runtime = l;
Ye2.typeName = "google.protobuf.EnumOptions";
Ye2.fields = l.util.newFieldList(() => [{ no: 2, name: "allow_alias", kind: "scalar", T: 8, opt: true }, { no: 3, name: "deprecated", kind: "scalar", T: 8, opt: true, default: false }, { no: 6, name: "deprecated_legacy_json_field_conflicts", kind: "scalar", T: 8, opt: true }, { no: 7, name: "features", kind: "message", T: O9, opt: true }, { no: 999, name: "uninterpreted_option", kind: "message", T: D6, repeated: true }]);
var Me2 = class t22 extends g2 {
  constructor(e4) {
    super(), this.uninterpretedOption = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t22().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t22().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t22().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t22, e4, n9);
  }
};
Me2.runtime = l;
Me2.typeName = "google.protobuf.EnumValueOptions";
Me2.fields = l.util.newFieldList(() => [{ no: 1, name: "deprecated", kind: "scalar", T: 8, opt: true, default: false }, { no: 2, name: "features", kind: "message", T: O9, opt: true }, { no: 3, name: "debug_redact", kind: "scalar", T: 8, opt: true, default: false }, { no: 4, name: "feature_support", kind: "message", T: ue3, opt: true }, { no: 999, name: "uninterpreted_option", kind: "message", T: D6, repeated: true }]);
var Ve2 = class t23 extends g2 {
  constructor(e4) {
    super(), this.uninterpretedOption = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t23().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t23().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t23().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t23, e4, n9);
  }
};
Ve2.runtime = l;
Ve2.typeName = "google.protobuf.ServiceOptions";
Ve2.fields = l.util.newFieldList(() => [{ no: 34, name: "features", kind: "message", T: O9, opt: true }, { no: 33, name: "deprecated", kind: "scalar", T: 8, opt: true, default: false }, { no: 999, name: "uninterpreted_option", kind: "message", T: D6, repeated: true }]);
var qe2 = class t24 extends g2 {
  constructor(e4) {
    super(), this.uninterpretedOption = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t24().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t24().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t24().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t24, e4, n9);
  }
};
qe2.runtime = l;
qe2.typeName = "google.protobuf.MethodOptions";
qe2.fields = l.util.newFieldList(() => [{ no: 33, name: "deprecated", kind: "scalar", T: 8, opt: true, default: false }, { no: 34, name: "idempotency_level", kind: "enum", T: l.getEnumType(q6), opt: true, default: q6.IDEMPOTENCY_UNKNOWN }, { no: 35, name: "features", kind: "message", T: O9, opt: true }, { no: 999, name: "uninterpreted_option", kind: "message", T: D6, repeated: true }]);
var q6;
(function(t72) {
  t72[t72.IDEMPOTENCY_UNKNOWN = 0] = "IDEMPOTENCY_UNKNOWN", t72[t72.NO_SIDE_EFFECTS = 1] = "NO_SIDE_EFFECTS", t72[t72.IDEMPOTENT = 2] = "IDEMPOTENT";
})(q6 || (q6 = {}));
l.util.setEnumType(q6, "google.protobuf.MethodOptions.IdempotencyLevel", [{ no: 0, name: "IDEMPOTENCY_UNKNOWN" }, { no: 1, name: "NO_SIDE_EFFECTS" }, { no: 2, name: "IDEMPOTENT" }]);
var D6 = class t25 extends g2 {
  constructor(e4) {
    super(), this.name = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t25().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t25().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t25().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t25, e4, n9);
  }
};
D6.runtime = l;
D6.typeName = "google.protobuf.UninterpretedOption";
D6.fields = l.util.newFieldList(() => [{ no: 2, name: "name", kind: "message", T: Ge2, repeated: true }, { no: 3, name: "identifier_value", kind: "scalar", T: 9, opt: true }, { no: 4, name: "positive_int_value", kind: "scalar", T: 4, opt: true }, { no: 5, name: "negative_int_value", kind: "scalar", T: 3, opt: true }, { no: 6, name: "double_value", kind: "scalar", T: 1, opt: true }, { no: 7, name: "string_value", kind: "scalar", T: 12, opt: true }, { no: 8, name: "aggregate_value", kind: "scalar", T: 9, opt: true }]);
var Ge2 = class t26 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t26().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t26().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t26().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t26, e4, n9);
  }
};
Ge2.runtime = l;
Ge2.typeName = "google.protobuf.UninterpretedOption.NamePart";
Ge2.fields = l.util.newFieldList(() => [{ no: 1, name: "name_part", kind: "scalar", T: 9, req: true }, { no: 2, name: "is_extension", kind: "scalar", T: 8, req: true }]);
var O9 = class t27 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t27().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t27().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t27().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t27, e4, n9);
  }
};
O9.runtime = l;
O9.typeName = "google.protobuf.FeatureSet";
O9.fields = l.util.newFieldList(() => [{ no: 1, name: "field_presence", kind: "enum", T: l.getEnumType(Mt2), opt: true }, { no: 2, name: "enum_type", kind: "enum", T: l.getEnumType(Vt), opt: true }, { no: 3, name: "repeated_field_encoding", kind: "enum", T: l.getEnumType(le2), opt: true }, { no: 4, name: "utf8_validation", kind: "enum", T: l.getEnumType(qt), opt: true }, { no: 5, name: "message_encoding", kind: "enum", T: l.getEnumType(Gt2), opt: true }, { no: 6, name: "json_format", kind: "enum", T: l.getEnumType($t2), opt: true }]);
var Mt2;
(function(t72) {
  t72[t72.FIELD_PRESENCE_UNKNOWN = 0] = "FIELD_PRESENCE_UNKNOWN", t72[t72.EXPLICIT = 1] = "EXPLICIT", t72[t72.IMPLICIT = 2] = "IMPLICIT", t72[t72.LEGACY_REQUIRED = 3] = "LEGACY_REQUIRED";
})(Mt2 || (Mt2 = {}));
l.util.setEnumType(Mt2, "google.protobuf.FeatureSet.FieldPresence", [{ no: 0, name: "FIELD_PRESENCE_UNKNOWN" }, { no: 1, name: "EXPLICIT" }, { no: 2, name: "IMPLICIT" }, { no: 3, name: "LEGACY_REQUIRED" }]);
var Vt;
(function(t72) {
  t72[t72.ENUM_TYPE_UNKNOWN = 0] = "ENUM_TYPE_UNKNOWN", t72[t72.OPEN = 1] = "OPEN", t72[t72.CLOSED = 2] = "CLOSED";
})(Vt || (Vt = {}));
l.util.setEnumType(Vt, "google.protobuf.FeatureSet.EnumType", [{ no: 0, name: "ENUM_TYPE_UNKNOWN" }, { no: 1, name: "OPEN" }, { no: 2, name: "CLOSED" }]);
var le2;
(function(t72) {
  t72[t72.REPEATED_FIELD_ENCODING_UNKNOWN = 0] = "REPEATED_FIELD_ENCODING_UNKNOWN", t72[t72.PACKED = 1] = "PACKED", t72[t72.EXPANDED = 2] = "EXPANDED";
})(le2 || (le2 = {}));
l.util.setEnumType(le2, "google.protobuf.FeatureSet.RepeatedFieldEncoding", [{ no: 0, name: "REPEATED_FIELD_ENCODING_UNKNOWN" }, { no: 1, name: "PACKED" }, { no: 2, name: "EXPANDED" }]);
var qt;
(function(t72) {
  t72[t72.UTF8_VALIDATION_UNKNOWN = 0] = "UTF8_VALIDATION_UNKNOWN", t72[t72.VERIFY = 2] = "VERIFY", t72[t72.NONE = 3] = "NONE";
})(qt || (qt = {}));
l.util.setEnumType(qt, "google.protobuf.FeatureSet.Utf8Validation", [{ no: 0, name: "UTF8_VALIDATION_UNKNOWN" }, { no: 2, name: "VERIFY" }, { no: 3, name: "NONE" }]);
var Gt2;
(function(t72) {
  t72[t72.MESSAGE_ENCODING_UNKNOWN = 0] = "MESSAGE_ENCODING_UNKNOWN", t72[t72.LENGTH_PREFIXED = 1] = "LENGTH_PREFIXED", t72[t72.DELIMITED = 2] = "DELIMITED";
})(Gt2 || (Gt2 = {}));
l.util.setEnumType(Gt2, "google.protobuf.FeatureSet.MessageEncoding", [{ no: 0, name: "MESSAGE_ENCODING_UNKNOWN" }, { no: 1, name: "LENGTH_PREFIXED" }, { no: 2, name: "DELIMITED" }]);
var $t2;
(function(t72) {
  t72[t72.JSON_FORMAT_UNKNOWN = 0] = "JSON_FORMAT_UNKNOWN", t72[t72.ALLOW = 1] = "ALLOW", t72[t72.LEGACY_BEST_EFFORT = 2] = "LEGACY_BEST_EFFORT";
})($t2 || ($t2 = {}));
l.util.setEnumType($t2, "google.protobuf.FeatureSet.JsonFormat", [{ no: 0, name: "JSON_FORMAT_UNKNOWN" }, { no: 1, name: "ALLOW" }, { no: 2, name: "LEGACY_BEST_EFFORT" }]);
var ce3 = class t28 extends g2 {
  constructor(e4) {
    super(), this.defaults = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t28().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t28().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t28().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t28, e4, n9);
  }
};
ce3.runtime = l;
ce3.typeName = "google.protobuf.FeatureSetDefaults";
ce3.fields = l.util.newFieldList(() => [{ no: 1, name: "defaults", kind: "message", T: $e2, repeated: true }, { no: 4, name: "minimum_edition", kind: "enum", T: l.getEnumType(w6), opt: true }, { no: 5, name: "maximum_edition", kind: "enum", T: l.getEnumType(w6), opt: true }]);
var $e2 = class t29 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t29().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t29().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t29().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t29, e4, n9);
  }
};
$e2.runtime = l;
$e2.typeName = "google.protobuf.FeatureSetDefaults.FeatureSetEditionDefault";
$e2.fields = l.util.newFieldList(() => [{ no: 3, name: "edition", kind: "enum", T: l.getEnumType(w6), opt: true }, { no: 4, name: "overridable_features", kind: "message", T: O9, opt: true }, { no: 5, name: "fixed_features", kind: "message", T: O9, opt: true }]);
var Ce = class t30 extends g2 {
  constructor(e4) {
    super(), this.location = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t30().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t30().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t30().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t30, e4, n9);
  }
};
Ce.runtime = l;
Ce.typeName = "google.protobuf.SourceCodeInfo";
Ce.fields = l.util.newFieldList(() => [{ no: 1, name: "location", kind: "message", T: je2, repeated: true }]);
var je2 = class t31 extends g2 {
  constructor(e4) {
    super(), this.path = [], this.span = [], this.leadingDetachedComments = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t31().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t31().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t31().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t31, e4, n9);
  }
};
je2.runtime = l;
je2.typeName = "google.protobuf.SourceCodeInfo.Location";
je2.fields = l.util.newFieldList(() => [{ no: 1, name: "path", kind: "scalar", T: 5, repeated: true, packed: true }, { no: 2, name: "span", kind: "scalar", T: 5, repeated: true, packed: true }, { no: 3, name: "leading_comments", kind: "scalar", T: 9, opt: true }, { no: 4, name: "trailing_comments", kind: "scalar", T: 9, opt: true }, { no: 6, name: "leading_detached_comments", kind: "scalar", T: 9, repeated: true }]);
var me2 = class t32 extends g2 {
  constructor(e4) {
    super(), this.annotation = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t32().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t32().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t32().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t32, e4, n9);
  }
};
me2.runtime = l;
me2.typeName = "google.protobuf.GeneratedCodeInfo";
me2.fields = l.util.newFieldList(() => [{ no: 1, name: "annotation", kind: "message", T: Xe2, repeated: true }]);
var Xe2 = class t33 extends g2 {
  constructor(e4) {
    super(), this.path = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t33().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t33().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t33().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t33, e4, n9);
  }
};
Xe2.runtime = l;
Xe2.typeName = "google.protobuf.GeneratedCodeInfo.Annotation";
Xe2.fields = l.util.newFieldList(() => [{ no: 1, name: "path", kind: "scalar", T: 5, repeated: true, packed: true }, { no: 2, name: "source_file", kind: "scalar", T: 9, opt: true }, { no: 3, name: "begin", kind: "scalar", T: 5, opt: true }, { no: 4, name: "end", kind: "scalar", T: 5, opt: true }, { no: 5, name: "semantic", kind: "enum", T: l.getEnumType(Ct2), opt: true }]);
var Ct2;
(function(t72) {
  t72[t72.NONE = 0] = "NONE", t72[t72.SET = 1] = "SET", t72[t72.ALIAS = 2] = "ALIAS";
})(Ct2 || (Ct2 = {}));
l.util.setEnumType(Ct2, "google.protobuf.GeneratedCodeInfo.Annotation.Semantic", [{ no: 0, name: "NONE" }, { no: 1, name: "SET" }, { no: 2, name: "ALIAS" }]);
var Cr = { [N8.DOUBLE]: c3.DOUBLE, [N8.FLOAT]: c3.FLOAT, [N8.INT64]: c3.INT64, [N8.UINT64]: c3.UINT64, [N8.INT32]: c3.INT32, [N8.FIXED64]: c3.FIXED64, [N8.FIXED32]: c3.FIXED32, [N8.BOOL]: c3.BOOL, [N8.STRING]: c3.STRING, [N8.GROUP]: void 0, [N8.MESSAGE]: void 0, [N8.BYTES]: c3.BYTES, [N8.UINT32]: c3.UINT32, [N8.ENUM]: void 0, [N8.SFIXED32]: c3.SFIXED32, [N8.SFIXED64]: c3.SFIXED64, [N8.SINT32]: c3.SINT32, [N8.SINT64]: c3.SINT64 };
var v3;
(function(t72) {
  t72[t72.FileDescriptorProto_Package = 2] = "FileDescriptorProto_Package", t72[t72.FileDescriptorProto_MessageType = 4] = "FileDescriptorProto_MessageType", t72[t72.FileDescriptorProto_EnumType = 5] = "FileDescriptorProto_EnumType", t72[t72.FileDescriptorProto_Service = 6] = "FileDescriptorProto_Service", t72[t72.FileDescriptorProto_Extension = 7] = "FileDescriptorProto_Extension", t72[t72.FileDescriptorProto_Syntax = 12] = "FileDescriptorProto_Syntax", t72[t72.DescriptorProto_Field = 2] = "DescriptorProto_Field", t72[t72.DescriptorProto_NestedType = 3] = "DescriptorProto_NestedType", t72[t72.DescriptorProto_EnumType = 4] = "DescriptorProto_EnumType", t72[t72.DescriptorProto_Extension = 6] = "DescriptorProto_Extension", t72[t72.DescriptorProto_OneofDecl = 8] = "DescriptorProto_OneofDecl", t72[t72.EnumDescriptorProto_Value = 2] = "EnumDescriptorProto_Value", t72[t72.ServiceDescriptorProto_Method = 2] = "ServiceDescriptorProto_Method";
})(v3 || (v3 = {}));
var fe4 = class t34 extends g2 {
  constructor(e4) {
    super(), this.seconds = y4.zero, this.nanos = 0, m4.util.initPartial(e4, this);
  }
  fromJson(e4, n9) {
    if (typeof e4 != "string") throw new Error(`cannot decode google.protobuf.Timestamp from JSON: ${m4.json.debug(e4)}`);
    let r10 = e4.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:Z|\.([0-9]{3,9})Z|([+-][0-9][0-9]:[0-9][0-9]))$/);
    if (!r10) throw new Error("cannot decode google.protobuf.Timestamp from JSON: invalid RFC 3339 string");
    let o18 = Date.parse(r10[1] + "-" + r10[2] + "-" + r10[3] + "T" + r10[4] + ":" + r10[5] + ":" + r10[6] + (r10[8] ? r10[8] : "Z"));
    if (Number.isNaN(o18)) throw new Error("cannot decode google.protobuf.Timestamp from JSON: invalid RFC 3339 string");
    if (o18 < Date.parse("0001-01-01T00:00:00Z") || o18 > Date.parse("9999-12-31T23:59:59Z")) throw new Error("cannot decode message google.protobuf.Timestamp from JSON: must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive");
    return this.seconds = y4.parse(o18 / 1e3), this.nanos = 0, r10[7] && (this.nanos = parseInt("1" + r10[7] + "0".repeat(9 - r10[7].length)) - 1e9), this;
  }
  toJson(e4) {
    let n9 = Number(this.seconds) * 1e3;
    if (n9 < Date.parse("0001-01-01T00:00:00Z") || n9 > Date.parse("9999-12-31T23:59:59Z")) throw new Error("cannot encode google.protobuf.Timestamp to JSON: must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive");
    if (this.nanos < 0) throw new Error("cannot encode google.protobuf.Timestamp to JSON: nanos must not be negative");
    let r10 = "Z";
    if (this.nanos > 0) {
      let o18 = (this.nanos + 1e9).toString().substring(1);
      o18.substring(3) === "000000" ? r10 = "." + o18.substring(0, 3) + "Z" : o18.substring(6) === "000" ? r10 = "." + o18.substring(0, 6) + "Z" : r10 = "." + o18 + "Z";
    }
    return new Date(n9).toISOString().replace(".000Z", r10);
  }
  toDate() {
    return new Date(Number(this.seconds) * 1e3 + Math.ceil(this.nanos / 1e6));
  }
  static now() {
    return t34.fromDate(/* @__PURE__ */ new Date());
  }
  static fromDate(e4) {
    let n9 = e4.getTime();
    return new t34({ seconds: y4.parse(Math.floor(n9 / 1e3)), nanos: n9 % 1e3 * 1e6 });
  }
  static fromBinary(e4, n9) {
    return new t34().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t34().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t34().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t34, e4, n9);
  }
};
fe4.runtime = m4;
fe4.typeName = "google.protobuf.Timestamp";
fe4.fields = m4.util.newFieldList(() => [{ no: 1, name: "seconds", kind: "scalar", T: 3 }, { no: 2, name: "nanos", kind: "scalar", T: 5 }]);
var oe4 = class t35 extends g2 {
  constructor(e4) {
    super(), this.seconds = y4.zero, this.nanos = 0, m4.util.initPartial(e4, this);
  }
  fromJson(e4, n9) {
    if (typeof e4 != "string") throw new Error(`cannot decode google.protobuf.Duration from JSON: ${m4.json.debug(e4)}`);
    let r10 = e4.match(/^(-?[0-9]+)(?:\.([0-9]+))?s/);
    if (r10 === null) throw new Error(`cannot decode google.protobuf.Duration from JSON: ${m4.json.debug(e4)}`);
    let o18 = Number(r10[1]);
    if (o18 > 315576e6 || o18 < -315576e6) throw new Error(`cannot decode google.protobuf.Duration from JSON: ${m4.json.debug(e4)}`);
    if (this.seconds = y4.parse(o18), typeof r10[2] == "string") {
      let s8 = r10[2] + "0".repeat(9 - r10[2].length);
      this.nanos = parseInt(s8), (o18 < 0 || Object.is(o18, -0)) && (this.nanos = -this.nanos);
    }
    return this;
  }
  toJson(e4) {
    if (Number(this.seconds) > 315576e6 || Number(this.seconds) < -315576e6) throw new Error("cannot encode google.protobuf.Duration to JSON: value out of range");
    let n9 = this.seconds.toString();
    if (this.nanos !== 0) {
      let r10 = Math.abs(this.nanos).toString();
      r10 = "0".repeat(9 - r10.length) + r10, r10.substring(3) === "000000" ? r10 = r10.substring(0, 3) : r10.substring(6) === "000" && (r10 = r10.substring(0, 6)), n9 += "." + r10, this.nanos < 0 && Number(this.seconds) == 0 && (n9 = "-" + n9);
    }
    return n9 + "s";
  }
  static fromBinary(e4, n9) {
    return new t35().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t35().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t35().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t35, e4, n9);
  }
};
oe4.runtime = m4;
oe4.typeName = "google.protobuf.Duration";
oe4.fields = m4.util.newFieldList(() => [{ no: 1, name: "seconds", kind: "scalar", T: 3 }, { no: 2, name: "nanos", kind: "scalar", T: 5 }]);
var G5 = class t36 extends g2 {
  constructor(e4) {
    super(), this.typeUrl = "", this.value = new Uint8Array(0), m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    var n9;
    if (this.typeUrl === "") return {};
    let r10 = this.typeUrlToName(this.typeUrl), o18 = (n9 = e4?.typeRegistry) === null || n9 === void 0 ? void 0 : n9.findMessage(r10);
    if (!o18) throw new Error(`cannot encode message google.protobuf.Any to JSON: "${this.typeUrl}" is not in the type registry`);
    let i12 = o18.fromBinary(this.value).toJson(e4);
    return (r10.startsWith("google.protobuf.") || i12 === null || Array.isArray(i12) || typeof i12 != "object") && (i12 = { value: i12 }), i12["@type"] = this.typeUrl, i12;
  }
  fromJson(e4, n9) {
    var r10;
    if (e4 === null || Array.isArray(e4) || typeof e4 != "object") throw new Error(`cannot decode message google.protobuf.Any from JSON: expected object but got ${e4 === null ? "null" : Array.isArray(e4) ? "array" : typeof e4}`);
    if (Object.keys(e4).length == 0) return this;
    let o18 = e4["@type"];
    if (typeof o18 != "string" || o18 == "") throw new Error('cannot decode message google.protobuf.Any from JSON: "@type" is empty');
    let s8 = this.typeUrlToName(o18), i12 = (r10 = n9?.typeRegistry) === null || r10 === void 0 ? void 0 : r10.findMessage(s8);
    if (!i12) throw new Error(`cannot decode message google.protobuf.Any from JSON: ${o18} is not in the type registry`);
    let u8;
    if (s8.startsWith("google.protobuf.") && Object.prototype.hasOwnProperty.call(e4, "value")) u8 = i12.fromJson(e4.value, n9);
    else {
      let a8 = Object.assign({}, e4);
      delete a8["@type"], u8 = i12.fromJson(a8, n9);
    }
    return this.packFrom(u8), this;
  }
  packFrom(e4) {
    this.value = e4.toBinary(), this.typeUrl = this.typeNameToUrl(e4.getType().typeName);
  }
  unpackTo(e4) {
    return this.is(e4.getType()) ? (e4.fromBinary(this.value), true) : false;
  }
  unpack(e4) {
    if (this.typeUrl === "") return;
    let n9 = e4.findMessage(this.typeUrlToName(this.typeUrl));
    if (n9) return n9.fromBinary(this.value);
  }
  is(e4) {
    if (this.typeUrl === "") return false;
    let n9 = this.typeUrlToName(this.typeUrl), r10 = "";
    return typeof e4 == "string" ? r10 = e4 : r10 = e4.typeName, n9 === r10;
  }
  typeNameToUrl(e4) {
    return `type.googleapis.com/${e4}`;
  }
  typeUrlToName(e4) {
    if (!e4.length) throw new Error(`invalid type url: ${e4}`);
    let n9 = e4.lastIndexOf("/"), r10 = n9 >= 0 ? e4.substring(n9 + 1) : e4;
    if (!r10.length) throw new Error(`invalid type url: ${e4}`);
    return r10;
  }
  static pack(e4) {
    let n9 = new t36();
    return n9.packFrom(e4), n9;
  }
  static fromBinary(e4, n9) {
    return new t36().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t36().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t36().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t36, e4, n9);
  }
};
G5.runtime = m4;
G5.typeName = "google.protobuf.Any";
G5.fields = m4.util.newFieldList(() => [{ no: 1, name: "type_url", kind: "scalar", T: 9 }, { no: 2, name: "value", kind: "scalar", T: 12 }]);
var pe3 = class t37 extends g2 {
  constructor(e4) {
    super(), m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t37().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t37().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t37().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t37, e4, n9);
  }
};
pe3.runtime = m4;
pe3.typeName = "google.protobuf.Empty";
pe3.fields = m4.util.newFieldList(() => []);
var de3 = class t38 extends g2 {
  constructor(e4) {
    super(), this.paths = [], m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    function n9(r10) {
      let o18 = false, s8 = [];
      for (let i12 = 0; i12 < r10.length; i12++) {
        let u8 = r10.charAt(i12);
        switch (u8) {
          case "_":
            o18 = true;
            break;
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
            s8.push(u8), o18 = false;
            break;
          default:
            o18 && (o18 = false, u8 = u8.toUpperCase()), s8.push(u8);
            break;
        }
      }
      return s8.join("");
    }
    return this.paths.map((r10) => {
      if (r10.match(/_[0-9]?_/g) || r10.match(/[A-Z]/g)) throw new Error('cannot encode google.protobuf.FieldMask to JSON: lowerCamelCase of path name "' + r10 + '" is irreversible');
      return n9(r10);
    }).join(",");
  }
  fromJson(e4, n9) {
    if (typeof e4 != "string") throw new Error("cannot decode google.protobuf.FieldMask from JSON: " + m4.json.debug(e4));
    if (e4 === "") return this;
    function r10(o18) {
      if (o18.includes("_")) throw new Error("cannot decode google.protobuf.FieldMask from JSON: path names must be lowerCamelCase");
      let s8 = o18.replace(/[A-Z]/g, (i12) => "_" + i12.toLowerCase());
      return s8[0] === "_" ? s8.substring(1) : s8;
    }
    return this.paths = e4.split(",").map(r10), this;
  }
  static fromBinary(e4, n9) {
    return new t38().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t38().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t38().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t38, e4, n9);
  }
};
de3.runtime = m4;
de3.typeName = "google.protobuf.FieldMask";
de3.fields = m4.util.newFieldList(() => [{ no: 1, name: "paths", kind: "scalar", T: 9, repeated: true }]);
var ge3;
(function(t72) {
  t72[t72.NULL_VALUE = 0] = "NULL_VALUE";
})(ge3 || (ge3 = {}));
m4.util.setEnumType(ge3, "google.protobuf.NullValue", [{ no: 0, name: "NULL_VALUE" }]);
var $7 = class t39 extends g2 {
  constructor(e4) {
    super(), this.fields = {}, m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    let n9 = {};
    for (let [r10, o18] of Object.entries(this.fields)) n9[r10] = o18.toJson(e4);
    return n9;
  }
  fromJson(e4, n9) {
    if (typeof e4 != "object" || e4 == null || Array.isArray(e4)) throw new Error("cannot decode google.protobuf.Struct from JSON " + m4.json.debug(e4));
    for (let [r10, o18] of Object.entries(e4)) this.fields[r10] = F6.fromJson(o18);
    return this;
  }
  static fromBinary(e4, n9) {
    return new t39().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t39().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t39().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t39, e4, n9);
  }
};
$7.runtime = m4;
$7.typeName = "google.protobuf.Struct";
$7.fields = m4.util.newFieldList(() => [{ no: 1, name: "fields", kind: "map", K: 9, V: { kind: "message", T: F6 } }]);
var F6 = class t40 extends g2 {
  constructor(e4) {
    super(), this.kind = { case: void 0 }, m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    switch (this.kind.case) {
      case "nullValue":
        return null;
      case "numberValue":
        if (!Number.isFinite(this.kind.value)) throw new Error("google.protobuf.Value cannot be NaN or Infinity");
        return this.kind.value;
      case "boolValue":
        return this.kind.value;
      case "stringValue":
        return this.kind.value;
      case "structValue":
      case "listValue":
        return this.kind.value.toJson(Object.assign(Object.assign({}, e4), { emitDefaultValues: true }));
    }
    throw new Error("google.protobuf.Value must have a value");
  }
  fromJson(e4, n9) {
    switch (typeof e4) {
      case "number":
        this.kind = { case: "numberValue", value: e4 };
        break;
      case "string":
        this.kind = { case: "stringValue", value: e4 };
        break;
      case "boolean":
        this.kind = { case: "boolValue", value: e4 };
        break;
      case "object":
        e4 === null ? this.kind = { case: "nullValue", value: ge3.NULL_VALUE } : Array.isArray(e4) ? this.kind = { case: "listValue", value: C6.fromJson(e4) } : this.kind = { case: "structValue", value: $7.fromJson(e4) };
        break;
      default:
        throw new Error("cannot decode google.protobuf.Value from JSON " + m4.json.debug(e4));
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t40().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t40().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t40().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t40, e4, n9);
  }
};
F6.runtime = m4;
F6.typeName = "google.protobuf.Value";
F6.fields = m4.util.newFieldList(() => [{ no: 1, name: "null_value", kind: "enum", T: m4.getEnumType(ge3), oneof: "kind" }, { no: 2, name: "number_value", kind: "scalar", T: 1, oneof: "kind" }, { no: 3, name: "string_value", kind: "scalar", T: 9, oneof: "kind" }, { no: 4, name: "bool_value", kind: "scalar", T: 8, oneof: "kind" }, { no: 5, name: "struct_value", kind: "message", T: $7, oneof: "kind" }, { no: 6, name: "list_value", kind: "message", T: C6, oneof: "kind" }]);
var C6 = class t41 extends g2 {
  constructor(e4) {
    super(), this.values = [], m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return this.values.map((n9) => n9.toJson());
  }
  fromJson(e4, n9) {
    if (!Array.isArray(e4)) throw new Error("cannot decode google.protobuf.ListValue from JSON " + m4.json.debug(e4));
    for (let r10 of e4) this.values.push(F6.fromJson(r10));
    return this;
  }
  static fromBinary(e4, n9) {
    return new t41().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t41().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t41().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t41, e4, n9);
  }
};
C6.runtime = m4;
C6.typeName = "google.protobuf.ListValue";
C6.fields = m4.util.newFieldList(() => [{ no: 1, name: "values", kind: "message", T: F6, repeated: true }]);
var j6 = class t42 extends g2 {
  constructor(e4) {
    super(), this.value = 0, m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return m4.json.writeScalar(c3.DOUBLE, this.value, true);
  }
  fromJson(e4, n9) {
    try {
      this.value = m4.json.readScalar(c3.DOUBLE, e4);
    } catch (r10) {
      let o18 = 'cannot decode message google.protobuf.DoubleValue from JSON"';
      throw r10 instanceof Error && r10.message.length > 0 && (o18 += `: ${r10.message}`), new Error(o18);
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t42().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t42().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t42().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t42, e4, n9);
  }
};
j6.runtime = m4;
j6.typeName = "google.protobuf.DoubleValue";
j6.fields = m4.util.newFieldList(() => [{ no: 1, name: "value", kind: "scalar", T: 1 }]);
j6.fieldWrapper = { wrapField(t72) {
  return new j6({ value: t72 });
}, unwrapField(t72) {
  return t72.value;
} };
var X5 = class t43 extends g2 {
  constructor(e4) {
    super(), this.value = 0, m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return m4.json.writeScalar(c3.FLOAT, this.value, true);
  }
  fromJson(e4, n9) {
    try {
      this.value = m4.json.readScalar(c3.FLOAT, e4);
    } catch (r10) {
      let o18 = 'cannot decode message google.protobuf.FloatValue from JSON"';
      throw r10 instanceof Error && r10.message.length > 0 && (o18 += `: ${r10.message}`), new Error(o18);
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t43().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t43().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t43().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t43, e4, n9);
  }
};
X5.runtime = m4;
X5.typeName = "google.protobuf.FloatValue";
X5.fields = m4.util.newFieldList(() => [{ no: 1, name: "value", kind: "scalar", T: 2 }]);
X5.fieldWrapper = { wrapField(t72) {
  return new X5({ value: t72 });
}, unwrapField(t72) {
  return t72.value;
} };
var W5 = class t44 extends g2 {
  constructor(e4) {
    super(), this.value = y4.zero, m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return m4.json.writeScalar(c3.INT64, this.value, true);
  }
  fromJson(e4, n9) {
    try {
      this.value = m4.json.readScalar(c3.INT64, e4);
    } catch (r10) {
      let o18 = 'cannot decode message google.protobuf.Int64Value from JSON"';
      throw r10 instanceof Error && r10.message.length > 0 && (o18 += `: ${r10.message}`), new Error(o18);
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t44().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t44().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t44().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t44, e4, n9);
  }
};
W5.runtime = m4;
W5.typeName = "google.protobuf.Int64Value";
W5.fields = m4.util.newFieldList(() => [{ no: 1, name: "value", kind: "scalar", T: 3 }]);
W5.fieldWrapper = { wrapField(t72) {
  return new W5({ value: t72 });
}, unwrapField(t72) {
  return t72.value;
} };
var K5 = class t45 extends g2 {
  constructor(e4) {
    super(), this.value = y4.zero, m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return m4.json.writeScalar(c3.UINT64, this.value, true);
  }
  fromJson(e4, n9) {
    try {
      this.value = m4.json.readScalar(c3.UINT64, e4);
    } catch (r10) {
      let o18 = 'cannot decode message google.protobuf.UInt64Value from JSON"';
      throw r10 instanceof Error && r10.message.length > 0 && (o18 += `: ${r10.message}`), new Error(o18);
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t45().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t45().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t45().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t45, e4, n9);
  }
};
K5.runtime = m4;
K5.typeName = "google.protobuf.UInt64Value";
K5.fields = m4.util.newFieldList(() => [{ no: 1, name: "value", kind: "scalar", T: 4 }]);
K5.fieldWrapper = { wrapField(t72) {
  return new K5({ value: t72 });
}, unwrapField(t72) {
  return t72.value;
} };
var Z5 = class t46 extends g2 {
  constructor(e4) {
    super(), this.value = 0, m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return m4.json.writeScalar(c3.INT32, this.value, true);
  }
  fromJson(e4, n9) {
    try {
      this.value = m4.json.readScalar(c3.INT32, e4);
    } catch (r10) {
      let o18 = 'cannot decode message google.protobuf.Int32Value from JSON"';
      throw r10 instanceof Error && r10.message.length > 0 && (o18 += `: ${r10.message}`), new Error(o18);
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t46().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t46().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t46().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t46, e4, n9);
  }
};
Z5.runtime = m4;
Z5.typeName = "google.protobuf.Int32Value";
Z5.fields = m4.util.newFieldList(() => [{ no: 1, name: "value", kind: "scalar", T: 5 }]);
Z5.fieldWrapper = { wrapField(t72) {
  return new Z5({ value: t72 });
}, unwrapField(t72) {
  return t72.value;
} };
var z5 = class t47 extends g2 {
  constructor(e4) {
    super(), this.value = 0, m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return m4.json.writeScalar(c3.UINT32, this.value, true);
  }
  fromJson(e4, n9) {
    try {
      this.value = m4.json.readScalar(c3.UINT32, e4);
    } catch (r10) {
      let o18 = 'cannot decode message google.protobuf.UInt32Value from JSON"';
      throw r10 instanceof Error && r10.message.length > 0 && (o18 += `: ${r10.message}`), new Error(o18);
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t47().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t47().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t47().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t47, e4, n9);
  }
};
z5.runtime = m4;
z5.typeName = "google.protobuf.UInt32Value";
z5.fields = m4.util.newFieldList(() => [{ no: 1, name: "value", kind: "scalar", T: 13 }]);
z5.fieldWrapper = { wrapField(t72) {
  return new z5({ value: t72 });
}, unwrapField(t72) {
  return t72.value;
} };
var Q5 = class t48 extends g2 {
  constructor(e4) {
    super(), this.value = false, m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return m4.json.writeScalar(c3.BOOL, this.value, true);
  }
  fromJson(e4, n9) {
    try {
      this.value = m4.json.readScalar(c3.BOOL, e4);
    } catch (r10) {
      let o18 = 'cannot decode message google.protobuf.BoolValue from JSON"';
      throw r10 instanceof Error && r10.message.length > 0 && (o18 += `: ${r10.message}`), new Error(o18);
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t48().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t48().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t48().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t48, e4, n9);
  }
};
Q5.runtime = m4;
Q5.typeName = "google.protobuf.BoolValue";
Q5.fields = m4.util.newFieldList(() => [{ no: 1, name: "value", kind: "scalar", T: 8 }]);
Q5.fieldWrapper = { wrapField(t72) {
  return new Q5({ value: t72 });
}, unwrapField(t72) {
  return t72.value;
} };
var H7 = class t49 extends g2 {
  constructor(e4) {
    super(), this.value = "", m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return m4.json.writeScalar(c3.STRING, this.value, true);
  }
  fromJson(e4, n9) {
    try {
      this.value = m4.json.readScalar(c3.STRING, e4);
    } catch (r10) {
      let o18 = 'cannot decode message google.protobuf.StringValue from JSON"';
      throw r10 instanceof Error && r10.message.length > 0 && (o18 += `: ${r10.message}`), new Error(o18);
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t49().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t49().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t49().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t49, e4, n9);
  }
};
H7.runtime = m4;
H7.typeName = "google.protobuf.StringValue";
H7.fields = m4.util.newFieldList(() => [{ no: 1, name: "value", kind: "scalar", T: 9 }]);
H7.fieldWrapper = { wrapField(t72) {
  return new H7({ value: t72 });
}, unwrapField(t72) {
  return t72.value;
} };
var ee5 = class t50 extends g2 {
  constructor(e4) {
    super(), this.value = new Uint8Array(0), m4.util.initPartial(e4, this);
  }
  toJson(e4) {
    return m4.json.writeScalar(c3.BYTES, this.value, true);
  }
  fromJson(e4, n9) {
    try {
      this.value = m4.json.readScalar(c3.BYTES, e4);
    } catch (r10) {
      let o18 = 'cannot decode message google.protobuf.BytesValue from JSON"';
      throw r10 instanceof Error && r10.message.length > 0 && (o18 += `: ${r10.message}`), new Error(o18);
    }
    return this;
  }
  static fromBinary(e4, n9) {
    return new t50().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t50().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t50().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t50, e4, n9);
  }
};
ee5.runtime = m4;
ee5.typeName = "google.protobuf.BytesValue";
ee5.fields = m4.util.newFieldList(() => [{ no: 1, name: "value", kind: "scalar", T: 12 }]);
ee5.fieldWrapper = { wrapField(t72) {
  return new ee5({ value: t72 });
}, unwrapField(t72) {
  return t72.value;
} };
var Kr = [Nt2(ge3)];
var Ke2 = class t51 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t51().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t51().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t51().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t51, e4, n9);
  }
};
Ke2.runtime = l;
Ke2.typeName = "google.protobuf.compiler.Version";
Ke2.fields = l.util.newFieldList(() => [{ no: 1, name: "major", kind: "scalar", T: 5, opt: true }, { no: 2, name: "minor", kind: "scalar", T: 5, opt: true }, { no: 3, name: "patch", kind: "scalar", T: 5, opt: true }, { no: 4, name: "suffix", kind: "scalar", T: 9, opt: true }]);
var ct2 = class t52 extends g2 {
  constructor(e4) {
    super(), this.fileToGenerate = [], this.protoFile = [], this.sourceFileDescriptors = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t52().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t52().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t52().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t52, e4, n9);
  }
};
ct2.runtime = l;
ct2.typeName = "google.protobuf.compiler.CodeGeneratorRequest";
ct2.fields = l.util.newFieldList(() => [{ no: 1, name: "file_to_generate", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "parameter", kind: "scalar", T: 9, opt: true }, { no: 15, name: "proto_file", kind: "message", T: V5, repeated: true }, { no: 17, name: "source_file_descriptors", kind: "message", T: V5, repeated: true }, { no: 3, name: "compiler_version", kind: "message", T: Ke2, opt: true }]);
var mt = class t53 extends g2 {
  constructor(e4) {
    super(), this.file = [], l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t53().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t53().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t53().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t53, e4, n9);
  }
};
mt.runtime = l;
mt.typeName = "google.protobuf.compiler.CodeGeneratorResponse";
mt.fields = l.util.newFieldList(() => [{ no: 1, name: "error", kind: "scalar", T: 9, opt: true }, { no: 2, name: "supported_features", kind: "scalar", T: 4, opt: true }, { no: 3, name: "minimum_edition", kind: "scalar", T: 5, opt: true }, { no: 4, name: "maximum_edition", kind: "scalar", T: 5, opt: true }, { no: 15, name: "file", kind: "message", T: Ze2, repeated: true }]);
var dn;
(function(t72) {
  t72[t72.NONE = 0] = "NONE", t72[t72.PROTO3_OPTIONAL = 1] = "PROTO3_OPTIONAL", t72[t72.SUPPORTS_EDITIONS = 2] = "SUPPORTS_EDITIONS";
})(dn || (dn = {}));
l.util.setEnumType(dn, "google.protobuf.compiler.CodeGeneratorResponse.Feature", [{ no: 0, name: "FEATURE_NONE" }, { no: 1, name: "FEATURE_PROTO3_OPTIONAL" }, { no: 2, name: "FEATURE_SUPPORTS_EDITIONS" }]);
var Ze2 = class t54 extends g2 {
  constructor(e4) {
    super(), l.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t54().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t54().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t54().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return l.util.equals(t54, e4, n9);
  }
};
Ze2.runtime = l;
Ze2.typeName = "google.protobuf.compiler.CodeGeneratorResponse.File";
Ze2.fields = l.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "insertion_point", kind: "scalar", T: 9, opt: true }, { no: 15, name: "content", kind: "scalar", T: 9, opt: true }, { no: 16, name: "generated_code_info", kind: "message", T: me2, opt: true }]);
var R5 = class t55 extends g2 {
  constructor(e4) {
    super(), this.fileName = "", m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t55().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t55().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t55().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t55, e4, n9);
  }
};
R5.runtime = m4;
R5.typeName = "google.protobuf.SourceContext";
R5.fields = m4.util.newFieldList(() => [{ no: 1, name: "file_name", kind: "scalar", T: 9 }]);
var J5;
(function(t72) {
  t72[t72.PROTO2 = 0] = "PROTO2", t72[t72.PROTO3 = 1] = "PROTO3", t72[t72.EDITIONS = 2] = "EDITIONS";
})(J5 || (J5 = {}));
m4.util.setEnumType(J5, "google.protobuf.Syntax", [{ no: 0, name: "SYNTAX_PROTO2" }, { no: 1, name: "SYNTAX_PROTO3" }, { no: 2, name: "SYNTAX_EDITIONS" }]);
var ft2 = class t56 extends g2 {
  constructor(e4) {
    super(), this.name = "", this.fields = [], this.oneofs = [], this.options = [], this.syntax = J5.PROTO2, this.edition = "", m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t56().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t56().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t56().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t56, e4, n9);
  }
};
ft2.runtime = m4;
ft2.typeName = "google.protobuf.Type";
ft2.fields = m4.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "fields", kind: "message", T: ze2, repeated: true }, { no: 3, name: "oneofs", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "options", kind: "message", T: B6, repeated: true }, { no: 5, name: "source_context", kind: "message", T: R5 }, { no: 6, name: "syntax", kind: "enum", T: m4.getEnumType(J5) }, { no: 7, name: "edition", kind: "scalar", T: 9 }]);
var ze2 = class t57 extends g2 {
  constructor(e4) {
    super(), this.kind = pt2.TYPE_UNKNOWN, this.cardinality = dt2.UNKNOWN, this.number = 0, this.name = "", this.typeUrl = "", this.oneofIndex = 0, this.packed = false, this.options = [], this.jsonName = "", this.defaultValue = "", m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t57().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t57().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t57().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t57, e4, n9);
  }
};
ze2.runtime = m4;
ze2.typeName = "google.protobuf.Field";
ze2.fields = m4.util.newFieldList(() => [{ no: 1, name: "kind", kind: "enum", T: m4.getEnumType(pt2) }, { no: 2, name: "cardinality", kind: "enum", T: m4.getEnumType(dt2) }, { no: 3, name: "number", kind: "scalar", T: 5 }, { no: 4, name: "name", kind: "scalar", T: 9 }, { no: 6, name: "type_url", kind: "scalar", T: 9 }, { no: 7, name: "oneof_index", kind: "scalar", T: 5 }, { no: 8, name: "packed", kind: "scalar", T: 8 }, { no: 9, name: "options", kind: "message", T: B6, repeated: true }, { no: 10, name: "json_name", kind: "scalar", T: 9 }, { no: 11, name: "default_value", kind: "scalar", T: 9 }]);
var pt2;
(function(t72) {
  t72[t72.TYPE_UNKNOWN = 0] = "TYPE_UNKNOWN", t72[t72.TYPE_DOUBLE = 1] = "TYPE_DOUBLE", t72[t72.TYPE_FLOAT = 2] = "TYPE_FLOAT", t72[t72.TYPE_INT64 = 3] = "TYPE_INT64", t72[t72.TYPE_UINT64 = 4] = "TYPE_UINT64", t72[t72.TYPE_INT32 = 5] = "TYPE_INT32", t72[t72.TYPE_FIXED64 = 6] = "TYPE_FIXED64", t72[t72.TYPE_FIXED32 = 7] = "TYPE_FIXED32", t72[t72.TYPE_BOOL = 8] = "TYPE_BOOL", t72[t72.TYPE_STRING = 9] = "TYPE_STRING", t72[t72.TYPE_GROUP = 10] = "TYPE_GROUP", t72[t72.TYPE_MESSAGE = 11] = "TYPE_MESSAGE", t72[t72.TYPE_BYTES = 12] = "TYPE_BYTES", t72[t72.TYPE_UINT32 = 13] = "TYPE_UINT32", t72[t72.TYPE_ENUM = 14] = "TYPE_ENUM", t72[t72.TYPE_SFIXED32 = 15] = "TYPE_SFIXED32", t72[t72.TYPE_SFIXED64 = 16] = "TYPE_SFIXED64", t72[t72.TYPE_SINT32 = 17] = "TYPE_SINT32", t72[t72.TYPE_SINT64 = 18] = "TYPE_SINT64";
})(pt2 || (pt2 = {}));
m4.util.setEnumType(pt2, "google.protobuf.Field.Kind", [{ no: 0, name: "TYPE_UNKNOWN" }, { no: 1, name: "TYPE_DOUBLE" }, { no: 2, name: "TYPE_FLOAT" }, { no: 3, name: "TYPE_INT64" }, { no: 4, name: "TYPE_UINT64" }, { no: 5, name: "TYPE_INT32" }, { no: 6, name: "TYPE_FIXED64" }, { no: 7, name: "TYPE_FIXED32" }, { no: 8, name: "TYPE_BOOL" }, { no: 9, name: "TYPE_STRING" }, { no: 10, name: "TYPE_GROUP" }, { no: 11, name: "TYPE_MESSAGE" }, { no: 12, name: "TYPE_BYTES" }, { no: 13, name: "TYPE_UINT32" }, { no: 14, name: "TYPE_ENUM" }, { no: 15, name: "TYPE_SFIXED32" }, { no: 16, name: "TYPE_SFIXED64" }, { no: 17, name: "TYPE_SINT32" }, { no: 18, name: "TYPE_SINT64" }]);
var dt2;
(function(t72) {
  t72[t72.UNKNOWN = 0] = "UNKNOWN", t72[t72.OPTIONAL = 1] = "OPTIONAL", t72[t72.REQUIRED = 2] = "REQUIRED", t72[t72.REPEATED = 3] = "REPEATED";
})(dt2 || (dt2 = {}));
m4.util.setEnumType(dt2, "google.protobuf.Field.Cardinality", [{ no: 0, name: "CARDINALITY_UNKNOWN" }, { no: 1, name: "CARDINALITY_OPTIONAL" }, { no: 2, name: "CARDINALITY_REQUIRED" }, { no: 3, name: "CARDINALITY_REPEATED" }]);
var gt2 = class t58 extends g2 {
  constructor(e4) {
    super(), this.name = "", this.enumvalue = [], this.options = [], this.syntax = J5.PROTO2, this.edition = "", m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t58().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t58().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t58().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t58, e4, n9);
  }
};
gt2.runtime = m4;
gt2.typeName = "google.protobuf.Enum";
gt2.fields = m4.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "enumvalue", kind: "message", T: Qe2, repeated: true }, { no: 3, name: "options", kind: "message", T: B6, repeated: true }, { no: 4, name: "source_context", kind: "message", T: R5 }, { no: 5, name: "syntax", kind: "enum", T: m4.getEnumType(J5) }, { no: 6, name: "edition", kind: "scalar", T: 9 }]);
var Qe2 = class t59 extends g2 {
  constructor(e4) {
    super(), this.name = "", this.number = 0, this.options = [], m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t59().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t59().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t59().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t59, e4, n9);
  }
};
Qe2.runtime = m4;
Qe2.typeName = "google.protobuf.EnumValue";
Qe2.fields = m4.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "number", kind: "scalar", T: 5 }, { no: 3, name: "options", kind: "message", T: B6, repeated: true }]);
var B6 = class t60 extends g2 {
  constructor(e4) {
    super(), this.name = "", m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t60().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t60().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t60().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t60, e4, n9);
  }
};
B6.runtime = m4;
B6.typeName = "google.protobuf.Option";
B6.fields = m4.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "value", kind: "message", T: G5 }]);
var ht2 = class t61 extends g2 {
  constructor(e4) {
    super(), this.name = "", this.methods = [], this.options = [], this.version = "", this.mixins = [], this.syntax = J5.PROTO2, m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t61().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t61().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t61().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t61, e4, n9);
  }
};
ht2.runtime = m4;
ht2.typeName = "google.protobuf.Api";
ht2.fields = m4.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "methods", kind: "message", T: He2, repeated: true }, { no: 3, name: "options", kind: "message", T: B6, repeated: true }, { no: 4, name: "version", kind: "scalar", T: 9 }, { no: 5, name: "source_context", kind: "message", T: R5 }, { no: 6, name: "mixins", kind: "message", T: et2, repeated: true }, { no: 7, name: "syntax", kind: "enum", T: m4.getEnumType(J5) }]);
var He2 = class t62 extends g2 {
  constructor(e4) {
    super(), this.name = "", this.requestTypeUrl = "", this.requestStreaming = false, this.responseTypeUrl = "", this.responseStreaming = false, this.options = [], this.syntax = J5.PROTO2, m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t62().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t62().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t62().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t62, e4, n9);
  }
};
He2.runtime = m4;
He2.typeName = "google.protobuf.Method";
He2.fields = m4.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "request_type_url", kind: "scalar", T: 9 }, { no: 3, name: "request_streaming", kind: "scalar", T: 8 }, { no: 4, name: "response_type_url", kind: "scalar", T: 9 }, { no: 5, name: "response_streaming", kind: "scalar", T: 8 }, { no: 6, name: "options", kind: "message", T: B6, repeated: true }, { no: 7, name: "syntax", kind: "enum", T: m4.getEnumType(J5) }]);
var et2 = class t63 extends g2 {
  constructor(e4) {
    super(), this.name = "", this.root = "", m4.util.initPartial(e4, this);
  }
  static fromBinary(e4, n9) {
    return new t63().fromBinary(e4, n9);
  }
  static fromJson(e4, n9) {
    return new t63().fromJson(e4, n9);
  }
  static fromJsonString(e4, n9) {
    return new t63().fromJsonString(e4, n9);
  }
  static equals(e4, n9) {
    return m4.util.equals(t63, e4, n9);
  }
};
et2.runtime = m4;
et2.typeName = "google.protobuf.Mixin";
et2.fields = m4.util.newFieldList(() => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "root", kind: "scalar", T: 9 }]);

// supabase/functions/_vendor/esm.sh/@livekit/protocol@1.53.4/denonext/protocol.mjs
var Q6 = m4.makeEnum("livekit.agent.ChatRole", [{ no: 0, name: "DEVELOPER" }, { no: 1, name: "SYSTEM" }, { no: 2, name: "USER" }, { no: 3, name: "ASSISTANT" }]);
var L7 = m4.makeEnum("livekit.agent.AgentState", [{ no: 0, name: "AS_INITIALIZING" }, { no: 1, name: "AS_IDLE" }, { no: 2, name: "AS_LISTENING" }, { no: 3, name: "AS_THINKING" }, { no: 4, name: "AS_SPEAKING" }]);
var q7 = m4.makeEnum("livekit.agent.UserState", [{ no: 0, name: "US_SPEAKING" }, { no: 1, name: "US_LISTENING" }, { no: 2, name: "US_AWAY" }]);
var Pe3 = m4.makeEnum("livekit.agent.ToolCallStatus", [{ no: 0, name: "TC_RUNNING" }, { no: 1, name: "TC_DONE" }, { no: 2, name: "TC_ERROR" }, { no: 3, name: "TC_CANCELLED" }]);
var De3 = m4.makeEnum("livekit.agent.ToolReplyStatus", [{ no: 0, name: "TR_SCHEDULED" }, { no: 1, name: "TR_COMPLETED" }, { no: 2, name: "TR_INTERRUPTED" }, { no: 3, name: "TR_SKIPPED" }]);
var Oe3 = m4.makeEnum("livekit.agent.CloseReason", [{ no: 0, name: "CR_UNKNOWN" }, { no: 1, name: "CR_ERROR" }, { no: 2, name: "CR_JOB_SHUTDOWN" }, { no: 3, name: "CR_PARTICIPANT_DISCONNECTED" }, { no: 4, name: "CR_USER_INITIATED" }, { no: 5, name: "CR_COMPLETED" }]);
var F7 = m4.makeEnum("livekit.agent.AmdCategory", [{ no: 0, name: "AMD_UNKNOWN" }, { no: 1, name: "AMD_HUMAN" }, { no: 2, name: "AMD_MACHINE_IVR" }, { no: 3, name: "AMD_MACHINE_VM" }, { no: 4, name: "AMD_MACHINE_UNAVAILABLE" }, { no: 5, name: "AMD_UNCERTAIN" }, { no: 6, name: "AMD_MACHINE_SCREENING" }, { no: 7, name: "AMD_WAIT" }]);
var Ue3 = m4.makeMessageType("livekit.agent.MetricsReport", () => [{ no: 1, name: "started_speaking_at", kind: "message", T: fe4 }, { no: 2, name: "stopped_speaking_at", kind: "message", T: fe4 }, { no: 3, name: "transcription_delay", kind: "scalar", T: 1, opt: true }, { no: 4, name: "end_of_turn_delay", kind: "scalar", T: 1, opt: true }, { no: 5, name: "on_user_turn_completed_delay", kind: "scalar", T: 1, opt: true }, { no: 6, name: "llm_node_ttft", kind: "scalar", T: 1, opt: true }, { no: 7, name: "tts_node_ttfb", kind: "scalar", T: 1, opt: true }, { no: 8, name: "e2e_latency", kind: "scalar", T: 1, opt: true }, { no: 9, name: "llm_node_tps", kind: "scalar", T: 1, opt: true }, { no: 10, name: "llm_node_ttfs", kind: "scalar", T: 1, opt: true }]);
var Ds = m4.makeMessageType("livekit.agent.TimedString", () => [{ no: 1, name: "text", kind: "scalar", T: 9 }, { no: 2, name: "start_time", kind: "scalar", T: 1, opt: true }, { no: 3, name: "end_time", kind: "scalar", T: 1, opt: true }, { no: 4, name: "confidence", kind: "scalar", T: 1, opt: true }, { no: 5, name: "start_time_offset", kind: "scalar", T: 1, opt: true }, { no: 6, name: "speaker_id", kind: "scalar", T: 9, opt: true }]);
var B7 = m4.makeMessageType("livekit.agent.ChatMessage", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "role", kind: "enum", T: m4.getEnumType(Q6) }, { no: 3, name: "content", kind: "message", T: be2, repeated: true }, { no: 4, name: "interrupted", kind: "scalar", T: 8 }, { no: 5, name: "transcript_confidence", kind: "scalar", T: 1, opt: true }, { no: 6, name: "extra", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 7, name: "metrics", kind: "message", T: Ue3 }, { no: 8, name: "created_at", kind: "message", T: fe4 }]);
var be2 = m4.makeMessageType("livekit.agent.ChatMessage.ChatContent", () => [{ no: 1, name: "text", kind: "scalar", T: 9, oneof: "payload" }], { localName: "ChatMessage_ChatContent" });
var p3 = m4.makeMessageType("livekit.agent.FunctionCall", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "call_id", kind: "scalar", T: 9 }, { no: 3, name: "arguments", kind: "scalar", T: 9 }, { no: 4, name: "name", kind: "scalar", T: 9 }, { no: 5, name: "created_at", kind: "message", T: fe4 }, { no: 6, name: "extra", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var K6 = m4.makeMessageType("livekit.agent.FunctionCallOutput", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "call_id", kind: "scalar", T: 9 }, { no: 4, name: "output", kind: "scalar", T: 9 }, { no: 5, name: "is_error", kind: "scalar", T: 8 }, { no: 6, name: "created_at", kind: "message", T: fe4 }]);
var X6 = m4.makeMessageType("livekit.agent.AgentHandoff", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "old_agent_id", kind: "scalar", T: 9, opt: true }, { no: 3, name: "new_agent_id", kind: "scalar", T: 9 }, { no: 4, name: "created_at", kind: "message", T: fe4 }]);
var he3 = m4.makeMessageType("livekit.agent.AgentConfigUpdate", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "instructions", kind: "scalar", T: 9, opt: true }, { no: 3, name: "tools_added", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "tools_removed", kind: "scalar", T: 9, repeated: true }, { no: 5, name: "created_at", kind: "message", T: fe4 }]);
var Le3 = m4.makeMessageType("livekit.agent.ChatContext", () => [{ no: 1, name: "items", kind: "message", T: T8, repeated: true }]);
var T8 = m4.makeMessageType("livekit.agent.ChatContext.ChatItem", () => [{ no: 1, name: "message", kind: "message", T: B7, oneof: "item" }, { no: 2, name: "function_call", kind: "message", T: p3, oneof: "item" }, { no: 3, name: "function_call_output", kind: "message", T: K6, oneof: "item" }, { no: 4, name: "agent_handoff", kind: "message", T: X6, oneof: "item" }, { no: 5, name: "agent_config_update", kind: "message", T: he3, oneof: "item" }], { localName: "ChatContext_ChatItem" });
var qe3 = m4.makeMessageType("livekit.agent.LLMModelUsage", () => [{ no: 1, name: "provider", kind: "scalar", T: 9 }, { no: 2, name: "model", kind: "scalar", T: 9 }, { no: 3, name: "input_tokens", kind: "scalar", T: 5 }, { no: 4, name: "input_cached_tokens", kind: "scalar", T: 5 }, { no: 5, name: "input_audio_tokens", kind: "scalar", T: 5 }, { no: 6, name: "input_cached_audio_tokens", kind: "scalar", T: 5 }, { no: 7, name: "input_text_tokens", kind: "scalar", T: 5 }, { no: 8, name: "input_cached_text_tokens", kind: "scalar", T: 5 }, { no: 9, name: "input_image_tokens", kind: "scalar", T: 5 }, { no: 10, name: "input_cached_image_tokens", kind: "scalar", T: 5 }, { no: 11, name: "output_tokens", kind: "scalar", T: 5 }, { no: 12, name: "output_audio_tokens", kind: "scalar", T: 5 }, { no: 13, name: "output_text_tokens", kind: "scalar", T: 5 }, { no: 14, name: "session_duration", kind: "scalar", T: 1 }]);
var Fe3 = m4.makeMessageType("livekit.agent.TTSModelUsage", () => [{ no: 1, name: "provider", kind: "scalar", T: 9 }, { no: 2, name: "model", kind: "scalar", T: 9 }, { no: 3, name: "input_tokens", kind: "scalar", T: 5 }, { no: 4, name: "output_tokens", kind: "scalar", T: 5 }, { no: 5, name: "characters_count", kind: "scalar", T: 5 }, { no: 6, name: "audio_duration", kind: "scalar", T: 1 }]);
var Ge3 = m4.makeMessageType("livekit.agent.STTModelUsage", () => [{ no: 1, name: "provider", kind: "scalar", T: 9 }, { no: 2, name: "model", kind: "scalar", T: 9 }, { no: 3, name: "input_tokens", kind: "scalar", T: 5 }, { no: 4, name: "output_tokens", kind: "scalar", T: 5 }, { no: 5, name: "audio_duration", kind: "scalar", T: 1 }]);
var He3 = m4.makeMessageType("livekit.agent.InterruptionModelUsage", () => [{ no: 1, name: "provider", kind: "scalar", T: 9 }, { no: 2, name: "model", kind: "scalar", T: 9 }, { no: 3, name: "total_requests", kind: "scalar", T: 5 }]);
var Be3 = m4.makeMessageType("livekit.agent.EotModelUsage", () => [{ no: 1, name: "provider", kind: "scalar", T: 9 }, { no: 2, name: "model", kind: "scalar", T: 9 }, { no: 3, name: "total_requests", kind: "scalar", T: 5 }]);
var Ke3 = m4.makeMessageType("livekit.agent.ModelUsage", () => [{ no: 1, name: "llm", kind: "message", T: qe3, oneof: "usage" }, { no: 2, name: "tts", kind: "message", T: Fe3, oneof: "usage" }, { no: 3, name: "stt", kind: "message", T: Ge3, oneof: "usage" }, { no: 4, name: "interruption", kind: "message", T: He3, oneof: "usage" }, { no: 5, name: "eot", kind: "message", T: Be3, oneof: "usage" }]);
var Z6 = m4.makeMessageType("livekit.agent.AgentSessionUsage", () => [{ no: 1, name: "model_usage", kind: "message", T: Ke3, repeated: true }]);
var xe3 = m4.makeMessageType("livekit.agent.DebugMessage", () => [{ no: 1, name: "payload", kind: "message", T: $7 }]);
var Ve3 = m4.makeMessageType("livekit.agent.AgentSessionEvent", () => [{ no: 1, name: "created_at", kind: "message", T: fe4 }, { no: 10, name: "agent_state_changed", kind: "message", T: We2, oneof: "event" }, { no: 11, name: "user_state_changed", kind: "message", T: we3, oneof: "event" }, { no: 12, name: "conversation_item_added", kind: "message", T: Je3, oneof: "event" }, { no: 13, name: "user_input_transcribed", kind: "message", T: Ye3, oneof: "event" }, { no: 14, name: "function_tools_executed", kind: "message", T: ze3, oneof: "event" }, { no: 15, name: "error", kind: "message", T: Qe3, oneof: "event" }, { no: 16, name: "overlapping_speech", kind: "message", T: Xe3, oneof: "event" }, { no: 17, name: "session_usage_updated", kind: "message", T: en2, oneof: "event" }, { no: 18, name: "amd_prediction", kind: "message", T: $8, oneof: "event" }, { no: 19, name: "eot_prediction", kind: "message", T: $e3, oneof: "event" }, { no: 20, name: "function_tools_started", kind: "message", T: je3, oneof: "event" }, { no: 21, name: "debug_message", kind: "message", T: xe3, oneof: "event" }, { no: 22, name: "tool_execution_updated", kind: "message", T: nn2, oneof: "event" }, { no: 23, name: "agent_false_interruption", kind: "message", T: rn2, oneof: "event" }, { no: 24, name: "amd_completed", kind: "message", T: Ze3, oneof: "event" }, { no: 25, name: "session_closed", kind: "message", T: mn, oneof: "event" }]);
var We2 = m4.makeMessageType("livekit.agent.AgentSessionEvent.AgentStateChanged", () => [{ no: 1, name: "old_state", kind: "enum", T: m4.getEnumType(L7) }, { no: 2, name: "new_state", kind: "enum", T: m4.getEnumType(L7) }], { localName: "AgentSessionEvent_AgentStateChanged" });
var we3 = m4.makeMessageType("livekit.agent.AgentSessionEvent.UserStateChanged", () => [{ no: 1, name: "old_state", kind: "enum", T: m4.getEnumType(q7) }, { no: 2, name: "new_state", kind: "enum", T: m4.getEnumType(q7) }], { localName: "AgentSessionEvent_UserStateChanged" });
var Je3 = m4.makeMessageType("livekit.agent.AgentSessionEvent.ConversationItemAdded", () => [{ no: 1, name: "item", kind: "message", T: T8 }], { localName: "AgentSessionEvent_ConversationItemAdded" });
var Ye3 = m4.makeMessageType("livekit.agent.AgentSessionEvent.UserInputTranscribed", () => [{ no: 1, name: "transcript", kind: "scalar", T: 9 }, { no: 2, name: "is_final", kind: "scalar", T: 8 }, { no: 3, name: "language", kind: "scalar", T: 9, opt: true }], { localName: "AgentSessionEvent_UserInputTranscribed" });
var je3 = m4.makeMessageType("livekit.agent.AgentSessionEvent.FunctionToolsStarted", () => [{ no: 1, name: "function_calls", kind: "message", T: p3, repeated: true }], { localName: "AgentSessionEvent_FunctionToolsStarted" });
var ze3 = m4.makeMessageType("livekit.agent.AgentSessionEvent.FunctionToolsExecuted", () => [{ no: 1, name: "function_calls", kind: "message", T: p3, repeated: true }, { no: 2, name: "function_call_outputs", kind: "message", T: K6, repeated: true }], { localName: "AgentSessionEvent_FunctionToolsExecuted" });
var Qe3 = m4.makeMessageType("livekit.agent.AgentSessionEvent.Error", () => [{ no: 1, name: "message", kind: "scalar", T: 9 }], { localName: "AgentSessionEvent_Error" });
var Xe3 = m4.makeMessageType("livekit.agent.AgentSessionEvent.OverlappingSpeech", () => [{ no: 1, name: "is_interruption", kind: "scalar", T: 8 }, { no: 2, name: "overlap_started_at", kind: "message", T: fe4, opt: true }, { no: 3, name: "detection_delay", kind: "scalar", T: 1 }, { no: 4, name: "detected_at", kind: "message", T: fe4 }], { localName: "AgentSessionEvent_OverlappingSpeech" });
var $8 = m4.makeMessageType("livekit.agent.AgentSessionEvent.AmdPrediction", () => [{ no: 1, name: "speech_duration", kind: "message", T: oe4 }, { no: 2, name: "category", kind: "enum", T: m4.getEnumType(F7) }, { no: 3, name: "reason", kind: "scalar", T: 9 }, { no: 4, name: "transcript", kind: "scalar", T: 9 }, { no: 5, name: "delay", kind: "message", T: oe4 }, { no: 6, name: "turn_id", kind: "scalar", T: 13 }, { no: 7, name: "stage", kind: "enum", T: m4.getEnumType(F7) }, { no: 8, name: "inference_duration", kind: "message", T: oe4 }], { localName: "AgentSessionEvent_AmdPrediction" });
var Ze3 = m4.makeMessageType("livekit.agent.AgentSessionEvent.AmdCompleted", () => [{ no: 1, name: "category", kind: "enum", T: m4.getEnumType(F7) }, { no: 2, name: "reason", kind: "scalar", T: 9 }, { no: 3, name: "voicemail_message_played", kind: "scalar", T: 8 }, { no: 4, name: "prediction", kind: "message", T: $8 }], { localName: "AgentSessionEvent_AmdCompleted" });
var $e3 = m4.makeMessageType("livekit.agent.AgentSessionEvent.EotPrediction", () => [{ no: 1, name: "probability", kind: "scalar", T: 2 }, { no: 2, name: "threshold", kind: "scalar", T: 2 }, { no: 3, name: "inference_duration", kind: "message", T: oe4 }, { no: 4, name: "delay", kind: "message", T: oe4 }], { localName: "AgentSessionEvent_EotPrediction" });
var en2 = m4.makeMessageType("livekit.agent.AgentSessionEvent.SessionUsageUpdated", () => [{ no: 1, name: "usage", kind: "message", T: Z6 }], { localName: "AgentSessionEvent_SessionUsageUpdated" });
var nn2 = m4.makeMessageType("livekit.agent.AgentSessionEvent.ToolExecutionUpdated", () => [{ no: 1, name: "started", kind: "message", T: an2, oneof: "update" }, { no: 2, name: "call_updated", kind: "message", T: sn2, oneof: "update" }, { no: 3, name: "reply_updated", kind: "message", T: tn2, oneof: "update" }, { no: 4, name: "ended", kind: "message", T: on2, oneof: "update" }], { localName: "AgentSessionEvent_ToolExecutionUpdated" });
var an2 = m4.makeMessageType("livekit.agent.AgentSessionEvent.ToolExecutionUpdated.Started", () => [{ no: 1, name: "function_call", kind: "message", T: p3 }], { localName: "AgentSessionEvent_ToolExecutionUpdated_Started" });
var sn2 = m4.makeMessageType("livekit.agent.AgentSessionEvent.ToolExecutionUpdated.CallUpdated", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "call_id", kind: "scalar", T: 9 }, { no: 3, name: "message", kind: "scalar", T: 9 }], { localName: "AgentSessionEvent_ToolExecutionUpdated_CallUpdated" });
var on2 = m4.makeMessageType("livekit.agent.AgentSessionEvent.ToolExecutionUpdated.Ended", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "call_id", kind: "scalar", T: 9 }, { no: 3, name: "message", kind: "scalar", T: 9, opt: true }, { no: 4, name: "status", kind: "enum", T: m4.getEnumType(Pe3) }], { localName: "AgentSessionEvent_ToolExecutionUpdated_Ended" });
var tn2 = m4.makeMessageType("livekit.agent.AgentSessionEvent.ToolExecutionUpdated.ReplyUpdated", () => [{ no: 1, name: "update_ids", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "status", kind: "enum", T: m4.getEnumType(De3) }, { no: 3, name: "speech_id", kind: "scalar", T: 9 }], { localName: "AgentSessionEvent_ToolExecutionUpdated_ReplyUpdated" });
var mn = m4.makeMessageType("livekit.agent.AgentSessionEvent.SessionClosed", () => [{ no: 1, name: "reason", kind: "enum", T: m4.getEnumType(Oe3) }, { no: 2, name: "error", kind: "scalar", T: 9, opt: true }], { localName: "AgentSessionEvent_SessionClosed" });
var rn2 = m4.makeMessageType("livekit.agent.AgentSessionEvent.AgentFalseInterruption", () => [{ no: 1, name: "resumed", kind: "scalar", T: 8 }], { localName: "AgentSessionEvent_AgentFalseInterruption" });
var dn2 = m4.makeMessageType("livekit.agent.SessionRequest", () => [{ no: 1, name: "request_id", kind: "scalar", T: 9 }, { no: 2, name: "ping", kind: "message", T: Tn2, oneof: "request" }, { no: 4, name: "get_chat_history", kind: "message", T: kn2, oneof: "request" }, { no: 5, name: "run_input", kind: "message", T: cn, oneof: "request" }, { no: 6, name: "get_agent_info", kind: "message", T: ln, oneof: "request" }, { no: 7, name: "get_session_state", kind: "message", T: _n2, oneof: "request" }, { no: 8, name: "get_rtc_stats", kind: "message", T: pn, oneof: "request" }, { no: 9, name: "get_session_usage", kind: "message", T: un2, oneof: "request" }, { no: 10, name: "get_framework_info", kind: "message", T: gn2, oneof: "request" }, { no: 11, name: "update_io", kind: "message", T: Sn2, oneof: "request" }, { no: 12, name: "finalize_simulation", kind: "message", T: In2, oneof: "request" }]);
var Tn2 = m4.makeMessageType("livekit.agent.SessionRequest.Ping", [], { localName: "SessionRequest_Ping" });
var kn2 = m4.makeMessageType("livekit.agent.SessionRequest.GetChatHistory", [], { localName: "SessionRequest_GetChatHistory" });
var cn = m4.makeMessageType("livekit.agent.SessionRequest.RunInput", () => [{ no: 1, name: "text", kind: "scalar", T: 9 }], { localName: "SessionRequest_RunInput" });
var ln = m4.makeMessageType("livekit.agent.SessionRequest.GetAgentInfo", [], { localName: "SessionRequest_GetAgentInfo" });
var _n2 = m4.makeMessageType("livekit.agent.SessionRequest.GetSessionState", [], { localName: "SessionRequest_GetSessionState" });
var pn = m4.makeMessageType("livekit.agent.SessionRequest.GetRTCStats", [], { localName: "SessionRequest_GetRTCStats" });
var un2 = m4.makeMessageType("livekit.agent.SessionRequest.GetSessionUsage", [], { localName: "SessionRequest_GetSessionUsage" });
var gn2 = m4.makeMessageType("livekit.agent.SessionRequest.GetFrameworkInfo", [], { localName: "SessionRequest_GetFrameworkInfo" });
var Sn2 = m4.makeMessageType("livekit.agent.SessionRequest.UpdateIO", () => [{ no: 1, name: "input", kind: "message", T: En2, opt: true }, { no: 2, name: "output", kind: "message", T: Rn2, opt: true }], { localName: "SessionRequest_UpdateIO" });
var En2 = m4.makeMessageType("livekit.agent.SessionRequest.UpdateIO.Input", () => [{ no: 1, name: "audio_enabled", kind: "scalar", T: 8, opt: true }, { no: 2, name: "video_enabled", kind: "scalar", T: 8, opt: true }], { localName: "SessionRequest_UpdateIO_Input" });
var Rn2 = m4.makeMessageType("livekit.agent.SessionRequest.UpdateIO.Output", () => [{ no: 1, name: "audio_enabled", kind: "scalar", T: 8, opt: true }, { no: 2, name: "video_enabled", kind: "scalar", T: 8, opt: true }, { no: 3, name: "transcription_enabled", kind: "scalar", T: 8, opt: true }], { localName: "SessionRequest_UpdateIO_Output" });
var In2 = m4.makeMessageType("livekit.agent.SessionRequest.FinalizeSimulation", () => [{ no: 1, name: "provisional_success", kind: "scalar", T: 8 }, { no: 2, name: "provisional_reason", kind: "scalar", T: 9 }], { localName: "SessionRequest_FinalizeSimulation" });
var yn2 = m4.makeMessageType("livekit.agent.SessionResponse", () => [{ no: 1, name: "request_id", kind: "scalar", T: 9 }, { no: 2, name: "error", kind: "scalar", T: 9, opt: true }, { no: 3, name: "pong", kind: "message", T: An2, oneof: "response" }, { no: 5, name: "get_chat_history", kind: "message", T: vn2, oneof: "response" }, { no: 6, name: "run_input", kind: "message", T: Nn2, oneof: "response" }, { no: 7, name: "get_agent_info", kind: "message", T: Mn, oneof: "response" }, { no: 8, name: "get_session_state", kind: "message", T: fn, oneof: "response" }, { no: 9, name: "get_rtc_stats", kind: "message", T: Cn, oneof: "response" }, { no: 10, name: "get_session_usage", kind: "message", T: Pn2, oneof: "response" }, { no: 11, name: "get_framework_info", kind: "message", T: Dn2, oneof: "response" }, { no: 12, name: "update_io", kind: "message", T: On, oneof: "response" }, { no: 13, name: "finalize_simulation", kind: "message", T: Un2, oneof: "response" }]);
var An2 = m4.makeMessageType("livekit.agent.SessionResponse.Pong", [], { localName: "SessionResponse_Pong" });
var vn2 = m4.makeMessageType("livekit.agent.SessionResponse.GetChatHistoryResponse", () => [{ no: 1, name: "items", kind: "message", T: T8, repeated: true }], { localName: "SessionResponse_GetChatHistoryResponse" });
var Mn = m4.makeMessageType("livekit.agent.SessionResponse.GetAgentInfoResponse", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "instructions", kind: "scalar", T: 9, opt: true }, { no: 3, name: "tools", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "chat_ctx", kind: "message", T: T8, repeated: true }], { localName: "SessionResponse_GetAgentInfoResponse" });
var Nn2 = m4.makeMessageType("livekit.agent.SessionResponse.RunInputResponse", () => [{ no: 1, name: "items", kind: "message", T: T8, repeated: true }], { localName: "SessionResponse_RunInputResponse" });
var fn = m4.makeMessageType("livekit.agent.SessionResponse.GetSessionStateResponse", () => [{ no: 1, name: "agent_state", kind: "enum", T: m4.getEnumType(L7) }, { no: 2, name: "user_state", kind: "enum", T: m4.getEnumType(q7) }, { no: 3, name: "agent_id", kind: "scalar", T: 9 }, { no: 4, name: "options", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 5, name: "created_at", kind: "message", T: fe4 }], { localName: "SessionResponse_GetSessionStateResponse" });
var Cn = m4.makeMessageType("livekit.agent.SessionResponse.GetRTCStatsResponse", () => [{ no: 1, name: "publisher_stats", kind: "message", T: $7, repeated: true }, { no: 2, name: "subscriber_stats", kind: "message", T: $7, repeated: true }], { localName: "SessionResponse_GetRTCStatsResponse" });
var Pn2 = m4.makeMessageType("livekit.agent.SessionResponse.GetSessionUsageResponse", () => [{ no: 1, name: "usage", kind: "message", T: Z6 }, { no: 2, name: "created_at", kind: "message", T: fe4 }], { localName: "SessionResponse_GetSessionUsageResponse" });
var Dn2 = m4.makeMessageType("livekit.agent.SessionResponse.GetFrameworkInfoResponse", () => [{ no: 1, name: "sdk", kind: "scalar", T: 9 }, { no: 2, name: "sdk_version", kind: "scalar", T: 9 }], { localName: "SessionResponse_GetFrameworkInfoResponse" });
var On = m4.makeMessageType("livekit.agent.SessionResponse.UpdateIOResponse", [], { localName: "SessionResponse_UpdateIOResponse" });
var Un2 = m4.makeMessageType("livekit.agent.SessionResponse.FinalizeSimulationResponse", () => [{ no: 1, name: "user_verdict", kind: "message", T: bn2 }], { localName: "SessionResponse_FinalizeSimulationResponse" });
var bn2 = m4.makeMessageType("livekit.agent.SessionResponse.FinalizeSimulationResponse.SimulationVerdict", () => [{ no: 1, name: "success", kind: "scalar", T: 8 }, { no: 2, name: "reason", kind: "scalar", T: 9 }], { localName: "SessionResponse_FinalizeSimulationResponse_SimulationVerdict" });
var Os = m4.makeMessageType("livekit.agent.AgentSessionMessage", () => [{ no: 1, name: "audio_input", kind: "message", T: j7, oneof: "message" }, { no: 2, name: "audio_output", kind: "message", T: j7, oneof: "message" }, { no: 3, name: "event", kind: "message", T: Ve3, oneof: "message" }, { no: 4, name: "request", kind: "message", T: dn2, oneof: "message" }, { no: 5, name: "response", kind: "message", T: yn2, oneof: "message" }, { no: 6, name: "audio_playback_flush", kind: "message", T: hn2, oneof: "message" }, { no: 7, name: "audio_playback_clear", kind: "message", T: Ln2, oneof: "message" }, { no: 8, name: "audio_playback_finished", kind: "message", T: qn, oneof: "message" }]);
var Us = m4.makeMessageType("livekit.agent.AgentSessionMessage.ConsoleIO", [], { localName: "AgentSessionMessage_ConsoleIO" });
var j7 = m4.makeMessageType("livekit.agent.AgentSessionMessage.ConsoleIO.AudioFrame", () => [{ no: 1, name: "data", kind: "scalar", T: 12 }, { no: 2, name: "sample_rate", kind: "scalar", T: 13 }, { no: 3, name: "num_channels", kind: "scalar", T: 13 }, { no: 4, name: "samples_per_channel", kind: "scalar", T: 13 }], { localName: "AgentSessionMessage_ConsoleIO_AudioFrame" });
var hn2 = m4.makeMessageType("livekit.agent.AgentSessionMessage.ConsoleIO.AudioPlaybackFlush", [], { localName: "AgentSessionMessage_ConsoleIO_AudioPlaybackFlush" });
var Ln2 = m4.makeMessageType("livekit.agent.AgentSessionMessage.ConsoleIO.AudioPlaybackClear", [], { localName: "AgentSessionMessage_ConsoleIO_AudioPlaybackClear" });
var qn = m4.makeMessageType("livekit.agent.AgentSessionMessage.ConsoleIO.AudioPlaybackFinished", [], { localName: "AgentSessionMessage_ConsoleIO_AudioPlaybackFinished" });
var bs = m4.makeMessageType("livekit.agent.AgentThread", []);
var Fn2 = m4.makeEnum("livekit.agent.AgentThread.SortOrder", [{ no: 0, name: "SORT_ORDER_UNSPECIFIED", localName: "UNSPECIFIED" }, { no: 1, name: "SORT_ORDER_ASC", localName: "ASC" }, { no: 2, name: "SORT_ORDER_DESC", localName: "DESC" }]);
var hs = m4.makeMessageType("livekit.agent.AgentThread.CreateRequest", () => [{ no: 1, name: "scope", kind: "scalar", T: 9 }, { no: 2, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 3, name: "idle_ttl", kind: "message", T: oe4 }], { localName: "AgentThread_CreateRequest" });
var Ls = m4.makeMessageType("livekit.agent.AgentThread.GetRequest", () => [{ no: 1, name: "thread_id", kind: "scalar", T: 9 }], { localName: "AgentThread_GetRequest" });
var qs = m4.makeMessageType("livekit.agent.AgentThread.ListRequest", () => [{ no: 1, name: "scope", kind: "scalar", T: 9 }, { no: 2, name: "page_token", kind: "scalar", T: 9 }, { no: 3, name: "limit", kind: "scalar", T: 5 }], { localName: "AgentThread_ListRequest" });
var Fs = m4.makeMessageType("livekit.agent.AgentThread.ListResponse", () => [{ no: 1, name: "threads", kind: "message", T: Hn, repeated: true }, { no: 2, name: "next_page_token", kind: "scalar", T: 9 }], { localName: "AgentThread_ListResponse" });
var Gs = m4.makeMessageType("livekit.agent.AgentThread.UpdateRequest", () => [{ no: 1, name: "thread_id", kind: "scalar", T: 9 }, { no: 2, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 3, name: "idle_ttl", kind: "message", T: oe4 }], { localName: "AgentThread_UpdateRequest" });
var Hs = m4.makeMessageType("livekit.agent.AgentThread.DeleteRequest", () => [{ no: 1, name: "thread_id", kind: "scalar", T: 9 }], { localName: "AgentThread_DeleteRequest" });
var Bs = m4.makeMessageType("livekit.agent.AgentThread.DeleteResponse", [], { localName: "AgentThread_DeleteResponse" });
var Ks = m4.makeMessageType("livekit.agent.AgentThread.GetItemsRequest", () => [{ no: 1, name: "thread_id", kind: "scalar", T: 9 }, { no: 2, name: "agent", kind: "scalar", T: 9 }, { no: 3, name: "page_token", kind: "scalar", T: 9 }, { no: 4, name: "limit", kind: "scalar", T: 5 }, { no: 5, name: "sort_order", kind: "enum", T: m4.getEnumType(Fn2) }], { localName: "AgentThread_GetItemsRequest" });
var xs = m4.makeMessageType("livekit.agent.AgentThread.GetItemsResponse", () => [{ no: 1, name: "items", kind: "message", T: Gn, repeated: true }, { no: 2, name: "next_page_token", kind: "scalar", T: 9 }], { localName: "AgentThread_GetItemsResponse" });
var Gn = m4.makeMessageType("livekit.agent.AgentThread.Item", () => [{ no: 1, name: "agent", kind: "scalar", T: 9 }, { no: 2, name: "seq", kind: "scalar", T: 3 }, { no: 3, name: "message_id", kind: "scalar", T: 9 }, { no: 4, name: "item", kind: "message", T: T8 }], { localName: "AgentThread_Item" });
var Hn = m4.makeMessageType("livekit.agent.AgentThread.Thread", () => [{ no: 1, name: "thread_id", kind: "scalar", T: 9 }, { no: 2, name: "scope", kind: "scalar", T: 9 }, { no: 3, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 4, name: "created_at", kind: "message", T: fe4 }, { no: 5, name: "last_active", kind: "message", T: fe4 }, { no: 6, name: "expires_at", kind: "message", T: fe4 }, { no: 7, name: "idle_ttl", kind: "message", T: oe4 }, { no: 8, name: "database_id", kind: "scalar", T: 9 }], { localName: "AgentThread_Thread" });
var Vs = m4.makeMessageType("livekit.agent.AgentTask", []);
var ee6 = m4.makeEnum("livekit.agent.AgentTask.Status", [{ no: 0, name: "UNSPECIFIED" }, { no: 1, name: "RUNNING" }, { no: 2, name: "COMPLETED" }, { no: 3, name: "FAILED" }, { no: 4, name: "CANCELED" }]);
var Ws = m4.makeMessageType("livekit.agent.AgentTask.GetTasksRequest", () => [{ no: 1, name: "thread_id", kind: "scalar", T: 9 }, { no: 2, name: "status", kind: "enum", T: m4.getEnumType(ee6), opt: true }, { no: 3, name: "page_token", kind: "scalar", T: 9 }, { no: 4, name: "limit", kind: "scalar", T: 5 }], { localName: "AgentTask_GetTasksRequest" });
var ws = m4.makeMessageType("livekit.agent.AgentTask.GetTasksResponse", () => [{ no: 1, name: "tasks", kind: "message", T: Bn2, repeated: true }, { no: 2, name: "next_page_token", kind: "scalar", T: 9 }], { localName: "AgentTask_GetTasksResponse" });
var Bn2 = m4.makeMessageType("livekit.agent.AgentTask.Task", () => [{ no: 1, name: "task_id", kind: "scalar", T: 9 }, { no: 2, name: "thread_id", kind: "scalar", T: 9 }, { no: 3, name: "name", kind: "scalar", T: 9 }, { no: 4, name: "status", kind: "enum", T: m4.getEnumType(ee6) }, { no: 5, name: "updated_at", kind: "message", T: fe4 }], { localName: "AgentTask_Task" });
var x8 = m4.makeEnum("livekit.agent.AudioEncoding", [{ no: 0, name: "AUDIO_ENCODING_PCM_S16LE", localName: "PCM_S16LE" }, { no: 1, name: "AUDIO_ENCODING_OPUS", localName: "OPUS" }]);
var Kn = m4.makeMessageType("livekit.agent.SessionSettings", () => [{ no: 1, name: "sample_rate", kind: "scalar", T: 13 }, { no: 2, name: "encoding", kind: "enum", T: m4.getEnumType(x8) }, { no: 3, name: "eot_settings", kind: "message", T: Vn2, oneof: "type_settings" }, { no: 4, name: "interruption_settings", kind: "message", T: Wn, oneof: "type_settings" }]);
var xn2 = m4.makeMessageType("livekit.agent.InferenceError", () => [{ no: 1, name: "message", kind: "scalar", T: 9 }, { no: 2, name: "code", kind: "scalar", T: 13 }]);
var Vn2 = m4.makeMessageType("livekit.agent.EotSettings", () => [{ no: 1, name: "detection_interval", kind: "message", T: oe4 }]);
var Wn = m4.makeMessageType("livekit.agent.InterruptionSettings", () => [{ no: 1, name: "threshold", kind: "scalar", T: 2 }, { no: 2, name: "min_frames", kind: "scalar", T: 13 }, { no: 3, name: "max_audio_duration", kind: "message", T: oe4 }, { no: 4, name: "audio_prefix_duration", kind: "message", T: oe4 }, { no: 5, name: "detection_interval", kind: "message", T: oe4 }]);
var wn2 = m4.makeMessageType("livekit.agent.SessionCreate", () => [{ no: 1, name: "settings", kind: "message", T: Kn }]);
var Jn2 = m4.makeMessageType("livekit.agent.InputAudio", () => [{ no: 1, name: "audio", kind: "scalar", T: 12 }, { no: 2, name: "created_at", kind: "message", T: fe4 }, { no: 3, name: "num_samples", kind: "scalar", T: 13 }]);
var Yn2 = m4.makeMessageType("livekit.agent.EotInputChatContext", () => [{ no: 1, name: "messages", kind: "message", T: B7, repeated: true }]);
var jn = m4.makeMessageType("livekit.agent.SessionFlush", []);
var zn = m4.makeMessageType("livekit.agent.SessionClose", []);
var Qn = m4.makeMessageType("livekit.agent.InferenceStart", () => [{ no: 1, name: "request_id", kind: "scalar", T: 9 }, { no: 2, name: "turn_samples", kind: "scalar", T: 13 }]);
var Xn = m4.makeMessageType("livekit.agent.InferenceStop", () => [{ no: 1, name: "request_id", kind: "scalar", T: 9 }]);
var Zn = m4.makeMessageType("livekit.agent.BufferStart", []);
var $n = m4.makeMessageType("livekit.agent.BufferStop", []);
var Js = m4.makeMessageType("livekit.agent.ClientMessage", () => [{ no: 1, name: "created_at", kind: "message", T: fe4 }, { no: 2, name: "session_create", kind: "message", T: wn2, oneof: "message" }, { no: 3, name: "input_audio", kind: "message", T: Jn2, oneof: "message" }, { no: 4, name: "session_flush", kind: "message", T: jn, oneof: "message" }, { no: 5, name: "session_close", kind: "message", T: zn, oneof: "message" }, { no: 6, name: "inference_start", kind: "message", T: Qn, oneof: "message" }, { no: 7, name: "inference_stop", kind: "message", T: Xn, oneof: "message" }, { no: 8, name: "buffer_start", kind: "message", T: Zn, oneof: "message" }, { no: 9, name: "buffer_stop", kind: "message", T: $n, oneof: "message" }, { no: 10, name: "eot_input_chat_context", kind: "message", T: Yn2, oneof: "message" }]);
var ea = m4.makeMessageType("livekit.agent.EotInferenceRequest", () => [{ no: 1, name: "audio", kind: "scalar", T: 12 }, { no: 2, name: "assistant_text", kind: "scalar", T: 9 }, { no: 3, name: "encoding", kind: "enum", T: m4.getEnumType(x8) }, { no: 4, name: "sample_rate", kind: "scalar", T: 13 }]);
var na = m4.makeMessageType("livekit.agent.InterruptionInferenceRequest", () => [{ no: 1, name: "audio", kind: "scalar", T: 12 }, { no: 2, name: "encoding", kind: "enum", T: m4.getEnumType(x8) }, { no: 3, name: "sample_rate", kind: "scalar", T: 13 }]);
var Ys = m4.makeMessageType("livekit.agent.InferenceRequest", () => [{ no: 1, name: "eot_inference_request", kind: "message", T: ea, oneof: "request" }, { no: 2, name: "interruption_inference_request", kind: "message", T: na, oneof: "request" }]);
var N9 = m4.makeMessageType("livekit.agent.InferenceStats", () => [{ no: 1, name: "earliest_client_created_at", kind: "message", T: fe4, opt: true }, { no: 2, name: "latest_client_created_at", kind: "message", T: fe4, opt: true }, { no: 3, name: "client_e2e_latency", kind: "message", T: oe4, opt: true }, { no: 4, name: "server_e2e_latency", kind: "message", T: oe4 }, { no: 5, name: "preprocessing_duration", kind: "message", T: oe4 }, { no: 6, name: "inference_duration", kind: "message", T: oe4 }]);
var aa = m4.makeMessageType("livekit.agent.EotInferenceResponse", () => [{ no: 1, name: "probability", kind: "scalar", T: 2 }, { no: 2, name: "stats", kind: "message", T: N9 }]);
var sa = m4.makeMessageType("livekit.agent.InterruptionInferenceResponse", () => [{ no: 1, name: "is_interruption", kind: "scalar", T: 8 }, { no: 2, name: "probabilities", kind: "scalar", T: 2, repeated: true }, { no: 3, name: "stats", kind: "message", T: N9 }]);
var js = m4.makeMessageType("livekit.agent.InferenceResponse", () => [{ no: 1, name: "eot_inference_response", kind: "message", T: aa, oneof: "response" }, { no: 2, name: "interruption_inference_response", kind: "message", T: sa, oneof: "response" }]);
var oa = m4.makeMessageType("livekit.agent.SessionCreated", () => [{ no: 1, name: "default_thresholds", kind: "map", K: 9, V: { kind: "scalar", T: 2 } }, { no: 2, name: "default_threshold", kind: "scalar", T: 2 }, { no: 3, name: "default_backchannel_thresholds", kind: "map", K: 9, V: { kind: "scalar", T: 2 } }, { no: 4, name: "default_backchannel_threshold", kind: "scalar", T: 2 }]);
var ta = m4.makeMessageType("livekit.agent.InferenceStarted", []);
var ia = m4.makeMessageType("livekit.agent.InferenceStopped", []);
var ma = m4.makeMessageType("livekit.agent.SessionClosed", []);
var ra = m4.makeMessageType("livekit.agent.EotPrediction", () => [{ no: 1, name: "probability", kind: "scalar", T: 2 }, { no: 2, name: "inference_stats", kind: "message", T: N9 }, { no: 3, name: "backend", kind: "enum", T: m4.getEnumType(da) }, { no: 4, name: "backchannel_probability", kind: "scalar", T: 2 }]);
var da = m4.makeEnum("livekit.agent.EotPrediction.EotBackend", [{ no: 0, name: "EOT_BACKEND_UNKNOWN", localName: "UNKNOWN" }, { no: 1, name: "EOT_BACKEND_MULTIMODAL", localName: "MULTIMODAL" }, { no: 2, name: "EOT_BACKEND_TEXT", localName: "TEXT" }]);
var Ta = m4.makeMessageType("livekit.agent.InterruptionPrediction", () => [{ no: 1, name: "is_interruption", kind: "scalar", T: 8 }, { no: 2, name: "probabilities", kind: "scalar", T: 2, repeated: true }, { no: 3, name: "inference_stats", kind: "message", T: N9 }]);
var zs = m4.makeMessageType("livekit.agent.ServerMessage", () => [{ no: 1, name: "server_created_at", kind: "message", T: fe4 }, { no: 2, name: "request_id", kind: "scalar", T: 9, opt: true }, { no: 3, name: "client_created_at", kind: "message", T: fe4, opt: true }, { no: 4, name: "session_created", kind: "message", T: oa, oneof: "message" }, { no: 5, name: "inference_started", kind: "message", T: ta, oneof: "message" }, { no: 6, name: "inference_stopped", kind: "message", T: ia, oneof: "message" }, { no: 7, name: "session_closed", kind: "message", T: ma, oneof: "message" }, { no: 8, name: "error", kind: "message", T: xn2, oneof: "message" }, { no: 9, name: "eot_prediction", kind: "message", T: ra, oneof: "message" }, { no: 10, name: "interruption_prediction", kind: "message", T: Ta, oneof: "message" }]);
var ka = m4.makeEnum("livekit.agent.TextMessageErrorCode", [{ no: 0, name: "INTERNAL_ERROR" }, { no: 1, name: "SESSION_STATE_NOT_FOUND" }, { no: 2, name: "TEXT_HANDLER_ERROR" }, { no: 3, name: "PROCESS_CLOSED" }]);
var Qs = m4.makeMessageType("livekit.agent.TextMessageRequest", () => [{ no: 1, name: "text", kind: "scalar", T: 9 }, { no: 2, name: "message_id", kind: "scalar", T: 9 }, { no: 3, name: "session_id", kind: "scalar", T: 9 }, { no: 4, name: "agent_name", kind: "scalar", T: 9 }, { no: 5, name: "metadata", kind: "scalar", T: 9 }, { no: 6, name: "session_state", kind: "message", T: ne6, opt: true }]);
var Xs = m4.makeMessageType("livekit.agent.TextMessageResponse", () => [{ no: 1, name: "message_id", kind: "scalar", T: 9 }, { no: 2, name: "session_id", kind: "scalar", T: 9 }, { no: 3, name: "message", kind: "message", T: B7, oneof: "event" }, { no: 4, name: "function_call", kind: "message", T: p3, oneof: "event" }, { no: 5, name: "function_call_output", kind: "message", T: K6, oneof: "event" }, { no: 6, name: "agent_handoff", kind: "message", T: X6, oneof: "event" }, { no: 7, name: "complete", kind: "message", T: ca, oneof: "event" }]);
var ca = m4.makeMessageType("livekit.agent.TextMessageComplete", () => [{ no: 1, name: "session_state", kind: "message", T: ne6, oneof: "result" }, { no: 2, name: "error", kind: "message", T: la, oneof: "result" }]);
var ne6 = m4.makeMessageType("livekit.agent.AgentSessionState", () => [{ no: 1, name: "version", kind: "scalar", T: 4 }, { no: 2, name: "snapshot", kind: "scalar", T: 12, oneof: "data" }, { no: 3, name: "delta", kind: "scalar", T: 12, oneof: "data" }]);
var la = m4.makeMessageType("livekit.agent.TextMessageError", () => [{ no: 1, name: "message", kind: "scalar", T: 9 }, { no: 2, name: "code", kind: "enum", T: m4.getEnumType(ka) }]);
var Zs = m4.makeMessageType("livekit.agent.AgentDevMessage", () => [{ no: 1, name: "get_running_jobs_request", kind: "message", T: pa, oneof: "message" }, { no: 2, name: "get_running_jobs_response", kind: "message", T: ua, oneof: "message" }, { no: 3, name: "server_info", kind: "message", T: _a, oneof: "message" }]);
var _a = m4.makeMessageType("livekit.agent.ServerInfo", () => [{ no: 1, name: "agent_name", kind: "scalar", T: 9 }, { no: 2, name: "url", kind: "scalar", T: 9 }]);
var pa = m4.makeMessageType("livekit.agent.GetRunningAgentJobsRequest", []);
var ua = m4.makeMessageType("livekit.agent.GetRunningAgentJobsResponse", () => [{ no: 1, name: "jobs", kind: "message", T: ga, repeated: true }]);
var ga = m4.makeMessageType("livekit.agent.RunningAgentJobInfo", () => [{ no: 1, name: "job", kind: "scalar", T: 12 }, { no: 2, name: "accept_name", kind: "scalar", T: 9 }, { no: 3, name: "accept_identity", kind: "scalar", T: 9 }, { no: 4, name: "accept_metadata", kind: "scalar", T: 9 }, { no: 5, name: "url", kind: "scalar", T: 9 }, { no: 6, name: "token", kind: "scalar", T: 9 }, { no: 7, name: "worker_id", kind: "scalar", T: 9 }, { no: 8, name: "mock_job", kind: "scalar", T: 8 }]);
var xm = m4.makeEnum("livekit.MetricLabel", [{ no: 0, name: "AGENTS_LLM_TTFT" }, { no: 1, name: "AGENTS_STT_TTFT" }, { no: 2, name: "AGENTS_TTS_TTFB" }, { no: 3, name: "CLIENT_VIDEO_SUBSCRIBER_FREEZE_COUNT" }, { no: 4, name: "CLIENT_VIDEO_SUBSCRIBER_TOTAL_FREEZE_DURATION" }, { no: 5, name: "CLIENT_VIDEO_SUBSCRIBER_PAUSE_COUNT" }, { no: 6, name: "CLIENT_VIDEO_SUBSCRIBER_TOTAL_PAUSES_DURATION" }, { no: 7, name: "CLIENT_AUDIO_SUBSCRIBER_CONCEALED_SAMPLES" }, { no: 8, name: "CLIENT_AUDIO_SUBSCRIBER_SILENT_CONCEALED_SAMPLES" }, { no: 9, name: "CLIENT_AUDIO_SUBSCRIBER_CONCEALMENT_EVENTS" }, { no: 10, name: "CLIENT_AUDIO_SUBSCRIBER_INTERRUPTION_COUNT" }, { no: 11, name: "CLIENT_AUDIO_SUBSCRIBER_TOTAL_INTERRUPTION_DURATION" }, { no: 12, name: "CLIENT_SUBSCRIBER_JITTER_BUFFER_DELAY" }, { no: 13, name: "CLIENT_SUBSCRIBER_JITTER_BUFFER_EMITTED_COUNT" }, { no: 14, name: "CLIENT_VIDEO_PUBLISHER_QUALITY_LIMITATION_DURATION_BANDWIDTH" }, { no: 15, name: "CLIENT_VIDEO_PUBLISHER_QUALITY_LIMITATION_DURATION_CPU" }, { no: 16, name: "CLIENT_VIDEO_PUBLISHER_QUALITY_LIMITATION_DURATION_OTHER" }, { no: 17, name: "PUBLISHER_RTT" }, { no: 18, name: "SERVER_MESH_RTT" }, { no: 19, name: "SUBSCRIBER_RTT" }, { no: 4096, name: "METRIC_LABEL_PREDEFINED_MAX_VALUE" }]);
var $s = m4.makeMessageType("livekit.MetricsBatch", () => [{ no: 1, name: "timestamp_ms", kind: "scalar", T: 3 }, { no: 2, name: "normalized_timestamp", kind: "message", T: fe4 }, { no: 3, name: "str_data", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "time_series", kind: "message", T: eo, repeated: true }, { no: 5, name: "events", kind: "message", T: ao, repeated: true }]);
var eo = m4.makeMessageType("livekit.TimeSeriesMetric", () => [{ no: 1, name: "label", kind: "scalar", T: 13 }, { no: 2, name: "participant_identity", kind: "scalar", T: 13 }, { no: 3, name: "track_sid", kind: "scalar", T: 13 }, { no: 4, name: "samples", kind: "message", T: no, repeated: true }, { no: 5, name: "rid", kind: "scalar", T: 13 }]);
var no = m4.makeMessageType("livekit.MetricSample", () => [{ no: 1, name: "timestamp_ms", kind: "scalar", T: 3 }, { no: 2, name: "normalized_timestamp", kind: "message", T: fe4 }, { no: 3, name: "value", kind: "scalar", T: 2 }]);
var ao = m4.makeMessageType("livekit.EventMetric", () => [{ no: 1, name: "label", kind: "scalar", T: 13 }, { no: 2, name: "participant_identity", kind: "scalar", T: 13 }, { no: 3, name: "track_sid", kind: "scalar", T: 13 }, { no: 4, name: "start_timestamp_ms", kind: "scalar", T: 3 }, { no: 5, name: "end_timestamp_ms", kind: "scalar", T: 3, opt: true }, { no: 6, name: "normalized_start_timestamp", kind: "message", T: fe4 }, { no: 7, name: "normalized_end_timestamp", kind: "message", T: fe4, opt: true }, { no: 8, name: "metadata", kind: "scalar", T: 9 }, { no: 9, name: "rid", kind: "scalar", T: 13 }]);
var Vm = m4.makeMessageType("livekit.MetricsRecordingHeader", () => [{ no: 1, name: "room_id", kind: "scalar", T: 9 }, { no: 3, name: "duration", kind: "scalar", T: 4 }, { no: 4, name: "start_time", kind: "message", T: fe4 }, { no: 5, name: "room_tags", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 6, name: "room_name", kind: "scalar", T: 9 }, { no: 7, name: "room_start_time", kind: "message", T: fe4 }, { no: 8, name: "job_id", kind: "scalar", T: 9 }, { no: 9, name: "simulated", kind: "scalar", T: 8 }, { no: 10, name: "redaction_enabled", kind: "scalar", T: 8 }, { no: 11, name: "session_summary", kind: "scalar", T: 9 }]);
var Sa = m4.makeEnum("livekit.AudioCodec", [{ no: 0, name: "DEFAULT_AC" }, { no: 1, name: "OPUS" }, { no: 2, name: "AAC" }, { no: 3, name: "AC_MP3" }]);
var Ea = m4.makeEnum("livekit.VideoCodec", [{ no: 0, name: "DEFAULT_VC" }, { no: 1, name: "H264_BASELINE" }, { no: 2, name: "H264_MAIN" }, { no: 3, name: "H264_HIGH" }, { no: 4, name: "VP8" }]);
var so = m4.makeEnum("livekit.ImageCodec", [{ no: 0, name: "IC_DEFAULT" }, { no: 1, name: "IC_JPEG" }]);
var Ra = m4.makeEnum("livekit.BackupCodecPolicy", [{ no: 0, name: "PREFER_REGRESSION" }, { no: 1, name: "SIMULCAST" }, { no: 2, name: "REGRESSION" }]);
var Ia = m4.makeEnum("livekit.TrackType", [{ no: 0, name: "AUDIO" }, { no: 1, name: "VIDEO" }, { no: 2, name: "DATA" }]);
var f5 = m4.makeEnum("livekit.TrackSource", [{ no: 0, name: "UNKNOWN" }, { no: 1, name: "CAMERA" }, { no: 2, name: "MICROPHONE" }, { no: 3, name: "SCREEN_SHARE" }, { no: 4, name: "SCREEN_SHARE_AUDIO" }]);
var oo = m4.makeEnum("livekit.DataTrackExtensionID", [{ no: 0, name: "DTEI_INVALID" }, { no: 1, name: "DTEI_E2EE" }, { no: 2, name: "DTEI_USER_TIMESTAMP" }, { no: 255, name: "DTEI_PARTICIPANT_SID" }]);
var V6 = m4.makeEnum("livekit.VideoQuality", [{ no: 0, name: "LOW" }, { no: 1, name: "MEDIUM" }, { no: 2, name: "HIGH" }, { no: 3, name: "OFF" }]);
var to = m4.makeEnum("livekit.ConnectionQuality", [{ no: 0, name: "POOR" }, { no: 1, name: "GOOD" }, { no: 2, name: "EXCELLENT" }, { no: 3, name: "LOST" }]);
var z6 = m4.makeEnum("livekit.ClientConfigSetting", [{ no: 0, name: "UNSET" }, { no: 1, name: "DISABLED" }, { no: 2, name: "ENABLED" }]);
var ae6 = m4.makeEnum("livekit.DisconnectReason", [{ no: 0, name: "UNKNOWN_REASON" }, { no: 1, name: "CLIENT_INITIATED" }, { no: 2, name: "DUPLICATE_IDENTITY" }, { no: 3, name: "SERVER_SHUTDOWN" }, { no: 4, name: "PARTICIPANT_REMOVED" }, { no: 5, name: "ROOM_DELETED" }, { no: 6, name: "STATE_MISMATCH" }, { no: 7, name: "JOIN_FAILURE" }, { no: 8, name: "MIGRATION" }, { no: 9, name: "SIGNAL_CLOSE" }, { no: 10, name: "ROOM_CLOSED" }, { no: 11, name: "USER_UNAVAILABLE" }, { no: 12, name: "USER_REJECTED" }, { no: 13, name: "SIP_TRUNK_FAILURE" }, { no: 14, name: "CONNECTION_TIMEOUT" }, { no: 15, name: "MEDIA_FAILURE" }, { no: 16, name: "AGENT_ERROR" }]);
var ya = m4.makeEnum("livekit.RoomEndReason", [{ no: 0, name: "ROOM_END_UNKNOWN" }, { no: 1, name: "ROOM_END_API_DELETE" }, { no: 2, name: "ROOM_END_IDLE_TIMEOUT" }, { no: 3, name: "ROOM_END_SERVER_SHUTDOWN" }, { no: 4, name: "ROOM_END_SUPERSEDED" }, { no: 5, name: "ROOM_END_OPEN_FAILED" }]);
var Aa = m4.makeEnum("livekit.ReconnectReason", [{ no: 0, name: "RR_UNKNOWN" }, { no: 1, name: "RR_SIGNAL_DISCONNECTED" }, { no: 2, name: "RR_PUBLISHER_FAILED" }, { no: 3, name: "RR_SUBSCRIBER_FAILED" }, { no: 4, name: "RR_SWITCH_CANDIDATE" }]);
var io = m4.makeEnum("livekit.SubscriptionError", [{ no: 0, name: "SE_UNKNOWN" }, { no: 1, name: "SE_CODEC_UNSUPPORTED" }, { no: 2, name: "SE_TRACK_NOTFOUND" }]);
var se5 = m4.makeEnum("livekit.AudioTrackFeature", [{ no: 0, name: "TF_STEREO" }, { no: 1, name: "TF_NO_DTX" }, { no: 2, name: "TF_AUTO_GAIN_CONTROL" }, { no: 3, name: "TF_ECHO_CANCELLATION" }, { no: 4, name: "TF_NOISE_SUPPRESSION" }, { no: 5, name: "TF_ENHANCED_NOISE_CANCELLATION" }, { no: 6, name: "TF_PRECONNECT_BUFFER" }]);
var va = m4.makeEnum("livekit.PacketTrailerFeature", [{ no: 0, name: "PTF_USER_TIMESTAMP" }, { no: 1, name: "PTF_FRAME_ID" }, { no: 2, name: "PTF_USER_DATA" }]);
var W6 = m4.makeMessageType("livekit.Pagination", () => [{ no: 1, name: "after_id", kind: "scalar", T: 9 }, { no: 2, name: "limit", kind: "scalar", T: 5 }]);
var u3 = m4.makeMessageType("livekit.TokenPagination", () => [{ no: 1, name: "token", kind: "scalar", T: 9 }]);
var M7 = m4.makeMessageType("livekit.ListUpdate", () => [{ no: 1, name: "set", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "add", kind: "scalar", T: 9, repeated: true }, { no: 3, name: "remove", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "clear", kind: "scalar", T: 8 }]);
var r = m4.makeMessageType("livekit.Room", () => [{ no: 1, name: "sid", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "empty_timeout", kind: "scalar", T: 13 }, { no: 14, name: "departure_timeout", kind: "scalar", T: 13 }, { no: 4, name: "max_participants", kind: "scalar", T: 13 }, { no: 5, name: "creation_time", kind: "scalar", T: 3 }, { no: 15, name: "creation_time_ms", kind: "scalar", T: 3 }, { no: 6, name: "turn_password", kind: "scalar", T: 9 }, { no: 7, name: "enabled_codecs", kind: "message", T: G6, repeated: true }, { no: 8, name: "metadata", kind: "scalar", T: 9 }, { no: 9, name: "num_participants", kind: "scalar", T: 13 }, { no: 11, name: "num_publishers", kind: "scalar", T: 13 }, { no: 10, name: "active_recording", kind: "scalar", T: 8 }, { no: 13, name: "version", kind: "message", T: Ka }]);
var G6 = m4.makeMessageType("livekit.Codec", () => [{ no: 1, name: "mime", kind: "scalar", T: 9 }, { no: 2, name: "fmtp_line", kind: "scalar", T: 9 }]);
var Wm = m4.makeMessageType("livekit.PlayoutDelay", () => [{ no: 1, name: "enabled", kind: "scalar", T: 8 }, { no: 2, name: "min", kind: "scalar", T: 13 }, { no: 3, name: "max", kind: "scalar", T: 13 }]);
var oe5 = m4.makeMessageType("livekit.ParticipantPermission", () => [{ no: 1, name: "can_subscribe", kind: "scalar", T: 8 }, { no: 2, name: "can_publish", kind: "scalar", T: 8 }, { no: 3, name: "can_publish_data", kind: "scalar", T: 8 }, { no: 9, name: "can_publish_sources", kind: "enum", T: m4.getEnumType(f5), repeated: true }, { no: 7, name: "hidden", kind: "scalar", T: 8 }, { no: 8, name: "recorder", kind: "scalar", T: 8 }, { no: 10, name: "can_update_metadata", kind: "scalar", T: 8 }, { no: 11, name: "agent", kind: "scalar", T: 8 }, { no: 12, name: "can_subscribe_metrics", kind: "scalar", T: 8 }, { no: 13, name: "can_manage_agent_session", kind: "scalar", T: 8 }]);
var s = m4.makeMessageType("livekit.ParticipantInfo", () => [{ no: 1, name: "sid", kind: "scalar", T: 9 }, { no: 2, name: "identity", kind: "scalar", T: 9 }, { no: 3, name: "state", kind: "enum", T: m4.getEnumType(Ma) }, { no: 4, name: "tracks", kind: "message", T: S7, repeated: true }, { no: 5, name: "metadata", kind: "scalar", T: 9 }, { no: 6, name: "joined_at", kind: "scalar", T: 3 }, { no: 17, name: "joined_at_ms", kind: "scalar", T: 3 }, { no: 9, name: "name", kind: "scalar", T: 9 }, { no: 10, name: "version", kind: "scalar", T: 13 }, { no: 11, name: "permission", kind: "message", T: oe5 }, { no: 12, name: "region", kind: "scalar", T: 9 }, { no: 13, name: "is_publisher", kind: "scalar", T: 8 }, { no: 14, name: "kind", kind: "enum", T: m4.getEnumType(Na) }, { no: 15, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 16, name: "disconnect_reason", kind: "enum", T: m4.getEnumType(ae6) }, { no: 18, name: "kind_details", kind: "enum", T: m4.getEnumType(mo), repeated: true }, { no: 19, name: "data_tracks", kind: "message", T: te6, repeated: true }, { no: 20, name: "client_protocol", kind: "scalar", T: 5 }, { no: 21, name: "capabilities", kind: "enum", T: m4.getEnumType(Ha), repeated: true }]);
var Ma = m4.makeEnum("livekit.ParticipantInfo.State", [{ no: 0, name: "JOINING" }, { no: 1, name: "JOINED" }, { no: 2, name: "ACTIVE" }, { no: 3, name: "DISCONNECTED" }]);
var Na = m4.makeEnum("livekit.ParticipantInfo.Kind", [{ no: 0, name: "STANDARD" }, { no: 1, name: "INGRESS" }, { no: 2, name: "EGRESS" }, { no: 3, name: "SIP" }, { no: 4, name: "AGENT" }, { no: 7, name: "CONNECTOR" }, { no: 8, name: "BRIDGE" }]);
var mo = m4.makeEnum("livekit.ParticipantInfo.KindDetail", [{ no: 0, name: "CLOUD_AGENT" }, { no: 1, name: "FORWARDED" }, { no: 2, name: "CONNECTOR_WHATSAPP" }, { no: 3, name: "CONNECTOR_TWILIO" }, { no: 4, name: "BRIDGE_RTSP" }, { no: 5, name: "SIMULATION" }]);
var wm = m4.makeMessageType("livekit.Encryption", []);
var g3 = m4.makeEnum("livekit.Encryption.Type", [{ no: 0, name: "NONE" }, { no: 1, name: "GCM" }, { no: 2, name: "CUSTOM" }]);
var ro = m4.makeMessageType("livekit.SimulcastCodecInfo", () => [{ no: 1, name: "mime_type", kind: "scalar", T: 9 }, { no: 2, name: "mid", kind: "scalar", T: 9 }, { no: 3, name: "cid", kind: "scalar", T: 9 }, { no: 4, name: "layers", kind: "message", T: E8, repeated: true }, { no: 5, name: "video_layer_mode", kind: "enum", T: m4.getEnumType(Pa) }, { no: 6, name: "sdp_cid", kind: "scalar", T: 9 }]);
var S7 = m4.makeMessageType("livekit.TrackInfo", () => [{ no: 1, name: "sid", kind: "scalar", T: 9 }, { no: 2, name: "type", kind: "enum", T: m4.getEnumType(Ia) }, { no: 3, name: "name", kind: "scalar", T: 9 }, { no: 4, name: "muted", kind: "scalar", T: 8 }, { no: 5, name: "width", kind: "scalar", T: 13 }, { no: 6, name: "height", kind: "scalar", T: 13 }, { no: 7, name: "simulcast", kind: "scalar", T: 8 }, { no: 8, name: "disable_dtx", kind: "scalar", T: 8 }, { no: 9, name: "source", kind: "enum", T: m4.getEnumType(f5) }, { no: 10, name: "layers", kind: "message", T: E8, repeated: true }, { no: 11, name: "mime_type", kind: "scalar", T: 9 }, { no: 12, name: "mid", kind: "scalar", T: 9 }, { no: 13, name: "codecs", kind: "message", T: ro, repeated: true }, { no: 14, name: "stereo", kind: "scalar", T: 8 }, { no: 15, name: "disable_red", kind: "scalar", T: 8 }, { no: 16, name: "encryption", kind: "enum", T: m4.getEnumType(g3) }, { no: 17, name: "stream", kind: "scalar", T: 9 }, { no: 18, name: "version", kind: "message", T: Ka }, { no: 19, name: "audio_features", kind: "enum", T: m4.getEnumType(se5), repeated: true }, { no: 20, name: "backup_codec_policy", kind: "enum", T: m4.getEnumType(Ra) }, { no: 21, name: "packet_trailer_features", kind: "enum", T: m4.getEnumType(va), repeated: true }]);
var te6 = m4.makeMessageType("livekit.DataTrackInfo", () => [{ no: 1, name: "pub_handle", kind: "scalar", T: 13 }, { no: 2, name: "sid", kind: "scalar", T: 9 }, { no: 3, name: "name", kind: "scalar", T: 9 }, { no: 4, name: "encryption", kind: "enum", T: m4.getEnumType(g3) }, { no: 5, name: "frame_encoding", kind: "message", T: fa, opt: true }, { no: 6, name: "schema", kind: "message", T: ie4, opt: true }]);
var fa = m4.makeMessageType("livekit.DataTrackFrameEncoding", () => [{ no: 1, name: "well_known", kind: "enum", T: m4.getEnumType(To), oneof: "value" }, { no: 2, name: "custom", kind: "scalar", T: 9, oneof: "value" }]);
var To = m4.makeEnum("livekit.DataTrackFrameEncoding.WellKnownFrameEncoding", [{ no: 0, name: "WELL_KNOWN_FRAME_ENCODING_UNSPECIFIED", localName: "UNSPECIFIED" }, { no: 1, name: "WELL_KNOWN_FRAME_ENCODING_ROS1", localName: "ROS1" }, { no: 2, name: "WELL_KNOWN_FRAME_ENCODING_CDR", localName: "CDR" }, { no: 3, name: "WELL_KNOWN_FRAME_ENCODING_PROTOBUF", localName: "PROTOBUF" }, { no: 4, name: "WELL_KNOWN_FRAME_ENCODING_FLATBUFFER", localName: "FLATBUFFER" }, { no: 5, name: "WELL_KNOWN_FRAME_ENCODING_CBOR", localName: "CBOR" }, { no: 6, name: "WELL_KNOWN_FRAME_ENCODING_MSGPACK", localName: "MSGPACK" }, { no: 7, name: "WELL_KNOWN_FRAME_ENCODING_JSON", localName: "JSON" }]);
var ko = m4.makeMessageType("livekit.DataTrackSchemaEncoding", () => [{ no: 1, name: "well_known", kind: "enum", T: m4.getEnumType(co), oneof: "value" }, { no: 2, name: "custom", kind: "scalar", T: 9, oneof: "value" }]);
var co = m4.makeEnum("livekit.DataTrackSchemaEncoding.WellKnownSchemaEncoding", [{ no: 0, name: "WELL_KNOWN_SCHEMA_ENCODING_UNSPECIFIED", localName: "UNSPECIFIED" }, { no: 1, name: "WELL_KNOWN_SCHEMA_ENCODING_PROTOBUF", localName: "PROTOBUF" }, { no: 2, name: "WELL_KNOWN_SCHEMA_ENCODING_FLATBUFFER", localName: "FLATBUFFER" }, { no: 3, name: "WELL_KNOWN_SCHEMA_ENCODING_ROS1_MSG", localName: "ROS1_MSG" }, { no: 4, name: "WELL_KNOWN_SCHEMA_ENCODING_ROS2_MSG", localName: "ROS2_MSG" }, { no: 5, name: "WELL_KNOWN_SCHEMA_ENCODING_ROS2_IDL", localName: "ROS2_IDL" }, { no: 6, name: "WELL_KNOWN_SCHEMA_ENCODING_OMG_IDL", localName: "OMG_IDL" }, { no: 7, name: "WELL_KNOWN_SCHEMA_ENCODING_JSON_SCHEMA", localName: "JSON_SCHEMA" }]);
var ie4 = m4.makeMessageType("livekit.DataTrackSchemaId", () => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "encoding", kind: "message", T: ko }]);
var Jm = m4.makeMessageType("livekit.DataTrackExtensionParticipantSid", () => [{ no: 1, name: "id", kind: "enum", T: m4.getEnumType(oo) }, { no: 2, name: "participant_sid", kind: "scalar", T: 9 }]);
var lo = m4.makeMessageType("livekit.DataTrackSubscriptionOptions", () => [{ no: 1, name: "target_fps", kind: "scalar", T: 13, opt: true }]);
var me3 = m4.makeMessageType("livekit.DataBlobKey", () => [{ no: 1, name: "generic", kind: "scalar", T: 9, oneof: "key" }, { no: 2, name: "schema_id", kind: "message", T: ie4, oneof: "key" }]);
var Ca = m4.makeMessageType("livekit.DataBlob", () => [{ no: 1, name: "key", kind: "message", T: me3 }, { no: 2, name: "contents", kind: "scalar", T: 12 }]);
var E8 = m4.makeMessageType("livekit.VideoLayer", () => [{ no: 1, name: "quality", kind: "enum", T: m4.getEnumType(V6) }, { no: 2, name: "width", kind: "scalar", T: 13 }, { no: 3, name: "height", kind: "scalar", T: 13 }, { no: 4, name: "bitrate", kind: "scalar", T: 13 }, { no: 5, name: "ssrc", kind: "scalar", T: 13 }, { no: 6, name: "spatial_layer", kind: "scalar", T: 5 }, { no: 7, name: "rid", kind: "scalar", T: 9 }, { no: 8, name: "repair_ssrc", kind: "scalar", T: 13 }]);
var Pa = m4.makeEnum("livekit.VideoLayer.Mode", [{ no: 0, name: "MODE_UNUSED" }, { no: 1, name: "ONE_SPATIAL_LAYER_PER_STREAM" }, { no: 2, name: "MULTIPLE_SPATIAL_LAYERS_PER_STREAM" }, { no: 3, name: "ONE_SPATIAL_LAYER_PER_STREAM_INCOMPLETE_RTCP_SR" }]);
var Ym = m4.makeMessageType("livekit.DataPacket", () => [{ no: 1, name: "kind", kind: "enum", T: m4.getEnumType(Da) }, { no: 4, name: "participant_identity", kind: "scalar", T: 9 }, { no: 5, name: "destination_identities", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "user", kind: "message", T: Ua, oneof: "value" }, { no: 3, name: "speaker", kind: "message", T: po, oneof: "value" }, { no: 6, name: "sip_dtmf", kind: "message", T: uo, oneof: "value" }, { no: 7, name: "transcription", kind: "message", T: go, oneof: "value" }, { no: 8, name: "metrics", kind: "message", T: $s, oneof: "value" }, { no: 9, name: "chat_message", kind: "message", T: ba, oneof: "value" }, { no: 10, name: "rpc_request", kind: "message", T: ha, oneof: "value" }, { no: 11, name: "rpc_ack", kind: "message", T: La, oneof: "value" }, { no: 12, name: "rpc_response", kind: "message", T: qa, oneof: "value" }, { no: 13, name: "stream_header", kind: "message", T: xa, oneof: "value" }, { no: 14, name: "stream_chunk", kind: "message", T: Va, oneof: "value" }, { no: 15, name: "stream_trailer", kind: "message", T: Wa, oneof: "value" }, { no: 18, name: "encrypted_packet", kind: "message", T: _o, oneof: "value" }, { no: 16, name: "sequence", kind: "scalar", T: 13 }, { no: 17, name: "participant_sid", kind: "scalar", T: 9 }]);
var Da = m4.makeEnum("livekit.DataPacket.Kind", [{ no: 0, name: "RELIABLE" }, { no: 1, name: "LOSSY" }]);
var _o = m4.makeMessageType("livekit.EncryptedPacket", () => [{ no: 1, name: "encryption_type", kind: "enum", T: m4.getEnumType(g3) }, { no: 2, name: "iv", kind: "scalar", T: 12 }, { no: 3, name: "key_index", kind: "scalar", T: 13 }, { no: 4, name: "encrypted_value", kind: "scalar", T: 12 }]);
var jm = m4.makeMessageType("livekit.EncryptedPacketPayload", () => [{ no: 1, name: "user", kind: "message", T: Ua, oneof: "value" }, { no: 3, name: "chat_message", kind: "message", T: ba, oneof: "value" }, { no: 4, name: "rpc_request", kind: "message", T: ha, oneof: "value" }, { no: 5, name: "rpc_ack", kind: "message", T: La, oneof: "value" }, { no: 6, name: "rpc_response", kind: "message", T: qa, oneof: "value" }, { no: 7, name: "stream_header", kind: "message", T: xa, oneof: "value" }, { no: 8, name: "stream_chunk", kind: "message", T: Va, oneof: "value" }, { no: 9, name: "stream_trailer", kind: "message", T: Wa, oneof: "value" }]);
var po = m4.makeMessageType("livekit.ActiveSpeakerUpdate", () => [{ no: 1, name: "speakers", kind: "message", T: Oa, repeated: true }]);
var Oa = m4.makeMessageType("livekit.SpeakerInfo", () => [{ no: 1, name: "sid", kind: "scalar", T: 9 }, { no: 2, name: "level", kind: "scalar", T: 2 }, { no: 3, name: "active", kind: "scalar", T: 8 }]);
var Ua = m4.makeMessageType("livekit.UserPacket", () => [{ no: 1, name: "participant_sid", kind: "scalar", T: 9 }, { no: 5, name: "participant_identity", kind: "scalar", T: 9 }, { no: 2, name: "payload", kind: "scalar", T: 12 }, { no: 3, name: "destination_sids", kind: "scalar", T: 9, repeated: true }, { no: 6, name: "destination_identities", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "topic", kind: "scalar", T: 9, opt: true }, { no: 8, name: "id", kind: "scalar", T: 9, opt: true }, { no: 9, name: "start_time", kind: "scalar", T: 4, opt: true }, { no: 10, name: "end_time", kind: "scalar", T: 4, opt: true }, { no: 11, name: "nonce", kind: "scalar", T: 12 }]);
var uo = m4.makeMessageType("livekit.SipDTMF", () => [{ no: 3, name: "code", kind: "scalar", T: 13 }, { no: 4, name: "digit", kind: "scalar", T: 9 }]);
var go = m4.makeMessageType("livekit.Transcription", () => [{ no: 2, name: "transcribed_participant_identity", kind: "scalar", T: 9 }, { no: 3, name: "track_id", kind: "scalar", T: 9 }, { no: 4, name: "segments", kind: "message", T: So, repeated: true }]);
var So = m4.makeMessageType("livekit.TranscriptionSegment", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "text", kind: "scalar", T: 9 }, { no: 3, name: "start_time", kind: "scalar", T: 4 }, { no: 4, name: "end_time", kind: "scalar", T: 4 }, { no: 5, name: "final", kind: "scalar", T: 8 }, { no: 6, name: "language", kind: "scalar", T: 9 }]);
var ba = m4.makeMessageType("livekit.ChatMessage", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "timestamp", kind: "scalar", T: 3 }, { no: 3, name: "edit_timestamp", kind: "scalar", T: 3, opt: true }, { no: 4, name: "message", kind: "scalar", T: 9 }, { no: 5, name: "deleted", kind: "scalar", T: 8 }, { no: 6, name: "generated", kind: "scalar", T: 8 }]);
var ha = m4.makeMessageType("livekit.RpcRequest", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "method", kind: "scalar", T: 9 }, { no: 3, name: "payload", kind: "scalar", T: 9 }, { no: 4, name: "response_timeout_ms", kind: "scalar", T: 13 }, { no: 5, name: "version", kind: "scalar", T: 13 }, { no: 6, name: "compressed_payload", kind: "scalar", T: 12 }]);
var La = m4.makeMessageType("livekit.RpcAck", () => [{ no: 1, name: "request_id", kind: "scalar", T: 9 }]);
var qa = m4.makeMessageType("livekit.RpcResponse", () => [{ no: 1, name: "request_id", kind: "scalar", T: 9 }, { no: 2, name: "payload", kind: "scalar", T: 9, oneof: "value" }, { no: 3, name: "error", kind: "message", T: Eo, oneof: "value" }, { no: 4, name: "compressed_payload", kind: "scalar", T: 12, oneof: "value" }]);
var Eo = m4.makeMessageType("livekit.RpcError", () => [{ no: 1, name: "code", kind: "scalar", T: 13 }, { no: 2, name: "message", kind: "scalar", T: 9 }, { no: 3, name: "data", kind: "scalar", T: 9 }]);
var Fa = m4.makeMessageType("livekit.ParticipantTracks", () => [{ no: 1, name: "participant_sid", kind: "scalar", T: 9 }, { no: 2, name: "track_sids", kind: "scalar", T: 9, repeated: true }]);
var re6 = m4.makeMessageType("livekit.ServerInfo", () => [{ no: 1, name: "edition", kind: "enum", T: m4.getEnumType(Ro) }, { no: 2, name: "version", kind: "scalar", T: 9 }, { no: 3, name: "protocol", kind: "scalar", T: 5 }, { no: 4, name: "region", kind: "scalar", T: 9 }, { no: 5, name: "node_id", kind: "scalar", T: 9 }, { no: 6, name: "debug_info", kind: "scalar", T: 9 }, { no: 7, name: "agent_protocol", kind: "scalar", T: 5 }]);
var Ro = m4.makeEnum("livekit.ServerInfo.Edition", [{ no: 0, name: "Standard" }, { no: 1, name: "Cloud" }]);
var Ga = m4.makeMessageType("livekit.ClientInfo", () => [{ no: 1, name: "sdk", kind: "enum", T: m4.getEnumType(Io) }, { no: 2, name: "version", kind: "scalar", T: 9 }, { no: 3, name: "protocol", kind: "scalar", T: 5 }, { no: 4, name: "os", kind: "scalar", T: 9 }, { no: 5, name: "os_version", kind: "scalar", T: 9 }, { no: 6, name: "device_model", kind: "scalar", T: 9 }, { no: 7, name: "browser", kind: "scalar", T: 9 }, { no: 8, name: "browser_version", kind: "scalar", T: 9 }, { no: 9, name: "address", kind: "scalar", T: 9 }, { no: 10, name: "network", kind: "scalar", T: 9 }, { no: 11, name: "other_sdks", kind: "scalar", T: 9 }, { no: 12, name: "client_protocol", kind: "scalar", T: 5 }, { no: 13, name: "capabilities", kind: "enum", T: m4.getEnumType(Ha), repeated: true }]);
var Io = m4.makeEnum("livekit.ClientInfo.SDK", [{ no: 0, name: "UNKNOWN" }, { no: 1, name: "JS" }, { no: 2, name: "SWIFT" }, { no: 3, name: "ANDROID" }, { no: 4, name: "FLUTTER" }, { no: 5, name: "GO" }, { no: 6, name: "UNITY" }, { no: 7, name: "REACT_NATIVE" }, { no: 8, name: "RUST" }, { no: 9, name: "PYTHON" }, { no: 10, name: "CPP" }, { no: 11, name: "UNITY_WEB" }, { no: 12, name: "NODE" }, { no: 13, name: "UNREAL" }, { no: 14, name: "ESP32" }, { no: 15, name: "DOTNET" }]);
var Ha = m4.makeEnum("livekit.ClientInfo.Capability", [{ no: 0, name: "CAP_UNUSED" }, { no: 1, name: "CAP_PACKET_TRAILER" }, { no: 2, name: "CAP_COMPRESSION_DEFLATE_RAW" }]);
var Ba = m4.makeMessageType("livekit.ClientConfiguration", () => [{ no: 1, name: "video", kind: "message", T: Me3 }, { no: 2, name: "screen", kind: "message", T: Me3 }, { no: 3, name: "resume_connection", kind: "enum", T: m4.getEnumType(z6) }, { no: 4, name: "disabled_codecs", kind: "message", T: yo }, { no: 5, name: "force_relay", kind: "enum", T: m4.getEnumType(z6) }]);
var Me3 = m4.makeMessageType("livekit.VideoConfiguration", () => [{ no: 1, name: "hardware_encoder", kind: "enum", T: m4.getEnumType(z6) }]);
var yo = m4.makeMessageType("livekit.DisabledCodecs", () => [{ no: 1, name: "codecs", kind: "message", T: G6, repeated: true }, { no: 2, name: "publish", kind: "message", T: G6, repeated: true }]);
var h3 = m4.makeMessageType("livekit.RTPDrift", () => [{ no: 1, name: "start_time", kind: "message", T: fe4 }, { no: 2, name: "end_time", kind: "message", T: fe4 }, { no: 3, name: "duration", kind: "scalar", T: 1 }, { no: 4, name: "start_timestamp", kind: "scalar", T: 4 }, { no: 5, name: "end_timestamp", kind: "scalar", T: 4 }, { no: 6, name: "rtp_clock_ticks", kind: "scalar", T: 4 }, { no: 7, name: "drift_samples", kind: "scalar", T: 3 }, { no: 8, name: "drift_ms", kind: "scalar", T: 1 }, { no: 9, name: "clock_rate", kind: "scalar", T: 1 }]);
var Ao = m4.makeMessageType("livekit.RTPStats", () => [{ no: 1, name: "start_time", kind: "message", T: fe4 }, { no: 2, name: "end_time", kind: "message", T: fe4 }, { no: 3, name: "duration", kind: "scalar", T: 1 }, { no: 4, name: "packets", kind: "scalar", T: 13 }, { no: 5, name: "packet_rate", kind: "scalar", T: 1 }, { no: 6, name: "bytes", kind: "scalar", T: 4 }, { no: 39, name: "header_bytes", kind: "scalar", T: 4 }, { no: 7, name: "bitrate", kind: "scalar", T: 1 }, { no: 8, name: "packets_lost", kind: "scalar", T: 13 }, { no: 9, name: "packet_loss_rate", kind: "scalar", T: 1 }, { no: 10, name: "packet_loss_percentage", kind: "scalar", T: 2 }, { no: 11, name: "packets_duplicate", kind: "scalar", T: 13 }, { no: 12, name: "packet_duplicate_rate", kind: "scalar", T: 1 }, { no: 13, name: "bytes_duplicate", kind: "scalar", T: 4 }, { no: 40, name: "header_bytes_duplicate", kind: "scalar", T: 4 }, { no: 14, name: "bitrate_duplicate", kind: "scalar", T: 1 }, { no: 15, name: "packets_padding", kind: "scalar", T: 13 }, { no: 16, name: "packet_padding_rate", kind: "scalar", T: 1 }, { no: 17, name: "bytes_padding", kind: "scalar", T: 4 }, { no: 41, name: "header_bytes_padding", kind: "scalar", T: 4 }, { no: 18, name: "bitrate_padding", kind: "scalar", T: 1 }, { no: 19, name: "packets_out_of_order", kind: "scalar", T: 13 }, { no: 20, name: "frames", kind: "scalar", T: 13 }, { no: 21, name: "frame_rate", kind: "scalar", T: 1 }, { no: 22, name: "jitter_current", kind: "scalar", T: 1 }, { no: 23, name: "jitter_max", kind: "scalar", T: 1 }, { no: 24, name: "gap_histogram", kind: "map", K: 5, V: { kind: "scalar", T: 13 } }, { no: 25, name: "nacks", kind: "scalar", T: 13 }, { no: 37, name: "nack_acks", kind: "scalar", T: 13 }, { no: 26, name: "nack_misses", kind: "scalar", T: 13 }, { no: 38, name: "nack_repeated", kind: "scalar", T: 13 }, { no: 27, name: "plis", kind: "scalar", T: 13 }, { no: 28, name: "last_pli", kind: "message", T: fe4 }, { no: 29, name: "firs", kind: "scalar", T: 13 }, { no: 30, name: "last_fir", kind: "message", T: fe4 }, { no: 31, name: "rtt_current", kind: "scalar", T: 13 }, { no: 32, name: "rtt_max", kind: "scalar", T: 13 }, { no: 33, name: "key_frames", kind: "scalar", T: 13 }, { no: 34, name: "last_key_frame", kind: "message", T: fe4 }, { no: 35, name: "layer_lock_plis", kind: "scalar", T: 13 }, { no: 36, name: "last_layer_lock_pli", kind: "message", T: fe4 }, { no: 44, name: "packet_drift", kind: "message", T: h3 }, { no: 45, name: "ntp_report_drift", kind: "message", T: h3 }, { no: 46, name: "rebased_report_drift", kind: "message", T: h3 }, { no: 47, name: "received_report_drift", kind: "message", T: h3 }, { no: 48, name: "fec_packets", kind: "scalar", T: 13 }, { no: 49, name: "fec_bytes", kind: "scalar", T: 4 }, { no: 50, name: "fec_packets_discarded", kind: "scalar", T: 13 }, { no: 51, name: "fec_packets_recovered", kind: "scalar", T: 13 }]);
var vo = m4.makeMessageType("livekit.RTCPSenderReportState", () => [{ no: 1, name: "rtp_timestamp", kind: "scalar", T: 13 }, { no: 2, name: "rtp_timestamp_ext", kind: "scalar", T: 4 }, { no: 3, name: "ntp_timestamp", kind: "scalar", T: 4 }, { no: 4, name: "at", kind: "scalar", T: 3 }, { no: 5, name: "at_adjusted", kind: "scalar", T: 3 }, { no: 6, name: "packets", kind: "scalar", T: 13 }, { no: 7, name: "octets", kind: "scalar", T: 4 }]);
var zm = m4.makeMessageType("livekit.RTPForwarderState", () => [{ no: 1, name: "started", kind: "scalar", T: 8 }, { no: 2, name: "reference_layer_spatial", kind: "scalar", T: 5 }, { no: 3, name: "pre_start_time", kind: "scalar", T: 3 }, { no: 4, name: "ext_first_timestamp", kind: "scalar", T: 4 }, { no: 5, name: "dummy_start_timestamp_offset", kind: "scalar", T: 4 }, { no: 6, name: "rtp_munger", kind: "message", T: No }, { no: 7, name: "vp8_munger", kind: "message", T: fo, oneof: "codec_munger" }, { no: 8, name: "sender_report_state", kind: "message", T: vo, repeated: true }, { no: 9, name: "dependency_descriptor_forwarder", kind: "message", T: Mo }]);
var Mo = m4.makeMessageType("livekit.DependencyDescriptorForwarderState", () => [{ no: 1, name: "ext_last_frame_number", kind: "scalar", T: 4 }]);
var No = m4.makeMessageType("livekit.RTPMungerState", () => [{ no: 1, name: "ext_last_sequence_number", kind: "scalar", T: 4 }, { no: 2, name: "ext_second_last_sequence_number", kind: "scalar", T: 4 }, { no: 3, name: "ext_last_timestamp", kind: "scalar", T: 4 }, { no: 4, name: "ext_second_last_timestamp", kind: "scalar", T: 4 }, { no: 5, name: "last_marker", kind: "scalar", T: 8 }, { no: 6, name: "second_last_marker", kind: "scalar", T: 8 }]);
var fo = m4.makeMessageType("livekit.VP8MungerState", () => [{ no: 1, name: "ext_last_picture_id", kind: "scalar", T: 5 }, { no: 2, name: "picture_id_used", kind: "scalar", T: 8 }, { no: 3, name: "last_tl0_pic_idx", kind: "scalar", T: 13 }, { no: 4, name: "tl0_pic_idx_used", kind: "scalar", T: 8 }, { no: 5, name: "tid_used", kind: "scalar", T: 8 }, { no: 6, name: "last_key_idx", kind: "scalar", T: 13 }, { no: 7, name: "key_idx_used", kind: "scalar", T: 8 }]);
var Ka = m4.makeMessageType("livekit.TimedVersion", () => [{ no: 1, name: "unix_micro", kind: "scalar", T: 3 }, { no: 2, name: "ticks", kind: "scalar", T: 5 }]);
var Qm = m4.makeMessageType("livekit.DataStream", []);
var Co = m4.makeEnum("livekit.DataStream.OperationType", [{ no: 0, name: "CREATE" }, { no: 1, name: "UPDATE" }, { no: 2, name: "DELETE" }, { no: 3, name: "REACTION" }]);
var Po = m4.makeEnum("livekit.DataStream.CompressionType", [{ no: 0, name: "NONE" }, { no: 1, name: "DEFLATE_RAW" }]);
var Do = m4.makeMessageType("livekit.DataStream.TextHeader", () => [{ no: 1, name: "operation_type", kind: "enum", T: m4.getEnumType(Co) }, { no: 2, name: "version", kind: "scalar", T: 5 }, { no: 3, name: "reply_to_stream_id", kind: "scalar", T: 9 }, { no: 4, name: "attached_stream_ids", kind: "scalar", T: 9, repeated: true }, { no: 5, name: "generated", kind: "scalar", T: 8 }], { localName: "DataStream_TextHeader" });
var Oo = m4.makeMessageType("livekit.DataStream.ByteHeader", () => [{ no: 1, name: "name", kind: "scalar", T: 9 }], { localName: "DataStream_ByteHeader" });
var xa = m4.makeMessageType("livekit.DataStream.Header", () => [{ no: 1, name: "stream_id", kind: "scalar", T: 9 }, { no: 2, name: "timestamp", kind: "scalar", T: 3 }, { no: 3, name: "topic", kind: "scalar", T: 9 }, { no: 4, name: "mime_type", kind: "scalar", T: 9 }, { no: 5, name: "total_length", kind: "scalar", T: 4, opt: true }, { no: 7, name: "encryption_type", kind: "enum", T: m4.getEnumType(g3) }, { no: 8, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 9, name: "text_header", kind: "message", T: Do, oneof: "content_header" }, { no: 10, name: "byte_header", kind: "message", T: Oo, oneof: "content_header" }, { no: 11, name: "inline_content", kind: "scalar", T: 12, opt: true }, { no: 12, name: "compression", kind: "enum", T: m4.getEnumType(Po) }], { localName: "DataStream_Header" });
var Va = m4.makeMessageType("livekit.DataStream.Chunk", () => [{ no: 1, name: "stream_id", kind: "scalar", T: 9 }, { no: 2, name: "chunk_index", kind: "scalar", T: 4 }, { no: 3, name: "content", kind: "scalar", T: 12 }, { no: 4, name: "version", kind: "scalar", T: 5 }, { no: 5, name: "iv", kind: "scalar", T: 12, opt: true }], { localName: "DataStream_Chunk" });
var Wa = m4.makeMessageType("livekit.DataStream.Trailer", () => [{ no: 1, name: "stream_id", kind: "scalar", T: 9 }, { no: 2, name: "reason", kind: "scalar", T: 9 }, { no: 3, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }], { localName: "DataStream_Trailer" });
var Uo = m4.makeMessageType("livekit.FilterParams", () => [{ no: 1, name: "include_events", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "exclude_events", kind: "scalar", T: 9, repeated: true }]);
var k4 = m4.makeMessageType("livekit.WebhookConfig", () => [{ no: 1, name: "url", kind: "scalar", T: 9 }, { no: 2, name: "signing_key", kind: "scalar", T: 9 }, { no: 3, name: "filter_params", kind: "message", T: Uo }]);
var bo = m4.makeMessageType("livekit.SubscribedAudioCodec", () => [{ no: 1, name: "codec", kind: "scalar", T: 9 }, { no: 2, name: "enabled", kind: "scalar", T: 8 }]);
var de4 = m4.makeEnum("livekit.JobType", [{ no: 0, name: "JT_ROOM" }, { no: 1, name: "JT_PUBLISHER" }, { no: 2, name: "JT_PARTICIPANT" }]);
var ho = m4.makeEnum("livekit.WorkerStatus", [{ no: 0, name: "WS_AVAILABLE" }, { no: 1, name: "WS_FULL" }]);
var wa = m4.makeEnum("livekit.JobStatus", [{ no: 0, name: "JS_PENDING" }, { no: 1, name: "JS_RUNNING" }, { no: 2, name: "JS_SUCCESS" }, { no: 3, name: "JS_FAILED" }, { no: 4, name: "JS_CANCELLED" }]);
var Lo = m4.makeEnum("livekit.JobStateReason", [{ no: 0, name: "JSR_UNSPECIFIED" }, { no: 1, name: "JSR_NO_CAPACITY" }, { no: 2, name: "JSR_ROOM_CLOSED" }, { no: 3, name: "JSR_DISPATCH_DELETED" }, { no: 4, name: "JSR_RETRYING" }]);
var C7 = m4.makeMessageType("livekit.Job", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 9, name: "dispatch_id", kind: "scalar", T: 9 }, { no: 2, name: "type", kind: "enum", T: m4.getEnumType(de4) }, { no: 3, name: "room", kind: "message", T: r }, { no: 4, name: "participant", kind: "message", T: s, opt: true }, { no: 5, name: "namespace", kind: "scalar", T: 9 }, { no: 6, name: "metadata", kind: "scalar", T: 9 }, { no: 7, name: "agent_name", kind: "scalar", T: 9 }, { no: 8, name: "state", kind: "message", T: qo }, { no: 10, name: "enable_recording", kind: "scalar", T: 8 }, { no: 11, name: "deployment", kind: "scalar", T: 9 }, { no: 12, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 13, name: "enable_redaction", kind: "scalar", T: 8 }, { no: 14, name: "created_at", kind: "scalar", T: 3 }]);
var qo = m4.makeMessageType("livekit.JobState", () => [{ no: 1, name: "status", kind: "enum", T: m4.getEnumType(wa) }, { no: 2, name: "error", kind: "scalar", T: 9 }, { no: 3, name: "started_at", kind: "scalar", T: 3 }, { no: 4, name: "ended_at", kind: "scalar", T: 3 }, { no: 5, name: "updated_at", kind: "scalar", T: 3 }, { no: 6, name: "participant_identity", kind: "scalar", T: 9 }, { no: 7, name: "worker_id", kind: "scalar", T: 9 }, { no: 8, name: "agent_id", kind: "scalar", T: 9 }, { no: 9, name: "reason", kind: "enum", T: m4.getEnumType(Lo) }, { no: 10, name: "accepted_at", kind: "scalar", T: 3 }, { no: 11, name: "assigned_at", kind: "scalar", T: 3 }]);
var Xm = m4.makeMessageType("livekit.WorkerMessage", () => [{ no: 1, name: "register", kind: "message", T: Bo, oneof: "message" }, { no: 2, name: "availability", kind: "message", T: Wo, oneof: "message" }, { no: 3, name: "update_worker", kind: "message", T: Yo, oneof: "message" }, { no: 4, name: "update_job", kind: "message", T: wo, oneof: "message" }, { no: 5, name: "ping", kind: "message", T: Go, oneof: "message" }, { no: 6, name: "simulate_job", kind: "message", T: Fo, oneof: "message" }, { no: 7, name: "migrate_job", kind: "message", T: xo, oneof: "message" }]);
var Zm = m4.makeMessageType("livekit.ServerMessage", () => [{ no: 1, name: "register", kind: "message", T: Ko, oneof: "message" }, { no: 2, name: "availability", kind: "message", T: Vo, oneof: "message" }, { no: 3, name: "assignment", kind: "message", T: jo, oneof: "message" }, { no: 5, name: "termination", kind: "message", T: zo, oneof: "message" }, { no: 4, name: "pong", kind: "message", T: Ho, oneof: "message" }, { no: 6, name: "go_away", kind: "message", T: Zo, oneof: "message" }]);
var Fo = m4.makeMessageType("livekit.SimulateJobRequest", () => [{ no: 1, name: "type", kind: "enum", T: m4.getEnumType(de4) }, { no: 2, name: "room", kind: "message", T: r }, { no: 3, name: "participant", kind: "message", T: s }]);
var Go = m4.makeMessageType("livekit.WorkerPing", () => [{ no: 1, name: "timestamp", kind: "scalar", T: 3 }]);
var Ho = m4.makeMessageType("livekit.WorkerPong", () => [{ no: 1, name: "last_timestamp", kind: "scalar", T: 3 }, { no: 2, name: "timestamp", kind: "scalar", T: 3 }]);
var Bo = m4.makeMessageType("livekit.RegisterWorkerRequest", () => [{ no: 1, name: "type", kind: "enum", T: m4.getEnumType(de4) }, { no: 8, name: "agent_name", kind: "scalar", T: 9 }, { no: 3, name: "version", kind: "scalar", T: 9 }, { no: 5, name: "ping_interval", kind: "scalar", T: 13 }, { no: 6, name: "namespace", kind: "scalar", T: 9, opt: true }, { no: 7, name: "allowed_permissions", kind: "message", T: oe5 }, { no: 9, name: "deployment", kind: "scalar", T: 9 }, { no: 10, name: "endpoints", kind: "message", T: Qo, repeated: true }, { no: 11, name: "instance_id", kind: "scalar", T: 9 }, { no: 12, name: "endpoint_protocol", kind: "scalar", T: 13 }]);
var Ko = m4.makeMessageType("livekit.RegisterWorkerResponse", () => [{ no: 1, name: "worker_id", kind: "scalar", T: 9 }, { no: 3, name: "server_info", kind: "message", T: re6 }, { no: 4, name: "endpoint_settings", kind: "message", T: Xo }]);
var xo = m4.makeMessageType("livekit.MigrateJobRequest", () => [{ no: 2, name: "job_ids", kind: "scalar", T: 9, repeated: true }, { no: 3, name: "jobs", kind: "message", T: C7, repeated: true }]);
var Vo = m4.makeMessageType("livekit.AvailabilityRequest", () => [{ no: 1, name: "job", kind: "message", T: C7 }, { no: 2, name: "resuming", kind: "scalar", T: 8 }]);
var Wo = m4.makeMessageType("livekit.AvailabilityResponse", () => [{ no: 1, name: "job_id", kind: "scalar", T: 9 }, { no: 2, name: "available", kind: "scalar", T: 8 }, { no: 3, name: "supports_resume", kind: "scalar", T: 8 }, { no: 8, name: "terminate", kind: "scalar", T: 8 }, { no: 4, name: "participant_name", kind: "scalar", T: 9 }, { no: 5, name: "participant_identity", kind: "scalar", T: 9 }, { no: 6, name: "participant_metadata", kind: "scalar", T: 9 }, { no: 7, name: "participant_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var wo = m4.makeMessageType("livekit.UpdateJobStatus", () => [{ no: 1, name: "job_id", kind: "scalar", T: 9 }, { no: 2, name: "status", kind: "enum", T: m4.getEnumType(wa) }, { no: 3, name: "error", kind: "scalar", T: 9 }, { no: 4, name: "join_timing", kind: "message", T: Jo }]);
var Jo = m4.makeMessageType("livekit.JobJoinTiming", () => [{ no: 1, name: "offer_received_us", kind: "scalar", T: 3 }, { no: 2, name: "accepted_us", kind: "scalar", T: 3 }, { no: 3, name: "assignment_received_us", kind: "scalar", T: 3 }, { no: 4, name: "launched_us", kind: "scalar", T: 3 }, { no: 5, name: "launch_warm", kind: "scalar", T: 8 }, { no: 6, name: "entrypoint_started_us", kind: "scalar", T: 3 }, { no: 7, name: "connect_called_us", kind: "scalar", T: 3 }, { no: 8, name: "connected_us", kind: "scalar", T: 3 }]);
var Yo = m4.makeMessageType("livekit.UpdateWorkerStatus", () => [{ no: 1, name: "status", kind: "enum", T: m4.getEnumType(ho), opt: true }, { no: 3, name: "load", kind: "scalar", T: 2 }, { no: 4, name: "job_count", kind: "scalar", T: 13 }, { no: 5, name: "draining", kind: "scalar", T: 8 }, { no: 6, name: "seq", kind: "scalar", T: 4 }]);
var jo = m4.makeMessageType("livekit.JobAssignment", () => [{ no: 1, name: "job", kind: "message", T: C7 }, { no: 2, name: "url", kind: "scalar", T: 9, opt: true }, { no: 3, name: "token", kind: "scalar", T: 9 }]);
var zo = m4.makeMessageType("livekit.JobTermination", () => [{ no: 1, name: "job_id", kind: "scalar", T: 9 }]);
var $m = m4.makeMessageType("livekit.AgentHttp", []);
var Ja = m4.makeEnum("livekit.AgentHttp.AgentEndpointKind", [{ no: 0, name: "AEK_HTTP" }, { no: 1, name: "AEK_TEXT" }]);
var er = m4.makeEnum("livekit.AgentHttp.HttpStreamResetCode", [{ no: 0, name: "HSR_ABORT" }, { no: 1, name: "HSR_REFUSED" }, { no: 2, name: "HSR_INTERNAL" }, { no: 3, name: "HSR_TIMEOUT" }, { no: 4, name: "HSR_PROTOCOL" }]);
var Qo = m4.makeMessageType("livekit.AgentHttp.AgentEndpoint", () => [{ no: 1, name: "path", kind: "scalar", T: 9 }, { no: 2, name: "methods", kind: "scalar", T: 9, repeated: true }, { no: 3, name: "kind", kind: "enum", T: m4.getEnumType(Ja) }, { no: 4, name: "public", kind: "scalar", T: 8 }], { localName: "AgentHttp_AgentEndpoint" });
var Xo = m4.makeMessageType("livekit.AgentHttp.AgentEndpointSettings", () => [{ no: 1, name: "protocol", kind: "scalar", T: 13 }], { localName: "AgentHttp_AgentEndpointSettings" });
var nr = m4.makeMessageType("livekit.AgentHttp.StreamPreamble", () => [{ no: 1, name: "kind", kind: "enum", T: m4.getEnumType(Ja) }, { no: 2, name: "request_id", kind: "scalar", T: 9 }, { no: 3, name: "authorized", kind: "scalar", T: 8 }, { no: 4, name: "route", kind: "scalar", T: 9 }, { no: 5, name: "timeout_ms", kind: "scalar", T: 13 }, { no: 6, name: "client_addr", kind: "scalar", T: 9 }, { no: 7, name: "scheme", kind: "scalar", T: 9 }], { localName: "AgentHttp_StreamPreamble" });
var Zo = m4.makeMessageType("livekit.AgentHttp.GoAway", () => [{ no: 1, name: "reason", kind: "scalar", T: 9 }], { localName: "AgentHttp_GoAway" });
var Te3 = m4.makeEnum("livekit.JobRestartPolicy", [{ no: 0, name: "JRP_ON_FAILURE" }, { no: 1, name: "JRP_NEVER" }]);
var $o = m4.makeEnum("livekit.AgentDispatchTrigger", [{ no: 0, name: "ADT_UNSPECIFIED" }, { no: 1, name: "ADT_JOIN" }, { no: 2, name: "ADT_ROOM_API" }, { no: 3, name: "ADT_DISPATCH_API" }]);
var ar2 = m4.makeMessageType("livekit.CreateAgentDispatchRequest", () => [{ no: 1, name: "agent_name", kind: "scalar", T: 9 }, { no: 2, name: "room", kind: "scalar", T: 9 }, { no: 3, name: "metadata", kind: "scalar", T: 9 }, { no: 4, name: "restart_policy", kind: "enum", T: m4.getEnumType(Te3) }, { no: 5, name: "deployment", kind: "scalar", T: 9 }, { no: 6, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var R6 = m4.makeMessageType("livekit.RoomAgentDispatch", () => [{ no: 1, name: "agent_name", kind: "scalar", T: 9 }, { no: 2, name: "metadata", kind: "scalar", T: 9 }, { no: 3, name: "restart_policy", kind: "enum", T: m4.getEnumType(Te3) }, { no: 4, name: "deployment", kind: "scalar", T: 9 }, { no: 5, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var sr2 = m4.makeMessageType("livekit.DeleteAgentDispatchRequest", () => [{ no: 1, name: "dispatch_id", kind: "scalar", T: 9 }, { no: 2, name: "room", kind: "scalar", T: 9 }]);
var or2 = m4.makeMessageType("livekit.ListAgentDispatchRequest", () => [{ no: 1, name: "dispatch_id", kind: "scalar", T: 9 }, { no: 2, name: "room", kind: "scalar", T: 9 }]);
var tr = m4.makeMessageType("livekit.ListAgentDispatchResponse", () => [{ no: 1, name: "agent_dispatches", kind: "message", T: et3, repeated: true }]);
var et3 = m4.makeMessageType("livekit.AgentDispatch", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "agent_name", kind: "scalar", T: 9 }, { no: 3, name: "room", kind: "scalar", T: 9 }, { no: 4, name: "metadata", kind: "scalar", T: 9 }, { no: 5, name: "state", kind: "message", T: nt3 }, { no: 6, name: "restart_policy", kind: "enum", T: m4.getEnumType(Te3) }, { no: 7, name: "deployment", kind: "scalar", T: 9 }, { no: 8, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var nt3 = m4.makeMessageType("livekit.AgentDispatchState", () => [{ no: 1, name: "jobs", kind: "message", T: C7, repeated: true }, { no: 2, name: "created_at", kind: "scalar", T: 3 }, { no: 3, name: "deleted_at", kind: "scalar", T: 3 }, { no: 4, name: "trigger", kind: "enum", T: m4.getEnumType($o) }]);
var at3 = m4.makeMessageType("livekit.PresignedPostRequest", () => [{ no: 1, name: "url", kind: "scalar", T: 9 }, { no: 2, name: "values", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var P6 = m4.makeEnum("livekit.SimulationMode", [{ no: 0, name: "SIMULATION_MODE_UNSPECIFIED", localName: "UNSPECIFIED" }, { no: 1, name: "SIMULATION_MODE_TEXT", localName: "TEXT" }, { no: 2, name: "SIMULATION_MODE_AUDIO", localName: "AUDIO" }]);
var ir2 = m4.makeMessageType("livekit.SimulationRunSummary", () => [{ no: 1, name: "passed", kind: "scalar", T: 5 }, { no: 2, name: "failed", kind: "scalar", T: 5 }, { no: 3, name: "going_well", kind: "scalar", T: 9 }, { no: 4, name: "to_improve", kind: "scalar", T: 9 }, { no: 5, name: "issues", kind: "message", T: st3, repeated: true }, { no: 6, name: "chat_history", kind: "map", K: 9, V: { kind: "message", T: Le3 } }]);
var st3 = m4.makeMessageType("livekit.SimulationRunSummary.Issue", () => [{ no: 1, name: "description", kind: "scalar", T: 9 }, { no: 2, name: "suggestion", kind: "scalar", T: 9 }, { no: 3, name: "label", kind: "scalar", T: 9 }], { localName: "SimulationRunSummary_Issue" });
var Ya = m4.makeMessageType("livekit.SimulationRun", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "project_id", kind: "scalar", T: 9 }, { no: 3, name: "status", kind: "enum", T: m4.getEnumType(ke3) }, { no: 4, name: "agent_description", kind: "scalar", T: 9 }, { no: 5, name: "error", kind: "scalar", T: 9 }, { no: 6, name: "created_at", kind: "message", T: fe4 }, { no: 7, name: "jobs", kind: "message", T: ot3, repeated: true }, { no: 9, name: "agent_name", kind: "scalar", T: 9 }, { no: 10, name: "scenario_group", kind: "message", T: es }, { no: 11, name: "ended_at", kind: "message", T: fe4 }, { no: 12, name: "job_count", kind: "scalar", T: 5 }, { no: 13, name: "passed_count", kind: "scalar", T: 5 }, { no: 14, name: "failed_count", kind: "scalar", T: 5 }, { no: 15, name: "num_simulations", kind: "scalar", T: 5 }, { no: 16, name: "usage", kind: "message", T: lt3 }, { no: 17, name: "concurrency", kind: "scalar", T: 5 }, { no: 18, name: "mode", kind: "enum", T: m4.getEnumType(P6) }, { no: 19, name: "metrics", kind: "message", T: kt2 }, { no: 20, name: "summary_zstd", kind: "scalar", T: 12 }, { no: 21, name: "issue_count", kind: "scalar", T: 5, opt: true }, { no: 22, name: "ci", kind: "message", T: Za, opt: true }, { no: 23, name: "sampling", kind: "message", T: $a, opt: true }]);
var ke3 = m4.makeEnum("livekit.SimulationRun.Status", [{ no: 0, name: "STATUS_PENDING_UPLOAD", localName: "PENDING_UPLOAD" }, { no: 1, name: "STATUS_GENERATING", localName: "GENERATING" }, { no: 2, name: "STATUS_RUNNING", localName: "RUNNING" }, { no: 3, name: "STATUS_SUMMARIZING", localName: "SUMMARIZING" }, { no: 4, name: "STATUS_COMPLETED", localName: "COMPLETED" }, { no: 5, name: "STATUS_FAILED", localName: "FAILED" }, { no: 6, name: "STATUS_CANCELLED", localName: "CANCELLED" }]);
var ot3 = m4.makeMessageType("livekit.SimulationRun.Job", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "status", kind: "enum", T: m4.getEnumType(tt3) }, { no: 3, name: "instructions", kind: "scalar", T: 9 }, { no: 4, name: "error", kind: "scalar", T: 9 }, { no: 5, name: "agent_expectations", kind: "scalar", T: 9 }, { no: 6, name: "label", kind: "scalar", T: 9 }, { no: 7, name: "tags", kind: "scalar", T: 9, repeated: true }, { no: 8, name: "room_name", kind: "scalar", T: 9 }, { no: 10, name: "started_at", kind: "message", T: fe4 }, { no: 11, name: "ended_at", kind: "message", T: fe4 }, { no: 12, name: "room_id", kind: "scalar", T: 9 }, { no: 13, name: "usage", kind: "message", T: mt2 }, { no: 14, name: "metrics", kind: "message", T: rt3 }, { no: 15, name: "scenario_id", kind: "scalar", T: 9 }, { no: 16, name: "sample", kind: "scalar", T: 5 }, { no: 19, name: "failure_reason", kind: "enum", T: m4.getEnumType(it3) }], { localName: "SimulationRun_Job" });
var tt3 = m4.makeEnum("livekit.SimulationRun.Job.Status", [{ no: 0, name: "STATUS_PENDING", localName: "PENDING" }, { no: 1, name: "STATUS_RUNNING", localName: "RUNNING" }, { no: 2, name: "STATUS_COMPLETED", localName: "COMPLETED" }, { no: 3, name: "STATUS_FAILED", localName: "FAILED" }, { no: 4, name: "STATUS_CANCELLED", localName: "CANCELLED" }]);
var it3 = m4.makeEnum("livekit.SimulationRun.Job.FailureReason", [{ no: 0, name: "FAILURE_REASON_UNSPECIFIED", localName: "UNSPECIFIED" }, { no: 1, name: "FAILURE_REASON_AGENT_JOIN_TIMEOUT", localName: "AGENT_JOIN_TIMEOUT" }]);
var mt2 = m4.makeMessageType("livekit.SimulationRun.Job.Usage", () => [{ no: 1, name: "text_turns_count", kind: "scalar", T: 5 }, { no: 2, name: "audio_turns_count", kind: "scalar", T: 5 }], { localName: "SimulationRun_Job_Usage" });
var rt3 = m4.makeMessageType("livekit.SimulationRun.JobMetrics", () => [{ no: 3, name: "task_completion", kind: "scalar", T: 2, opt: true }, { no: 20, name: "overall_score", kind: "scalar", T: 2, opt: true }, { no: 4, name: "stt", kind: "message", T: ja }, { no: 5, name: "llm", kind: "message", T: za }, { no: 6, name: "tts", kind: "message", T: Qa }, { no: 7, name: "conversation", kind: "message", T: Xa }, { no: 9, name: "turns", kind: "message", T: Tt2, repeated: true }, { no: 10, name: "judge_model", kind: "scalar", T: 9 }, { no: 12, name: "has_remote_session", kind: "scalar", T: 8 }, { no: 13, name: "t0", kind: "message", T: fe4 }, { no: 14, name: "conciseness", kind: "scalar", T: 2, opt: true }, { no: 15, name: "unnecessary_tool_calls", kind: "scalar", T: 8, opt: true }, { no: 16, name: "information_loss", kind: "scalar", T: 8, opt: true }, { no: 17, name: "redundant_statements", kind: "scalar", T: 8, opt: true }, { no: 18, name: "poor_question_quality", kind: "scalar", T: 8, opt: true }, { no: 19, name: "conversation_progression", kind: "scalar", T: 2, opt: true }, { no: 21, name: "end_reason", kind: "enum", T: m4.getEnumType(dt3) }, { no: 22, name: "caller_language", kind: "scalar", T: 9 }, { no: 23, name: "caller_listen_language", kind: "scalar", T: 9 }, { no: 24, name: "impairments", kind: "message", T: _t2 }], { localName: "SimulationRun_JobMetrics" });
var dt3 = m4.makeEnum("livekit.SimulationRun.JobMetrics.EndReason", [{ no: 0, name: "END_REASON_UNSPECIFIED", localName: "UNSPECIFIED" }, { no: 1, name: "END_REASON_SCENARIO_COMPLETED", localName: "SCENARIO_COMPLETED" }, { no: 2, name: "END_REASON_AGENT_ENDED", localName: "AGENT_ENDED" }, { no: 3, name: "END_REASON_INACTIVITY", localName: "INACTIVITY" }, { no: 4, name: "END_REASON_TURN_LIMIT", localName: "TURN_LIMIT" }, { no: 5, name: "END_REASON_EMPTY_RESPONSE", localName: "EMPTY_RESPONSE" }, { no: 6, name: "END_REASON_AGENT_ERROR", localName: "AGENT_ERROR" }]);
var ja = m4.makeMessageType("livekit.SimulationRun.JobMetrics.STT", () => [{ no: 1, name: "wer", kind: "scalar", T: 2, opt: true }, { no: 2, name: "words", kind: "scalar", T: 13, opt: true }, { no: 3, name: "word_errors", kind: "scalar", T: 13, opt: true }, { no: 4, name: "cer", kind: "scalar", T: 2, opt: true }, { no: 9, name: "chars", kind: "scalar", T: 13, opt: true }, { no: 10, name: "char_errors", kind: "scalar", T: 13, opt: true }, { no: 8, name: "stt_delay_ms", kind: "scalar", T: 13, opt: true }, { no: 11, name: "entity_recognition", kind: "scalar", T: 2, opt: true }, { no: 12, name: "entities_uttered", kind: "scalar", T: 13, opt: true }, { no: 13, name: "entities_recognized", kind: "scalar", T: 13, opt: true }, { no: 14, name: "entity_recall", kind: "scalar", T: 2, opt: true }, { no: 15, name: "entities_acquired_uttered", kind: "scalar", T: 13, opt: true }, { no: 16, name: "entities_acquired_recognized", kind: "scalar", T: 13, opt: true }], { localName: "SimulationRun_JobMetrics_STT" });
var za = m4.makeMessageType("livekit.SimulationRun.JobMetrics.LLM", () => [{ no: 1, name: "ttft_ms", kind: "scalar", T: 13, opt: true }, { no: 2, name: "ttfs_ms", kind: "scalar", T: 13, opt: true }, { no: 3, name: "tokens_per_second", kind: "scalar", T: 2, opt: true }], { localName: "SimulationRun_JobMetrics_LLM" });
var Qa = m4.makeMessageType("livekit.SimulationRun.JobMetrics.TTS", () => [{ no: 2, name: "ttfb_ms", kind: "scalar", T: 13, opt: true }, { no: 3, name: "wer", kind: "scalar", T: 2, opt: true }, { no: 7, name: "words", kind: "scalar", T: 13, opt: true }, { no: 8, name: "word_errors", kind: "scalar", T: 13, opt: true }, { no: 9, name: "cer", kind: "scalar", T: 2, opt: true }, { no: 10, name: "chars", kind: "scalar", T: 13, opt: true }, { no: 11, name: "char_errors", kind: "scalar", T: 13, opt: true }, { no: 14, name: "entity_recognition", kind: "scalar", T: 2, opt: true }, { no: 15, name: "entities_uttered", kind: "scalar", T: 13, opt: true }, { no: 16, name: "entities_recognized", kind: "scalar", T: 13, opt: true }, { no: 17, name: "entity_recall", kind: "scalar", T: 2, opt: true }, { no: 18, name: "entities_acquired_uttered", kind: "scalar", T: 13, opt: true }, { no: 19, name: "entities_acquired_recognized", kind: "scalar", T: 13, opt: true }], { localName: "SimulationRun_JobMetrics_TTS" });
var Xa = m4.makeMessageType("livekit.SimulationRun.JobMetrics.Conversation", () => [{ no: 1, name: "turn_taking_score", kind: "scalar", T: 2, opt: true }, { no: 2, name: "heard_e2e_latency_p50_ms", kind: "scalar", T: 5, opt: true }, { no: 3, name: "heard_e2e_latency_p95_ms", kind: "scalar", T: 5, opt: true }, { no: 4, name: "heard_e2e_latency_p99_ms", kind: "scalar", T: 5, opt: true }, { no: 5, name: "time_to_yield_ms", kind: "scalar", T: 13, opt: true }, { no: 6, name: "eot_misprediction_count", kind: "scalar", T: 13, opt: true }, { no: 7, name: "overlap_ratio", kind: "scalar", T: 2, opt: true }, { no: 8, name: "overlap_speech_ms", kind: "scalar", T: 13, opt: true }, { no: 9, name: "total_speech_ms", kind: "scalar", T: 13, opt: true }, { no: 11, name: "awkward_silence_count", kind: "scalar", T: 13, opt: true }, { no: 12, name: "unanswered_turns", kind: "scalar", T: 13, opt: true }, { no: 13, name: "false_interruption_count", kind: "scalar", T: 13, opt: true }, { no: 15, name: "e2e_latency_ms", kind: "scalar", T: 13, opt: true }, { no: 16, name: "backchannel_count", kind: "scalar", T: 13, opt: true }], { localName: "SimulationRun_JobMetrics_Conversation" });
var Tt2 = m4.makeMessageType("livekit.SimulationRun.JobMetrics.Turn", () => [{ no: 1, name: "index", kind: "scalar", T: 13 }, { no: 2, name: "role", kind: "enum", T: m4.getEnumType(Q6) }, { no: 18, name: "text", kind: "scalar", T: 9 }, { no: 3, name: "start_ms", kind: "scalar", T: 13, opt: true }, { no: 4, name: "end_ms", kind: "scalar", T: 13, opt: true }, { no: 5, name: "stt_delay_ms", kind: "scalar", T: 13, opt: true }, { no: 6, name: "llm_ttft_ms", kind: "scalar", T: 13, opt: true }, { no: 7, name: "llm_ttfs_ms", kind: "scalar", T: 13, opt: true }, { no: 8, name: "llm_tps", kind: "scalar", T: 2, opt: true }, { no: 9, name: "tts_ttfb_ms", kind: "scalar", T: 13, opt: true }, { no: 10, name: "e2e_latency_ms", kind: "scalar", T: 13, opt: true }, { no: 11, name: "heard_e2e_latency_ms", kind: "scalar", T: 5, opt: true }, { no: 12, name: "time_to_yield_ms", kind: "scalar", T: 13, opt: true }, { no: 13, name: "turn_taking_score", kind: "scalar", T: 2, opt: true }, { no: 14, name: "conciseness", kind: "scalar", T: 2, opt: true }, { no: 15, name: "eot_misprediction", kind: "scalar", T: 8, opt: true }, { no: 16, name: "awkward_silence", kind: "scalar", T: 8, opt: true }, { no: 17, name: "unanswered", kind: "scalar", T: 8, opt: true }], { localName: "SimulationRun_JobMetrics_Turn" });
var kt2 = m4.makeMessageType("livekit.SimulationRun.RunMetrics", () => [{ no: 3, name: "scenario_pass_rate", kind: "scalar", T: 2, opt: true }, { no: 10, name: "overall_score", kind: "scalar", T: 2, opt: true }, { no: 4, name: "stt", kind: "message", T: ja }, { no: 5, name: "llm", kind: "message", T: za }, { no: 6, name: "tts", kind: "message", T: Qa }, { no: 7, name: "conversation", kind: "message", T: Xa }, { no: 8, name: "conciseness", kind: "scalar", T: 2, opt: true }, { no: 9, name: "conversation_progression", kind: "scalar", T: 2, opt: true }], { localName: "SimulationRun_RunMetrics" });
var Za = m4.makeMessageType("livekit.SimulationRun.CI", () => [{ no: 1, name: "provider", kind: "scalar", T: 9 }, { no: 2, name: "commit_sha", kind: "scalar", T: 9 }, { no: 3, name: "ref", kind: "scalar", T: 9 }, { no: 4, name: "pull_request", kind: "scalar", T: 9 }, { no: 5, name: "run_url", kind: "scalar", T: 9 }, { no: 6, name: "actor", kind: "scalar", T: 9 }], { localName: "SimulationRun_CI" });
var $a = m4.makeMessageType("livekit.SimulationRun.SamplingOptions", () => [{ no: 1, name: "samples", kind: "scalar", T: 5 }, { no: 2, name: "pass_rate", kind: "scalar", T: 1 }], { localName: "SimulationRun_SamplingOptions" });
var mr = m4.makeMessageType("livekit.SimulationRun.Create", [], { localName: "SimulationRun_Create" });
var rr2 = m4.makeMessageType("livekit.SimulationRun.Create.Request", () => [{ no: 1, name: "project_id", kind: "scalar", T: 9 }, { no: 2, name: "agent_name", kind: "scalar", T: 9 }, { no: 4, name: "num_simulations", kind: "scalar", T: 5 }, { no: 6, name: "region", kind: "scalar", T: 9 }, { no: 7, name: "scenario_group", kind: "message", T: es, opt: true }, { no: 8, name: "concurrency", kind: "scalar", T: 5, opt: true }, { no: 9, name: "mode", kind: "enum", T: m4.getEnumType(P6) }, { no: 10, name: "background_noise", kind: "scalar", T: 8 }, { no: 11, name: "low_quality_microphone", kind: "scalar", T: 8 }, { no: 12, name: "packet_loss", kind: "scalar", T: 8 }, { no: 13, name: "ci", kind: "message", T: Za, opt: true }, { no: 14, name: "sampling", kind: "message", T: $a, opt: true }, { no: 15, name: "sip_call_to", kind: "scalar", T: 9 }, { no: 16, name: "sip_trunk_id", kind: "scalar", T: 9 }, { no: 17, name: "sip_number", kind: "scalar", T: 9 }, { no: 18, name: "deployment", kind: "scalar", T: 9 }], { localName: "SimulationRun_Create_Request" });
var dr2 = m4.makeMessageType("livekit.SimulationRun.Create.Response", () => [{ no: 1, name: "simulation_run_id", kind: "scalar", T: 9 }, { no: 2, name: "presigned_post_request", kind: "message", T: at3 }], { localName: "SimulationRun_Create_Response" });
var Tr2 = m4.makeMessageType("livekit.SimulationRun.ConfirmSourceUpload", [], { localName: "SimulationRun_ConfirmSourceUpload" });
var kr = m4.makeMessageType("livekit.SimulationRun.ConfirmSourceUpload.Request", () => [{ no: 1, name: "project_id", kind: "scalar", T: 9 }, { no: 2, name: "simulation_run_id", kind: "scalar", T: 9 }, { no: 3, name: "code_entrypoint", kind: "scalar", T: 9 }], { localName: "SimulationRun_ConfirmSourceUpload_Request" });
var cr2 = m4.makeMessageType("livekit.SimulationRun.ConfirmSourceUpload.Response", [], { localName: "SimulationRun_ConfirmSourceUpload_Response" });
var lr2 = m4.makeMessageType("livekit.SimulationRun.Get", [], { localName: "SimulationRun_Get" });
var _r = m4.makeMessageType("livekit.SimulationRun.Get.Request", () => [{ no: 1, name: "project_id", kind: "scalar", T: 9 }, { no: 2, name: "simulation_run_id", kind: "scalar", T: 9 }], { localName: "SimulationRun_Get_Request" });
var pr2 = m4.makeMessageType("livekit.SimulationRun.Get.Response", () => [{ no: 1, name: "run", kind: "message", T: Ya }], { localName: "SimulationRun_Get_Response" });
var ur2 = m4.makeMessageType("livekit.SimulationRun.List", [], { localName: "SimulationRun_List" });
var gr2 = m4.makeMessageType("livekit.SimulationRun.List.Request", () => [{ no: 1, name: "project_id", kind: "scalar", T: 9 }, { no: 2, name: "status", kind: "enum", T: m4.getEnumType(ke3), opt: true }, { no: 3, name: "page_token", kind: "message", T: u3, opt: true }, { no: 4, name: "start_time", kind: "message", T: fe4, opt: true }, { no: 5, name: "end_time", kind: "message", T: fe4, opt: true }, { no: 6, name: "agent_name", kind: "scalar", T: 9, opt: true }, { no: 7, name: "mode", kind: "enum", T: m4.getEnumType(P6), opt: true }], { localName: "SimulationRun_List_Request" });
var Sr2 = m4.makeMessageType("livekit.SimulationRun.List.Response", () => [{ no: 1, name: "runs", kind: "message", T: Ya, repeated: true }, { no: 2, name: "next_page_token", kind: "message", T: u3 }], { localName: "SimulationRun_List_Response" });
var Er2 = m4.makeMessageType("livekit.SimulationRun.Counts", [], { localName: "SimulationRun_Counts" });
var Rr = m4.makeMessageType("livekit.SimulationRun.Counts.Request", () => [{ no: 1, name: "project_id", kind: "scalar", T: 9 }, { no: 2, name: "start_time", kind: "message", T: fe4 }, { no: 3, name: "end_time", kind: "message", T: fe4 }, { no: 4, name: "status", kind: "enum", T: m4.getEnumType(ke3), opt: true }, { no: 5, name: "agent_name", kind: "scalar", T: 9, opt: true }, { no: 6, name: "mode", kind: "enum", T: m4.getEnumType(P6), opt: true }], { localName: "SimulationRun_Counts_Request" });
var Ir = m4.makeMessageType("livekit.SimulationRun.Counts.Response", () => [{ no: 1, name: "buckets", kind: "message", T: ct3, repeated: true }, { no: 2, name: "interval", kind: "message", T: oe4 }], { localName: "SimulationRun_Counts_Response" });
var ct3 = m4.makeMessageType("livekit.SimulationRun.Counts.Bucket", () => [{ no: 1, name: "bucket_start", kind: "message", T: fe4 }, { no: 2, name: "count", kind: "scalar", T: 4 }], { localName: "SimulationRun_Counts_Bucket" });
var yr2 = m4.makeMessageType("livekit.SimulationRun.Cancel", [], { localName: "SimulationRun_Cancel" });
var Ar = m4.makeMessageType("livekit.SimulationRun.Cancel.Request", () => [{ no: 1, name: "project_id", kind: "scalar", T: 9 }, { no: 2, name: "simulation_run_id", kind: "scalar", T: 9 }], { localName: "SimulationRun_Cancel_Request" });
var vr2 = m4.makeMessageType("livekit.SimulationRun.Cancel.Response", [], { localName: "SimulationRun_Cancel_Response" });
var lt3 = m4.makeMessageType("livekit.SimulationRun.Usage", () => [{ no: 1, name: "text_turns_count", kind: "scalar", T: 5 }, { no: 2, name: "audio_turns_count", kind: "scalar", T: 5 }], { localName: "SimulationRun_Usage" });
var ce4 = m4.makeMessageType("livekit.Scenario", () => [{ no: 1, name: "label", kind: "scalar", T: 9 }, { no: 2, name: "instructions", kind: "scalar", T: 9 }, { no: 3, name: "agent_expectations", kind: "scalar", T: 9 }, { no: 4, name: "tags", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 5, name: "userdata", kind: "scalar", T: 9 }, { no: 6, name: "id", kind: "scalar", T: 9 }]);
var Mr = m4.makeMessageType("livekit.Scenario.CreateFromSession", [], { localName: "Scenario_CreateFromSession" });
var Nr2 = m4.makeMessageType("livekit.Scenario.CreateFromSession.Request", () => [{ no: 1, name: "project_id", kind: "scalar", T: 9 }, { no: 2, name: "room_id", kind: "scalar", T: 9 }, { no: 3, name: "region", kind: "scalar", T: 9 }], { localName: "Scenario_CreateFromSession_Request" });
var fr2 = m4.makeMessageType("livekit.Scenario.CreateFromSession.Response", () => [{ no: 1, name: "scenario", kind: "message", T: ce4 }], { localName: "Scenario_CreateFromSession_Response" });
var es = m4.makeMessageType("livekit.ScenarioGroup", () => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "scenarios", kind: "message", T: ce4, repeated: true }, { no: 3, name: "id", kind: "scalar", T: 9 }]);
var _t2 = m4.makeMessageType("livekit.SimulationImpairments", () => [{ no: 1, name: "background_noise", kind: "scalar", T: 8 }, { no: 2, name: "low_quality_microphone", kind: "scalar", T: 8 }, { no: 3, name: "packet_loss", kind: "scalar", T: 8 }]);
var Cr2 = m4.makeMessageType("livekit.SimulationDispatch", () => [{ no: 1, name: "simulation_run_id", kind: "scalar", T: 9 }, { no: 2, name: "job_id", kind: "scalar", T: 9 }, { no: 3, name: "scenario", kind: "message", T: ce4 }, { no: 4, name: "mode", kind: "enum", T: m4.getEnumType(P6) }]);
var pt3 = m4.makeEnum("livekit.AudioChannel", [{ no: 0, name: "AUDIO_CHANNEL_BOTH", localName: "BOTH" }, { no: 1, name: "AUDIO_CHANNEL_LEFT", localName: "LEFT" }, { no: 2, name: "AUDIO_CHANNEL_RIGHT", localName: "RIGHT" }]);
var c4 = m4.makeEnum("livekit.EncodingOptionsPreset", [{ no: 0, name: "H264_720P_30" }, { no: 1, name: "H264_720P_60" }, { no: 2, name: "H264_1080P_30" }, { no: 3, name: "H264_1080P_60" }, { no: 4, name: "PORTRAIT_H264_720P_30" }, { no: 5, name: "PORTRAIT_H264_720P_60" }, { no: 6, name: "PORTRAIT_H264_1080P_30" }, { no: 7, name: "PORTRAIT_H264_1080P_60" }, { no: 8, name: "PASSTHROUGH" }]);
var ns = m4.makeEnum("livekit.EncodedFileType", [{ no: 0, name: "DEFAULT_FILETYPE" }, { no: 1, name: "MP4" }, { no: 2, name: "OGG" }, { no: 3, name: "MP3" }, { no: 4, name: "MCAP" }]);
var ut3 = m4.makeEnum("livekit.StreamProtocol", [{ no: 0, name: "DEFAULT_PROTOCOL" }, { no: 1, name: "RTMP" }, { no: 2, name: "SRT" }, { no: 3, name: "WEBSOCKET" }]);
var gt3 = m4.makeEnum("livekit.SegmentedFileProtocol", [{ no: 0, name: "DEFAULT_SEGMENTED_FILE_PROTOCOL" }, { no: 1, name: "HLS_PROTOCOL" }, { no: 2, name: "HLS_FMP4_PROTOCOL" }]);
var St3 = m4.makeEnum("livekit.SegmentedFileSuffix", [{ no: 0, name: "INDEX" }, { no: 1, name: "TIMESTAMP" }]);
var Et3 = m4.makeEnum("livekit.ImageFileSuffix", [{ no: 0, name: "IMAGE_SUFFIX_INDEX" }, { no: 1, name: "IMAGE_SUFFIX_TIMESTAMP" }, { no: 2, name: "IMAGE_SUFFIX_NONE_OVERWRITE" }]);
var Rt3 = m4.makeEnum("livekit.EgressSourceType", [{ no: 0, name: "EGRESS_SOURCE_TYPE_WEB", localName: "WEB" }, { no: 1, name: "EGRESS_SOURCE_TYPE_SDK", localName: "SDK" }]);
var It3 = m4.makeEnum("livekit.EgressStatus", [{ no: 0, name: "EGRESS_STARTING" }, { no: 1, name: "EGRESS_ACTIVE" }, { no: 2, name: "EGRESS_ENDING" }, { no: 3, name: "EGRESS_COMPLETE" }, { no: 4, name: "EGRESS_FAILED" }, { no: 5, name: "EGRESS_ABORTED" }, { no: 6, name: "EGRESS_LIMIT_REACHED" }]);
var yt3 = m4.makeEnum("livekit.AudioMixing", [{ no: 0, name: "DEFAULT_MIXING" }, { no: 1, name: "DUAL_CHANNEL_AGENT" }, { no: 2, name: "DUAL_CHANNEL_ALTERNATE" }]);
var At3 = m4.makeMessageType("livekit.StartEgressRequest", () => [{ no: 1, name: "room_name", kind: "scalar", T: 9 }, { no: 2, name: "template", kind: "message", T: as, oneof: "source" }, { no: 3, name: "web", kind: "message", T: ss, oneof: "source" }, { no: 4, name: "media", kind: "message", T: os, oneof: "source" }, { no: 5, name: "preset", kind: "enum", T: m4.getEnumType(c4), oneof: "encoding" }, { no: 6, name: "advanced", kind: "message", T: l2, oneof: "encoding" }, { no: 7, name: "outputs", kind: "message", T: ts, repeated: true }, { no: 8, name: "storage", kind: "message", T: le3 }, { no: 9, name: "webhooks", kind: "message", T: k4, repeated: true }]);
var as = m4.makeMessageType("livekit.TemplateSource", () => [{ no: 1, name: "layout", kind: "scalar", T: 9 }, { no: 2, name: "audio_only", kind: "scalar", T: 8 }, { no: 3, name: "video_only", kind: "scalar", T: 8 }, { no: 4, name: "custom_base_url", kind: "scalar", T: 9 }]);
var ss = m4.makeMessageType("livekit.WebSource", () => [{ no: 1, name: "url", kind: "scalar", T: 9 }, { no: 2, name: "audio_only", kind: "scalar", T: 8 }, { no: 3, name: "video_only", kind: "scalar", T: 8 }, { no: 4, name: "await_start_signal", kind: "scalar", T: 8 }]);
var os = m4.makeMessageType("livekit.MediaSource", () => [{ no: 1, name: "video_track_id", kind: "scalar", T: 9, oneof: "video" }, { no: 2, name: "participant_video", kind: "message", T: vt3, oneof: "video" }, { no: 5, name: "videos", kind: "message", T: Mt3, oneof: "video" }, { no: 3, name: "audio", kind: "message", T: ft3 }, { no: 4, name: "data", kind: "message", T: Pt3 }]);
var vt3 = m4.makeMessageType("livekit.ParticipantVideo", () => [{ no: 1, name: "identity", kind: "scalar", T: 9 }, { no: 2, name: "prefer_screen_share", kind: "scalar", T: 8 }]);
var Mt3 = m4.makeMessageType("livekit.VideoConfig", () => [{ no: 1, name: "capture_all", kind: "scalar", T: 8 }, { no: 2, name: "selectors", kind: "message", T: Nt3, repeated: true }]);
var Nt3 = m4.makeMessageType("livekit.VideoSelector", () => [{ no: 1, name: "track_id", kind: "scalar", T: 9, oneof: "match" }, { no: 2, name: "participant_identity", kind: "scalar", T: 9, oneof: "match" }, { no: 3, name: "track_name", kind: "scalar", T: 9 }, { no: 4, name: "exclude", kind: "scalar", T: 8 }]);
var ft3 = m4.makeMessageType("livekit.AudioConfig", () => [{ no: 1, name: "capture_all", kind: "scalar", T: 8 }, { no: 2, name: "routes", kind: "message", T: Ct3, repeated: true }]);
var Ct3 = m4.makeMessageType("livekit.AudioRoute", () => [{ no: 1, name: "track_id", kind: "scalar", T: 9, oneof: "match" }, { no: 2, name: "participant_identity", kind: "scalar", T: 9, oneof: "match" }, { no: 3, name: "participant_kind", kind: "enum", T: m4.getEnumType(Na), oneof: "match" }, { no: 5, name: "track_name", kind: "scalar", T: 9 }, { no: 6, name: "exclude", kind: "scalar", T: 8 }, { no: 4, name: "channel", kind: "enum", T: m4.getEnumType(pt3) }]);
var Pt3 = m4.makeMessageType("livekit.DataConfig", () => [{ no: 1, name: "capture_all", kind: "scalar", T: 8 }, { no: 2, name: "selectors", kind: "message", T: Dt2, repeated: true }]);
var Dt2 = m4.makeMessageType("livekit.DataSelector", () => [{ no: 1, name: "track_id", kind: "scalar", T: 9, oneof: "match" }, { no: 2, name: "participant_identity", kind: "scalar", T: 9, oneof: "match" }, { no: 3, name: "track_name", kind: "scalar", T: 9 }, { no: 4, name: "exclude", kind: "scalar", T: 8 }]);
var l2 = m4.makeMessageType("livekit.EncodingOptions", () => [{ no: 1, name: "width", kind: "scalar", T: 5 }, { no: 2, name: "height", kind: "scalar", T: 5 }, { no: 3, name: "depth", kind: "scalar", T: 5 }, { no: 4, name: "framerate", kind: "scalar", T: 5 }, { no: 5, name: "audio_codec", kind: "enum", T: m4.getEnumType(Sa) }, { no: 6, name: "audio_bitrate", kind: "scalar", T: 5 }, { no: 7, name: "audio_frequency", kind: "scalar", T: 5 }, { no: 8, name: "video_codec", kind: "enum", T: m4.getEnumType(Ea) }, { no: 9, name: "video_bitrate", kind: "scalar", T: 5 }, { no: 10, name: "key_frame_interval", kind: "scalar", T: 1 }, { no: 11, name: "audio_quality", kind: "scalar", T: 5 }, { no: 12, name: "video_quality", kind: "scalar", T: 5 }]);
var ts = m4.makeMessageType("livekit.Output", () => [{ no: 1, name: "file", kind: "message", T: Ot3, oneof: "config" }, { no: 2, name: "stream", kind: "message", T: i4, oneof: "config" }, { no: 3, name: "segments", kind: "message", T: o3, oneof: "config" }, { no: 4, name: "images", kind: "message", T: D7, oneof: "config" }, { no: 6, name: "storage", kind: "message", T: le3 }]);
var Ot3 = m4.makeMessageType("livekit.FileOutput", () => [{ no: 1, name: "file_type", kind: "enum", T: m4.getEnumType(ns) }, { no: 2, name: "filepath", kind: "scalar", T: 9 }, { no: 3, name: "disable_manifest", kind: "scalar", T: 8 }]);
var i4 = m4.makeMessageType("livekit.StreamOutput", () => [{ no: 1, name: "protocol", kind: "enum", T: m4.getEnumType(ut3) }, { no: 2, name: "urls", kind: "scalar", T: 9, repeated: true }, { no: 3, name: "destinations", kind: "message", T: is, repeated: true }]);
var is = m4.makeMessageType("livekit.StreamDestination", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "url", kind: "scalar", T: 9 }]);
var o3 = m4.makeMessageType("livekit.SegmentedFileOutput", () => [{ no: 1, name: "protocol", kind: "enum", T: m4.getEnumType(gt3) }, { no: 2, name: "filename_prefix", kind: "scalar", T: 9 }, { no: 3, name: "playlist_name", kind: "scalar", T: 9 }, { no: 11, name: "live_playlist_name", kind: "scalar", T: 9 }, { no: 4, name: "segment_duration", kind: "scalar", T: 13 }, { no: 10, name: "filename_suffix", kind: "enum", T: m4.getEnumType(St3) }, { no: 8, name: "disable_manifest", kind: "scalar", T: 8 }, { no: 5, name: "s3", kind: "message", T: I6, oneof: "output" }, { no: 6, name: "gcp", kind: "message", T: y5, oneof: "output" }, { no: 7, name: "azure", kind: "message", T: A9, oneof: "output" }, { no: 9, name: "aliOSS", kind: "message", T: v4, oneof: "output" }]);
var D7 = m4.makeMessageType("livekit.ImageOutput", () => [{ no: 1, name: "capture_interval", kind: "scalar", T: 13 }, { no: 2, name: "width", kind: "scalar", T: 5 }, { no: 3, name: "height", kind: "scalar", T: 5 }, { no: 4, name: "filename_prefix", kind: "scalar", T: 9 }, { no: 5, name: "filename_suffix", kind: "enum", T: m4.getEnumType(Et3) }, { no: 6, name: "image_codec", kind: "enum", T: m4.getEnumType(so) }, { no: 7, name: "disable_manifest", kind: "scalar", T: 8 }, { no: 8, name: "s3", kind: "message", T: I6, oneof: "output" }, { no: 9, name: "gcp", kind: "message", T: y5, oneof: "output" }, { no: 10, name: "azure", kind: "message", T: A9, oneof: "output" }, { no: 11, name: "aliOSS", kind: "message", T: v4, oneof: "output" }]);
var le3 = m4.makeMessageType("livekit.StorageConfig", () => [{ no: 1, name: "s3", kind: "message", T: I6, oneof: "provider" }, { no: 2, name: "gcp", kind: "message", T: y5, oneof: "provider" }, { no: 3, name: "azure", kind: "message", T: A9, oneof: "provider" }, { no: 4, name: "aliOSS", kind: "message", T: v4, oneof: "provider" }]);
var I6 = m4.makeMessageType("livekit.S3Upload", () => [{ no: 1, name: "access_key", kind: "scalar", T: 9 }, { no: 2, name: "secret", kind: "scalar", T: 9 }, { no: 11, name: "session_token", kind: "scalar", T: 9 }, { no: 12, name: "assume_role_arn", kind: "scalar", T: 9 }, { no: 13, name: "assume_role_external_id", kind: "scalar", T: 9 }, { no: 3, name: "region", kind: "scalar", T: 9 }, { no: 4, name: "endpoint", kind: "scalar", T: 9 }, { no: 5, name: "bucket", kind: "scalar", T: 9 }, { no: 6, name: "force_path_style", kind: "scalar", T: 8 }, { no: 7, name: "metadata", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 8, name: "tagging", kind: "scalar", T: 9 }, { no: 9, name: "content_disposition", kind: "scalar", T: 9 }, { no: 10, name: "proxy", kind: "message", T: ms }]);
var y5 = m4.makeMessageType("livekit.GCPUpload", () => [{ no: 1, name: "credentials", kind: "scalar", T: 9 }, { no: 2, name: "bucket", kind: "scalar", T: 9 }, { no: 3, name: "proxy", kind: "message", T: ms }]);
var A9 = m4.makeMessageType("livekit.AzureBlobUpload", () => [{ no: 1, name: "account_name", kind: "scalar", T: 9 }, { no: 2, name: "account_key", kind: "scalar", T: 9 }, { no: 3, name: "container_name", kind: "scalar", T: 9 }]);
var v4 = m4.makeMessageType("livekit.AliOSSUpload", () => [{ no: 1, name: "access_key", kind: "scalar", T: 9 }, { no: 2, name: "secret", kind: "scalar", T: 9 }, { no: 3, name: "region", kind: "scalar", T: 9 }, { no: 4, name: "endpoint", kind: "scalar", T: 9 }, { no: 5, name: "bucket", kind: "scalar", T: 9 }]);
var ms = m4.makeMessageType("livekit.ProxyConfig", () => [{ no: 1, name: "url", kind: "scalar", T: 9 }, { no: 2, name: "username", kind: "scalar", T: 9 }, { no: 3, name: "password", kind: "scalar", T: 9 }]);
var Pr = m4.makeMessageType("livekit.ListEgressRequest", () => [{ no: 1, name: "room_name", kind: "scalar", T: 9 }, { no: 2, name: "egress_id", kind: "scalar", T: 9 }, { no: 3, name: "active", kind: "scalar", T: 8 }, { no: 4, name: "page_token", kind: "message", T: u3 }]);
var Dr = m4.makeMessageType("livekit.ListEgressResponse", () => [{ no: 1, name: "items", kind: "message", T: _e3, repeated: true }, { no: 2, name: "next_page_token", kind: "message", T: u3 }]);
var Or2 = m4.makeMessageType("livekit.StopEgressRequest", () => [{ no: 1, name: "egress_id", kind: "scalar", T: 9 }]);
var _e3 = m4.makeMessageType("livekit.EgressInfo", () => [{ no: 1, name: "egress_id", kind: "scalar", T: 9 }, { no: 2, name: "room_id", kind: "scalar", T: 9 }, { no: 13, name: "room_name", kind: "scalar", T: 9 }, { no: 26, name: "source_type", kind: "enum", T: m4.getEnumType(Rt3) }, { no: 3, name: "status", kind: "enum", T: m4.getEnumType(It3) }, { no: 10, name: "started_at", kind: "scalar", T: 3 }, { no: 11, name: "ended_at", kind: "scalar", T: 3 }, { no: 18, name: "updated_at", kind: "scalar", T: 3 }, { no: 29, name: "egress", kind: "message", T: At3, oneof: "request" }, { no: 30, name: "replay", kind: "message", T: qt2, oneof: "request" }, { no: 4, name: "room_composite", kind: "message", T: ds, oneof: "request" }, { no: 14, name: "web", kind: "message", T: Ft3, oneof: "request" }, { no: 19, name: "participant", kind: "message", T: Gt3, oneof: "request" }, { no: 5, name: "track_composite", kind: "message", T: Ht3, oneof: "request" }, { no: 6, name: "track", kind: "message", T: Bt3, oneof: "request" }, { no: 15, name: "stream_results", kind: "message", T: rs, repeated: true }, { no: 16, name: "file_results", kind: "message", T: Ne3, repeated: true }, { no: 17, name: "segment_results", kind: "message", T: fe5, repeated: true }, { no: 20, name: "image_results", kind: "message", T: bt3, repeated: true }, { no: 9, name: "error", kind: "scalar", T: 9 }, { no: 22, name: "error_code", kind: "scalar", T: 5 }, { no: 21, name: "details", kind: "scalar", T: 9 }, { no: 23, name: "manifest_location", kind: "scalar", T: 9 }, { no: 25, name: "backup_storage_used", kind: "scalar", T: 8 }, { no: 27, name: "retry_count", kind: "scalar", T: 5 }, { no: 7, name: "stream", kind: "message", T: xt3, oneof: "result" }, { no: 8, name: "file", kind: "message", T: Ne3, oneof: "result" }, { no: 12, name: "segments", kind: "message", T: fe5, oneof: "result" }]);
var rs = m4.makeMessageType("livekit.StreamInfo", () => [{ no: 1, name: "url", kind: "scalar", T: 9 }, { no: 2, name: "started_at", kind: "scalar", T: 3 }, { no: 3, name: "ended_at", kind: "scalar", T: 3 }, { no: 4, name: "duration", kind: "scalar", T: 3 }, { no: 5, name: "status", kind: "enum", T: m4.getEnumType(Ut3) }, { no: 6, name: "error", kind: "scalar", T: 9 }, { no: 7, name: "last_retry_at", kind: "scalar", T: 3 }, { no: 8, name: "retries", kind: "scalar", T: 13 }, { no: 9, name: "id", kind: "scalar", T: 9 }]);
var Ut3 = m4.makeEnum("livekit.StreamInfo.Status", [{ no: 0, name: "ACTIVE" }, { no: 1, name: "FINISHED" }, { no: 2, name: "FAILED" }]);
var Ne3 = m4.makeMessageType("livekit.FileInfo", () => [{ no: 1, name: "filename", kind: "scalar", T: 9 }, { no: 2, name: "started_at", kind: "scalar", T: 3 }, { no: 3, name: "ended_at", kind: "scalar", T: 3 }, { no: 6, name: "duration", kind: "scalar", T: 3 }, { no: 4, name: "size", kind: "scalar", T: 3 }, { no: 5, name: "location", kind: "scalar", T: 9 }]);
var fe5 = m4.makeMessageType("livekit.SegmentsInfo", () => [{ no: 1, name: "playlist_name", kind: "scalar", T: 9 }, { no: 8, name: "live_playlist_name", kind: "scalar", T: 9 }, { no: 2, name: "duration", kind: "scalar", T: 3 }, { no: 3, name: "size", kind: "scalar", T: 3 }, { no: 4, name: "playlist_location", kind: "scalar", T: 9 }, { no: 9, name: "live_playlist_location", kind: "scalar", T: 9 }, { no: 5, name: "segment_count", kind: "scalar", T: 3 }, { no: 6, name: "started_at", kind: "scalar", T: 3 }, { no: 7, name: "ended_at", kind: "scalar", T: 3 }]);
var bt3 = m4.makeMessageType("livekit.ImagesInfo", () => [{ no: 4, name: "filename_prefix", kind: "scalar", T: 9 }, { no: 1, name: "image_count", kind: "scalar", T: 3 }, { no: 2, name: "started_at", kind: "scalar", T: 3 }, { no: 3, name: "ended_at", kind: "scalar", T: 3 }]);
var ht3 = m4.makeMessageType("livekit.AutoParticipantEgress", () => [{ no: 1, name: "preset", kind: "enum", T: m4.getEnumType(c4), oneof: "options" }, { no: 2, name: "advanced", kind: "message", T: l2, oneof: "options" }, { no: 3, name: "file_outputs", kind: "message", T: m5, repeated: true }, { no: 4, name: "segment_outputs", kind: "message", T: o3, repeated: true }]);
var Lt3 = m4.makeMessageType("livekit.AutoTrackEgress", () => [{ no: 1, name: "filepath", kind: "scalar", T: 9 }, { no: 5, name: "disable_manifest", kind: "scalar", T: 8 }, { no: 2, name: "s3", kind: "message", T: I6, oneof: "output" }, { no: 3, name: "gcp", kind: "message", T: y5, oneof: "output" }, { no: 4, name: "azure", kind: "message", T: A9, oneof: "output" }, { no: 6, name: "aliOSS", kind: "message", T: v4, oneof: "output" }]);
var qt2 = m4.makeMessageType("livekit.ExportReplayRequest", () => [{ no: 1, name: "replay_id", kind: "scalar", T: 9 }, { no: 2, name: "start_offset_ms", kind: "scalar", T: 3 }, { no: 3, name: "end_offset_ms", kind: "scalar", T: 3 }, { no: 4, name: "template", kind: "message", T: as, oneof: "source" }, { no: 5, name: "web", kind: "message", T: ss, oneof: "source" }, { no: 6, name: "media", kind: "message", T: os, oneof: "source" }, { no: 7, name: "preset", kind: "enum", T: m4.getEnumType(c4), oneof: "encoding" }, { no: 8, name: "advanced", kind: "message", T: l2, oneof: "encoding" }, { no: 9, name: "outputs", kind: "message", T: ts, repeated: true }, { no: 10, name: "storage", kind: "message", T: le3 }, { no: 11, name: "webhooks", kind: "message", T: k4, repeated: true }]);
var ds = m4.makeMessageType("livekit.RoomCompositeEgressRequest", () => [{ no: 1, name: "room_name", kind: "scalar", T: 9 }, { no: 2, name: "layout", kind: "scalar", T: 9 }, { no: 3, name: "audio_only", kind: "scalar", T: 8 }, { no: 15, name: "audio_mixing", kind: "enum", T: m4.getEnumType(yt3) }, { no: 4, name: "video_only", kind: "scalar", T: 8 }, { no: 5, name: "custom_base_url", kind: "scalar", T: 9 }, { no: 6, name: "file", kind: "message", T: m5, oneof: "output" }, { no: 7, name: "stream", kind: "message", T: i4, oneof: "output" }, { no: 10, name: "segments", kind: "message", T: o3, oneof: "output" }, { no: 8, name: "preset", kind: "enum", T: m4.getEnumType(c4), oneof: "options" }, { no: 9, name: "advanced", kind: "message", T: l2, oneof: "options" }, { no: 11, name: "file_outputs", kind: "message", T: m5, repeated: true }, { no: 12, name: "stream_outputs", kind: "message", T: i4, repeated: true }, { no: 13, name: "segment_outputs", kind: "message", T: o3, repeated: true }, { no: 14, name: "image_outputs", kind: "message", T: D7, repeated: true }, { no: 16, name: "webhooks", kind: "message", T: k4, repeated: true }]);
var Ft3 = m4.makeMessageType("livekit.WebEgressRequest", () => [{ no: 1, name: "url", kind: "scalar", T: 9 }, { no: 2, name: "audio_only", kind: "scalar", T: 8 }, { no: 3, name: "video_only", kind: "scalar", T: 8 }, { no: 12, name: "await_start_signal", kind: "scalar", T: 8 }, { no: 4, name: "file", kind: "message", T: m5, oneof: "output" }, { no: 5, name: "stream", kind: "message", T: i4, oneof: "output" }, { no: 6, name: "segments", kind: "message", T: o3, oneof: "output" }, { no: 7, name: "preset", kind: "enum", T: m4.getEnumType(c4), oneof: "options" }, { no: 8, name: "advanced", kind: "message", T: l2, oneof: "options" }, { no: 9, name: "file_outputs", kind: "message", T: m5, repeated: true }, { no: 10, name: "stream_outputs", kind: "message", T: i4, repeated: true }, { no: 11, name: "segment_outputs", kind: "message", T: o3, repeated: true }, { no: 13, name: "image_outputs", kind: "message", T: D7, repeated: true }, { no: 14, name: "webhooks", kind: "message", T: k4, repeated: true }]);
var Gt3 = m4.makeMessageType("livekit.ParticipantEgressRequest", () => [{ no: 1, name: "room_name", kind: "scalar", T: 9 }, { no: 2, name: "identity", kind: "scalar", T: 9 }, { no: 3, name: "screen_share", kind: "scalar", T: 8 }, { no: 4, name: "preset", kind: "enum", T: m4.getEnumType(c4), oneof: "options" }, { no: 5, name: "advanced", kind: "message", T: l2, oneof: "options" }, { no: 6, name: "file_outputs", kind: "message", T: m5, repeated: true }, { no: 7, name: "stream_outputs", kind: "message", T: i4, repeated: true }, { no: 8, name: "segment_outputs", kind: "message", T: o3, repeated: true }, { no: 9, name: "image_outputs", kind: "message", T: D7, repeated: true }, { no: 10, name: "webhooks", kind: "message", T: k4, repeated: true }]);
var Ht3 = m4.makeMessageType("livekit.TrackCompositeEgressRequest", () => [{ no: 1, name: "room_name", kind: "scalar", T: 9 }, { no: 2, name: "audio_track_id", kind: "scalar", T: 9 }, { no: 3, name: "video_track_id", kind: "scalar", T: 9 }, { no: 4, name: "file", kind: "message", T: m5, oneof: "output" }, { no: 5, name: "stream", kind: "message", T: i4, oneof: "output" }, { no: 8, name: "segments", kind: "message", T: o3, oneof: "output" }, { no: 6, name: "preset", kind: "enum", T: m4.getEnumType(c4), oneof: "options" }, { no: 7, name: "advanced", kind: "message", T: l2, oneof: "options" }, { no: 11, name: "file_outputs", kind: "message", T: m5, repeated: true }, { no: 12, name: "stream_outputs", kind: "message", T: i4, repeated: true }, { no: 13, name: "segment_outputs", kind: "message", T: o3, repeated: true }, { no: 14, name: "image_outputs", kind: "message", T: D7, repeated: true }, { no: 15, name: "webhooks", kind: "message", T: k4, repeated: true }]);
var Bt3 = m4.makeMessageType("livekit.TrackEgressRequest", () => [{ no: 1, name: "room_name", kind: "scalar", T: 9 }, { no: 2, name: "track_id", kind: "scalar", T: 9 }, { no: 3, name: "file", kind: "message", T: Kt2, oneof: "output" }, { no: 4, name: "websocket_url", kind: "scalar", T: 9, oneof: "output" }, { no: 5, name: "webhooks", kind: "message", T: k4, repeated: true }]);
var Kt2 = m4.makeMessageType("livekit.DirectFileOutput", () => [{ no: 1, name: "filepath", kind: "scalar", T: 9 }, { no: 5, name: "disable_manifest", kind: "scalar", T: 8 }, { no: 2, name: "s3", kind: "message", T: I6, oneof: "output" }, { no: 3, name: "gcp", kind: "message", T: y5, oneof: "output" }, { no: 4, name: "azure", kind: "message", T: A9, oneof: "output" }, { no: 6, name: "aliOSS", kind: "message", T: v4, oneof: "output" }]);
var m5 = m4.makeMessageType("livekit.EncodedFileOutput", () => [{ no: 1, name: "file_type", kind: "enum", T: m4.getEnumType(ns) }, { no: 2, name: "filepath", kind: "scalar", T: 9 }, { no: 6, name: "disable_manifest", kind: "scalar", T: 8 }, { no: 3, name: "s3", kind: "message", T: I6, oneof: "output" }, { no: 4, name: "gcp", kind: "message", T: y5, oneof: "output" }, { no: 5, name: "azure", kind: "message", T: A9, oneof: "output" }, { no: 7, name: "aliOSS", kind: "message", T: v4, oneof: "output" }]);
var Ur = m4.makeMessageType("livekit.UpdateLayoutRequest", () => [{ no: 1, name: "egress_id", kind: "scalar", T: 9 }, { no: 2, name: "layout", kind: "scalar", T: 9 }]);
var br2 = m4.makeMessageType("livekit.UpdateStreamRequest", () => [{ no: 1, name: "egress_id", kind: "scalar", T: 9 }, { no: 2, name: "add_output_urls", kind: "scalar", T: 9, repeated: true }, { no: 3, name: "remove_output_urls", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "add_destinations", kind: "message", T: is, repeated: true }]);
var xt3 = m4.makeMessageType("livekit.StreamInfoList", () => [{ no: 1, name: "info", kind: "message", T: rs, repeated: true }]);
var Ts = m4.makeEnum("livekit.IngressInput", [{ no: 0, name: "RTMP_INPUT" }, { no: 1, name: "WHIP_INPUT" }, { no: 2, name: "URL_INPUT" }]);
var Vt2 = m4.makeEnum("livekit.IngressAudioEncodingPreset", [{ no: 0, name: "OPUS_STEREO_96KBPS" }, { no: 1, name: "OPUS_MONO_64KBS" }]);
var Wt3 = m4.makeEnum("livekit.IngressVideoEncodingPreset", [{ no: 0, name: "H264_720P_30FPS_3_LAYERS" }, { no: 1, name: "H264_1080P_30FPS_3_LAYERS" }, { no: 2, name: "H264_540P_25FPS_2_LAYERS" }, { no: 3, name: "H264_720P_30FPS_1_LAYER" }, { no: 4, name: "H264_1080P_30FPS_1_LAYER" }, { no: 5, name: "H264_720P_30FPS_3_LAYERS_HIGH_MOTION" }, { no: 6, name: "H264_1080P_30FPS_3_LAYERS_HIGH_MOTION" }, { no: 7, name: "H264_540P_25FPS_2_LAYERS_HIGH_MOTION" }, { no: 8, name: "H264_720P_30FPS_1_LAYER_HIGH_MOTION" }, { no: 9, name: "H264_1080P_30FPS_1_LAYER_HIGH_MOTION" }]);
var hr2 = m4.makeMessageType("livekit.CreateIngressRequest", () => [{ no: 1, name: "input_type", kind: "enum", T: m4.getEnumType(Ts) }, { no: 9, name: "url", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "room_name", kind: "scalar", T: 9 }, { no: 4, name: "participant_identity", kind: "scalar", T: 9 }, { no: 5, name: "participant_name", kind: "scalar", T: 9 }, { no: 10, name: "participant_metadata", kind: "scalar", T: 9 }, { no: 8, name: "bypass_transcoding", kind: "scalar", T: 8 }, { no: 11, name: "enable_transcoding", kind: "scalar", T: 8, opt: true }, { no: 6, name: "audio", kind: "message", T: pe4 }, { no: 7, name: "video", kind: "message", T: ue4 }, { no: 12, name: "enabled", kind: "scalar", T: 8, opt: true }]);
var pe4 = m4.makeMessageType("livekit.IngressAudioOptions", () => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "source", kind: "enum", T: m4.getEnumType(f5) }, { no: 3, name: "preset", kind: "enum", T: m4.getEnumType(Vt2), oneof: "encoding_options" }, { no: 4, name: "options", kind: "message", T: wt3, oneof: "encoding_options" }]);
var ue4 = m4.makeMessageType("livekit.IngressVideoOptions", () => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "source", kind: "enum", T: m4.getEnumType(f5) }, { no: 3, name: "preset", kind: "enum", T: m4.getEnumType(Wt3), oneof: "encoding_options" }, { no: 4, name: "options", kind: "message", T: Jt3, oneof: "encoding_options" }]);
var wt3 = m4.makeMessageType("livekit.IngressAudioEncodingOptions", () => [{ no: 1, name: "audio_codec", kind: "enum", T: m4.getEnumType(Sa) }, { no: 2, name: "bitrate", kind: "scalar", T: 13 }, { no: 3, name: "disable_dtx", kind: "scalar", T: 8 }, { no: 4, name: "channels", kind: "scalar", T: 13 }]);
var Jt3 = m4.makeMessageType("livekit.IngressVideoEncodingOptions", () => [{ no: 1, name: "video_codec", kind: "enum", T: m4.getEnumType(Ea) }, { no: 2, name: "frame_rate", kind: "scalar", T: 1 }, { no: 3, name: "layers", kind: "message", T: E8, repeated: true }]);
var ge4 = m4.makeMessageType("livekit.IngressInfo", () => [{ no: 1, name: "ingress_id", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "stream_key", kind: "scalar", T: 9 }, { no: 4, name: "url", kind: "scalar", T: 9 }, { no: 5, name: "input_type", kind: "enum", T: m4.getEnumType(Ts) }, { no: 13, name: "bypass_transcoding", kind: "scalar", T: 8 }, { no: 15, name: "enable_transcoding", kind: "scalar", T: 8, opt: true }, { no: 6, name: "audio", kind: "message", T: pe4 }, { no: 7, name: "video", kind: "message", T: ue4 }, { no: 8, name: "room_name", kind: "scalar", T: 9 }, { no: 9, name: "participant_identity", kind: "scalar", T: 9 }, { no: 10, name: "participant_name", kind: "scalar", T: 9 }, { no: 14, name: "participant_metadata", kind: "scalar", T: 9 }, { no: 11, name: "reusable", kind: "scalar", T: 8 }, { no: 12, name: "state", kind: "message", T: Yt2 }, { no: 16, name: "enabled", kind: "scalar", T: 8, opt: true }]);
var Yt2 = m4.makeMessageType("livekit.IngressState", () => [{ no: 1, name: "status", kind: "enum", T: m4.getEnumType(jt) }, { no: 2, name: "error", kind: "scalar", T: 9 }, { no: 3, name: "video", kind: "message", T: zt2 }, { no: 4, name: "audio", kind: "message", T: Qt2 }, { no: 5, name: "room_id", kind: "scalar", T: 9 }, { no: 7, name: "started_at", kind: "scalar", T: 3 }, { no: 8, name: "ended_at", kind: "scalar", T: 3 }, { no: 10, name: "updated_at", kind: "scalar", T: 3 }, { no: 9, name: "resource_id", kind: "scalar", T: 9 }, { no: 6, name: "tracks", kind: "message", T: S7, repeated: true }]);
var jt = m4.makeEnum("livekit.IngressState.Status", [{ no: 0, name: "ENDPOINT_INACTIVE" }, { no: 1, name: "ENDPOINT_BUFFERING" }, { no: 2, name: "ENDPOINT_PUBLISHING" }, { no: 3, name: "ENDPOINT_ERROR" }, { no: 4, name: "ENDPOINT_COMPLETE" }]);
var zt2 = m4.makeMessageType("livekit.InputVideoState", () => [{ no: 1, name: "mime_type", kind: "scalar", T: 9 }, { no: 2, name: "average_bitrate", kind: "scalar", T: 13 }, { no: 3, name: "width", kind: "scalar", T: 13 }, { no: 4, name: "height", kind: "scalar", T: 13 }, { no: 5, name: "framerate", kind: "scalar", T: 1 }]);
var Qt2 = m4.makeMessageType("livekit.InputAudioState", () => [{ no: 1, name: "mime_type", kind: "scalar", T: 9 }, { no: 2, name: "average_bitrate", kind: "scalar", T: 13 }, { no: 3, name: "channels", kind: "scalar", T: 13 }, { no: 4, name: "sample_rate", kind: "scalar", T: 13 }]);
var Lr = m4.makeMessageType("livekit.UpdateIngressRequest", () => [{ no: 1, name: "ingress_id", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "room_name", kind: "scalar", T: 9 }, { no: 4, name: "participant_identity", kind: "scalar", T: 9 }, { no: 5, name: "participant_name", kind: "scalar", T: 9 }, { no: 9, name: "participant_metadata", kind: "scalar", T: 9 }, { no: 8, name: "bypass_transcoding", kind: "scalar", T: 8, opt: true }, { no: 10, name: "enable_transcoding", kind: "scalar", T: 8, opt: true }, { no: 6, name: "audio", kind: "message", T: pe4 }, { no: 7, name: "video", kind: "message", T: ue4 }, { no: 11, name: "enabled", kind: "scalar", T: 8, opt: true }]);
var qr = m4.makeMessageType("livekit.ListIngressRequest", () => [{ no: 3, name: "page_token", kind: "message", T: u3 }, { no: 1, name: "room_name", kind: "scalar", T: 9 }, { no: 2, name: "ingress_id", kind: "scalar", T: 9 }]);
var Fr = m4.makeMessageType("livekit.ListIngressResponse", () => [{ no: 2, name: "next_page_token", kind: "message", T: u3 }, { no: 1, name: "items", kind: "message", T: ge4, repeated: true }]);
var Gr = m4.makeMessageType("livekit.DeleteIngressRequest", () => [{ no: 1, name: "ingress_id", kind: "scalar", T: 9 }]);
var Xt = m4.makeMessageType("livekit.CreateRoomRequest", () => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 12, name: "room_preset", kind: "scalar", T: 9 }, { no: 2, name: "empty_timeout", kind: "scalar", T: 13 }, { no: 10, name: "departure_timeout", kind: "scalar", T: 13 }, { no: 3, name: "max_participants", kind: "scalar", T: 13 }, { no: 4, name: "node_id", kind: "scalar", T: 9 }, { no: 5, name: "metadata", kind: "scalar", T: 9 }, { no: 15, name: "tags", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 6, name: "egress", kind: "message", T: ks }, { no: 7, name: "min_playout_delay", kind: "scalar", T: 13 }, { no: 8, name: "max_playout_delay", kind: "scalar", T: 13 }, { no: 9, name: "sync_streams", kind: "scalar", T: 8 }, { no: 13, name: "replay_enabled", kind: "scalar", T: 8 }, { no: 14, name: "agents", kind: "message", T: R6, repeated: true }]);
var ks = m4.makeMessageType("livekit.RoomEgress", () => [{ no: 1, name: "room", kind: "message", T: ds }, { no: 3, name: "participant", kind: "message", T: ht3 }, { no: 2, name: "tracks", kind: "message", T: Lt3 }]);
var Hr = m4.makeMessageType("livekit.RoomAgent", () => [{ no: 1, name: "dispatches", kind: "message", T: R6, repeated: true }]);
var Zt2 = m4.makeMessageType("livekit.ListRoomsRequest", () => [{ no: 1, name: "names", kind: "scalar", T: 9, repeated: true }]);
var Br = m4.makeMessageType("livekit.ListRoomsResponse", () => [{ no: 1, name: "rooms", kind: "message", T: r, repeated: true }]);
var $t3 = m4.makeMessageType("livekit.DeleteRoomRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }]);
var Kr2 = m4.makeMessageType("livekit.DeleteRoomResponse", []);
var ei = m4.makeMessageType("livekit.ListParticipantsRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }]);
var xr2 = m4.makeMessageType("livekit.ListParticipantsResponse", () => [{ no: 1, name: "participants", kind: "message", T: s, repeated: true }]);
var ni = m4.makeMessageType("livekit.RoomParticipantIdentity", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }, { no: 2, name: "identity", kind: "scalar", T: 9 }, { no: 3, name: "revoke_token_ts", kind: "scalar", T: 3 }]);
var Vr = m4.makeMessageType("livekit.RemoveParticipantResponse", []);
var ai = m4.makeMessageType("livekit.MuteRoomTrackRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }, { no: 2, name: "identity", kind: "scalar", T: 9 }, { no: 3, name: "track_sid", kind: "scalar", T: 9 }, { no: 4, name: "muted", kind: "scalar", T: 8 }]);
var Wr = m4.makeMessageType("livekit.MuteRoomTrackResponse", () => [{ no: 1, name: "track", kind: "message", T: S7 }]);
var si = m4.makeMessageType("livekit.UpdateParticipantRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }, { no: 2, name: "identity", kind: "scalar", T: 9 }, { no: 3, name: "metadata", kind: "scalar", T: 9 }, { no: 4, name: "permission", kind: "message", T: oe5 }, { no: 5, name: "name", kind: "scalar", T: 9 }, { no: 6, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var oi = m4.makeMessageType("livekit.UpdateSubscriptionsRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }, { no: 2, name: "identity", kind: "scalar", T: 9 }, { no: 3, name: "track_sids", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "subscribe", kind: "scalar", T: 8 }, { no: 5, name: "participant_tracks", kind: "message", T: Fa, repeated: true }]);
var wr2 = m4.makeMessageType("livekit.UpdateSubscriptionsResponse", []);
var ti = m4.makeMessageType("livekit.SendDataRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }, { no: 2, name: "data", kind: "scalar", T: 12 }, { no: 3, name: "kind", kind: "enum", T: m4.getEnumType(Da) }, { no: 4, name: "destination_sids", kind: "scalar", T: 9, repeated: true }, { no: 6, name: "destination_identities", kind: "scalar", T: 9, repeated: true }, { no: 5, name: "topic", kind: "scalar", T: 9, opt: true }, { no: 7, name: "nonce", kind: "scalar", T: 12 }]);
var Jr = m4.makeMessageType("livekit.SendDataResponse", []);
var ii = m4.makeMessageType("livekit.UpdateRoomMetadataRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }, { no: 2, name: "metadata", kind: "scalar", T: 9 }]);
var Se3 = m4.makeMessageType("livekit.RoomConfiguration", () => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "empty_timeout", kind: "scalar", T: 13 }, { no: 3, name: "departure_timeout", kind: "scalar", T: 13 }, { no: 4, name: "max_participants", kind: "scalar", T: 13 }, { no: 11, name: "metadata", kind: "scalar", T: 9 }, { no: 5, name: "egress", kind: "message", T: ks }, { no: 7, name: "min_playout_delay", kind: "scalar", T: 13 }, { no: 8, name: "max_playout_delay", kind: "scalar", T: 13 }, { no: 9, name: "sync_streams", kind: "scalar", T: 8 }, { no: 10, name: "agents", kind: "message", T: R6, repeated: true }, { no: 12, name: "tags", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var Yr = m4.makeMessageType("livekit.ForwardParticipantRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }, { no: 2, name: "identity", kind: "scalar", T: 9 }, { no: 3, name: "destination_room", kind: "scalar", T: 9 }]);
var jr = m4.makeMessageType("livekit.ForwardParticipantResponse", []);
var zr = m4.makeMessageType("livekit.MoveParticipantRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }, { no: 2, name: "identity", kind: "scalar", T: 9 }, { no: 3, name: "destination_room", kind: "scalar", T: 9 }]);
var Qr = m4.makeMessageType("livekit.MoveParticipantResponse", []);
var Xr = m4.makeMessageType("livekit.PerformRpcRequest", () => [{ no: 1, name: "room", kind: "scalar", T: 9 }, { no: 2, name: "destination_identity", kind: "scalar", T: 9 }, { no: 3, name: "method", kind: "scalar", T: 9 }, { no: 4, name: "payload", kind: "scalar", T: 9 }, { no: 5, name: "response_timeout_ms", kind: "scalar", T: 13 }]);
var Zr = m4.makeMessageType("livekit.PerformRpcResponse", () => [{ no: 1, name: "payload", kind: "scalar", T: 9 }]);
var cs = m4.makeEnum("livekit.SIPStatusCode", [{ no: 0, name: "SIP_STATUS_UNKNOWN" }, { no: 100, name: "SIP_STATUS_TRYING" }, { no: 180, name: "SIP_STATUS_RINGING" }, { no: 181, name: "SIP_STATUS_CALL_IS_FORWARDED" }, { no: 182, name: "SIP_STATUS_QUEUED" }, { no: 183, name: "SIP_STATUS_SESSION_PROGRESS" }, { no: 199, name: "SIP_STATUS_EARLY_DIALOG_TERMINATED" }, { no: 200, name: "SIP_STATUS_OK" }, { no: 202, name: "SIP_STATUS_ACCEPTED" }, { no: 204, name: "SIP_STATUS_NO_NOTIFICATION" }, { no: 300, name: "SIP_STATUS_MULTIPLE_CHOICES" }, { no: 301, name: "SIP_STATUS_MOVED_PERMANENTLY" }, { no: 302, name: "SIP_STATUS_MOVED_TEMPORARILY" }, { no: 305, name: "SIP_STATUS_USE_PROXY" }, { no: 380, name: "SIP_STATUS_ALTERNATIVE_SERVICE" }, { no: 400, name: "SIP_STATUS_BAD_REQUEST" }, { no: 401, name: "SIP_STATUS_UNAUTHORIZED" }, { no: 402, name: "SIP_STATUS_PAYMENT_REQUIRED" }, { no: 403, name: "SIP_STATUS_FORBIDDEN" }, { no: 404, name: "SIP_STATUS_NOTFOUND" }, { no: 405, name: "SIP_STATUS_METHOD_NOT_ALLOWED" }, { no: 406, name: "SIP_STATUS_NOT_ACCEPTABLE" }, { no: 407, name: "SIP_STATUS_PROXY_AUTH_REQUIRED" }, { no: 408, name: "SIP_STATUS_REQUEST_TIMEOUT" }, { no: 409, name: "SIP_STATUS_CONFLICT" }, { no: 410, name: "SIP_STATUS_GONE" }, { no: 411, name: "SIP_STATUS_LENGTH_REQUIRED" }, { no: 412, name: "SIP_STATUS_CONDITIONAL_REQUEST_FAILED" }, { no: 413, name: "SIP_STATUS_REQUEST_ENTITY_TOO_LARGE" }, { no: 414, name: "SIP_STATUS_REQUEST_URI_TOO_LONG" }, { no: 415, name: "SIP_STATUS_UNSUPPORTED_MEDIA_TYPE" }, { no: 416, name: "SIP_STATUS_REQUESTED_RANGE_NOT_SATISFIABLE" }, { no: 417, name: "SIP_STATUS_UNKNOWN_RESOURCE_PRIORITY" }, { no: 420, name: "SIP_STATUS_BAD_EXTENSION" }, { no: 421, name: "SIP_STATUS_EXTENSION_REQUIRED" }, { no: 422, name: "SIP_STATUS_SESSION_INTERVAL_TOO_SMALL" }, { no: 423, name: "SIP_STATUS_INTERVAL_TOO_BRIEF" }, { no: 424, name: "SIP_STATUS_BAD_LOCATION_INFORMATION" }, { no: 425, name: "SIP_STATUS_BAD_ALERT_MESSAGE" }, { no: 428, name: "SIP_STATUS_USE_IDENTITY_HEADER" }, { no: 429, name: "SIP_STATUS_PROVIDE_REFERRER_IDENTITY" }, { no: 430, name: "SIP_STATUS_FLOW_FAILED" }, { no: 433, name: "SIP_STATUS_ANONYMITY_DISALLOWED" }, { no: 436, name: "SIP_STATUS_BAD_IDENTITY_INFO" }, { no: 437, name: "SIP_STATUS_UNSUPPORTED_CERTIFICATE" }, { no: 438, name: "SIP_STATUS_INVALID_IDENTITY_HEADER" }, { no: 439, name: "SIP_STATUS_FIRST_HOP_LACKS_OUTBOUND_SUPPORT" }, { no: 440, name: "SIP_STATUS_MAX_BREADTH_EXCEEDED" }, { no: 469, name: "SIP_STATUS_BAD_INFO_PACKAGE" }, { no: 470, name: "SIP_STATUS_CONSENT_NEEDED" }, { no: 480, name: "SIP_STATUS_TEMPORARILY_UNAVAILABLE" }, { no: 481, name: "SIP_STATUS_CALL_TRANSACTION_DOES_NOT_EXISTS" }, { no: 482, name: "SIP_STATUS_LOOP_DETECTED" }, { no: 483, name: "SIP_STATUS_TOO_MANY_HOPS" }, { no: 484, name: "SIP_STATUS_ADDRESS_INCOMPLETE" }, { no: 485, name: "SIP_STATUS_AMBIGUOUS" }, { no: 486, name: "SIP_STATUS_BUSY_HERE" }, { no: 487, name: "SIP_STATUS_REQUEST_TERMINATED" }, { no: 488, name: "SIP_STATUS_NOT_ACCEPTABLE_HERE" }, { no: 489, name: "SIP_STATUS_BAD_EVENT" }, { no: 491, name: "SIP_STATUS_REQUEST_PENDING" }, { no: 493, name: "SIP_STATUS_UNDECIPHERABLE" }, { no: 494, name: "SIP_STATUS_SECURITY_AGREEMENT_REQUIRED" }, { no: 500, name: "SIP_STATUS_INTERNAL_SERVER_ERROR" }, { no: 501, name: "SIP_STATUS_NOT_IMPLEMENTED" }, { no: 502, name: "SIP_STATUS_BAD_GATEWAY" }, { no: 503, name: "SIP_STATUS_SERVICE_UNAVAILABLE" }, { no: 504, name: "SIP_STATUS_GATEWAY_TIMEOUT" }, { no: 505, name: "SIP_STATUS_VERSION_NOT_SUPPORTED" }, { no: 513, name: "SIP_STATUS_MESSAGE_TOO_LARGE" }, { no: 600, name: "SIP_STATUS_GLOBAL_BUSY_EVERYWHERE" }, { no: 603, name: "SIP_STATUS_GLOBAL_DECLINE" }, { no: 604, name: "SIP_STATUS_GLOBAL_DOES_NOT_EXIST_ANYWHERE" }, { no: 606, name: "SIP_STATUS_GLOBAL_NOT_ACCEPTABLE" }, { no: 607, name: "SIP_STATUS_GLOBAL_UNWANTED" }, { no: 608, name: "SIP_STATUS_GLOBAL_REJECTED" }]);
var O10 = m4.makeEnum("livekit.SIPTransport", [{ no: 0, name: "SIP_TRANSPORT_AUTO" }, { no: 1, name: "SIP_TRANSPORT_UDP" }, { no: 2, name: "SIP_TRANSPORT_TCP" }, { no: 3, name: "SIP_TRANSPORT_TLS" }]);
var Ee3 = m4.makeEnum("livekit.SIPHeaderOptions", [{ no: 0, name: "SIP_NO_HEADERS" }, { no: 1, name: "SIP_X_HEADERS" }, { no: 2, name: "SIP_ALL_HEADERS" }]);
var d = m4.makeEnum("livekit.SIPMediaEncryption", [{ no: 0, name: "SIP_MEDIA_ENCRYPT_DISABLE" }, { no: 1, name: "SIP_MEDIA_ENCRYPT_ALLOW" }, { no: 2, name: "SIP_MEDIA_ENCRYPT_REQUIRE" }]);
var ls = m4.makeEnum("livekit.SIPDialtone", [{ no: 0, name: "SIP_DIALTONE_DISABLED" }, { no: 1, name: "SIP_DIALTONE_ETSI" }, { no: 2, name: "SIP_DIALTONE_AUTO" }, { no: 3, name: "SIP_DIALTONE_US" }, { no: 4, name: "SIP_DIALTONE_UK" }, { no: 5, name: "SIP_DIALTONE_JP" }, { no: 6, name: "SIP_DIALTONE_AU" }]);
var mi = m4.makeEnum("livekit.ProviderType", [{ no: 0, name: "PROVIDER_TYPE_UNKNOWN", localName: "UNKNOWN" }, { no: 1, name: "PROVIDER_TYPE_INTERNAL", localName: "INTERNAL" }, { no: 2, name: "PROVIDER_TYPE_EXTERNAL", localName: "EXTERNAL" }]);
var ri = m4.makeEnum("livekit.SIPCallStatus", [{ no: 0, name: "SCS_CALL_INCOMING" }, { no: 1, name: "SCS_PARTICIPANT_JOINED" }, { no: 2, name: "SCS_ACTIVE" }, { no: 3, name: "SCS_DISCONNECTED" }, { no: 4, name: "SCS_ERROR" }]);
var _s = m4.makeEnum("livekit.SIPTransferStatus", [{ no: 0, name: "STS_TRANSFER_ONGOING" }, { no: 1, name: "STS_TRANSFER_FAILED" }, { no: 2, name: "STS_TRANSFER_SUCCESSFUL" }]);
var Re3 = m4.makeEnum("livekit.SIPTransferReason", [{ no: 0, name: "STR_UNSPECIFIED" }, { no: 1, name: "STR_COMPLETED" }, { no: 2, name: "STR_CALL_ENDED" }, { no: 3, name: "STR_REJECTED" }, { no: 4, name: "STR_RINGING_TIMEOUT" }, { no: 5, name: "STR_SUBSCRIPTION_TERMINATED" }, { no: 6, name: "STR_CANCELED" }]);
var di = m4.makeEnum("livekit.SIPFeature", [{ no: 0, name: "NONE" }, { no: 1, name: "KRISP_ENABLED" }]);
var Ti = m4.makeEnum("livekit.SIPCallDirection", [{ no: 0, name: "SCD_UNKNOWN" }, { no: 1, name: "SCD_INBOUND" }, { no: 2, name: "SCD_OUTBOUND" }]);
var w7 = m4.makeMessageType("livekit.SIPStatus", () => [{ no: 1, name: "code", kind: "enum", T: m4.getEnumType(cs) }, { no: 2, name: "status", kind: "scalar", T: 9 }]);
var $r = m4.makeMessageType("livekit.CreateSIPTrunkRequest", () => [{ no: 1, name: "inbound_addresses", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "outbound_address", kind: "scalar", T: 9 }, { no: 3, name: "outbound_number", kind: "scalar", T: 9 }, { no: 4, name: "inbound_numbers_regex", kind: "scalar", T: 9, repeated: true }, { no: 9, name: "inbound_numbers", kind: "scalar", T: 9, repeated: true }, { no: 5, name: "inbound_username", kind: "scalar", T: 9 }, { no: 6, name: "inbound_password", kind: "scalar", T: 9 }, { no: 7, name: "outbound_username", kind: "scalar", T: 9 }, { no: 8, name: "outbound_password", kind: "scalar", T: 9 }, { no: 10, name: "name", kind: "scalar", T: 9 }, { no: 11, name: "metadata", kind: "scalar", T: 9 }]);
var ki = m4.makeMessageType("livekit.SIPCodec", () => [{ no: 1, name: "name", kind: "scalar", T: 9 }, { no: 2, name: "rate", kind: "scalar", T: 13 }]);
var _6 = m4.makeMessageType("livekit.SIPMediaConfig", () => [{ no: 1, name: "only_listed_codecs", kind: "scalar", T: 8 }, { no: 2, name: "codecs", kind: "message", T: ki, repeated: true }, { no: 3, name: "encryption", kind: "enum", T: m4.getEnumType(d), opt: true }, { no: 4, name: "media_timeout", kind: "message", T: oe4, opt: true }, { no: 5, name: "drop_audio_during_dtmf", kind: "scalar", T: 8 }]);
var ci = m4.makeMessageType("livekit.ProviderInfo", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "type", kind: "enum", T: m4.getEnumType(mi) }, { no: 4, name: "prevent_transfer", kind: "scalar", T: 8 }]);
var li = m4.makeMessageType("livekit.SIPTrunkInfo", () => [{ no: 1, name: "sip_trunk_id", kind: "scalar", T: 9 }, { no: 14, name: "kind", kind: "enum", T: m4.getEnumType(_i) }, { no: 2, name: "inbound_addresses", kind: "scalar", T: 9, repeated: true }, { no: 3, name: "outbound_address", kind: "scalar", T: 9 }, { no: 4, name: "outbound_number", kind: "scalar", T: 9 }, { no: 13, name: "transport", kind: "enum", T: m4.getEnumType(O10) }, { no: 5, name: "inbound_numbers_regex", kind: "scalar", T: 9, repeated: true }, { no: 10, name: "inbound_numbers", kind: "scalar", T: 9, repeated: true }, { no: 6, name: "inbound_username", kind: "scalar", T: 9 }, { no: 7, name: "inbound_password", kind: "scalar", T: 9 }, { no: 8, name: "outbound_username", kind: "scalar", T: 9 }, { no: 9, name: "outbound_password", kind: "scalar", T: 9 }, { no: 11, name: "name", kind: "scalar", T: 9 }, { no: 12, name: "metadata", kind: "scalar", T: 9 }]);
var _i = m4.makeEnum("livekit.SIPTrunkInfo.TrunkKind", [{ no: 0, name: "TRUNK_LEGACY" }, { no: 1, name: "TRUNK_INBOUND" }, { no: 2, name: "TRUNK_OUTBOUND" }]);
var ed = m4.makeMessageType("livekit.CreateSIPInboundTrunkRequest", () => [{ no: 1, name: "trunk", kind: "message", T: U5 }]);
var nd = m4.makeMessageType("livekit.UpdateSIPInboundTrunkRequest", () => [{ no: 1, name: "sip_trunk_id", kind: "scalar", T: 9 }, { no: 2, name: "replace", kind: "message", T: U5, oneof: "action" }, { no: 3, name: "update", kind: "message", T: pi, oneof: "action" }]);
var U5 = m4.makeMessageType("livekit.SIPInboundTrunkInfo", () => [{ no: 1, name: "sip_trunk_id", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "metadata", kind: "scalar", T: 9 }, { no: 4, name: "numbers", kind: "scalar", T: 9, repeated: true }, { no: 5, name: "allowed_addresses", kind: "scalar", T: 9, repeated: true }, { no: 6, name: "allowed_numbers", kind: "scalar", T: 9, repeated: true }, { no: 7, name: "auth_username", kind: "scalar", T: 9 }, { no: 8, name: "auth_password", kind: "scalar", T: 9 }, { no: 19, name: "auth_realm", kind: "scalar", T: 9 }, { no: 9, name: "headers", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 10, name: "headers_to_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 14, name: "attributes_to_headers", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 15, name: "include_headers", kind: "enum", T: m4.getEnumType(Ee3) }, { no: 11, name: "ringing_timeout", kind: "message", T: oe4 }, { no: 21, name: "ringing_timeout_status", kind: "enum", T: m4.getEnumType(cs) }, { no: 12, name: "max_call_duration", kind: "message", T: oe4 }, { no: 13, name: "krisp_enabled", kind: "scalar", T: 8 }, { no: 16, name: "media_encryption", kind: "enum", T: m4.getEnumType(d) }, { no: 20, name: "media", kind: "message", T: _6 }, { no: 17, name: "created_at", kind: "message", T: fe4 }, { no: 18, name: "updated_at", kind: "message", T: fe4 }]);
var pi = m4.makeMessageType("livekit.SIPInboundTrunkUpdate", () => [{ no: 1, name: "numbers", kind: "message", T: M7 }, { no: 2, name: "allowed_addresses", kind: "message", T: M7 }, { no: 3, name: "allowed_numbers", kind: "message", T: M7 }, { no: 4, name: "auth_username", kind: "scalar", T: 9, opt: true }, { no: 5, name: "auth_password", kind: "scalar", T: 9, opt: true }, { no: 9, name: "auth_realm", kind: "scalar", T: 9, opt: true }, { no: 6, name: "name", kind: "scalar", T: 9, opt: true }, { no: 7, name: "metadata", kind: "scalar", T: 9, opt: true }, { no: 8, name: "media_encryption", kind: "enum", T: m4.getEnumType(d), opt: true }, { no: 10, name: "media", kind: "message", T: _6 }]);
var ad = m4.makeMessageType("livekit.CreateSIPOutboundTrunkRequest", () => [{ no: 1, name: "trunk", kind: "message", T: b4 }]);
var sd = m4.makeMessageType("livekit.UpdateSIPOutboundTrunkRequest", () => [{ no: 1, name: "sip_trunk_id", kind: "scalar", T: 9 }, { no: 2, name: "replace", kind: "message", T: b4, oneof: "action" }, { no: 3, name: "update", kind: "message", T: ui, oneof: "action" }]);
var b4 = m4.makeMessageType("livekit.SIPOutboundTrunkInfo", () => [{ no: 1, name: "sip_trunk_id", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "metadata", kind: "scalar", T: 9 }, { no: 4, name: "address", kind: "scalar", T: 9 }, { no: 14, name: "destination_country", kind: "scalar", T: 9 }, { no: 5, name: "transport", kind: "enum", T: m4.getEnumType(O10) }, { no: 6, name: "numbers", kind: "scalar", T: 9, repeated: true }, { no: 7, name: "auth_username", kind: "scalar", T: 9 }, { no: 8, name: "auth_password", kind: "scalar", T: 9 }, { no: 9, name: "headers", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 10, name: "headers_to_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 11, name: "attributes_to_headers", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 12, name: "include_headers", kind: "enum", T: m4.getEnumType(Ee3) }, { no: 13, name: "media_encryption", kind: "enum", T: m4.getEnumType(d) }, { no: 18, name: "media", kind: "message", T: _6 }, { no: 15, name: "from_host", kind: "scalar", T: 9 }, { no: 16, name: "created_at", kind: "message", T: fe4 }, { no: 17, name: "updated_at", kind: "message", T: fe4 }]);
var ui = m4.makeMessageType("livekit.SIPOutboundTrunkUpdate", () => [{ no: 1, name: "address", kind: "scalar", T: 9, opt: true }, { no: 2, name: "transport", kind: "enum", T: m4.getEnumType(O10), opt: true }, { no: 9, name: "destination_country", kind: "scalar", T: 9, opt: true }, { no: 3, name: "numbers", kind: "message", T: M7 }, { no: 4, name: "auth_username", kind: "scalar", T: 9, opt: true }, { no: 5, name: "auth_password", kind: "scalar", T: 9, opt: true }, { no: 6, name: "name", kind: "scalar", T: 9, opt: true }, { no: 7, name: "metadata", kind: "scalar", T: 9, opt: true }, { no: 8, name: "media_encryption", kind: "enum", T: m4.getEnumType(d), opt: true }, { no: 11, name: "media", kind: "message", T: _6 }, { no: 10, name: "from_host", kind: "scalar", T: 9, opt: true }]);
var od = m4.makeMessageType("livekit.GetSIPInboundTrunkRequest", () => [{ no: 1, name: "sip_trunk_id", kind: "scalar", T: 9 }]);
var td = m4.makeMessageType("livekit.GetSIPInboundTrunkResponse", () => [{ no: 1, name: "trunk", kind: "message", T: U5 }]);
var id = m4.makeMessageType("livekit.GetSIPOutboundTrunkRequest", () => [{ no: 1, name: "sip_trunk_id", kind: "scalar", T: 9 }]);
var md = m4.makeMessageType("livekit.GetSIPOutboundTrunkResponse", () => [{ no: 1, name: "trunk", kind: "message", T: b4 }]);
var rd = m4.makeMessageType("livekit.ListSIPTrunkRequest", () => [{ no: 1, name: "page", kind: "message", T: W6 }]);
var dd = m4.makeMessageType("livekit.ListSIPTrunkResponse", () => [{ no: 1, name: "items", kind: "message", T: li, repeated: true }]);
var Td = m4.makeMessageType("livekit.ListSIPInboundTrunkRequest", () => [{ no: 3, name: "page", kind: "message", T: W6 }, { no: 1, name: "trunk_ids", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "numbers", kind: "scalar", T: 9, repeated: true }]);
var kd = m4.makeMessageType("livekit.ListSIPInboundTrunkResponse", () => [{ no: 1, name: "items", kind: "message", T: U5, repeated: true }]);
var cd = m4.makeMessageType("livekit.ListSIPOutboundTrunkRequest", () => [{ no: 3, name: "page", kind: "message", T: W6 }, { no: 1, name: "trunk_ids", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "numbers", kind: "scalar", T: 9, repeated: true }]);
var ld = m4.makeMessageType("livekit.ListSIPOutboundTrunkResponse", () => [{ no: 1, name: "items", kind: "message", T: b4, repeated: true }]);
var _d = m4.makeMessageType("livekit.DeleteSIPTrunkRequest", () => [{ no: 1, name: "sip_trunk_id", kind: "scalar", T: 9 }]);
var gi = m4.makeMessageType("livekit.SIPDispatchRuleDirect", () => [{ no: 1, name: "room_name", kind: "scalar", T: 9 }, { no: 2, name: "pin", kind: "scalar", T: 9 }]);
var Si = m4.makeMessageType("livekit.SIPDispatchRuleIndividual", () => [{ no: 1, name: "room_prefix", kind: "scalar", T: 9 }, { no: 2, name: "pin", kind: "scalar", T: 9 }, { no: 3, name: "no_randomness", kind: "scalar", T: 8 }]);
var Ei = m4.makeMessageType("livekit.SIPDispatchRuleCallee", () => [{ no: 1, name: "room_prefix", kind: "scalar", T: 9 }, { no: 2, name: "pin", kind: "scalar", T: 9 }, { no: 3, name: "randomize", kind: "scalar", T: 8 }]);
var Ie2 = m4.makeMessageType("livekit.SIPDispatchRule", () => [{ no: 1, name: "dispatch_rule_direct", kind: "message", T: gi, oneof: "rule" }, { no: 2, name: "dispatch_rule_individual", kind: "message", T: Si, oneof: "rule" }, { no: 3, name: "dispatch_rule_callee", kind: "message", T: Ei, oneof: "rule" }]);
var pd = m4.makeMessageType("livekit.CreateSIPDispatchRuleRequest", () => [{ no: 10, name: "dispatch_rule", kind: "message", T: J6 }, { no: 1, name: "rule", kind: "message", T: Ie2 }, { no: 2, name: "trunk_ids", kind: "scalar", T: 9, repeated: true }, { no: 3, name: "hide_phone_number", kind: "scalar", T: 8 }, { no: 6, name: "inbound_numbers", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "name", kind: "scalar", T: 9 }, { no: 5, name: "metadata", kind: "scalar", T: 9 }, { no: 7, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 8, name: "room_preset", kind: "scalar", T: 9 }, { no: 9, name: "room_config", kind: "message", T: Se3 }]);
var ud = m4.makeMessageType("livekit.UpdateSIPDispatchRuleRequest", () => [{ no: 1, name: "sip_dispatch_rule_id", kind: "scalar", T: 9 }, { no: 2, name: "replace", kind: "message", T: J6, oneof: "action" }, { no: 3, name: "update", kind: "message", T: Ri, oneof: "action" }]);
var J6 = m4.makeMessageType("livekit.SIPDispatchRuleInfo", () => [{ no: 1, name: "sip_dispatch_rule_id", kind: "scalar", T: 9 }, { no: 2, name: "rule", kind: "message", T: Ie2 }, { no: 3, name: "trunk_ids", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "hide_phone_number", kind: "scalar", T: 8 }, { no: 7, name: "inbound_numbers", kind: "scalar", T: 9, repeated: true }, { no: 13, name: "numbers", kind: "scalar", T: 9, repeated: true }, { no: 5, name: "name", kind: "scalar", T: 9 }, { no: 6, name: "metadata", kind: "scalar", T: 9 }, { no: 8, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 9, name: "room_preset", kind: "scalar", T: 9 }, { no: 10, name: "room_config", kind: "message", T: Se3 }, { no: 16, name: "media", kind: "message", T: _6 }, { no: 11, name: "krisp_enabled", kind: "scalar", T: 8 }, { no: 12, name: "media_encryption", kind: "enum", T: m4.getEnumType(d) }, { no: 14, name: "created_at", kind: "message", T: fe4 }, { no: 15, name: "updated_at", kind: "message", T: fe4 }]);
var Ri = m4.makeMessageType("livekit.SIPDispatchRuleUpdate", () => [{ no: 1, name: "trunk_ids", kind: "message", T: M7 }, { no: 2, name: "rule", kind: "message", T: Ie2 }, { no: 3, name: "name", kind: "scalar", T: 9, opt: true }, { no: 4, name: "metadata", kind: "scalar", T: 9, opt: true }, { no: 5, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 6, name: "media_encryption", kind: "enum", T: m4.getEnumType(d), opt: true }, { no: 7, name: "media", kind: "message", T: _6 }]);
var gd = m4.makeMessageType("livekit.ListSIPDispatchRuleRequest", () => [{ no: 3, name: "page", kind: "message", T: W6 }, { no: 1, name: "dispatch_rule_ids", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "trunk_ids", kind: "scalar", T: 9, repeated: true }]);
var Sd = m4.makeMessageType("livekit.ListSIPDispatchRuleResponse", () => [{ no: 1, name: "items", kind: "message", T: J6, repeated: true }]);
var Ed = m4.makeMessageType("livekit.DeleteSIPDispatchRuleRequest", () => [{ no: 1, name: "sip_dispatch_rule_id", kind: "scalar", T: 9 }]);
var Ii = m4.makeMessageType("livekit.SIPOutboundConfig", () => [{ no: 1, name: "hostname", kind: "scalar", T: 9 }, { no: 7, name: "destination_country", kind: "scalar", T: 9 }, { no: 2, name: "transport", kind: "enum", T: m4.getEnumType(O10) }, { no: 3, name: "auth_username", kind: "scalar", T: 9 }, { no: 4, name: "auth_password", kind: "scalar", T: 9 }, { no: 5, name: "headers_to_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 6, name: "attributes_to_headers", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 8, name: "from_host", kind: "scalar", T: 9 }]);
var Rd = m4.makeMessageType("livekit.CreateSIPParticipantRequest", () => [{ no: 1, name: "sip_trunk_id", kind: "scalar", T: 9 }, { no: 20, name: "trunk", kind: "message", T: Ii }, { no: 24, name: "sip_request_uri", kind: "message", T: vi }, { no: 25, name: "sip_to_header", kind: "message", T: Ce2 }, { no: 26, name: "sip_from_header", kind: "message", T: Ce2 }, { no: 2, name: "sip_call_to", kind: "scalar", T: 9 }, { no: 27, name: "to_user_override", kind: "scalar", T: 9 }, { no: 15, name: "sip_number", kind: "scalar", T: 9 }, { no: 3, name: "room_name", kind: "scalar", T: 9 }, { no: 4, name: "participant_identity", kind: "scalar", T: 9 }, { no: 7, name: "participant_name", kind: "scalar", T: 9 }, { no: 8, name: "participant_metadata", kind: "scalar", T: 9 }, { no: 9, name: "participant_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 5, name: "dtmf", kind: "scalar", T: 9 }, { no: 6, name: "play_ringtone", kind: "scalar", T: 8 }, { no: 13, name: "play_dialtone", kind: "scalar", T: 8 }, { no: 28, name: "dialtone", kind: "enum", T: m4.getEnumType(ls) }, { no: 10, name: "hide_phone_number", kind: "scalar", T: 8 }, { no: 16, name: "headers", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 17, name: "include_headers", kind: "enum", T: m4.getEnumType(Ee3) }, { no: 11, name: "ringing_timeout", kind: "message", T: oe4 }, { no: 12, name: "max_call_duration", kind: "message", T: oe4 }, { no: 14, name: "krisp_enabled", kind: "scalar", T: 8 }, { no: 18, name: "media_encryption", kind: "enum", T: m4.getEnumType(d) }, { no: 23, name: "media", kind: "message", T: _6 }, { no: 19, name: "wait_until_answered", kind: "scalar", T: 8 }, { no: 21, name: "display_name", kind: "scalar", T: 9, opt: true }, { no: 22, name: "destination", kind: "message", T: Mi, opt: true }]);
var Id = m4.makeMessageType("livekit.SIPParticipantInfo", () => [{ no: 1, name: "participant_id", kind: "scalar", T: 9 }, { no: 2, name: "participant_identity", kind: "scalar", T: 9 }, { no: 3, name: "room_name", kind: "scalar", T: 9 }, { no: 4, name: "sip_call_id", kind: "scalar", T: 9 }]);
var yd = m4.makeMessageType("livekit.TransferSIPParticipantRequest", () => [{ no: 1, name: "participant_identity", kind: "scalar", T: 9 }, { no: 2, name: "room_name", kind: "scalar", T: 9 }, { no: 3, name: "transfer_to", kind: "scalar", T: 9 }, { no: 4, name: "play_dialtone", kind: "scalar", T: 8 }, { no: 7, name: "dialtone", kind: "enum", T: m4.getEnumType(ls) }, { no: 5, name: "headers", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 6, name: "ringing_timeout", kind: "message", T: oe4 }]);
var Ad = m4.makeMessageType("livekit.TransferSIPParticipantResponse", () => [{ no: 1, name: "transfer_id", kind: "scalar", T: 9 }, { no: 2, name: "status", kind: "enum", T: m4.getEnumType(_s) }, { no: 3, name: "reason", kind: "enum", T: m4.getEnumType(Re3) }, { no: 4, name: "sip_status", kind: "message", T: w7 }]);
var vd = m4.makeMessageType("livekit.SIPTransferError", () => [{ no: 1, name: "transfer_id", kind: "scalar", T: 9 }, { no: 2, name: "reason", kind: "enum", T: m4.getEnumType(Re3) }, { no: 3, name: "sip_status", kind: "message", T: w7 }]);
var yi = m4.makeMessageType("livekit.SIPCallInfo", () => [{ no: 1, name: "call_id", kind: "scalar", T: 9 }, { no: 2, name: "trunk_id", kind: "scalar", T: 9 }, { no: 16, name: "dispatch_rule_id", kind: "scalar", T: 9 }, { no: 17, name: "region", kind: "scalar", T: 9 }, { no: 3, name: "room_name", kind: "scalar", T: 9 }, { no: 4, name: "room_id", kind: "scalar", T: 9 }, { no: 5, name: "participant_identity", kind: "scalar", T: 9 }, { no: 18, name: "participant_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 6, name: "from_uri", kind: "message", T: H8 }, { no: 7, name: "to_uri", kind: "message", T: H8 }, { no: 9, name: "created_at", kind: "scalar", T: 3 }, { no: 10, name: "started_at", kind: "scalar", T: 3 }, { no: 11, name: "ended_at", kind: "scalar", T: 3 }, { no: 14, name: "enabled_features", kind: "enum", T: m4.getEnumType(di), repeated: true }, { no: 15, name: "call_direction", kind: "enum", T: m4.getEnumType(Ti) }, { no: 8, name: "call_status", kind: "enum", T: m4.getEnumType(ri) }, { no: 22, name: "created_at_ns", kind: "scalar", T: 3 }, { no: 23, name: "started_at_ns", kind: "scalar", T: 3 }, { no: 24, name: "ended_at_ns", kind: "scalar", T: 3 }, { no: 12, name: "disconnect_reason", kind: "enum", T: m4.getEnumType(ae6) }, { no: 13, name: "error", kind: "scalar", T: 9 }, { no: 19, name: "call_status_code", kind: "message", T: w7 }, { no: 20, name: "audio_codec", kind: "scalar", T: 9 }, { no: 21, name: "media_encryption", kind: "scalar", T: 9 }, { no: 25, name: "pcap_file_link", kind: "scalar", T: 9 }, { no: 26, name: "call_context", kind: "message", T: G5, repeated: true }, { no: 27, name: "provider_info", kind: "message", T: ci }, { no: 28, name: "sip_call_id", kind: "scalar", T: 9 }]);
var Ai = m4.makeMessageType("livekit.SIPTransferInfo", () => [{ no: 1, name: "transfer_id", kind: "scalar", T: 9 }, { no: 2, name: "call_id", kind: "scalar", T: 9 }, { no: 3, name: "transfer_to", kind: "scalar", T: 9 }, { no: 4, name: "transfer_initiated_at_ns", kind: "scalar", T: 3 }, { no: 5, name: "transfer_completed_at_ns", kind: "scalar", T: 3 }, { no: 6, name: "transfer_status", kind: "enum", T: m4.getEnumType(_s) }, { no: 7, name: "error", kind: "scalar", T: 9 }, { no: 8, name: "transfer_status_code", kind: "message", T: w7 }, { no: 9, name: "reason", kind: "enum", T: m4.getEnumType(Re3) }]);
var H8 = m4.makeMessageType("livekit.SIPUri", () => [{ no: 1, name: "user", kind: "scalar", T: 9 }, { no: 2, name: "host", kind: "scalar", T: 9 }, { no: 3, name: "ip", kind: "scalar", T: 9 }, { no: 4, name: "port", kind: "scalar", T: 13 }, { no: 5, name: "transport", kind: "enum", T: m4.getEnumType(O10) }]);
var vi = m4.makeMessageType("livekit.SIPRequestDest", () => [{ no: 1, name: "raw", kind: "scalar", T: 9, oneof: "uri" }, { no: 2, name: "values", kind: "message", T: H8, oneof: "uri" }]);
var Ce2 = m4.makeMessageType("livekit.SIPNamedDest", () => [{ no: 3, name: "display_name", kind: "scalar", T: 9 }, { no: 1, name: "raw", kind: "scalar", T: 9, oneof: "uri" }, { no: 2, name: "values", kind: "message", T: H8, oneof: "uri" }]);
var Mi = m4.makeMessageType("livekit.Destination", () => [{ no: 1, name: "city", kind: "scalar", T: 9 }, { no: 2, name: "country", kind: "scalar", T: 9 }, { no: 3, name: "region", kind: "scalar", T: 9 }]);
var Ni = m4.makeEnum("livekit.StreamType", [{ no: 0, name: "UPSTREAM" }, { no: 1, name: "DOWNSTREAM" }]);
var fi = m4.makeEnum("livekit.AnalyticsEventType", [{ no: 0, name: "ROOM_CREATED" }, { no: 1, name: "ROOM_ENDED" }, { no: 2, name: "PARTICIPANT_JOINED" }, { no: 3, name: "PARTICIPANT_LEFT" }, { no: 45, name: "PARTICIPANT_CONNECTION_ABORTED" }, { no: 4, name: "TRACK_PUBLISHED" }, { no: 20, name: "TRACK_PUBLISH_REQUESTED" }, { no: 5, name: "TRACK_UNPUBLISHED" }, { no: 6, name: "TRACK_SUBSCRIBED" }, { no: 21, name: "TRACK_SUBSCRIBE_REQUESTED" }, { no: 25, name: "TRACK_SUBSCRIBE_FAILED" }, { no: 7, name: "TRACK_UNSUBSCRIBED" }, { no: 10, name: "TRACK_PUBLISHED_UPDATE" }, { no: 23, name: "TRACK_MUTED" }, { no: 24, name: "TRACK_UNMUTED" }, { no: 26, name: "TRACK_PUBLISH_STATS" }, { no: 27, name: "TRACK_SUBSCRIBE_STATS" }, { no: 11, name: "PARTICIPANT_ACTIVE" }, { no: 22, name: "PARTICIPANT_RESUMED" }, { no: 12, name: "EGRESS_STARTED" }, { no: 13, name: "EGRESS_ENDED" }, { no: 28, name: "EGRESS_UPDATED" }, { no: 14, name: "TRACK_MAX_SUBSCRIBED_VIDEO_QUALITY" }, { no: 15, name: "RECONNECTED" }, { no: 18, name: "INGRESS_CREATED" }, { no: 19, name: "INGRESS_DELETED" }, { no: 16, name: "INGRESS_STARTED" }, { no: 17, name: "INGRESS_ENDED" }, { no: 29, name: "INGRESS_UPDATED" }, { no: 30, name: "SIP_INBOUND_TRUNK_CREATED" }, { no: 31, name: "SIP_INBOUND_TRUNK_DELETED" }, { no: 32, name: "SIP_OUTBOUND_TRUNK_CREATED" }, { no: 33, name: "SIP_OUTBOUND_TRUNK_DELETED" }, { no: 34, name: "SIP_DISPATCH_RULE_CREATED" }, { no: 35, name: "SIP_DISPATCH_RULE_DELETED" }, { no: 36, name: "SIP_PARTICIPANT_CREATED" }, { no: 37, name: "SIP_CALL_INCOMING" }, { no: 38, name: "SIP_CALL_STARTED" }, { no: 39, name: "SIP_CALL_ENDED" }, { no: 43, name: "SIP_TRANSFER_REQUESTED" }, { no: 44, name: "SIP_TRANSFER_COMPLETE" }, { no: 46, name: "SIP_CALL_UPDATE" }, { no: 40, name: "REPORT" }, { no: 41, name: "API_CALL" }, { no: 42, name: "WEBHOOK" }]);
var Ci = m4.makeMessageType("livekit.AnalyticsVideoLayer", () => [{ no: 1, name: "layer", kind: "scalar", T: 5 }, { no: 2, name: "packets", kind: "scalar", T: 13 }, { no: 3, name: "bytes", kind: "scalar", T: 4 }, { no: 4, name: "frames", kind: "scalar", T: 13 }]);
var Pi = m4.makeMessageType("livekit.AnalyticsStream", () => [{ no: 1, name: "ssrc", kind: "scalar", T: 13 }, { no: 2, name: "primary_packets", kind: "scalar", T: 13 }, { no: 3, name: "primary_bytes", kind: "scalar", T: 4 }, { no: 4, name: "retransmit_packets", kind: "scalar", T: 13 }, { no: 5, name: "retransmit_bytes", kind: "scalar", T: 4 }, { no: 6, name: "padding_packets", kind: "scalar", T: 13 }, { no: 7, name: "padding_bytes", kind: "scalar", T: 4 }, { no: 8, name: "packets_lost", kind: "scalar", T: 13 }, { no: 9, name: "frames", kind: "scalar", T: 13 }, { no: 10, name: "rtt", kind: "scalar", T: 13 }, { no: 11, name: "jitter", kind: "scalar", T: 13 }, { no: 12, name: "nacks", kind: "scalar", T: 13 }, { no: 13, name: "plis", kind: "scalar", T: 13 }, { no: 14, name: "firs", kind: "scalar", T: 13 }, { no: 15, name: "video_layers", kind: "message", T: Ci, repeated: true }, { no: 17, name: "start_time", kind: "message", T: fe4 }, { no: 18, name: "end_time", kind: "message", T: fe4 }, { no: 19, name: "packets_out_of_order", kind: "scalar", T: 13 }]);
var Di = m4.makeMessageType("livekit.AnalyticsStat", () => [{ no: 14, name: "id", kind: "scalar", T: 9 }, { no: 1, name: "analytics_key", kind: "scalar", T: 9 }, { no: 2, name: "kind", kind: "enum", T: m4.getEnumType(Ni) }, { no: 3, name: "time_stamp", kind: "message", T: fe4 }, { no: 4, name: "node", kind: "scalar", T: 9 }, { no: 5, name: "room_id", kind: "scalar", T: 9 }, { no: 6, name: "room_name", kind: "scalar", T: 9 }, { no: 7, name: "participant_id", kind: "scalar", T: 9 }, { no: 8, name: "track_id", kind: "scalar", T: 9 }, { no: 9, name: "score", kind: "scalar", T: 2 }, { no: 10, name: "streams", kind: "message", T: Pi, repeated: true }, { no: 11, name: "mime", kind: "scalar", T: 9 }, { no: 12, name: "min_score", kind: "scalar", T: 2 }, { no: 13, name: "median_score", kind: "scalar", T: 2 }]);
var Md = m4.makeMessageType("livekit.AnalyticsStats", () => [{ no: 1, name: "stats", kind: "message", T: Di, repeated: true }]);
var Oi = m4.makeMessageType("livekit.AnalyticsClientMeta", () => [{ no: 1, name: "region", kind: "scalar", T: 9 }, { no: 2, name: "node", kind: "scalar", T: 9 }, { no: 3, name: "client_addr", kind: "scalar", T: 9 }, { no: 4, name: "client_connect_time", kind: "scalar", T: 13 }, { no: 5, name: "connection_type", kind: "scalar", T: 9 }, { no: 6, name: "reconnect_reason", kind: "enum", T: m4.getEnumType(Aa) }, { no: 7, name: "geo_hash", kind: "scalar", T: 9, opt: true }, { no: 8, name: "country", kind: "scalar", T: 9, opt: true }, { no: 9, name: "isp_asn", kind: "scalar", T: 13, opt: true }]);
var Ui = m4.makeMessageType("livekit.AnalyticsEvent", () => [{ no: 25, name: "id", kind: "scalar", T: 9 }, { no: 1, name: "type", kind: "enum", T: m4.getEnumType(fi) }, { no: 2, name: "timestamp", kind: "message", T: fe4 }, { no: 3, name: "room_id", kind: "scalar", T: 9 }, { no: 4, name: "room", kind: "message", T: r }, { no: 5, name: "participant_id", kind: "scalar", T: 9 }, { no: 6, name: "participant", kind: "message", T: s }, { no: 7, name: "track_id", kind: "scalar", T: 9 }, { no: 8, name: "track", kind: "message", T: S7 }, { no: 10, name: "analytics_key", kind: "scalar", T: 9 }, { no: 11, name: "client_info", kind: "message", T: Ga }, { no: 12, name: "client_meta", kind: "message", T: Oi }, { no: 13, name: "egress_id", kind: "scalar", T: 9 }, { no: 19, name: "ingress_id", kind: "scalar", T: 9 }, { no: 14, name: "max_subscribed_video_quality", kind: "enum", T: m4.getEnumType(V6) }, { no: 15, name: "publisher", kind: "message", T: s }, { no: 16, name: "mime", kind: "scalar", T: 9 }, { no: 17, name: "egress", kind: "message", T: _e3 }, { no: 18, name: "ingress", kind: "message", T: ge4 }, { no: 20, name: "error", kind: "scalar", T: 9 }, { no: 21, name: "rtp_stats", kind: "message", T: Ao }, { no: 22, name: "video_layer", kind: "scalar", T: 5 }, { no: 24, name: "node_id", kind: "scalar", T: 9 }, { no: 26, name: "sip_call_id", kind: "scalar", T: 9 }, { no: 27, name: "sip_call", kind: "message", T: yi }, { no: 28, name: "sip_trunk_id", kind: "scalar", T: 9 }, { no: 29, name: "sip_inbound_trunk", kind: "message", T: U5 }, { no: 30, name: "sip_outbound_trunk", kind: "message", T: b4 }, { no: 31, name: "sip_dispatch_rule_id", kind: "scalar", T: 9 }, { no: 32, name: "sip_dispatch_rule", kind: "message", T: J6 }, { no: 36, name: "sip_transfer", kind: "message", T: Ai }, { no: 33, name: "report", kind: "message", T: Li }, { no: 34, name: "api_call", kind: "message", T: Bi }, { no: 35, name: "webhook", kind: "message", T: Ki }, { no: 37, name: "room_end_reason", kind: "enum", T: m4.getEnumType(ya) }]);
var Nd = m4.makeMessageType("livekit.AnalyticsEvents", () => [{ no: 1, name: "events", kind: "message", T: Ui, repeated: true }]);
var bi = m4.makeMessageType("livekit.AnalyticsRoomParticipant", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "identity", kind: "scalar", T: 9 }, { no: 3, name: "name", kind: "scalar", T: 9 }, { no: 4, name: "state", kind: "enum", T: m4.getEnumType(Ma) }, { no: 5, name: "joined_at", kind: "message", T: fe4 }]);
var hi = m4.makeMessageType("livekit.AnalyticsRoom", () => [{ no: 1, name: "id", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 5, name: "project_id", kind: "scalar", T: 9 }, { no: 3, name: "created_at", kind: "message", T: fe4 }, { no: 4, name: "participants", kind: "message", T: bi, repeated: true }]);
var fd = m4.makeMessageType("livekit.AnalyticsNodeRooms", () => [{ no: 1, name: "node_id", kind: "scalar", T: 9 }, { no: 2, name: "sequence_number", kind: "scalar", T: 4 }, { no: 3, name: "timestamp", kind: "message", T: fe4 }, { no: 4, name: "rooms", kind: "message", T: hi, repeated: true }]);
var Li = m4.makeMessageType("livekit.ReportInfo", () => [{ no: 1, name: "feature_usage", kind: "message", T: Fi, oneof: "message" }]);
var qi = m4.makeMessageType("livekit.TimeRange", () => [{ no: 1, name: "started_at", kind: "message", T: fe4 }, { no: 2, name: "ended_at", kind: "message", T: fe4 }]);
var Fi = m4.makeMessageType("livekit.FeatureUsageInfo", () => [{ no: 1, name: "feature", kind: "enum", T: m4.getEnumType(Gi) }, { no: 2, name: "project_id", kind: "scalar", T: 9 }, { no: 3, name: "room_name", kind: "scalar", T: 9 }, { no: 4, name: "room_id", kind: "scalar", T: 9 }, { no: 5, name: "participant_identity", kind: "scalar", T: 9 }, { no: 6, name: "participant_id", kind: "scalar", T: 9 }, { no: 7, name: "track_id", kind: "scalar", T: 9 }, { no: 8, name: "time_ranges", kind: "message", T: qi, repeated: true }, { no: 9, name: "feature_info", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var Gi = m4.makeEnum("livekit.FeatureUsageInfo.Feature", [{ no: 0, name: "KRISP_NOISE_CANCELLATION" }, { no: 1, name: "KRISP_BACKGROUND_VOICE_CANCELLATION" }, { no: 2, name: "AIC_AUDIO_ENHANCEMENT" }, { no: 3, name: "KRISP_VIVA" }]);
var Hi = m4.makeMessageType("livekit.APICallRequest", () => [{ no: 1, name: "create_room_request", kind: "message", T: Xt, oneof: "message" }, { no: 2, name: "list_rooms_request", kind: "message", T: Zt2, oneof: "message" }, { no: 3, name: "delete_room_request", kind: "message", T: $t3, oneof: "message" }, { no: 4, name: "list_participants_request", kind: "message", T: ei, oneof: "message" }, { no: 5, name: "room_participant_identity", kind: "message", T: ni, oneof: "message" }, { no: 6, name: "mute_room_track_request", kind: "message", T: ai, oneof: "message" }, { no: 7, name: "update_participant_request", kind: "message", T: si, oneof: "message" }, { no: 8, name: "update_subscriptions_request", kind: "message", T: oi, oneof: "message" }, { no: 9, name: "send_data_request", kind: "message", T: ti, oneof: "message" }, { no: 10, name: "update_room_metadata_request", kind: "message", T: ii, oneof: "message" }]);
var Bi = m4.makeMessageType("livekit.APICallInfo", () => [{ no: 1, name: "project_id", kind: "scalar", T: 9 }, { no: 2, name: "request", kind: "message", T: Hi }, { no: 3, name: "service", kind: "scalar", T: 9 }, { no: 4, name: "method", kind: "scalar", T: 9 }, { no: 5, name: "node_id", kind: "scalar", T: 9 }, { no: 6, name: "status", kind: "scalar", T: 5 }, { no: 7, name: "twirp_error_code", kind: "scalar", T: 9 }, { no: 8, name: "twirp_error_message", kind: "scalar", T: 9 }, { no: 9, name: "room_name", kind: "scalar", T: 9 }, { no: 10, name: "room_id", kind: "scalar", T: 9 }, { no: 11, name: "participant_identity", kind: "scalar", T: 9 }, { no: 12, name: "participant_id", kind: "scalar", T: 9 }, { no: 13, name: "track_id", kind: "scalar", T: 9 }, { no: 14, name: "started_at", kind: "message", T: fe4 }, { no: 15, name: "duration_ns", kind: "scalar", T: 3 }]);
var Ki = m4.makeMessageType("livekit.WebhookInfo", () => [{ no: 1, name: "event_id", kind: "scalar", T: 9 }, { no: 2, name: "event", kind: "scalar", T: 9 }, { no: 3, name: "project_id", kind: "scalar", T: 9 }, { no: 4, name: "room_name", kind: "scalar", T: 9 }, { no: 5, name: "room_id", kind: "scalar", T: 9 }, { no: 6, name: "participant_identity", kind: "scalar", T: 9 }, { no: 7, name: "participant_id", kind: "scalar", T: 9 }, { no: 8, name: "track_id", kind: "scalar", T: 9 }, { no: 9, name: "egress_id", kind: "scalar", T: 9 }, { no: 10, name: "ingress_id", kind: "scalar", T: 9 }, { no: 11, name: "created_at", kind: "message", T: fe4 }, { no: 12, name: "queued_at", kind: "message", T: fe4 }, { no: 13, name: "queue_duration_ns", kind: "scalar", T: 3 }, { no: 14, name: "sent_at", kind: "message", T: fe4 }, { no: 15, name: "send_duration_ns", kind: "scalar", T: 3 }, { no: 16, name: "url", kind: "scalar", T: 9 }, { no: 17, name: "num_dropped", kind: "scalar", T: 5 }, { no: 18, name: "is_dropped", kind: "scalar", T: 8 }, { no: 19, name: "service_status", kind: "scalar", T: 9 }, { no: 20, name: "service_error_code", kind: "scalar", T: 5 }, { no: 21, name: "service_error", kind: "scalar", T: 9 }, { no: 22, name: "send_error", kind: "scalar", T: 9 }, { no: 23, name: "http_status_code", kind: "scalar", T: 5 }]);
var Cd = m4.makeEnum("livekit.ConnectorType", [{ no: 0, name: "Unspecified" }, { no: 1, name: "WhatsApp" }, { no: 2, name: "Twilio" }]);
var Pd = m4.makeMessageType("livekit.ConnectTwilioCallRequest", () => [{ no: 1, name: "twilio_call_direction", kind: "enum", T: m4.getEnumType(xi) }, { no: 2, name: "room_name", kind: "scalar", T: 9 }, { no: 3, name: "agents", kind: "message", T: R6, repeated: true }, { no: 4, name: "participant_identity", kind: "scalar", T: 9 }, { no: 5, name: "participant_name", kind: "scalar", T: 9 }, { no: 6, name: "participant_metadata", kind: "scalar", T: 9 }, { no: 7, name: "participant_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 8, name: "destination_country", kind: "scalar", T: 9 }]);
var xi = m4.makeEnum("livekit.ConnectTwilioCallRequest.TwilioCallDirection", [{ no: 0, name: "TWILIO_CALL_DIRECTION_INBOUND", localName: "INBOUND" }, { no: 1, name: "TWILIO_CALL_DIRECTION_OUTBOUND", localName: "OUTBOUND" }]);
var Dd = m4.makeMessageType("livekit.ConnectTwilioCallResponse", () => [{ no: 1, name: "connect_url", kind: "scalar", T: 9 }]);
var ps = m4.makeEnum("livekit.SignalTarget", [{ no: 0, name: "PUBLISHER" }, { no: 1, name: "SUBSCRIBER" }]);
var Vi = m4.makeEnum("livekit.StreamState", [{ no: 0, name: "ACTIVE" }, { no: 1, name: "PAUSED" }]);
var Od = m4.makeEnum("livekit.NegotiatedDataChannelID", [{ no: 0, name: "NDCI_INVALID" }, { no: 100, name: "NDCI_RELIABLE" }, { no: 101, name: "NDCI_LOSSY" }, { no: 102, name: "NDCI_DATA_TRACK" }]);
var Wi = m4.makeEnum("livekit.CandidateProtocol", [{ no: 0, name: "UDP" }, { no: 1, name: "TCP" }, { no: 2, name: "TLS" }]);
var Ud = m4.makeMessageType("livekit.SignalRequest", () => [{ no: 1, name: "offer", kind: "message", T: t64, oneof: "message" }, { no: 2, name: "answer", kind: "message", T: t64, oneof: "message" }, { no: 3, name: "trickle", kind: "message", T: Ae3, oneof: "message" }, { no: 4, name: "add_track", kind: "message", T: ye4, oneof: "message" }, { no: 5, name: "mute", kind: "message", T: ve3, oneof: "message" }, { no: 6, name: "subscription", kind: "message", T: Rs, oneof: "message" }, { no: 7, name: "track_setting", kind: "message", T: om, oneof: "message" }, { no: 8, name: "leave", kind: "message", T: vs, oneof: "message" }, { no: 10, name: "update_layers", kind: "message", T: im, oneof: "message" }, { no: 11, name: "subscription_permission", kind: "message", T: gm, oneof: "message" }, { no: 12, name: "sync_state", kind: "message", T: Cs, oneof: "message" }, { no: 13, name: "simulate", kind: "message", T: ym, oneof: "message" }, { no: 14, name: "ping", kind: "scalar", T: 3, oneof: "message" }, { no: 15, name: "update_metadata", kind: "message", T: Ms, oneof: "message" }, { no: 16, name: "ping_req", kind: "message", T: Am, oneof: "message" }, { no: 17, name: "update_audio_track", kind: "message", T: ys, oneof: "message" }, { no: 18, name: "update_video_track", kind: "message", T: As, oneof: "message" }, { no: 19, name: "publish_data_track_request", kind: "message", T: us, oneof: "message" }, { no: 20, name: "unpublish_data_track_request", kind: "message", T: Ss, oneof: "message" }, { no: 21, name: "update_data_subscription", kind: "message", T: Is, oneof: "message" }, { no: 22, name: "store_data_blob_request", kind: "message", T: em, oneof: "message" }, { no: 23, name: "get_data_blob_request", kind: "message", T: am, oneof: "message" }]);
var bd = m4.makeMessageType("livekit.SignalResponse", () => [{ no: 1, name: "join", kind: "message", T: zi, oneof: "message" }, { no: 2, name: "answer", kind: "message", T: t64, oneof: "message" }, { no: 3, name: "offer", kind: "message", T: t64, oneof: "message" }, { no: 4, name: "trickle", kind: "message", T: Ae3, oneof: "message" }, { no: 5, name: "update", kind: "message", T: Zi, oneof: "message" }, { no: 6, name: "track_published", kind: "message", T: Es, oneof: "message" }, { no: 8, name: "leave", kind: "message", T: vs, oneof: "message" }, { no: 9, name: "mute", kind: "message", T: ve3, oneof: "message" }, { no: 10, name: "speakers_changed", kind: "message", T: mm, oneof: "message" }, { no: 11, name: "room_update", kind: "message", T: rm, oneof: "message" }, { no: 12, name: "connection_quality", kind: "message", T: Tm, oneof: "message" }, { no: 13, name: "stream_state_update", kind: "message", T: cm, oneof: "message" }, { no: 14, name: "subscribed_quality_update", kind: "message", T: _m, oneof: "message" }, { no: 15, name: "subscription_permission_update", kind: "message", T: Sm, oneof: "message" }, { no: 16, name: "refresh_token", kind: "scalar", T: 9, oneof: "message" }, { no: 17, name: "track_unpublished", kind: "message", T: Xi, oneof: "message" }, { no: 18, name: "pong", kind: "scalar", T: 3, oneof: "message" }, { no: 19, name: "reconnect", kind: "message", T: Qi, oneof: "message" }, { no: 20, name: "pong_resp", kind: "message", T: vm, oneof: "message" }, { no: 21, name: "subscription_response", kind: "message", T: fm, oneof: "message" }, { no: 22, name: "request_response", kind: "message", T: Cm, oneof: "message" }, { no: 23, name: "track_subscribed", kind: "message", T: Dm, oneof: "message" }, { no: 24, name: "room_moved", kind: "message", T: Em, oneof: "message" }, { no: 25, name: "media_sections_requirement", kind: "message", T: bm, oneof: "message" }, { no: 26, name: "subscribed_audio_codec_update", kind: "message", T: pm, oneof: "message" }, { no: 27, name: "publish_data_track_response", kind: "message", T: gs, oneof: "message" }, { no: 28, name: "unpublish_data_track_response", kind: "message", T: Ji, oneof: "message" }, { no: 29, name: "data_track_subscriber_handles", kind: "message", T: Yi, oneof: "message" }, { no: 30, name: "store_data_blob_response", kind: "message", T: nm, oneof: "message" }, { no: 31, name: "get_data_blob_response", kind: "message", T: sm, oneof: "message" }]);
var wi = m4.makeMessageType("livekit.SimulcastCodec", () => [{ no: 1, name: "codec", kind: "scalar", T: 9 }, { no: 2, name: "cid", kind: "scalar", T: 9 }, { no: 4, name: "layers", kind: "message", T: E8, repeated: true }, { no: 5, name: "video_layer_mode", kind: "enum", T: m4.getEnumType(Pa) }]);
var ye4 = m4.makeMessageType("livekit.AddTrackRequest", () => [{ no: 1, name: "cid", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "type", kind: "enum", T: m4.getEnumType(Ia) }, { no: 4, name: "width", kind: "scalar", T: 13 }, { no: 5, name: "height", kind: "scalar", T: 13 }, { no: 6, name: "muted", kind: "scalar", T: 8 }, { no: 7, name: "disable_dtx", kind: "scalar", T: 8 }, { no: 8, name: "source", kind: "enum", T: m4.getEnumType(f5) }, { no: 9, name: "layers", kind: "message", T: E8, repeated: true }, { no: 10, name: "simulcast_codecs", kind: "message", T: wi, repeated: true }, { no: 11, name: "sid", kind: "scalar", T: 9 }, { no: 12, name: "stereo", kind: "scalar", T: 8 }, { no: 13, name: "disable_red", kind: "scalar", T: 8 }, { no: 14, name: "encryption", kind: "enum", T: m4.getEnumType(g3) }, { no: 15, name: "stream", kind: "scalar", T: 9 }, { no: 16, name: "backup_codec_policy", kind: "enum", T: m4.getEnumType(Ra) }, { no: 17, name: "audio_features", kind: "enum", T: m4.getEnumType(se5), repeated: true }, { no: 18, name: "packet_trailer_features", kind: "enum", T: m4.getEnumType(va), repeated: true }]);
var us = m4.makeMessageType("livekit.PublishDataTrackRequest", () => [{ no: 1, name: "pub_handle", kind: "scalar", T: 13 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "encryption", kind: "enum", T: m4.getEnumType(g3) }, { no: 4, name: "frame_encoding", kind: "message", T: fa, opt: true }, { no: 5, name: "schema", kind: "message", T: ie4, opt: true }]);
var gs = m4.makeMessageType("livekit.PublishDataTrackResponse", () => [{ no: 1, name: "info", kind: "message", T: te6 }]);
var Ss = m4.makeMessageType("livekit.UnpublishDataTrackRequest", () => [{ no: 1, name: "pub_handle", kind: "scalar", T: 13 }]);
var Ji = m4.makeMessageType("livekit.UnpublishDataTrackResponse", () => [{ no: 1, name: "info", kind: "message", T: te6 }]);
var Yi = m4.makeMessageType("livekit.DataTrackSubscriberHandles", () => [{ no: 1, name: "sub_handles", kind: "map", K: 13, V: { kind: "message", T: ji } }]);
var ji = m4.makeMessageType("livekit.DataTrackSubscriberHandles.PublishedDataTrack", () => [{ no: 1, name: "publisher_identity", kind: "scalar", T: 9 }, { no: 2, name: "publisher_sid", kind: "scalar", T: 9 }, { no: 3, name: "track_sid", kind: "scalar", T: 9 }], { localName: "DataTrackSubscriberHandles_PublishedDataTrack" });
var Ae3 = m4.makeMessageType("livekit.TrickleRequest", () => [{ no: 1, name: "candidateInit", kind: "scalar", T: 9 }, { no: 2, name: "target", kind: "enum", T: m4.getEnumType(ps) }, { no: 3, name: "final", kind: "scalar", T: 8 }]);
var ve3 = m4.makeMessageType("livekit.MuteTrackRequest", () => [{ no: 1, name: "sid", kind: "scalar", T: 9 }, { no: 2, name: "muted", kind: "scalar", T: 8 }]);
var zi = m4.makeMessageType("livekit.JoinResponse", () => [{ no: 1, name: "room", kind: "message", T: r }, { no: 2, name: "participant", kind: "message", T: s }, { no: 3, name: "other_participants", kind: "message", T: s, repeated: true }, { no: 4, name: "server_version", kind: "scalar", T: 9 }, { no: 5, name: "ice_servers", kind: "message", T: Ns, repeated: true }, { no: 6, name: "subscriber_primary", kind: "scalar", T: 8 }, { no: 7, name: "alternative_url", kind: "scalar", T: 9 }, { no: 8, name: "client_configuration", kind: "message", T: Ba }, { no: 9, name: "server_region", kind: "scalar", T: 9 }, { no: 10, name: "ping_timeout", kind: "scalar", T: 5 }, { no: 11, name: "ping_interval", kind: "scalar", T: 5 }, { no: 12, name: "server_info", kind: "message", T: re6 }, { no: 13, name: "sif_trailer", kind: "scalar", T: 12 }, { no: 14, name: "enabled_publish_codecs", kind: "message", T: G6, repeated: true }, { no: 15, name: "fast_publish", kind: "scalar", T: 8 }]);
var Qi = m4.makeMessageType("livekit.ReconnectResponse", () => [{ no: 1, name: "ice_servers", kind: "message", T: Ns, repeated: true }, { no: 2, name: "client_configuration", kind: "message", T: Ba }, { no: 3, name: "server_info", kind: "message", T: re6 }, { no: 4, name: "last_message_seq", kind: "scalar", T: 13 }]);
var Es = m4.makeMessageType("livekit.TrackPublishedResponse", () => [{ no: 1, name: "cid", kind: "scalar", T: 9 }, { no: 2, name: "track", kind: "message", T: S7 }]);
var Xi = m4.makeMessageType("livekit.TrackUnpublishedResponse", () => [{ no: 1, name: "track_sid", kind: "scalar", T: 9 }]);
var t64 = m4.makeMessageType("livekit.SessionDescription", () => [{ no: 1, name: "type", kind: "scalar", T: 9 }, { no: 2, name: "sdp", kind: "scalar", T: 9 }, { no: 3, name: "id", kind: "scalar", T: 13 }, { no: 4, name: "mid_to_track_id", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }]);
var Zi = m4.makeMessageType("livekit.ParticipantUpdate", () => [{ no: 1, name: "participants", kind: "message", T: s, repeated: true }]);
var Rs = m4.makeMessageType("livekit.UpdateSubscription", () => [{ no: 1, name: "track_sids", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "subscribe", kind: "scalar", T: 8 }, { no: 3, name: "participant_tracks", kind: "message", T: Fa, repeated: true }]);
var Is = m4.makeMessageType("livekit.UpdateDataSubscription", () => [{ no: 1, name: "updates", kind: "message", T: $i, repeated: true }]);
var $i = m4.makeMessageType("livekit.UpdateDataSubscription.Update", () => [{ no: 1, name: "track_sid", kind: "scalar", T: 9 }, { no: 2, name: "subscribe", kind: "scalar", T: 8 }, { no: 3, name: "options", kind: "message", T: lo }], { localName: "UpdateDataSubscription_Update" });
var em = m4.makeMessageType("livekit.StoreDataBlobRequest", () => [{ no: 1, name: "request_id", kind: "scalar", T: 13 }, { no: 2, name: "blob", kind: "message", T: Ca }]);
var nm = m4.makeMessageType("livekit.StoreDataBlobResponse", () => [{ no: 1, name: "request_id", kind: "scalar", T: 13 }, { no: 2, name: "key", kind: "message", T: me3 }]);
var am = m4.makeMessageType("livekit.GetDataBlobRequest", () => [{ no: 1, name: "request_id", kind: "scalar", T: 13 }, { no: 2, name: "participant_identity", kind: "scalar", T: 9 }, { no: 3, name: "key", kind: "message", T: me3 }]);
var sm = m4.makeMessageType("livekit.GetDataBlobResponse", () => [{ no: 1, name: "request_id", kind: "scalar", T: 13 }, { no: 2, name: "blob", kind: "message", T: Ca }]);
var om = m4.makeMessageType("livekit.UpdateTrackSettings", () => [{ no: 1, name: "track_sids", kind: "scalar", T: 9, repeated: true }, { no: 3, name: "disabled", kind: "scalar", T: 8 }, { no: 4, name: "quality", kind: "enum", T: m4.getEnumType(V6) }, { no: 5, name: "width", kind: "scalar", T: 13 }, { no: 6, name: "height", kind: "scalar", T: 13 }, { no: 7, name: "fps", kind: "scalar", T: 13 }, { no: 8, name: "priority", kind: "scalar", T: 13 }]);
var ys = m4.makeMessageType("livekit.UpdateLocalAudioTrack", () => [{ no: 1, name: "track_sid", kind: "scalar", T: 9 }, { no: 2, name: "features", kind: "enum", T: m4.getEnumType(se5), repeated: true }]);
var As = m4.makeMessageType("livekit.UpdateLocalVideoTrack", () => [{ no: 1, name: "track_sid", kind: "scalar", T: 9 }, { no: 2, name: "width", kind: "scalar", T: 13 }, { no: 3, name: "height", kind: "scalar", T: 13 }]);
var vs = m4.makeMessageType("livekit.LeaveRequest", () => [{ no: 1, name: "can_reconnect", kind: "scalar", T: 8 }, { no: 2, name: "reason", kind: "enum", T: m4.getEnumType(ae6) }, { no: 3, name: "action", kind: "enum", T: m4.getEnumType(tm) }, { no: 4, name: "regions", kind: "message", T: Mm }]);
var tm = m4.makeEnum("livekit.LeaveRequest.Action", [{ no: 0, name: "DISCONNECT" }, { no: 1, name: "RESUME" }, { no: 2, name: "RECONNECT" }]);
var im = m4.makeMessageType("livekit.UpdateVideoLayers", () => [{ no: 1, name: "track_sid", kind: "scalar", T: 9 }, { no: 2, name: "layers", kind: "message", T: E8, repeated: true }]);
var Ms = m4.makeMessageType("livekit.UpdateParticipantMetadata", () => [{ no: 1, name: "metadata", kind: "scalar", T: 9 }, { no: 2, name: "name", kind: "scalar", T: 9 }, { no: 3, name: "attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 4, name: "request_id", kind: "scalar", T: 13 }]);
var Ns = m4.makeMessageType("livekit.ICEServer", () => [{ no: 1, name: "urls", kind: "scalar", T: 9, repeated: true }, { no: 2, name: "username", kind: "scalar", T: 9 }, { no: 3, name: "credential", kind: "scalar", T: 9 }]);
var mm = m4.makeMessageType("livekit.SpeakersChanged", () => [{ no: 1, name: "speakers", kind: "message", T: Oa, repeated: true }]);
var rm = m4.makeMessageType("livekit.RoomUpdate", () => [{ no: 1, name: "room", kind: "message", T: r }]);
var dm = m4.makeMessageType("livekit.ConnectionQualityInfo", () => [{ no: 1, name: "participant_sid", kind: "scalar", T: 9 }, { no: 2, name: "quality", kind: "enum", T: m4.getEnumType(to) }, { no: 3, name: "score", kind: "scalar", T: 2 }]);
var Tm = m4.makeMessageType("livekit.ConnectionQualityUpdate", () => [{ no: 1, name: "updates", kind: "message", T: dm, repeated: true }]);
var km = m4.makeMessageType("livekit.StreamStateInfo", () => [{ no: 1, name: "participant_sid", kind: "scalar", T: 9 }, { no: 2, name: "track_sid", kind: "scalar", T: 9 }, { no: 3, name: "state", kind: "enum", T: m4.getEnumType(Vi) }]);
var cm = m4.makeMessageType("livekit.StreamStateUpdate", () => [{ no: 1, name: "stream_states", kind: "message", T: km, repeated: true }]);
var fs = m4.makeMessageType("livekit.SubscribedQuality", () => [{ no: 1, name: "quality", kind: "enum", T: m4.getEnumType(V6) }, { no: 2, name: "enabled", kind: "scalar", T: 8 }]);
var lm = m4.makeMessageType("livekit.SubscribedCodec", () => [{ no: 1, name: "codec", kind: "scalar", T: 9 }, { no: 2, name: "qualities", kind: "message", T: fs, repeated: true }]);
var _m = m4.makeMessageType("livekit.SubscribedQualityUpdate", () => [{ no: 1, name: "track_sid", kind: "scalar", T: 9 }, { no: 2, name: "subscribed_qualities", kind: "message", T: fs, repeated: true }, { no: 3, name: "subscribed_codecs", kind: "message", T: lm, repeated: true }]);
var pm = m4.makeMessageType("livekit.SubscribedAudioCodecUpdate", () => [{ no: 1, name: "track_sid", kind: "scalar", T: 9 }, { no: 2, name: "subscribed_audio_codecs", kind: "message", T: bo, repeated: true }]);
var um = m4.makeMessageType("livekit.TrackPermission", () => [{ no: 1, name: "participant_sid", kind: "scalar", T: 9 }, { no: 2, name: "all_tracks", kind: "scalar", T: 8 }, { no: 3, name: "track_sids", kind: "scalar", T: 9, repeated: true }, { no: 4, name: "participant_identity", kind: "scalar", T: 9 }]);
var gm = m4.makeMessageType("livekit.SubscriptionPermission", () => [{ no: 1, name: "all_participants", kind: "scalar", T: 8 }, { no: 2, name: "track_permissions", kind: "message", T: um, repeated: true }]);
var Sm = m4.makeMessageType("livekit.SubscriptionPermissionUpdate", () => [{ no: 1, name: "participant_sid", kind: "scalar", T: 9 }, { no: 2, name: "track_sid", kind: "scalar", T: 9 }, { no: 3, name: "allowed", kind: "scalar", T: 8 }]);
var Em = m4.makeMessageType("livekit.RoomMovedResponse", () => [{ no: 1, name: "room", kind: "message", T: r }, { no: 2, name: "token", kind: "scalar", T: 9 }, { no: 3, name: "participant", kind: "message", T: s }, { no: 4, name: "other_participants", kind: "message", T: s, repeated: true }]);
var Cs = m4.makeMessageType("livekit.SyncState", () => [{ no: 1, name: "answer", kind: "message", T: t64 }, { no: 2, name: "subscription", kind: "message", T: Rs }, { no: 3, name: "publish_tracks", kind: "message", T: Es, repeated: true }, { no: 4, name: "data_channels", kind: "message", T: Im, repeated: true }, { no: 5, name: "offer", kind: "message", T: t64 }, { no: 6, name: "track_sids_disabled", kind: "scalar", T: 9, repeated: true }, { no: 7, name: "datachannel_receive_states", kind: "message", T: Rm, repeated: true }, { no: 8, name: "publish_data_tracks", kind: "message", T: gs, repeated: true }, { no: 9, name: "data_subscription", kind: "message", T: Is }]);
var Rm = m4.makeMessageType("livekit.DataChannelReceiveState", () => [{ no: 1, name: "publisher_sid", kind: "scalar", T: 9 }, { no: 2, name: "last_seq", kind: "scalar", T: 13 }]);
var Im = m4.makeMessageType("livekit.DataChannelInfo", () => [{ no: 1, name: "label", kind: "scalar", T: 9 }, { no: 2, name: "id", kind: "scalar", T: 13 }, { no: 3, name: "target", kind: "enum", T: m4.getEnumType(ps) }]);
var ym = m4.makeMessageType("livekit.SimulateScenario", () => [{ no: 1, name: "speaker_update", kind: "scalar", T: 5, oneof: "scenario" }, { no: 2, name: "node_failure", kind: "scalar", T: 8, oneof: "scenario" }, { no: 3, name: "migration", kind: "scalar", T: 8, oneof: "scenario" }, { no: 4, name: "server_leave", kind: "scalar", T: 8, oneof: "scenario" }, { no: 5, name: "switch_candidate_protocol", kind: "enum", T: m4.getEnumType(Wi), oneof: "scenario" }, { no: 6, name: "subscriber_bandwidth", kind: "scalar", T: 3, oneof: "scenario" }, { no: 7, name: "disconnect_signal_on_resume", kind: "scalar", T: 8, oneof: "scenario" }, { no: 8, name: "disconnect_signal_on_resume_no_messages", kind: "scalar", T: 8, oneof: "scenario" }, { no: 9, name: "leave_request_full_reconnect", kind: "scalar", T: 8, oneof: "scenario" }]);
var Am = m4.makeMessageType("livekit.Ping", () => [{ no: 1, name: "timestamp", kind: "scalar", T: 3 }, { no: 2, name: "rtt", kind: "scalar", T: 3 }]);
var vm = m4.makeMessageType("livekit.Pong", () => [{ no: 1, name: "last_ping_timestamp", kind: "scalar", T: 3 }, { no: 2, name: "timestamp", kind: "scalar", T: 3 }]);
var Mm = m4.makeMessageType("livekit.RegionSettings", () => [{ no: 1, name: "regions", kind: "message", T: Nm, repeated: true }]);
var Nm = m4.makeMessageType("livekit.RegionInfo", () => [{ no: 1, name: "region", kind: "scalar", T: 9 }, { no: 2, name: "url", kind: "scalar", T: 9 }, { no: 3, name: "distance", kind: "scalar", T: 3 }]);
var fm = m4.makeMessageType("livekit.SubscriptionResponse", () => [{ no: 1, name: "track_sid", kind: "scalar", T: 9 }, { no: 2, name: "err", kind: "enum", T: m4.getEnumType(io) }]);
var Cm = m4.makeMessageType("livekit.RequestResponse", () => [{ no: 1, name: "request_id", kind: "scalar", T: 13 }, { no: 2, name: "reason", kind: "enum", T: m4.getEnumType(Pm) }, { no: 3, name: "message", kind: "scalar", T: 9 }, { no: 4, name: "trickle", kind: "message", T: Ae3, oneof: "request" }, { no: 5, name: "add_track", kind: "message", T: ye4, oneof: "request" }, { no: 6, name: "mute", kind: "message", T: ve3, oneof: "request" }, { no: 7, name: "update_metadata", kind: "message", T: Ms, oneof: "request" }, { no: 8, name: "update_audio_track", kind: "message", T: ys, oneof: "request" }, { no: 9, name: "update_video_track", kind: "message", T: As, oneof: "request" }, { no: 10, name: "publish_data_track", kind: "message", T: us, oneof: "request" }, { no: 11, name: "unpublish_data_track", kind: "message", T: Ss, oneof: "request" }]);
var Pm = m4.makeEnum("livekit.RequestResponse.Reason", [{ no: 0, name: "OK" }, { no: 1, name: "NOT_FOUND" }, { no: 2, name: "NOT_ALLOWED" }, { no: 3, name: "LIMIT_EXCEEDED" }, { no: 4, name: "QUEUED" }, { no: 5, name: "UNSUPPORTED_TYPE" }, { no: 6, name: "UNCLASSIFIED_ERROR" }, { no: 7, name: "INVALID_HANDLE" }, { no: 8, name: "INVALID_NAME" }, { no: 9, name: "DUPLICATE_HANDLE" }, { no: 10, name: "DUPLICATE_NAME" }, { no: 11, name: "INVALID_REQUEST" }]);
var Dm = m4.makeMessageType("livekit.TrackSubscribed", () => [{ no: 1, name: "track_sid", kind: "scalar", T: 9 }]);
var Om = m4.makeMessageType("livekit.ConnectionSettings", () => [{ no: 1, name: "auto_subscribe", kind: "scalar", T: 8 }, { no: 2, name: "adaptive_stream", kind: "scalar", T: 8 }, { no: 3, name: "subscriber_allow_pause", kind: "scalar", T: 8, opt: true }, { no: 4, name: "disable_ice_lite", kind: "scalar", T: 8 }, { no: 5, name: "auto_subscribe_data_track", kind: "scalar", T: 8, opt: true }]);
var hd = m4.makeMessageType("livekit.JoinRequest", () => [{ no: 1, name: "client_info", kind: "message", T: Ga }, { no: 2, name: "connection_settings", kind: "message", T: Om }, { no: 3, name: "metadata", kind: "scalar", T: 9 }, { no: 4, name: "participant_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 5, name: "add_track_requests", kind: "message", T: ye4, repeated: true }, { no: 6, name: "publisher_offer", kind: "message", T: t64 }, { no: 7, name: "reconnect", kind: "scalar", T: 8 }, { no: 8, name: "reconnect_reason", kind: "enum", T: m4.getEnumType(Aa) }, { no: 9, name: "participant_sid", kind: "scalar", T: 9 }, { no: 10, name: "sync_state", kind: "message", T: Cs }]);
var Ld = m4.makeMessageType("livekit.WrappedJoinRequest", () => [{ no: 1, name: "compression", kind: "enum", T: m4.getEnumType(Um) }, { no: 2, name: "join_request", kind: "scalar", T: 12 }]);
var Um = m4.makeEnum("livekit.WrappedJoinRequest.Compression", [{ no: 0, name: "NONE" }, { no: 1, name: "GZIP" }]);
var bm = m4.makeMessageType("livekit.MediaSectionsRequirement", () => [{ no: 1, name: "num_audios", kind: "scalar", T: 13 }, { no: 2, name: "num_videos", kind: "scalar", T: 13 }]);
var hm = m4.makeEnum("livekit.WhatsAppCallDirection", [{ no: 0, name: "WHATSAPP_CALL_DIRECTION_INBOUND" }, { no: 2, name: "WHATSAPP_CALL_DIRECTION_OUTBOUND" }]);
var qd = m4.makeMessageType("livekit.DialWhatsAppCallRequest", () => [{ no: 1, name: "whatsapp_phone_number_id", kind: "scalar", T: 9 }, { no: 2, name: "whatsapp_to_phone_number", kind: "scalar", T: 9 }, { no: 3, name: "whatsapp_api_key", kind: "scalar", T: 9 }, { no: 12, name: "whatsapp_cloud_api_version", kind: "scalar", T: 9 }, { no: 4, name: "whatsapp_biz_opaque_callback_data", kind: "scalar", T: 9 }, { no: 5, name: "room_name", kind: "scalar", T: 9 }, { no: 6, name: "agents", kind: "message", T: R6, repeated: true }, { no: 7, name: "participant_identity", kind: "scalar", T: 9 }, { no: 8, name: "participant_name", kind: "scalar", T: 9 }, { no: 9, name: "participant_metadata", kind: "scalar", T: 9 }, { no: 10, name: "participant_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 11, name: "destination_country", kind: "scalar", T: 9 }, { no: 13, name: "ringing_timeout", kind: "message", T: oe4 }]);
var Fd = m4.makeMessageType("livekit.DialWhatsAppCallResponse", () => [{ no: 1, name: "whatsapp_call_id", kind: "scalar", T: 9 }, { no: 2, name: "room_name", kind: "scalar", T: 9 }]);
var Gd = m4.makeMessageType("livekit.DisconnectWhatsAppCallRequest", () => [{ no: 1, name: "whatsapp_call_id", kind: "scalar", T: 9 }, { no: 2, name: "whatsapp_api_key", kind: "scalar", T: 9 }, { no: 3, name: "disconnect_reason", kind: "enum", T: m4.getEnumType(Lm) }]);
var Lm = m4.makeEnum("livekit.DisconnectWhatsAppCallRequest.DisconnectReason", [{ no: 0, name: "BUSINESS_INITIATED" }, { no: 1, name: "USER_INITIATED" }]);
var Hd = m4.makeMessageType("livekit.DisconnectWhatsAppCallResponse", []);
var Bd = m4.makeMessageType("livekit.ConnectWhatsAppCallRequest", () => [{ no: 1, name: "whatsapp_call_id", kind: "scalar", T: 9 }, { no: 2, name: "sdp", kind: "message", T: t64 }, { no: 3, name: "wait_until_answered", kind: "scalar", T: 8 }]);
var Kd = m4.makeMessageType("livekit.ConnectWhatsAppCallResponse", []);
var xd = m4.makeMessageType("livekit.AcceptWhatsAppCallRequest", () => [{ no: 1, name: "whatsapp_phone_number_id", kind: "scalar", T: 9 }, { no: 2, name: "whatsapp_api_key", kind: "scalar", T: 9 }, { no: 13, name: "whatsapp_cloud_api_version", kind: "scalar", T: 9 }, { no: 3, name: "whatsapp_call_id", kind: "scalar", T: 9 }, { no: 4, name: "whatsapp_biz_opaque_callback_data", kind: "scalar", T: 9 }, { no: 5, name: "sdp", kind: "message", T: t64 }, { no: 6, name: "room_name", kind: "scalar", T: 9 }, { no: 7, name: "agents", kind: "message", T: R6, repeated: true }, { no: 8, name: "participant_identity", kind: "scalar", T: 9 }, { no: 9, name: "participant_name", kind: "scalar", T: 9 }, { no: 10, name: "participant_metadata", kind: "scalar", T: 9 }, { no: 11, name: "participant_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 12, name: "destination_country", kind: "scalar", T: 9 }, { no: 14, name: "ringing_timeout", kind: "message", T: oe4 }, { no: 15, name: "wait_until_answered", kind: "scalar", T: 8 }]);
var Vd = m4.makeMessageType("livekit.AcceptWhatsAppCallResponse", () => [{ no: 1, name: "room_name", kind: "scalar", T: 9 }]);
var Wd = m4.makeMessageType("livekit.WhatsAppCall", () => [{ no: 1, name: "whatsapp_call_id", kind: "scalar", T: 9 }, { no: 2, name: "direction", kind: "enum", T: m4.getEnumType(hm) }]);
var wd = m4.makeMessageType("livekit.TokenSourceRequest", () => [{ no: 1, name: "room_name", kind: "scalar", T: 9, opt: true }, { no: 2, name: "participant_name", kind: "scalar", T: 9, opt: true }, { no: 3, name: "participant_identity", kind: "scalar", T: 9, opt: true }, { no: 4, name: "participant_metadata", kind: "scalar", T: 9, opt: true }, { no: 5, name: "participant_attributes", kind: "map", K: 9, V: { kind: "scalar", T: 9 } }, { no: 6, name: "room_config", kind: "message", T: Se3, opt: true }]);
var Jd = m4.makeMessageType("livekit.TokenSourceResponse", () => [{ no: 1, name: "server_url", kind: "scalar", T: 9 }, { no: 2, name: "participant_token", kind: "scalar", T: 9 }]);
var Yd = m4.makeMessageType("livekit.WebhookEvent", () => [{ no: 1, name: "event", kind: "scalar", T: 9 }, { no: 2, name: "room", kind: "message", T: r }, { no: 3, name: "participant", kind: "message", T: s }, { no: 9, name: "egress_info", kind: "message", T: _e3 }, { no: 10, name: "ingress_info", kind: "message", T: ge4 }, { no: 8, name: "track", kind: "message", T: S7 }, { no: 12, name: "job", kind: "message", T: C7 }, { no: 6, name: "id", kind: "scalar", T: 9 }, { no: 7, name: "created_at", kind: "scalar", T: 3 }, { no: 11, name: "num_dropped", kind: "scalar", T: 5 }, { no: 13, name: "room_end_reason", kind: "enum", T: m4.getEnumType(ya) }]);

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/runtime/webcrypto.mjs
var o4 = crypto;
var e = (t72) => t72 instanceof CryptoKey;

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/buffer_utils.mjs
var h4 = new TextEncoder();
var a = new TextDecoder();
var s2 = 2 ** 32;
function u4(...n9) {
  let t72 = n9.reduce((o18, { length: c9 }) => o18 + c9, 0), e4 = new Uint8Array(t72), r10 = 0;
  for (let o18 of n9) e4.set(o18, r10), r10 += o18.length;
  return e4;
}

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/runtime/base64url.mjs
var a2 = (r10) => {
  let e4 = r10;
  typeof e4 == "string" && (e4 = h4.encode(e4));
  let t72 = 32768, o18 = [];
  for (let n9 = 0; n9 < e4.length; n9 += t72) o18.push(String.fromCharCode.apply(null, e4.subarray(n9, n9 + t72)));
  return btoa(o18.join(""));
};
var s3 = (r10) => a2(r10).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
var l3 = (r10) => {
  let e4 = atob(r10), t72 = new Uint8Array(e4.length);
  for (let o18 = 0; o18 < e4.length; o18++) t72[o18] = e4.charCodeAt(o18);
  return t72;
};
var i5 = (r10) => {
  let e4 = r10;
  e4 instanceof Uint8Array && (e4 = a.decode(e4)), e4 = e4.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  try {
    return l3(e4);
  } catch {
    throw new TypeError("The input to be decoded is not correctly encoded.");
  }
};

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/is_object.mjs
function o6(t72) {
  return typeof t72 == "object" && t72 !== null;
}
function r2(t72) {
  if (!o6(t72) || Object.prototype.toString.call(t72) !== "[object Object]") return false;
  if (Object.getPrototypeOf(t72) === null) return true;
  let e4 = t72;
  for (; Object.getPrototypeOf(e4) !== null; ) e4 = Object.getPrototypeOf(e4);
  return Object.getPrototypeOf(t72) === e4;
}

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/errors.mjs
var s4 = class extends Error {
  constructor(t72, e4) {
    super(t72, e4), this.code = "ERR_JOSE_GENERIC", this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
  }
};
s4.code = "ERR_JOSE_GENERIC";
var r4 = class extends s4 {
  constructor(t72, e4, _8 = "unspecified", o18 = "unspecified") {
    super(t72, { cause: { claim: _8, reason: o18, payload: e4 } }), this.code = "ERR_JWT_CLAIM_VALIDATION_FAILED", this.claim = _8, this.reason = o18, this.payload = e4;
  }
};
r4.code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
var R7 = class extends s4 {
  constructor(t72, e4, _8 = "unspecified", o18 = "unspecified") {
    super(t72, { cause: { claim: _8, reason: o18, payload: e4 } }), this.code = "ERR_JWT_EXPIRED", this.claim = _8, this.reason = o18, this.payload = e4;
  }
};
R7.code = "ERR_JWT_EXPIRED";
var E9 = class extends s4 {
  constructor() {
    super(...arguments), this.code = "ERR_JOSE_ALG_NOT_ALLOWED";
  }
};
E9.code = "ERR_JOSE_ALG_NOT_ALLOWED";
var I7 = class extends s4 {
  constructor() {
    super(...arguments), this.code = "ERR_JOSE_NOT_SUPPORTED";
  }
};
I7.code = "ERR_JOSE_NOT_SUPPORTED";
var u5 = class extends s4 {
  constructor(t72 = "decryption operation failed", e4) {
    super(t72, e4), this.code = "ERR_JWE_DECRYPTION_FAILED";
  }
};
u5.code = "ERR_JWE_DECRYPTION_FAILED";
var n3 = class extends s4 {
  constructor() {
    super(...arguments), this.code = "ERR_JWE_INVALID";
  }
};
n3.code = "ERR_JWE_INVALID";
var d2 = class extends s4 {
  constructor() {
    super(...arguments), this.code = "ERR_JWS_INVALID";
  }
};
d2.code = "ERR_JWS_INVALID";
var p4 = class extends s4 {
  constructor() {
    super(...arguments), this.code = "ERR_JWT_INVALID";
  }
};
p4.code = "ERR_JWT_INVALID";
var A10 = class extends s4 {
  constructor() {
    super(...arguments), this.code = "ERR_JWK_INVALID";
  }
};
A10.code = "ERR_JWK_INVALID";
var L8 = class extends s4 {
  constructor() {
    super(...arguments), this.code = "ERR_JWKS_INVALID";
  }
};
L8.code = "ERR_JWKS_INVALID";
var x9 = class extends s4 {
  constructor(t72 = "no applicable key found in the JSON Web Key Set", e4) {
    super(t72, e4), this.code = "ERR_JWKS_NO_MATCHING_KEY";
  }
};
x9.code = "ERR_JWKS_NO_MATCHING_KEY";
var N10 = class extends s4 {
  constructor(t72 = "multiple matching keys found in the JSON Web Key Set", e4) {
    super(t72, e4), this.code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  }
};
N10.code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
var T9 = class extends s4 {
  constructor(t72 = "request timed out", e4) {
    super(t72, e4), this.code = "ERR_JWKS_TIMEOUT";
  }
};
T9.code = "ERR_JWKS_TIMEOUT";
var h5 = class extends s4 {
  constructor(t72 = "signature verification failed", e4) {
    super(t72, e4), this.code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  }
};
h5.code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/runtime/random.mjs
var e2 = o4.getRandomValues.bind(o4);

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/crypto_key.mjs
function r5(t72, e4 = "algorithm.name") {
  return new TypeError(`CryptoKey does not support this operation, its ${e4} must be ${t72}`);
}
function c5(t72, e4) {
  return t72.name === e4;
}
function h6(t72) {
  return parseInt(t72.name.slice(4), 10);
}
function n4(t72) {
  switch (t72) {
    case "ES256":
      return "P-256";
    case "ES384":
      return "P-384";
    case "ES512":
      return "P-521";
    default:
      throw new Error("unreachable");
  }
}
function i6(t72, e4) {
  if (e4.length && !e4.some((o18) => t72.usages.includes(o18))) {
    let o18 = "CryptoKey does not support this operation, its usages must include ";
    if (e4.length > 2) {
      let a8 = e4.pop();
      o18 += `one of ${e4.join(", ")}, or ${a8}.`;
    } else e4.length === 2 ? o18 += `one of ${e4[0]} or ${e4[1]}.` : o18 += `${e4[0]}.`;
    throw new TypeError(o18);
  }
}
function l4(t72, e4, ...o18) {
  switch (e4) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!c5(t72.algorithm, "HMAC")) throw r5("HMAC");
      let a8 = parseInt(e4.slice(2), 10);
      if (h6(t72.algorithm.hash) !== a8) throw r5(`SHA-${a8}`, "algorithm.hash");
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!c5(t72.algorithm, "RSASSA-PKCS1-v1_5")) throw r5("RSASSA-PKCS1-v1_5");
      let a8 = parseInt(e4.slice(2), 10);
      if (h6(t72.algorithm.hash) !== a8) throw r5(`SHA-${a8}`, "algorithm.hash");
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!c5(t72.algorithm, "RSA-PSS")) throw r5("RSA-PSS");
      let a8 = parseInt(e4.slice(2), 10);
      if (h6(t72.algorithm.hash) !== a8) throw r5(`SHA-${a8}`, "algorithm.hash");
      break;
    }
    case "EdDSA": {
      if (t72.algorithm.name !== "Ed25519" && t72.algorithm.name !== "Ed448") throw r5("Ed25519 or Ed448");
      break;
    }
    case "Ed25519": {
      if (!c5(t72.algorithm, "Ed25519")) throw r5("Ed25519");
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!c5(t72.algorithm, "ECDSA")) throw r5("ECDSA");
      let a8 = n4(e4);
      if (t72.algorithm.namedCurve !== a8) throw r5(a8, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  i6(t72, o18);
}

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/invalid_key_input.mjs
function f6(n9, e4, ...o18) {
  if (o18 = o18.filter(Boolean), o18.length > 2) {
    let i12 = o18.pop();
    n9 += `one of type ${o18.join(", ")}, or ${i12}.`;
  } else o18.length === 2 ? n9 += `one of type ${o18[0]} or ${o18[1]}.` : n9 += `of type ${o18[0]}.`;
  return e4 == null ? n9 += ` Received ${e4}` : typeof e4 == "function" && e4.name ? n9 += ` Received function ${e4.name}` : typeof e4 == "object" && e4 != null && e4.constructor?.name && (n9 += ` Received an instance of ${e4.constructor.name}`), n9;
}
var r6 = (n9, ...e4) => f6("Key must be ", n9, ...e4);
function t65(n9, e4, ...o18) {
  return f6(`Key for the ${n9} algorithm must be `, e4, ...o18);
}

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/runtime/is_key_like.mjs
var o8 = (t72) => e(t72) ? true : t72?.[Symbol.toStringTag] === "KeyObject";
var p5 = ["CryptoKey"];

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/is_disjoint.mjs
var a4 = (...o18) => {
  let t72 = o18.filter(Boolean);
  if (t72.length === 0 || t72.length === 1) return true;
  let e4;
  for (let s8 of t72) {
    let r10 = Object.keys(s8);
    if (!e4 || e4.size === 0) {
      e4 = new Set(r10);
      continue;
    }
    for (let n9 of r10) {
      if (e4.has(n9)) return false;
      e4.add(n9);
    }
  }
  return true;
};
var c6 = a4;

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/runtime/check_key_length.mjs
var o9 = (t72, e4) => {
  if (t72.startsWith("RS") || t72.startsWith("PS")) {
    let { modulusLength: r10 } = e4.algorithm;
    if (typeof r10 != "number" || r10 < 2048) throw new TypeError(`${t72} requires key modulusLength to be 2048 bits or larger`);
  }
};

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/is_jwk.mjs
function n5(t72) {
  return r2(t72) && typeof t72.kty == "string";
}
function i7(t72) {
  return t72.kty !== "oct" && typeof t72.d == "string";
}
function e3(t72) {
  return t72.kty !== "oct" && typeof t72.d > "u";
}
function c7(t72) {
  return n5(t72) && t72.kty === "oct" && typeof t72.k == "string";
}

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/runtime/jwk_to_key.mjs
function i8(e4) {
  let a8, r10;
  switch (e4.kty) {
    case "RSA": {
      switch (e4.alg) {
        case "PS256":
        case "PS384":
        case "PS512":
          a8 = { name: "RSA-PSS", hash: `SHA-${e4.alg.slice(-3)}` }, r10 = e4.d ? ["sign"] : ["verify"];
          break;
        case "RS256":
        case "RS384":
        case "RS512":
          a8 = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${e4.alg.slice(-3)}` }, r10 = e4.d ? ["sign"] : ["verify"];
          break;
        case "RSA-OAEP":
        case "RSA-OAEP-256":
        case "RSA-OAEP-384":
        case "RSA-OAEP-512":
          a8 = { name: "RSA-OAEP", hash: `SHA-${parseInt(e4.alg.slice(-3), 10) || 1}` }, r10 = e4.d ? ["decrypt", "unwrapKey"] : ["encrypt", "wrapKey"];
          break;
        default:
          throw new I7('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "EC": {
      switch (e4.alg) {
        case "ES256":
          a8 = { name: "ECDSA", namedCurve: "P-256" }, r10 = e4.d ? ["sign"] : ["verify"];
          break;
        case "ES384":
          a8 = { name: "ECDSA", namedCurve: "P-384" }, r10 = e4.d ? ["sign"] : ["verify"];
          break;
        case "ES512":
          a8 = { name: "ECDSA", namedCurve: "P-521" }, r10 = e4.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          a8 = { name: "ECDH", namedCurve: e4.crv }, r10 = e4.d ? ["deriveBits"] : [];
          break;
        default:
          throw new I7('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "OKP": {
      switch (e4.alg) {
        case "Ed25519":
          a8 = { name: "Ed25519" }, r10 = e4.d ? ["sign"] : ["verify"];
          break;
        case "EdDSA":
          a8 = { name: e4.crv }, r10 = e4.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          a8 = { name: e4.crv }, r10 = e4.d ? ["deriveBits"] : [];
          break;
        default:
          throw new I7('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    default:
      throw new I7('Invalid or unsupported JWK "kty" (Key Type) Parameter value');
  }
  return { algorithm: a8, keyUsages: r10 };
}
var l6 = async (e4) => {
  if (!e4.alg) throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
  let { algorithm: a8, keyUsages: r10 } = i8(e4), n9 = [a8, e4.ext ?? false, e4.key_ops ?? r10], t72 = { ...e4 };
  return delete t72.alg, delete t72.use, o4.subtle.importKey("jwk", t72, ...n9);
};
var o10 = l6;

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/runtime/normalize_key.mjs
var d3 = (e4) => i5(e4);
var o11;
var n6;
var s5 = (e4) => e4?.[Symbol.toStringTag] === "KeyObject";
var p7 = async (e4, r10, t72, i12, l8 = false) => {
  let c9 = e4.get(r10);
  if (c9?.[i12]) return c9[i12];
  let f11 = await o10({ ...t72, alg: i12 });
  return l8 && Object.freeze(r10), c9 ? c9[i12] = f11 : e4.set(r10, { [i12]: f11 }), f11;
};
var K7 = (e4, r10) => {
  if (s5(e4)) {
    let t72 = e4.export({ format: "jwk" });
    return delete t72.d, delete t72.dp, delete t72.dq, delete t72.p, delete t72.q, delete t72.qi, t72.k ? d3(t72.k) : (n6 || (n6 = /* @__PURE__ */ new WeakMap()), p7(n6, e4, t72, r10));
  }
  return n5(e4) ? e4.k ? i5(e4.k) : (n6 || (n6 = /* @__PURE__ */ new WeakMap()), p7(n6, e4, e4, r10, true)) : e4;
};
var w9 = (e4, r10) => {
  if (s5(e4)) {
    let t72 = e4.export({ format: "jwk" });
    return t72.k ? d3(t72.k) : (o11 || (o11 = /* @__PURE__ */ new WeakMap()), p7(o11, e4, t72, r10));
  }
  return n5(e4) ? e4.k ? i5(e4.k) : (o11 || (o11 = /* @__PURE__ */ new WeakMap()), p7(o11, e4, e4, r10, true)) : e4;
};
var x10 = { normalizePublicKey: K7, normalizePrivateKey: w9 };

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/check_key_type.mjs
var o12 = (e4) => e4?.[Symbol.toStringTag];
var s6 = (e4, r10, t72) => {
  if (r10.use !== void 0 && r10.use !== "sig") throw new TypeError("Invalid key for this operation, when present its use must be sig");
  if (r10.key_ops !== void 0 && r10.key_ops.includes?.(t72) !== true) throw new TypeError(`Invalid key for this operation, when present its key_ops must include ${t72}`);
  if (r10.alg !== void 0 && r10.alg !== e4) throw new TypeError(`Invalid key for this operation, when present its alg must be ${e4}`);
  return true;
};
var h8 = (e4, r10, t72, n9) => {
  if (!(r10 instanceof Uint8Array)) {
    if (n9 && n5(r10)) {
      if (c7(r10) && s6(e4, r10, t72)) return;
      throw new TypeError('JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present');
    }
    if (!o8(r10)) throw new TypeError(t65(e4, r10, ...p5, "Uint8Array", n9 ? "JSON Web Key" : null));
    if (r10.type !== "secret") throw new TypeError(`${o12(r10)} instances for symmetric algorithms must be of type "secret"`);
  }
};
var y7 = (e4, r10, t72, n9) => {
  if (n9 && n5(r10)) switch (t72) {
    case "sign":
      if (i7(r10) && s6(e4, r10, t72)) return;
      throw new TypeError("JSON Web Key for this operation be a private JWK");
    case "verify":
      if (e3(r10) && s6(e4, r10, t72)) return;
      throw new TypeError("JSON Web Key for this operation be a public JWK");
  }
  if (!o8(r10)) throw new TypeError(t65(e4, r10, ...p5, n9 ? "JSON Web Key" : null));
  if (r10.type === "secret") throw new TypeError(`${o12(r10)} instances for asymmetric algorithms must not be of type "secret"`);
  if (t72 === "sign" && r10.type === "public") throw new TypeError(`${o12(r10)} instances for asymmetric algorithm signing must be of type "private"`);
  if (t72 === "decrypt" && r10.type === "public") throw new TypeError(`${o12(r10)} instances for asymmetric algorithm decryption must be of type "private"`);
  if (r10.algorithm && t72 === "verify" && r10.type === "private") throw new TypeError(`${o12(r10)} instances for asymmetric algorithm verifying must be of type "public"`);
  if (r10.algorithm && t72 === "encrypt" && r10.type === "private") throw new TypeError(`${o12(r10)} instances for asymmetric algorithm encryption must be of type "public"`);
};
function m6(e4, r10, t72, n9) {
  r10.startsWith("HS") || r10 === "dir" || r10.startsWith("PBES2") || /^A\d{3}(?:GCM)?KW$/.test(r10) ? h8(r10, t72, n9, e4) : y7(r10, t72, n9, e4);
}
var b6 = m6.bind(void 0, false);
var d4 = m6.bind(void 0, true);

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/validate_crit.mjs
function o13(e4, r10, a8, n9, f11) {
  if (f11.crit !== void 0 && n9?.crit === void 0) throw new e4('"crit" (Critical) Header Parameter MUST be integrity protected');
  if (!n9 || n9.crit === void 0) return /* @__PURE__ */ new Set();
  if (!Array.isArray(n9.crit) || n9.crit.length === 0 || n9.crit.some((i12) => typeof i12 != "string" || i12.length === 0)) throw new e4('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  let t72;
  a8 !== void 0 ? t72 = new Map([...Object.entries(a8), ...r10.entries()]) : t72 = r10;
  for (let i12 of n9.crit) {
    if (!t72.has(i12)) throw new I7(`Extension Header Parameter "${i12}" is not recognized`);
    if (f11[i12] === void 0) throw new e4(`Extension Header Parameter "${i12}" is missing`);
    if (t72.get(i12) && n9[i12] === void 0) throw new e4(`Extension Header Parameter "${i12}" MUST be integrity protected`);
  }
  return new Set(n9.crit);
}
var m7 = o13;

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/private_symbols.mjs
var o14 = Symbol();

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/jwks/remote.mjs
var o15;
(typeof navigator > "u" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) && (o15 = "jose/v5.10.0");
var i9 = Symbol();

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/runtime/subtle_dsa.mjs
function r7(e4, s8) {
  let a8 = `SHA-${e4.slice(-3)}`;
  switch (e4) {
    case "HS256":
    case "HS384":
    case "HS512":
      return { hash: a8, name: "HMAC" };
    case "PS256":
    case "PS384":
    case "PS512":
      return { hash: a8, name: "RSA-PSS", saltLength: e4.slice(-3) >> 3 };
    case "RS256":
    case "RS384":
    case "RS512":
      return { hash: a8, name: "RSASSA-PKCS1-v1_5" };
    case "ES256":
    case "ES384":
    case "ES512":
      return { hash: a8, name: "ECDSA", namedCurve: s8.namedCurve };
    case "Ed25519":
      return { name: "Ed25519" };
    case "EdDSA":
      return { name: s8.name };
    default:
      throw new I7(`alg ${e4} is not supported either by JOSE or your javascript runtime`);
  }
}

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/runtime/get_sign_verify_key.mjs
async function a6(i12, r10, t72) {
  if (t72 === "sign" && (r10 = await x10.normalizePrivateKey(r10, i12)), t72 === "verify" && (r10 = await x10.normalizePublicKey(r10, i12)), e(r10)) return l4(r10, i12, t72), r10;
  if (r10 instanceof Uint8Array) {
    if (!i12.startsWith("HS")) throw new TypeError(r6(r10, ...p5));
    return o4.subtle.importKey("raw", r10, { hash: `SHA-${i12.slice(-3)}`, name: "HMAC" }, false, [t72]);
  }
  throw new TypeError(r6(r10, ...p5, "Uint8Array", "JSON Web Key"));
}

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/jws/flattened/sign.mjs
var P7 = async (o18, e4, p9) => {
  let t72 = await a6(o18, e4, "sign");
  o9(o18, t72);
  let h11 = await o4.subtle.sign(r7(o18, t72.algorithm), t72, p9);
  return new Uint8Array(h11);
};
var f8 = P7;
var H10 = class {
  constructor(e4) {
    if (!(e4 instanceof Uint8Array)) throw new TypeError("payload must be an instance of Uint8Array");
    this._payload = e4;
  }
  setProtectedHeader(e4) {
    if (this._protectedHeader) throw new TypeError("setProtectedHeader can only be called once");
    return this._protectedHeader = e4, this;
  }
  setUnprotectedHeader(e4) {
    if (this._unprotectedHeader) throw new TypeError("setUnprotectedHeader can only be called once");
    return this._unprotectedHeader = e4, this;
  }
  async sign(e4, p9) {
    if (!this._protectedHeader && !this._unprotectedHeader) throw new d2("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
    if (!c6(this._protectedHeader, this._unprotectedHeader)) throw new d2("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
    let t72 = { ...this._protectedHeader, ...this._unprotectedHeader }, h11 = m7(d2, /* @__PURE__ */ new Map([["b64", true]]), p9?.crit, this._protectedHeader, t72), a8 = true;
    if (h11.has("b64") && (a8 = this._protectedHeader.b64, typeof a8 != "boolean")) throw new d2('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    let { alg: i12 } = t72;
    if (typeof i12 != "string" || !i12) throw new d2('JWS "alg" (Algorithm) Header Parameter missing or invalid');
    d4(i12, e4, "sign");
    let d5 = this._payload;
    a8 && (d5 = h4.encode(s3(d5)));
    let n9;
    this._protectedHeader ? n9 = h4.encode(s3(JSON.stringify(this._protectedHeader))) : n9 = h4.encode("");
    let u8 = u4(n9, h4.encode("."), d5), y11 = await f8(i12, e4, u8), s8 = { signature: s3(y11), payload: "" };
    return a8 && (s8.payload = a.decode(d5)), this._unprotectedHeader && (s8.header = this._unprotectedHeader), this._protectedHeader && (s8.protected = a.decode(n9)), s8;
  }
};

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/jws/compact/sign.mjs
var r8 = class {
  constructor(e4) {
    this._flattened = new H10(e4);
  }
  setProtectedHeader(e4) {
    return this._flattened.setProtectedHeader(e4), this;
  }
  async sign(e4, n9) {
    let t72 = await this._flattened.sign(e4, n9);
    if (t72.payload === void 0) throw new TypeError("use the flattened module for creating JWS with b64: false");
    return `${t72.protected}.${t72.payload}.${t72.signature}`;
  }
};

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/epoch.mjs
var t67 = (e4) => Math.floor(e4.getTime() / 1e3);

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/lib/secs.mjs
var o16 = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var t68 = (c9) => {
  let s8 = o16.exec(c9);
  if (!s8 || s8[4] && s8[1]) throw new TypeError("Invalid time period format");
  let a8 = parseFloat(s8[2]), r10 = s8[3].toLowerCase(), e4;
  switch (r10) {
    case "sec":
    case "secs":
    case "second":
    case "seconds":
    case "s":
      e4 = Math.round(a8);
      break;
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      e4 = Math.round(a8 * 60);
      break;
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      e4 = Math.round(a8 * 3600);
      break;
    case "day":
    case "days":
    case "d":
      e4 = Math.round(a8 * 86400);
      break;
    case "week":
    case "weeks":
    case "w":
      e4 = Math.round(a8 * 604800);
      break;
    default:
      e4 = Math.round(a8 * 31557600);
      break;
  }
  return s8[1] === "-" || s8[4] === "ago" ? -e4 : e4;
};

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/dist/browser/jwt/produce.mjs
function s7(i12, t72) {
  if (!Number.isFinite(t72)) throw new TypeError(`Invalid ${i12} input`);
  return t72;
}
var o17 = class {
  constructor(t72 = {}) {
    if (!r2(t72)) throw new TypeError("JWT Claims Set MUST be an object");
    this._payload = t72;
  }
  setIssuer(t72) {
    return this._payload = { ...this._payload, iss: t72 }, this;
  }
  setSubject(t72) {
    return this._payload = { ...this._payload, sub: t72 }, this;
  }
  setAudience(t72) {
    return this._payload = { ...this._payload, aud: t72 }, this;
  }
  setJti(t72) {
    return this._payload = { ...this._payload, jti: t72 }, this;
  }
  setNotBefore(t72) {
    return typeof t72 == "number" ? this._payload = { ...this._payload, nbf: s7("setNotBefore", t72) } : t72 instanceof Date ? this._payload = { ...this._payload, nbf: s7("setNotBefore", t67(t72)) } : this._payload = { ...this._payload, nbf: t67(/* @__PURE__ */ new Date()) + t68(t72) }, this;
  }
  setExpirationTime(t72) {
    return typeof t72 == "number" ? this._payload = { ...this._payload, exp: s7("setExpirationTime", t72) } : t72 instanceof Date ? this._payload = { ...this._payload, exp: s7("setExpirationTime", t67(t72)) } : this._payload = { ...this._payload, exp: t67(/* @__PURE__ */ new Date()) + t68(t72) }, this;
  }
  setIssuedAt(t72) {
    return typeof t72 > "u" ? this._payload = { ...this._payload, iat: t67(/* @__PURE__ */ new Date()) } : t72 instanceof Date ? this._payload = { ...this._payload, iat: s7("setIssuedAt", t67(t72)) } : typeof t72 == "string" ? this._payload = { ...this._payload, iat: s7("setIssuedAt", t67(/* @__PURE__ */ new Date()) + t68(t72)) } : this._payload = { ...this._payload, iat: s7("setIssuedAt", t72) }, this;
  }
};

// supabase/functions/_vendor/esm.sh/jose@5.10.0/denonext/jwt/sign.mjs
var t69 = class extends o17 {
  setProtectedHeader(e4) {
    return this._protectedHeader = e4, this;
  }
  async sign(e4, o18) {
    let r10 = new r8(h4.encode(JSON.stringify(this._payload)));
    if (r10.setProtectedHeader(this._protectedHeader), Array.isArray(this._protectedHeader?.crit) && this._protectedHeader.crit.includes("b64") && this._protectedHeader.b64 === false) throw new p4("JWTs MUST NOT use unencoded payload");
    return r10.sign(e4, o18);
  }
};

// supabase/functions/_vendor/esm.sh/livekit-server-sdk@2.9.7/denonext/livekit-server-sdk.mjs
import __Process$4 from "node:process";
function X7(c9) {
  switch (c9) {
    case f5.CAMERA:
      return "camera";
    case f5.MICROPHONE:
      return "microphone";
    case f5.SCREEN_SHARE:
      return "screen_share";
    case f5.SCREEN_SHARE_AUDIO:
      return "screen_share_audio";
    default:
      throw new TypeError(`Cannot convert TrackSource ${c9} to string`);
  }
}
function D9(c9) {
  var e4;
  let t72 = { ...c9 };
  return Array.isArray((e4 = t72.video) == null ? void 0 : e4.canPublishSources) && (t72.video.canPublishSources = t72.video.canPublishSources.map(X7)), t72;
}
var Z7 = "6h";
var v5 = class {
  constructor(e4, t72, r10) {
    if (e4 || (e4 = __Process$4.env.LIVEKIT_API_KEY), t72 || (t72 = __Process$4.env.LIVEKIT_API_SECRET), !e4 || !t72) throw Error("api-key and api-secret must be set");
    typeof document < "u" && console.error(`You should not include your API secret in your web client bundle.

Your web client should request a token from your backend server which should then use the API secret to generate a token. See https://docs.livekit.io/client/connect/`), this.apiKey = e4, this.apiSecret = t72, this.grants = {}, this.identity = r10?.identity, this.ttl = r10?.ttl || Z7, typeof this.ttl == "number" && (this.ttl = `${this.ttl}s`), r10?.metadata && (this.metadata = r10.metadata), r10?.attributes && (this.attributes = r10.attributes), r10?.name && (this.name = r10.name);
  }
  addGrant(e4) {
    this.grants.video = { ...this.grants.video ?? {}, ...e4 };
  }
  addSIPGrant(e4) {
    this.grants.sip = { ...this.grants.sip ?? {}, ...e4 };
  }
  get name() {
    return this.grants.name;
  }
  set name(e4) {
    this.grants.name = e4;
  }
  get metadata() {
    return this.grants.metadata;
  }
  set metadata(e4) {
    this.grants.metadata = e4;
  }
  get attributes() {
    return this.grants.attributes;
  }
  set attributes(e4) {
    this.grants.attributes = e4;
  }
  get kind() {
    return this.grants.kind;
  }
  set kind(e4) {
    this.grants.kind = e4;
  }
  get sha256() {
    return this.grants.sha256;
  }
  set sha256(e4) {
    this.grants.sha256 = e4;
  }
  get roomPreset() {
    return this.grants.roomPreset;
  }
  set roomPreset(e4) {
    this.grants.roomPreset = e4;
  }
  get roomConfig() {
    return this.grants.roomConfig;
  }
  set roomConfig(e4) {
    this.grants.roomConfig = e4;
  }
  async toJwt() {
    var e4;
    let t72 = new TextEncoder().encode(this.apiSecret), r10 = new t69(D9(this.grants)).setProtectedHeader({ alg: "HS256" }).setIssuer(this.apiKey).setExpirationTime(this.ttl).setNotBefore(0);
    if (this.identity) r10.setSubject(this.identity);
    else if ((e4 = this.grants.video) != null && e4.roomJoin) throw Error("identity is required for join but not set");
    return r10.sign(t72);
  }
};

// supabase/functions/_shared/cors.ts
function previewOriginAllowed(origin) {
  const pattern = Deno.env.get("PREVIEW_ORIGIN_PATTERN")?.trim();
  if (!pattern || !origin) return false;
  try {
    return new RegExp(`^(?:${pattern})$`, "i").test(origin);
  } catch {
    return false;
  }
}
var DEV_ORIGINS = /* @__PURE__ */ new Set([
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  // illuxus-venue dev server
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080"
]);
var NATIVE_APP_ORIGINS = /* @__PURE__ */ new Set([
  "capacitor://localhost",
  // iOS
  "https://localhost"
  // Android
]);
var ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-correlation-id";
var DEFAULT_METHODS = "POST, OPTIONS";
function envAllowedOrigins() {
  const set = /* @__PURE__ */ new Set([...DEV_ORIGINS, ...NATIVE_APP_ORIGINS]);
  const fromSecret = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s8) => s8.trim()).filter(Boolean);
  for (const o18 of fromSecret) set.add(stripTrailingSlash(o18));
  const publicDomain = Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN");
  const publishedHost = Deno.env.get("PUBLIC_PUBLISHED_HOST") || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST");
  for (const host of [publicDomain, publishedHost]) {
    if (!host) continue;
    const trimmed = stripTrailingSlash(host).trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      set.add(trimmed);
    } else {
      set.add(`https://${trimmed}`);
    }
  }
  return set;
}
function stripTrailingSlash(s8) {
  return s8.endsWith("/") ? s8.slice(0, -1) : s8;
}
function buildCorsHeaders(req, opts = {}) {
  const headers = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": opts.methods ?? DEFAULT_METHODS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (opts.allowAny) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }
  const origin = req.headers.get("Origin") ?? "";
  const allowed = envAllowedOrigins();
  for (const e4 of opts.extraOrigins ?? []) allowed.add(stripTrailingSlash(e4));
  if (origin && allowed.has(stripTrailingSlash(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else if (origin && previewOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = "null";
  }
  return headers;
}
function handlePreflight(req, cors) {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: cors });
}

// supabase/functions/_shared/auth.ts
function tokenClaims(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload.padEnd(payload.length + (4 - payload.length % 4) % 4, "=")));
  } catch {
    return {};
  }
}
function tokenAal(token) {
  const aal = tokenClaims(token).aal;
  return typeof aal === "string" ? aal : null;
}
function sessionMeetsTwoFactor(user, token) {
  const hasFactor = (user.factors ?? []).some((f11) => f11.status === "verified");
  return !hasFactor || tokenAal(token) === "aal2";
}

// supabase/functions/_shared/edge-logger.ts
var DENY_LIST_KEYS = /* @__PURE__ */ new Set([
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "service_role_key",
  "service-role-key",
  "supabase_service_role_key",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
  "session_id",
  "session",
  "otp",
  "otp_code",
  "code_hash",
  "private_key",
  "credit_card",
  "card_number",
  "cvv",
  "ssn"
]);
function redactValue(key, value) {
  if (DENY_LIST_KEYS.has(key.toLowerCase())) return "[redacted]";
  if (value === null || value === void 0) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v6, i12) => redactValue(`${key}[${i12}]`, v6));
  const out = {};
  for (const [k6, v6] of Object.entries(value)) {
    out[k6] = redactValue(k6, v6);
  }
  return out;
}
function emit(level, fnName, bound, msg, fields) {
  const record = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    fn: fnName,
    msg,
    ...redactValue("__bound__", bound)
  };
  if (fields) {
    Object.assign(record, redactValue("__fields__", fields));
  }
  const line = JSON.stringify(record);
  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "info":
      console.info(line);
      break;
    case "debug":
    default:
      console.debug(line);
      break;
  }
}
function createEdgeLogger(fnName) {
  return makeLogger(fnName, {});
}
function makeLogger(fnName, bound) {
  return {
    debug(msg, fields) {
      emit("debug", fnName, bound, msg, fields);
    },
    info(msg, fields) {
      emit("info", fnName, bound, msg, fields);
    },
    warn(msg, fields) {
      emit("warn", fnName, bound, msg, fields);
    },
    error(msg, fields) {
      emit("error", fnName, bound, msg, fields);
    },
    child(extra) {
      return makeLogger(fnName, { ...bound, ...extra });
    }
  };
}
function toErrorFields(err) {
  if (err instanceof Error) {
    return {
      error_name: err.name,
      error_message: err.message,
      error_stack: err.stack
    };
  }
  return { error_message: String(err) };
}

// supabase/functions/livekit-room-end/index.ts
var log = createEdgeLogger("livekit-room-end");
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const { session_id } = await req.json();
    const auth = req.headers.get("Authorization") || "";
    const supabase = ye2(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return j10({ error: "Unauthenticated" }, 401);
    if (!sessionMeetsTwoFactor(user, auth.replace("Bearer ", ""))) return j10({ error: "Two-factor verification required" }, 401);
    const { data: session } = await supabase.from("webinar_sessions").select("id, event_id, livekit_room, egress_id").eq("id", session_id).maybeSingle();
    if (!session) return j10({ error: "Not found" }, 404);
    const { data: ev } = await supabase.from("events").select("user_id").eq("id", session.event_id).maybeSingle();
    if (ev?.user_id !== user.id) {
      const { data: r10 } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!r10) return j10({ error: "Forbidden" }, 403);
    }
    const url = Deno.env.get("LIVEKIT_WS_URL").replace(/^wss?:\/\//, "https://");
    const at4 = new v5(Deno.env.get("LIVEKIT_API_KEY"), Deno.env.get("LIVEKIT_API_SECRET"), { identity: "server" });
    at4.addGrant({ roomAdmin: true, room: session.livekit_room });
    const jwt = await at4.toJwt();
    if (session.egress_id) {
      await fetch(`${url}/twirp/livekit.Egress/StopEgress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
        body: JSON.stringify({ egress_id: session.egress_id })
      }).catch(() => {
      });
    }
    await fetch(`${url}/twirp/livekit.RoomService/DeleteRoom`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ room: session.livekit_room })
    }).catch(() => {
    });
    await supabase.from("webinar_sessions").update({ status: "ended", ended_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", session_id);
    return j10({ ok: true });
  } catch (e4) {
    log.error("unhandled error", toErrorFields(e4));
    return j10({ error: "Something went wrong. Please try again." }, 500);
  }
  function j10(b7, s8 = 200) {
    return new Response(JSON.stringify(b7), { status: s8, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
