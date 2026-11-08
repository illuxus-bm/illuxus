// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `send-speaker-invite-email` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/_vendor/esm.sh/tslib@2.8.1/denonext/tslib.mjs
function S(e, t) {
  var r = {};
  for (var n3 in e) Object.prototype.hasOwnProperty.call(e, n3) && t.indexOf(n3) < 0 && (r[n3] = e[n3]);
  if (e != null && typeof Object.getOwnPropertySymbols == "function") for (var i4 = 0, n3 = Object.getOwnPropertySymbols(e); i4 < n3.length; i4++) t.indexOf(n3[i4]) < 0 && Object.prototype.propertyIsEnumerable.call(e, n3[i4]) && (r[n3[i4]] = e[n3[i4]]);
  return r;
}
function F(e, t, r, n3) {
  function i4(o3) {
    return o3 instanceof r ? o3 : new r(function(a) {
      a(o3);
    });
  }
  return new (r || (r = Promise))(function(o3, a) {
    function f5(s) {
      try {
        c3(n3.next(s));
      } catch (l) {
        a(l);
      }
    }
    function p3(s) {
      try {
        c3(n3.throw(s));
      } catch (l) {
        a(l);
      }
    }
    function c3(s) {
      s.done ? o3(s.value) : i4(s.value).then(f5, p3);
    }
    c3((n3 = n3.apply(e, t || [])).next());
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
  constructor(e, t, r) {
    super(e), this.__isAuthError = true, this.name = "AuthError", this.status = t, this.code = r;
  }
  toJSON() {
    return { name: this.name, message: this.message, status: this.status, code: this.code };
  }
};
function h(i4) {
  return typeof i4 == "object" && i4 !== null && "__isAuthError" in i4;
}
var _e = class extends M {
  constructor(e, t, r) {
    super(e, t, r), this.name = "AuthApiError", this.status = t, this.code = r;
  }
};
function Je(i4) {
  return h(i4) && i4.name === "AuthApiError";
}
var x = class extends M {
  constructor(e, t) {
    super(e), this.name = "AuthUnknownError", this.originalError = t;
  }
};
var C = class extends M {
  constructor(e, t, r, s) {
    super(e, r, s), this.name = t, this.status = r;
  }
};
var E = class extends C {
  constructor() {
    super("Auth session missing!", "AuthSessionMissingError", 400, void 0);
  }
};
function ae(i4) {
  return h(i4) && i4.name === "AuthSessionMissingError";
}
var K = class extends C {
  constructor() {
    super("Auth session or user missing", "AuthInvalidTokenResponseError", 500, void 0);
  }
};
var J = class extends C {
  constructor(e) {
    super(e, "AuthInvalidCredentialsError", 400, void 0);
  }
};
var H = class extends C {
  constructor(e, t = null) {
    super(e, "AuthImplicitGrantRedirectError", 500, void 0), this.details = null, this.details = t;
  }
  toJSON() {
    return Object.assign(Object.assign({}, super.toJSON()), { details: this.details });
  }
};
function He(i4) {
  return h(i4) && i4.name === "AuthImplicitGrantRedirectError";
}
var ie = class extends C {
  constructor(e, t = null) {
    super(e, "AuthPKCEGrantCodeExchangeError", 500, void 0), this.details = null, this.details = t;
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
  constructor(e, t) {
    super(e, "AuthRetryableFetchError", t, void 0);
  }
};
function we(i4) {
  return h(i4) && i4.name === "AuthRetryableFetchError";
}
var ne = class extends C {
  constructor(e = "Refresh result discarded: session state changed mid-flight (e.g., concurrent signOut)") {
    super(e, "AuthRefreshDiscardedError", 409, void 0);
  }
};
function Ye(i4) {
  return h(i4) && i4.name === "AuthRefreshDiscardedError";
}
var oe = class extends C {
  constructor(e, t, r) {
    super(e, "AuthWeakPasswordError", t, "weak_password"), this.reasons = r;
  }
  toJSON() {
    return Object.assign(Object.assign({}, super.toJSON()), { reasons: this.reasons });
  }
};
var G = class extends C {
  constructor(e) {
    super(e, "AuthInvalidJwtError", 400, "invalid_jwt");
  }
};
var pe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
var Xe = ` 	
\r=`.split("");
var Rt = (() => {
  let i4 = new Array(128);
  for (let e = 0; e < i4.length; e += 1) i4[e] = -1;
  for (let e = 0; e < Xe.length; e += 1) i4[Xe[e].charCodeAt(0)] = -2;
  for (let e = 0; e < pe.length; e += 1) i4[pe[e].charCodeAt(0)] = e;
  return i4;
})();
function Ze(i4, e, t) {
  if (i4 !== null) for (e.queue = e.queue << 8 | i4, e.queuedBits += 8; e.queuedBits >= 6; ) {
    let r = e.queue >> e.queuedBits - 6 & 63;
    t(pe[r]), e.queuedBits -= 6;
  }
  else if (e.queuedBits > 0) for (e.queue = e.queue << 6 - e.queuedBits, e.queuedBits = 6; e.queuedBits >= 6; ) {
    let r = e.queue >> e.queuedBits - 6 & 63;
    t(pe[r]), e.queuedBits -= 6;
  }
}
function Qe(i4, e, t) {
  let r = Rt[i4];
  if (r > -1) for (e.queue = e.queue << 6 | r, e.queuedBits += 6; e.queuedBits >= 8; ) t(e.queue >> e.queuedBits - 8 & 255), e.queuedBits -= 8;
  else {
    if (r === -2) return;
    throw new Error(`Invalid Base64-URL character "${String.fromCharCode(i4)}"`);
  }
}
function Te(i4) {
  let e = [], t = (o3) => {
    e.push(String.fromCodePoint(o3));
  }, r = { utf8seq: 0, codepoint: 0 }, s = { queue: 0, queuedBits: 0 }, n3 = (o3) => {
    At(o3, r, t);
  };
  for (let o3 = 0; o3 < i4.length; o3 += 1) Qe(i4.charCodeAt(o3), s, n3);
  return e.join("");
}
function St(i4, e) {
  if (i4 <= 127) {
    e(i4);
    return;
  } else if (i4 <= 2047) {
    e(192 | i4 >> 6), e(128 | i4 & 63);
    return;
  } else if (i4 <= 65535) {
    e(224 | i4 >> 12), e(128 | i4 >> 6 & 63), e(128 | i4 & 63);
    return;
  } else if (i4 <= 1114111) {
    e(240 | i4 >> 18), e(128 | i4 >> 12 & 63), e(128 | i4 >> 6 & 63), e(128 | i4 & 63);
    return;
  }
  throw new Error(`Unrecognized Unicode codepoint: ${i4.toString(16)}`);
}
function Et(i4, e) {
  for (let t = 0; t < i4.length; t += 1) {
    let r = i4.charCodeAt(t);
    if (r > 55295 && r <= 56319) {
      let s = (r - 55296) * 1024 & 65535;
      r = (i4.charCodeAt(t + 1) - 56320 & 65535 | s) + 65536, t += 1;
    }
    St(r, e);
  }
}
function At(i4, e, t) {
  if (e.utf8seq === 0) {
    if (i4 <= 127) {
      t(i4);
      return;
    }
    for (let r = 1; r < 6; r += 1) if ((i4 >> 7 - r & 1) === 0) {
      e.utf8seq = r;
      break;
    }
    if (e.utf8seq === 2) e.codepoint = i4 & 31;
    else if (e.utf8seq === 3) e.codepoint = i4 & 15;
    else if (e.utf8seq === 4) e.codepoint = i4 & 7;
    else throw new Error("Invalid UTF-8 sequence");
    e.utf8seq -= 1;
  } else if (e.utf8seq > 0) {
    if (i4 <= 127) throw new Error("Invalid UTF-8 sequence");
    e.codepoint = e.codepoint << 6 | i4 & 63, e.utf8seq -= 1, e.utf8seq === 0 && t(e.codepoint);
  }
}
function B(i4) {
  let e = [], t = { queue: 0, queuedBits: 0 }, r = (s) => {
    e.push(s);
  };
  for (let s = 0; s < i4.length; s += 1) Qe(i4.charCodeAt(s), t, r);
  return new Uint8Array(e);
}
function et(i4) {
  let e = [];
  return Et(i4, (t) => e.push(t)), new Uint8Array(e);
}
function W(i4) {
  let e = [], t = { queue: 0, queuedBits: 0 }, r = (s) => {
    e.push(s);
  };
  return i4.forEach((s) => Ze(s, t, r)), Ze(null, t, r), e.join("");
}
function tt(i4) {
  return Math.round(Date.now() / 1e3) + i4;
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
  let i4 = `lswt-${Math.random()}${Math.random()}`;
  try {
    globalThis.localStorage.setItem(i4, i4), globalThis.localStorage.removeItem(i4), Y.tested = true, Y.writable = true;
  } catch {
    Y.tested = true, Y.writable = false;
  }
  return Y.writable;
};
function st(i4) {
  let e = {}, t = new URL(i4);
  if (t.hash && t.hash[0] === "#") try {
    new URLSearchParams(t.hash.substring(1)).forEach((s, n3) => {
      e[n3] = s;
    });
  } catch {
  }
  return t.searchParams.forEach((r, s) => {
    e[s] = r;
  }), e;
}
var ve = (i4) => i4 ? (...e) => i4(...e) : (...e) => fetch(...e);
var it = (i4) => typeof i4 == "object" && i4 !== null && "status" in i4 && "ok" in i4 && "json" in i4 && typeof i4.json == "function";
var X = async (i4, e, t) => {
  await i4.setItem(e, JSON.stringify(t));
};
var $ = async (i4, e) => {
  let t = await i4.getItem(e);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};
var A = async (i4, e) => {
  await i4.removeItem(e);
};
var le = class i {
  constructor() {
    this.promise = new i.promiseConstructor((e, t) => {
      this.resolve = e, this.reject = t;
    });
  }
};
le.promiseConstructor = Promise;
function ue(i4) {
  let e = i4.split(".");
  if (e.length !== 3) throw new G("Invalid JWT structure");
  for (let r = 0; r < e.length; r++) if (!ze.test(e[r])) throw new G("JWT not in base64url format");
  return { header: JSON.parse(Te(e[0])), payload: JSON.parse(Te(e[1])), signature: B(e[2]), raw: { header: e[0], payload: e[1] } };
}
async function nt(i4) {
  return await new Promise((e) => {
    setTimeout(() => e(null), i4);
  });
}
function ot(i4, e) {
  return new Promise((r, s) => {
    (async () => {
      for (let n3 = 0; n3 < 1 / 0; n3++) try {
        let o3 = await i4(n3);
        if (!e(n3, null, o3)) {
          r(o3);
          return;
        }
      } catch (o3) {
        if (!e(n3, o3)) {
          s(o3);
          return;
        }
      }
    })();
  });
}
function Tt(i4) {
  return ("0" + i4.toString(16)).substr(-2);
}
function It() {
  let e = new Uint32Array(56);
  if (typeof crypto > "u") {
    let t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~", r = t.length, s = "";
    for (let n3 = 0; n3 < 56; n3++) s += t.charAt(Math.floor(Math.random() * r));
    return s;
  }
  return crypto.getRandomValues(e), Array.from(e, Tt).join("");
}
async function xt(i4) {
  let t = new TextEncoder().encode(i4), r = await crypto.subtle.digest("SHA-256", t), s = new Uint8Array(r);
  return Array.from(s).map((n3) => String.fromCharCode(n3)).join("");
}
async function Ot(i4) {
  if (!(typeof crypto < "u" && typeof crypto.subtle < "u" && typeof TextEncoder < "u")) return console.warn("WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256."), i4;
  let t = await xt(i4);
  return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function F2(i4, e, t = false) {
  let r = It(), s = r;
  t && (s += "/recovery"), await X(i4, `${e}-code-verifier`, s);
  let n3 = await Ot(r);
  return [n3, r === n3 ? "plain" : "s256"];
}
var Pt = /^2[0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/i;
function at(i4) {
  let e = i4.headers.get(se);
  if (!e || !e.match(Pt)) return null;
  try {
    return /* @__PURE__ */ new Date(`${e}T00:00:00.0Z`);
  } catch {
    return null;
  }
}
function lt(i4) {
  if (!i4) throw new Error("Missing exp claim");
  let e = Math.floor(Date.now() / 1e3);
  if (i4 <= e) throw new Error("JWT has expired");
}
function ut(i4) {
  switch (i4) {
    case "RS256":
      return { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } };
    case "ES256":
      return { name: "ECDSA", namedCurve: "P-256", hash: { name: "SHA-256" } };
    default:
      throw new Error("Invalid alg claim");
  }
}
var Ct = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function N(i4) {
  if (!Ct.test(i4)) throw new Error("@supabase/auth-js: Expected parameter to be UUID but is not");
}
function O(i4) {
  if (!i4.passkey) throw new Error("@supabase/auth-js: the passkey API is experimental and disabled by default. Enable it by passing `auth: { experimental: { passkey: true } }` to createClient (or to the GoTrueClient constructor).");
}
function be() {
  let i4 = {};
  return new Proxy(i4, { get: (e, t) => {
    if (t === "__isUserNotAvailableProxy") return true;
    if (typeof t == "symbol") {
      let r = t.toString();
      if (r === "Symbol(Symbol.toPrimitive)" || r === "Symbol(Symbol.toStringTag)" || r === "Symbol(util.inspect.custom)") return;
    }
    throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Accessing the "${t}" property of the session object is not supported. Please use getUser() instead.`);
  }, set: (e, t) => {
    throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Setting the "${t}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
  }, deleteProperty: (e, t) => {
    throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Deleting the "${t}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
  } });
}
function ct(i4, e) {
  return new Proxy(i4, { get: (t, r, s) => {
    if (r === "__isInsecureUserWarningProxy") return true;
    if (typeof r == "symbol") {
      let n3 = r.toString();
      if (n3 === "Symbol(Symbol.toPrimitive)" || n3 === "Symbol(Symbol.toStringTag)" || n3 === "Symbol(util.inspect.custom)" || n3 === "Symbol(nodejs.util.inspect.custom)") return Reflect.get(t, r, s);
    }
    return !e.value && typeof r == "string" && (console.warn("Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server."), e.value = true), Reflect.get(t, r, s);
  } });
}
function Ie(i4) {
  return JSON.parse(JSON.stringify(i4));
}
var Z = (i4) => {
  if (typeof i4 == "object" && i4 !== null) {
    let e = i4;
    if (typeof e.msg == "string") return e.msg;
    if (typeof e.message == "string") return e.message;
    if (typeof e.error_description == "string") return e.error_description;
    if (typeof e.error == "string") return e.error;
  }
  return JSON.stringify(i4);
};
var Ut = [502, 503, 504, 520, 521, 522, 523, 524, 530];
async function ht(i4) {
  var e;
  if (!it(i4)) throw new te(Z(i4), 0);
  if (Ut.includes(i4.status)) throw new te(Z(i4), i4.status);
  let t;
  try {
    t = await i4.json();
  } catch (n3) {
    throw new x(Z(n3), n3);
  }
  let r, s = at(i4);
  if (s && s.getTime() >= Ae["2024-01-01"].timestamp && typeof t == "object" && t && typeof t.code == "string" ? r = t.code : typeof t == "object" && t && typeof t.error_code == "string" && (r = t.error_code), r) {
    if (r === "weak_password") throw new oe(Z(t), i4.status, ((e = t.weak_password) === null || e === void 0 ? void 0 : e.reasons) || []);
    if (r === "session_not_found") throw new E();
  } else if (typeof t == "object" && t && typeof t.weak_password == "object" && t.weak_password && Array.isArray(t.weak_password.reasons) && t.weak_password.reasons.length && t.weak_password.reasons.reduce((n3, o3) => n3 && typeof o3 == "string", true)) throw new oe(Z(t), i4.status, t.weak_password.reasons);
  throw new _e(Z(t), i4.status || 500, r);
}
var $t = (i4, e, t, r) => {
  let s = { method: i4, headers: e?.headers || {} };
  return i4 === "GET" ? s : (s.headers = Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, e?.headers), s.body = JSON.stringify(r), Object.assign(Object.assign({}, s), t));
};
async function f(i4, e, t, r) {
  var s;
  let n3 = Object.assign({}, r?.headers);
  n3[se] || (n3[se] = Ae["2024-01-01"].name), r?.jwt && (n3.Authorization = `Bearer ${r.jwt}`);
  let o3 = (s = r?.query) !== null && s !== void 0 ? s : {};
  r?.redirectTo && (o3.redirect_to = r.redirectTo);
  let a = Object.keys(o3).length ? "?" + new URLSearchParams(o3).toString() : "", l = await Nt(i4, e, t + a, { headers: n3, noResolveJson: r?.noResolveJson }, {}, r?.body);
  return r?.xform ? r?.xform(l) : { data: Object.assign({}, l), error: null };
}
async function Nt(i4, e, t, r, s, n3) {
  let o3 = $t(e, r, s, n3), a;
  try {
    a = await i4(t, Object.assign({}, o3));
  } catch (l) {
    throw console.error(l), new te(Z(l), 0);
  }
  if (a.ok || await ht(a), r?.noResolveJson) return a;
  try {
    return await a.json();
  } catch (l) {
    await ht(l);
  }
}
function P(i4) {
  var e;
  let t = null;
  Lt(i4) && (t = Object.assign({}, i4), i4.expires_at || (t.expires_at = tt(i4.expires_in)));
  let r = (e = i4.user) !== null && e !== void 0 ? e : typeof i4?.id == "string" ? i4 : null;
  return { data: { session: t, user: r }, error: null };
}
function xe(i4) {
  let e = P(i4);
  return !e.error && i4.weak_password && typeof i4.weak_password == "object" && Array.isArray(i4.weak_password.reasons) && i4.weak_password.reasons.length && i4.weak_password.message && typeof i4.weak_password.message == "string" && i4.weak_password.reasons.reduce((t, r) => t && typeof r == "string", true) && (e.data.weak_password = i4.weak_password), e;
}
function L(i4) {
  var e;
  return { data: { user: (e = i4.user) !== null && e !== void 0 ? e : i4 }, error: null };
}
function dt(i4) {
  return { data: i4, error: null };
}
function ft(i4) {
  let { action_link: e, email_otp: t, hashed_token: r, redirect_to: s, verification_type: n3 } = i4, o3 = S(i4, ["action_link", "email_otp", "hashed_token", "redirect_to", "verification_type"]), a = { action_link: e, email_otp: t, hashed_token: r, redirect_to: s, verification_type: n3 }, l = Object.assign({}, o3);
  return { data: { properties: a, user: l }, error: null };
}
function Oe(i4) {
  return i4;
}
function Lt(i4) {
  return !!i4.access_token && !!i4.refresh_token && !!i4.expires_in;
}
var me = ["global", "local", "others"];
var z = class {
  constructor({ url: e = "", headers: t = {}, fetch: r, experimental: s }) {
    this.url = e, this.headers = t, this.fetch = ve(r), this.experimental = s ?? {}, this.mfa = { listFactors: this._listFactors.bind(this), deleteFactor: this._deleteFactor.bind(this) }, this.oauth = { listClients: this._listOAuthClients.bind(this), createClient: this._createOAuthClient.bind(this), getClient: this._getOAuthClient.bind(this), updateClient: this._updateOAuthClient.bind(this), deleteClient: this._deleteOAuthClient.bind(this), regenerateClientSecret: this._regenerateOAuthClientSecret.bind(this) }, this.customProviders = { listProviders: this._listCustomProviders.bind(this), createProvider: this._createCustomProvider.bind(this), getProvider: this._getCustomProvider.bind(this), updateProvider: this._updateCustomProvider.bind(this), deleteProvider: this._deleteCustomProvider.bind(this) }, this.passkey = { listPasskeys: this._adminListPasskeys.bind(this), deletePasskey: this._adminDeletePasskey.bind(this) };
  }
  async signOut(e, t = me[0]) {
    if (me.indexOf(t) < 0) throw new Error(`@supabase/auth-js: Parameter scope must be one of ${me.join(", ")}`);
    try {
      return await f(this.fetch, "POST", `${this.url}/logout?scope=${t}`, { headers: this.headers, jwt: e, noResolveJson: true }), { data: null, error: null };
    } catch (r) {
      if (h(r)) return { data: null, error: r };
      throw r;
    }
  }
  async inviteUserByEmail(e, t = {}) {
    try {
      return await f(this.fetch, "POST", `${this.url}/invite`, { body: { email: e, data: t.data }, headers: this.headers, redirectTo: t.redirectTo, xform: L });
    } catch (r) {
      if (h(r)) return { data: { user: null }, error: r };
      throw r;
    }
  }
  async generateLink(e) {
    try {
      let { options: t } = e, r = S(e, ["options"]), s = Object.assign(Object.assign({}, r), t);
      return "newEmail" in r && (s.new_email = r?.newEmail, delete s.newEmail), await f(this.fetch, "POST", `${this.url}/admin/generate_link`, { body: s, headers: this.headers, xform: ft, redirectTo: t?.redirectTo });
    } catch (t) {
      if (h(t)) return { data: { properties: null, user: null }, error: t };
      throw t;
    }
  }
  async createUser(e) {
    try {
      return await f(this.fetch, "POST", `${this.url}/admin/users`, { body: e, headers: this.headers, xform: L });
    } catch (t) {
      if (h(t)) return { data: { user: null }, error: t };
      throw t;
    }
  }
  async listUsers(e) {
    var t, r, s, n3, o3, a, l;
    try {
      let u3 = { nextPage: null, lastPage: 0, total: 0 }, c3 = await f(this.fetch, "GET", `${this.url}/admin/users`, { headers: this.headers, noResolveJson: true, query: { page: (r = (t = e?.page) === null || t === void 0 ? void 0 : t.toString()) !== null && r !== void 0 ? r : "", per_page: (n3 = (s = e?.perPage) === null || s === void 0 ? void 0 : s.toString()) !== null && n3 !== void 0 ? n3 : "" }, xform: Oe });
      if (c3.error) throw c3.error;
      let w6 = await c3.json(), d = (o3 = c3.headers.get("x-total-count")) !== null && o3 !== void 0 ? o3 : 0, _6 = (l = (a = c3.headers.get("link")) === null || a === void 0 ? void 0 : a.split(",")) !== null && l !== void 0 ? l : [];
      return _6.length > 0 && (_6.forEach((v3) => {
        let b4 = parseInt(v3.split(";")[0].split("=")[1].substring(0, 1)), y4 = JSON.parse(v3.split(";")[1].split("=")[1]);
        u3[`${y4}Page`] = b4;
      }), u3.total = parseInt(d)), { data: Object.assign(Object.assign({}, w6), u3), error: null };
    } catch (u3) {
      if (h(u3)) return { data: { users: [] }, error: u3 };
      throw u3;
    }
  }
  async getUserById(e) {
    N(e);
    try {
      return await f(this.fetch, "GET", `${this.url}/admin/users/${e}`, { headers: this.headers, xform: L });
    } catch (t) {
      if (h(t)) return { data: { user: null }, error: t };
      throw t;
    }
  }
  async updateUserById(e, t) {
    N(e);
    try {
      return await f(this.fetch, "PUT", `${this.url}/admin/users/${e}`, { body: t, headers: this.headers, xform: L });
    } catch (r) {
      if (h(r)) return { data: { user: null }, error: r };
      throw r;
    }
  }
  async deleteUser(e, t = false) {
    N(e);
    try {
      return await f(this.fetch, "DELETE", `${this.url}/admin/users/${e}`, { headers: this.headers, body: { should_soft_delete: t }, xform: L });
    } catch (r) {
      if (h(r)) return { data: { user: null }, error: r };
      throw r;
    }
  }
  async _listFactors(e) {
    N(e.userId);
    try {
      let { data: t, error: r } = await f(this.fetch, "GET", `${this.url}/admin/users/${e.userId}/factors`, { headers: this.headers, xform: (s) => ({ data: { factors: s }, error: null }) });
      return { data: t, error: r };
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _deleteFactor(e) {
    N(e.userId), N(e.id);
    try {
      return { data: await f(this.fetch, "DELETE", `${this.url}/admin/users/${e.userId}/factors/${e.id}`, { headers: this.headers }), error: null };
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _listOAuthClients(e) {
    var t, r, s, n3, o3, a, l;
    try {
      let u3 = { nextPage: null, lastPage: 0, total: 0 }, c3 = await f(this.fetch, "GET", `${this.url}/admin/oauth/clients`, { headers: this.headers, noResolveJson: true, query: { page: (r = (t = e?.page) === null || t === void 0 ? void 0 : t.toString()) !== null && r !== void 0 ? r : "", per_page: (n3 = (s = e?.perPage) === null || s === void 0 ? void 0 : s.toString()) !== null && n3 !== void 0 ? n3 : "" }, xform: Oe });
      if (c3.error) throw c3.error;
      let w6 = await c3.json(), d = (o3 = c3.headers.get("x-total-count")) !== null && o3 !== void 0 ? o3 : 0, _6 = (l = (a = c3.headers.get("link")) === null || a === void 0 ? void 0 : a.split(",")) !== null && l !== void 0 ? l : [];
      return _6.length > 0 && (_6.forEach((v3) => {
        let b4 = parseInt(v3.split(";")[0].split("=")[1].substring(0, 1)), y4 = JSON.parse(v3.split(";")[1].split("=")[1]);
        u3[`${y4}Page`] = b4;
      }), u3.total = parseInt(d)), { data: Object.assign(Object.assign({}, w6), u3), error: null };
    } catch (u3) {
      if (h(u3)) return { data: { clients: [] }, error: u3 };
      throw u3;
    }
  }
  async _createOAuthClient(e) {
    try {
      return await f(this.fetch, "POST", `${this.url}/admin/oauth/clients`, { body: e, headers: this.headers, xform: (t) => ({ data: t, error: null }) });
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _getOAuthClient(e) {
    try {
      return await f(this.fetch, "GET", `${this.url}/admin/oauth/clients/${e}`, { headers: this.headers, xform: (t) => ({ data: t, error: null }) });
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _updateOAuthClient(e, t) {
    try {
      return await f(this.fetch, "PUT", `${this.url}/admin/oauth/clients/${e}`, { body: t, headers: this.headers, xform: (r) => ({ data: r, error: null }) });
    } catch (r) {
      if (h(r)) return { data: null, error: r };
      throw r;
    }
  }
  async _deleteOAuthClient(e) {
    try {
      return await f(this.fetch, "DELETE", `${this.url}/admin/oauth/clients/${e}`, { headers: this.headers, noResolveJson: true }), { data: null, error: null };
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _regenerateOAuthClientSecret(e) {
    try {
      return await f(this.fetch, "POST", `${this.url}/admin/oauth/clients/${e}/regenerate_secret`, { headers: this.headers, xform: (t) => ({ data: t, error: null }) });
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _listCustomProviders(e) {
    try {
      let t = {};
      return e?.type && (t.type = e.type), await f(this.fetch, "GET", `${this.url}/admin/custom-providers`, { headers: this.headers, query: t, xform: (r) => {
        var s;
        return { data: { providers: (s = r?.providers) !== null && s !== void 0 ? s : [] }, error: null };
      } });
    } catch (t) {
      if (h(t)) return { data: { providers: [] }, error: t };
      throw t;
    }
  }
  async _createCustomProvider(e) {
    try {
      return await f(this.fetch, "POST", `${this.url}/admin/custom-providers`, { body: e, headers: this.headers, xform: (t) => ({ data: t, error: null }) });
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _getCustomProvider(e) {
    try {
      return await f(this.fetch, "GET", `${this.url}/admin/custom-providers/${e}`, { headers: this.headers, xform: (t) => ({ data: t, error: null }) });
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _updateCustomProvider(e, t) {
    try {
      return await f(this.fetch, "PUT", `${this.url}/admin/custom-providers/${e}`, { body: t, headers: this.headers, xform: (r) => ({ data: r, error: null }) });
    } catch (r) {
      if (h(r)) return { data: null, error: r };
      throw r;
    }
  }
  async _deleteCustomProvider(e) {
    try {
      return await f(this.fetch, "DELETE", `${this.url}/admin/custom-providers/${e}`, { headers: this.headers, noResolveJson: true }), { data: null, error: null };
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _adminListPasskeys(e) {
    O(this.experimental), N(e.userId);
    try {
      return await f(this.fetch, "GET", `${this.url}/admin/users/${e.userId}/passkeys`, { headers: this.headers, xform: (t) => ({ data: t, error: null }) });
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
  async _adminDeletePasskey(e) {
    O(this.experimental), N(e.userId), N(e.passkeyId);
    try {
      return await f(this.fetch, "DELETE", `${this.url}/admin/users/${e.userId}/passkeys/${e.passkeyId}`, { headers: this.headers, noResolveJson: true }), { data: null, error: null };
    } catch (t) {
      if (h(t)) return { data: null, error: t };
      throw t;
    }
  }
};
function Pe(i4 = {}) {
  return { getItem: (e) => i4[e] || null, setItem: (e, t) => {
    i4[e] = t;
  }, removeItem: (e) => {
    delete i4[e];
  } };
}
var U = { debug: !!(globalThis && ye() && globalThis.localStorage && globalThis.localStorage.getItem("supabase.gotrue-js.locks.debug") === "true") };
var V = class extends Error {
  constructor(e) {
    super(e), this.isAcquireTimeout = true;
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
function je(i4) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(i4)) throw new Error(`@supabase/auth-js: Address "${i4}" is invalid.`);
  return i4.toLowerCase();
}
function wt(i4) {
  return parseInt(i4, 16);
}
function pt(i4) {
  let e = new TextEncoder().encode(i4);
  return "0x" + Array.from(e, (r) => r.toString(16).padStart(2, "0")).join("");
}
function yt(i4) {
  var e;
  let { chainId: t, domain: r, expirationTime: s, issuedAt: n3 = /* @__PURE__ */ new Date(), nonce: o3, notBefore: a, requestId: l, resources: u3, scheme: c3, uri: w6, version: d } = i4;
  {
    if (!Number.isInteger(t)) throw new Error(`@supabase/auth-js: Invalid SIWE message field "chainId". Chain ID must be a EIP-155 chain ID. Provided value: ${t}`);
    if (!r) throw new Error('@supabase/auth-js: Invalid SIWE message field "domain". Domain must be provided.');
    if (o3 && o3.length < 8) throw new Error(`@supabase/auth-js: Invalid SIWE message field "nonce". Nonce must be at least 8 characters. Provided value: ${o3}`);
    if (!w6) throw new Error('@supabase/auth-js: Invalid SIWE message field "uri". URI must be provided.');
    if (d !== "1") throw new Error(`@supabase/auth-js: Invalid SIWE message field "version". Version must be '1'. Provided value: ${d}`);
    if (!((e = i4.statement) === null || e === void 0) && e.includes(`
`)) throw new Error(`@supabase/auth-js: Invalid SIWE message field "statement". Statement must not include '\\n'. Provided value: ${i4.statement}`);
  }
  let _6 = je(i4.address), v3 = c3 ? `${c3}://${r}` : r, b4 = i4.statement ? `${i4.statement}
` : "", y4 = `${v3} wants you to sign in with your Ethereum account:
${_6}

${b4}`, m4 = `URI: ${w6}
Version: ${d}
Chain ID: ${t}${o3 ? `
Nonce: ${o3}` : ""}
Issued At: ${n3.toISOString()}`;
  if (s && (m4 += `
Expiration Time: ${s.toISOString()}`), a && (m4 += `
Not Before: ${a.toISOString()}`), l && (m4 += `
Request ID: ${l}`), u3) {
    let p3 = `
Resources:`;
    for (let g2 of u3) {
      if (!g2 || typeof g2 != "string") throw new Error(`@supabase/auth-js: Invalid SIWE message field "resources". Every resource must be a valid string. Provided value: ${g2}`);
      p3 += `
- ${g2}`;
    }
    m4 += p3;
  }
  return `${y4}
${m4}`;
}
var S2 = class extends Error {
  constructor({ message: e, code: t, cause: r, name: s }) {
    var n3;
    super(e, { cause: r }), this.__isWebAuthnError = true, this.name = (n3 = s ?? (r instanceof Error ? r.name : void 0)) !== null && n3 !== void 0 ? n3 : "Unknown Error", this.code = t;
  }
  toJSON() {
    return { name: this.name, message: this.message, code: this.code };
  }
};
var Q = class extends S2 {
  constructor(e, t) {
    super({ code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: t, message: e }), this.name = "WebAuthnUnknownError", this.originalError = t;
  }
};
function vt({ error: i4, options: e }) {
  var t, r, s;
  let { publicKey: n3 } = e;
  if (!n3) throw Error("options was missing required publicKey property");
  if (i4.name === "AbortError") {
    if (e.signal instanceof AbortSignal) return new S2({ message: "Registration ceremony was sent an abort signal", code: "ERROR_CEREMONY_ABORTED", cause: i4 });
  } else if (i4.name === "ConstraintError") {
    if (((t = n3.authenticatorSelection) === null || t === void 0 ? void 0 : t.requireResidentKey) === true) return new S2({ message: "Discoverable credentials were required but no available authenticator supported it", code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT", cause: i4 });
    if (e.mediation === "conditional" && ((r = n3.authenticatorSelection) === null || r === void 0 ? void 0 : r.userVerification) === "required") return new S2({ message: "User verification was required during automatic registration but it could not be performed", code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE", cause: i4 });
    if (((s = n3.authenticatorSelection) === null || s === void 0 ? void 0 : s.userVerification) === "required") return new S2({ message: "User verification was required but no available authenticator supported it", code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT", cause: i4 });
  } else {
    if (i4.name === "InvalidStateError") return new S2({ message: "The authenticator was previously registered", code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", cause: i4 });
    if (i4.name === "NotAllowedError") return new S2({ message: i4.message, code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: i4 });
    if (i4.name === "NotSupportedError") return n3.pubKeyCredParams.filter((a) => a.type === "public-key").length === 0 ? new S2({ message: 'No entry in pubKeyCredParams was of type "public-key"', code: "ERROR_MALFORMED_PUBKEYCREDPARAMS", cause: i4 }) : new S2({ message: "No available authenticator supported any of the specified pubKeyCredParams algorithms", code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG", cause: i4 });
    if (i4.name === "SecurityError") {
      let o3 = globalThis.location.hostname;
      if (Ue(o3)) {
        if (n3.rp.id !== o3) return new S2({ message: `The RP ID "${n3.rp.id}" is invalid for this domain`, code: "ERROR_INVALID_RP_ID", cause: i4 });
      } else return new S2({ message: `${globalThis.location.hostname} is an invalid domain`, code: "ERROR_INVALID_DOMAIN", cause: i4 });
    } else if (i4.name === "TypeError") {
      if (n3.user.id.byteLength < 1 || n3.user.id.byteLength > 64) return new S2({ message: "User ID was not between 1 and 64 characters", code: "ERROR_INVALID_USER_ID_LENGTH", cause: i4 });
    } else if (i4.name === "UnknownError") return new S2({ message: "The authenticator was unable to process the specified options, or could not create a new credential", code: "ERROR_AUTHENTICATOR_GENERAL_ERROR", cause: i4 });
  }
  return new S2({ message: "a Non-Webauthn related error has occurred", code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: i4 });
}
function bt({ error: i4, options: e }) {
  let { publicKey: t } = e;
  if (!t) throw Error("options was missing required publicKey property");
  if (i4.name === "AbortError") {
    if (e.signal instanceof AbortSignal) return new S2({ message: "Authentication ceremony was sent an abort signal", code: "ERROR_CEREMONY_ABORTED", cause: i4 });
  } else {
    if (i4.name === "NotAllowedError") return new S2({ message: i4.message, code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: i4 });
    if (i4.name === "SecurityError") {
      let r = globalThis.location.hostname;
      if (Ue(r)) {
        if (t.rpId !== r) return new S2({ message: `The RP ID "${t.rpId}" is invalid for this domain`, code: "ERROR_INVALID_RP_ID", cause: i4 });
      } else return new S2({ message: `${globalThis.location.hostname} is an invalid domain`, code: "ERROR_INVALID_DOMAIN", cause: i4 });
    } else if (i4.name === "UnknownError") return new S2({ message: "The authenticator was unable to process the specified options, or could not create a new assertion signature", code: "ERROR_AUTHENTICATOR_GENERAL_ERROR", cause: i4 });
  }
  return new S2({ message: "a Non-Webauthn related error has occurred", code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause: i4 });
}
var $e = class {
  createNewAbortSignal() {
    if (this.controller) {
      let t = new Error("Cancelling existing WebAuthn API call for new one");
      t.name = "AbortError", this.controller.abort(t);
    }
    let e = new AbortController();
    return this.controller = e, e.signal;
  }
  cancelCeremony() {
    if (this.controller) {
      let e = new Error("Manually cancelling existing WebAuthn API call");
      e.name = "AbortError", this.controller.abort(e), this.controller = void 0;
    }
  }
};
var Se = new $e();
function Ne(i4) {
  if (!i4) throw new Error("Credential creation options are required");
  if (typeof PublicKeyCredential < "u" && "parseCreationOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseCreationOptionsFromJSON == "function") return PublicKeyCredential.parseCreationOptionsFromJSON(i4);
  let { challenge: e, user: t, excludeCredentials: r } = i4, s = S(i4, ["challenge", "user", "excludeCredentials"]), n3 = B(e).buffer, o3 = Object.assign(Object.assign({}, t), { id: B(t.id).buffer }), a = Object.assign(Object.assign({}, s), { challenge: n3, user: o3 });
  if (r && r.length > 0) {
    a.excludeCredentials = new Array(r.length);
    for (let l = 0; l < r.length; l++) {
      let u3 = r[l];
      a.excludeCredentials[l] = Object.assign(Object.assign({}, u3), { id: B(u3.id).buffer, type: u3.type || "public-key", transports: u3.transports });
    }
  }
  return a;
}
function Le(i4) {
  if (!i4) throw new Error("Credential request options are required");
  if (typeof PublicKeyCredential < "u" && "parseRequestOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseRequestOptionsFromJSON == "function") return PublicKeyCredential.parseRequestOptionsFromJSON(i4);
  let { challenge: e, allowCredentials: t } = i4, r = S(i4, ["challenge", "allowCredentials"]), s = B(e).buffer, n3 = Object.assign(Object.assign({}, r), { challenge: s });
  if (t && t.length > 0) {
    n3.allowCredentials = new Array(t.length);
    for (let o3 = 0; o3 < t.length; o3++) {
      let a = t[o3];
      n3.allowCredentials[o3] = Object.assign(Object.assign({}, a), { id: B(a.id).buffer, type: a.type || "public-key", transports: a.transports });
    }
  }
  return n3;
}
function De(i4) {
  var e;
  if ("toJSON" in i4 && typeof i4.toJSON == "function") return i4.toJSON();
  let t = i4;
  return { id: i4.id, rawId: i4.id, response: { attestationObject: W(new Uint8Array(i4.response.attestationObject)), clientDataJSON: W(new Uint8Array(i4.response.clientDataJSON)) }, type: "public-key", clientExtensionResults: i4.getClientExtensionResults(), authenticatorAttachment: (e = t.authenticatorAttachment) !== null && e !== void 0 ? e : void 0 };
}
function qe(i4) {
  var e;
  if ("toJSON" in i4 && typeof i4.toJSON == "function") return i4.toJSON();
  let t = i4, r = i4.getClientExtensionResults(), s = i4.response;
  return { id: i4.id, rawId: i4.id, response: { authenticatorData: W(new Uint8Array(s.authenticatorData)), clientDataJSON: W(new Uint8Array(s.clientDataJSON)), signature: W(new Uint8Array(s.signature)), userHandle: s.userHandle ? W(new Uint8Array(s.userHandle)) : void 0 }, type: "public-key", clientExtensionResults: r, authenticatorAttachment: (e = t.authenticatorAttachment) !== null && e !== void 0 ? e : void 0 };
}
function Ue(i4) {
  return i4 === "localhost" || /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(i4);
}
function he() {
  var i4, e;
  return !!(T() && "PublicKeyCredential" in globalThis && globalThis.PublicKeyCredential && "credentials" in navigator && typeof ((i4 = navigator?.credentials) === null || i4 === void 0 ? void 0 : i4.create) == "function" && typeof ((e = navigator?.credentials) === null || e === void 0 ? void 0 : e.get) == "function");
}
async function Ke(i4) {
  try {
    let e = await navigator.credentials.create(i4);
    return e ? e instanceof PublicKeyCredential ? { data: e, error: null } : { data: null, error: new Q("Browser returned unexpected credential type", e) } : { data: null, error: new Q("Empty credential response", e) };
  } catch (e) {
    return { data: null, error: vt({ error: e, options: i4 }) };
  }
}
async function We(i4) {
  try {
    let e = await navigator.credentials.get(i4);
    return e ? e instanceof PublicKeyCredential ? { data: e, error: null } : { data: null, error: new Q("Browser returned unexpected credential type", e) } : { data: null, error: new Q("Empty credential response", e) };
  } catch (e) {
    return { data: null, error: bt({ error: e, options: i4 }) };
  }
}
var Wt = { hints: ["security-key"], authenticatorSelection: { authenticatorAttachment: "cross-platform", requireResidentKey: false, userVerification: "preferred", residentKey: "discouraged" }, attestation: "direct" };
var Mt = { userVerification: "preferred", hints: ["security-key"], attestation: "direct" };
function ke(...i4) {
  let e = (s) => s !== null && typeof s == "object" && !Array.isArray(s), t = (s) => s instanceof ArrayBuffer || ArrayBuffer.isView(s), r = {};
  for (let s of i4) if (s) for (let n3 in s) {
    let o3 = s[n3];
    if (o3 !== void 0) if (Array.isArray(o3)) r[n3] = o3;
    else if (t(o3)) r[n3] = o3;
    else if (e(o3)) {
      let a = r[n3];
      e(a) ? r[n3] = ke(a, o3) : r[n3] = ke(o3);
    } else r[n3] = o3;
  }
  return r;
}
function Gt(i4, e) {
  return ke(Wt, i4, e || {});
}
function Bt(i4, e) {
  return ke(Mt, i4, e || {});
}
var Re = class {
  constructor(e) {
    this.client = e, this.enroll = this._enroll.bind(this), this.challenge = this._challenge.bind(this), this.verify = this._verify.bind(this), this.authenticate = this._authenticate.bind(this), this.register = this._register.bind(this);
  }
  async _enroll(e) {
    return this.client.mfa.enroll(Object.assign(Object.assign({}, e), { factorType: "webauthn" }));
  }
  async _challenge({ factorId: e, webauthn: t, friendlyName: r, signal: s }, n3) {
    var o3;
    try {
      let { data: a, error: l } = await this.client.mfa.challenge({ factorId: e, webauthn: t });
      if (!a) return { data: null, error: l };
      let u3 = s ?? Se.createNewAbortSignal();
      if (a.webauthn.type === "create") {
        let { user: c3 } = a.webauthn.credential_options.publicKey;
        if (!c3.name) {
          let w6 = r;
          if (w6) c3.name = `${c3.id}:${w6}`;
          else {
            let _6 = (await this.client.getUser()).data.user, v3 = ((o3 = _6?.user_metadata) === null || o3 === void 0 ? void 0 : o3.name) || _6?.email || _6?.id || "User";
            c3.name = `${c3.id}:${v3}`;
          }
        }
        c3.displayName || (c3.displayName = c3.name);
      }
      switch (a.webauthn.type) {
        case "create": {
          let c3 = Gt(a.webauthn.credential_options.publicKey, n3?.create), { data: w6, error: d } = await Ke({ publicKey: c3, signal: u3 });
          return w6 ? { data: { factorId: e, challengeId: a.id, webauthn: { type: a.webauthn.type, credential_response: w6 } }, error: null } : { data: null, error: d };
        }
        case "request": {
          let c3 = Bt(a.webauthn.credential_options.publicKey, n3?.request), { data: w6, error: d } = await We(Object.assign(Object.assign({}, a.webauthn.credential_options), { publicKey: c3, signal: u3 }));
          return w6 ? { data: { factorId: e, challengeId: a.id, webauthn: { type: a.webauthn.type, credential_response: w6 } }, error: null } : { data: null, error: d };
        }
      }
    } catch (a) {
      return h(a) ? { data: null, error: a } : { data: null, error: new x("Unexpected error in challenge", a) };
    }
  }
  async _verify({ challengeId: e, factorId: t, webauthn: r }) {
    return this.client.mfa.verify({ factorId: t, challengeId: e, webauthn: r });
  }
  async _authenticate({ factorId: e, webauthn: { rpId: t = typeof globalThis < "u" ? globalThis.location.hostname : void 0, rpOrigins: r = typeof globalThis < "u" ? [globalThis.location.origin] : void 0, signal: s } = {} }, n3) {
    if (!t) return { data: null, error: new M("rpId is required for WebAuthn authentication") };
    try {
      if (!he()) return { data: null, error: new x("Browser does not support WebAuthn", null) };
      let { data: o3, error: a } = await this.challenge({ factorId: e, webauthn: { rpId: t, rpOrigins: r }, signal: s }, { request: n3 });
      if (!o3) return { data: null, error: a };
      let { webauthn: l } = o3;
      return this._verify({ factorId: e, challengeId: o3.challengeId, webauthn: { type: l.type, rpId: t, rpOrigins: r, credential_response: l.credential_response } });
    } catch (o3) {
      return h(o3) ? { data: null, error: o3 } : { data: null, error: new x("Unexpected error in authenticate", o3) };
    }
  }
  async _register({ friendlyName: e, webauthn: { rpId: t = typeof globalThis < "u" ? globalThis.location.hostname : void 0, rpOrigins: r = typeof globalThis < "u" ? [globalThis.location.origin] : void 0, signal: s } = {} }, n3) {
    if (!t) return { data: null, error: new M("rpId is required for WebAuthn registration") };
    try {
      if (!he()) return { data: null, error: new x("Browser does not support WebAuthn", null) };
      let { data: o3, error: a } = await this._enroll({ friendlyName: e });
      if (!o3) return await this.client.mfa.listFactors().then((c3) => {
        var w6;
        return (w6 = c3.data) === null || w6 === void 0 ? void 0 : w6.all.find((d) => d.factor_type === "webauthn" && d.friendly_name === e && d.status !== "unverified");
      }).then((c3) => c3 ? this.client.mfa.unenroll({ factorId: c3?.id }) : void 0), { data: null, error: a };
      let { data: l, error: u3 } = await this._challenge({ factorId: o3.id, friendlyName: o3.friendly_name, webauthn: { rpId: t, rpOrigins: r }, signal: s }, { create: n3 });
      return l ? this._verify({ factorId: o3.id, challengeId: l.challengeId, webauthn: { rpId: t, rpOrigins: r, type: l.webauthn.type, credential_response: l.webauthn.credential_response } }) : { data: null, error: u3 };
    } catch (o3) {
      return h(o3) ? { data: null, error: o3 } : { data: null, error: new x("Unexpected error in register", o3) };
    }
  }
};
gt();
var Ft = { url: Ge, storageKey: Be, autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, headers: Fe, flowType: "implicit", debug: false, hasCustomAuthorizationHeader: false, throwOnError: false, lockAcquireTimeout: 5e3, skipAutoInitialize: false, experimental: {} };
var re = {};
var Ee = class i2 {
  get jwks() {
    var e, t;
    return (t = (e = re[this.storageKey]) === null || e === void 0 ? void 0 : e.jwks) !== null && t !== void 0 ? t : { keys: [] };
  }
  set jwks(e) {
    re[this.storageKey] = Object.assign(Object.assign({}, re[this.storageKey]), { jwks: e });
  }
  get jwks_cached_at() {
    var e, t;
    return (t = (e = re[this.storageKey]) === null || e === void 0 ? void 0 : e.cachedAt) !== null && t !== void 0 ? t : Number.MIN_SAFE_INTEGER;
  }
  set jwks_cached_at(e) {
    re[this.storageKey] = Object.assign(Object.assign({}, re[this.storageKey]), { cachedAt: e });
  }
  constructor(e) {
    var t, r, s;
    this.userStorage = null, this.memoryStorage = null, this.stateChangeEmitters = /* @__PURE__ */ new Map(), this.autoRefreshTicker = null, this.autoRefreshTickTimeout = null, this.visibilityChangedCallback = null, this.refreshingDeferred = null, this._sessionRemovalEpoch = 0, this.initializePromise = null, this.detectSessionInUrl = true, this.hasCustomAuthorizationHeader = false, this.suppressGetSessionWarning = false, this.lock = null, this.lockAcquired = false, this.pendingInLock = [], this.broadcastChannel = null, this.logger = console.log;
    let n3 = Object.assign(Object.assign({}, Ft), e);
    if (this.storageKey = n3.storageKey, this.instanceID = (t = i2.nextInstanceID[this.storageKey]) !== null && t !== void 0 ? t : 0, i2.nextInstanceID[this.storageKey] = this.instanceID + 1, this.logDebugMessages = !!n3.debug, typeof n3.debug == "function" && (this.logger = n3.debug), this.instanceID > 0 && T()) {
      let o3 = `${this._logPrefix()} Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`;
      console.warn(o3), this.logDebugMessages && console.trace(o3);
    }
    if (this.persistSession = n3.persistSession, this.autoRefreshToken = n3.autoRefreshToken, this.experimental = (r = n3.experimental) !== null && r !== void 0 ? r : {}, this.admin = new z({ url: n3.url, headers: n3.headers, fetch: n3.fetch, experimental: this.experimental }), this.url = n3.url, this.headers = n3.headers, this.fetch = ve(n3.fetch), this.detectSessionInUrl = n3.detectSessionInUrl, this.flowType = n3.flowType, this.hasCustomAuthorizationHeader = n3.hasCustomAuthorizationHeader, this.throwOnError = n3.throwOnError, this.lockAcquireTimeout = n3.lockAcquireTimeout, n3.lock != null && (this.lock = n3.lock), this.jwks || (this.jwks = { keys: [] }, this.jwks_cached_at = Number.MIN_SAFE_INTEGER), this.mfa = { verify: this._verify.bind(this), enroll: this._enroll.bind(this), unenroll: this._unenroll.bind(this), challenge: this._challenge.bind(this), listFactors: this._listFactors.bind(this), challengeAndVerify: this._challengeAndVerify.bind(this), getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this), webauthn: new Re(this) }, this.oauth = { getAuthorizationDetails: this._getAuthorizationDetails.bind(this), approveAuthorization: this._approveAuthorization.bind(this), denyAuthorization: this._denyAuthorization.bind(this), listGrants: this._listOAuthGrants.bind(this), revokeGrant: this._revokeOAuthGrant.bind(this) }, this.passkey = { startRegistration: this._startPasskeyRegistration.bind(this), verifyRegistration: this._verifyPasskeyRegistration.bind(this), startAuthentication: this._startPasskeyAuthentication.bind(this), verifyAuthentication: this._verifyPasskeyAuthentication.bind(this), list: this._listPasskeys.bind(this), update: this._updatePasskey.bind(this), delete: this._deletePasskey.bind(this) }, this.persistSession ? (n3.storage ? this.storage = n3.storage : ye() ? this.storage = globalThis.localStorage : (this.memoryStorage = {}, this.storage = Pe(this.memoryStorage)), n3.userStorage && (this.userStorage = n3.userStorage)) : (this.memoryStorage = {}, this.storage = Pe(this.memoryStorage)), T() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
      try {
        this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
      } catch (o3) {
        console.error("Failed to create a new BroadcastChannel, multi-tab state changes will not be available", o3);
      }
      (s = this.broadcastChannel) === null || s === void 0 || s.addEventListener("message", async (o3) => {
        this._debug("received broadcast notification from other tab or client", o3);
        try {
          await this._notifyAllSubscribers(o3.data.event, o3.data.session, false);
        } catch (a) {
          this._debug("#broadcastChannel", "error", a);
        }
      });
    }
    n3.skipAutoInitialize || this.initialize().catch((o3) => {
      this._debug("#initialize()", "error", o3);
    });
  }
  isThrowOnErrorEnabled() {
    return this.throwOnError;
  }
  _returnResult(e) {
    if (this.throwOnError && e && e.error) throw e.error;
    return e;
  }
  _logPrefix() {
    return `GoTrueClient@${this.storageKey}:${this.instanceID} (${de}) ${(/* @__PURE__ */ new Date()).toISOString()}`;
  }
  _debug(...e) {
    return this.logDebugMessages && this.logger(this._logPrefix(), ...e), this;
  }
  async initialize() {
    return this.initializePromise ? await this.initializePromise : (this.initializePromise = (async () => this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._initialize()) : await this._initialize())(), await this.initializePromise);
  }
  async _initialize() {
    var e;
    try {
      let t = {}, r = "none";
      if (T() && (t = st(globalThis.location.href), this._isImplicitGrantCallback(t) ? r = "implicit" : await this._isPKCECallback(t) && (r = "pkce")), T() && this.detectSessionInUrl && r !== "none") {
        let { data: s, error: n3 } = await this._getSessionFromURL(t, r);
        if (n3) {
          if (this._debug("#_initialize()", "error detecting session from URL", n3), He(n3)) {
            let l = (e = n3.details) === null || e === void 0 ? void 0 : e.code;
            if (l === "identity_already_exists" || l === "identity_not_found" || l === "single_identity_not_deletable") return { error: n3 };
          }
          return { error: n3 };
        }
        let { session: o3, redirectType: a } = s;
        return this._debug("#_initialize()", "detected session in URL", o3, "redirect type", a), await this._saveSession(o3), setTimeout(async () => {
          a === "recovery" ? await this._notifyAllSubscribers("PASSWORD_RECOVERY", o3) : await this._notifyAllSubscribers("SIGNED_IN", o3);
        }, 0), { error: null };
      }
      return await this._recoverAndRefresh(), { error: null };
    } catch (t) {
      return h(t) ? this._returnResult({ error: t }) : this._returnResult({ error: new x("Unexpected error during initialization", t) });
    } finally {
      await this._handleVisibilityChange(), this._debug("#_initialize()", "end");
    }
  }
  async signInAnonymously(e) {
    var t, r, s;
    try {
      let n3 = await f(this.fetch, "POST", `${this.url}/signup`, { headers: this.headers, body: { data: (r = (t = e?.options) === null || t === void 0 ? void 0 : t.data) !== null && r !== void 0 ? r : {}, gotrue_meta_security: { captcha_token: (s = e?.options) === null || s === void 0 ? void 0 : s.captchaToken } }, xform: P }), { data: o3, error: a } = n3;
      if (a || !o3) return this._returnResult({ data: { user: null, session: null }, error: a });
      let l = o3.session, u3 = o3.user;
      return o3.session && (await this._saveSession(o3.session), await this._notifyAllSubscribers("SIGNED_IN", l)), this._returnResult({ data: { user: u3, session: l }, error: null });
    } catch (n3) {
      if (h(n3)) return this._returnResult({ data: { user: null, session: null }, error: n3 });
      throw n3;
    }
  }
  async signUp(e) {
    var t, r, s;
    try {
      let n3;
      if ("email" in e) {
        let { email: c3, password: w6, options: d } = e, _6 = null, v3 = null;
        this.flowType === "pkce" && ([_6, v3] = await F2(this.storage, this.storageKey)), n3 = await f(this.fetch, "POST", `${this.url}/signup`, { headers: this.headers, redirectTo: d?.emailRedirectTo, body: { email: c3, password: w6, data: (t = d?.data) !== null && t !== void 0 ? t : {}, gotrue_meta_security: { captcha_token: d?.captchaToken }, code_challenge: _6, code_challenge_method: v3 }, xform: P });
      } else if ("phone" in e) {
        let { phone: c3, password: w6, options: d } = e;
        n3 = await f(this.fetch, "POST", `${this.url}/signup`, { headers: this.headers, body: { phone: c3, password: w6, data: (r = d?.data) !== null && r !== void 0 ? r : {}, channel: (s = d?.channel) !== null && s !== void 0 ? s : "sms", gotrue_meta_security: { captcha_token: d?.captchaToken } }, xform: P });
      } else throw new J("You must provide either an email or phone number and a password");
      let { data: o3, error: a } = n3;
      if (a || !o3) return await A(this.storage, `${this.storageKey}-code-verifier`), this._returnResult({ data: { user: null, session: null }, error: a });
      let l = o3.session, u3 = o3.user;
      return o3.session && (await this._saveSession(o3.session), await this._notifyAllSubscribers("SIGNED_IN", l)), this._returnResult({ data: { user: u3, session: l }, error: null });
    } catch (n3) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(n3)) return this._returnResult({ data: { user: null, session: null }, error: n3 });
      throw n3;
    }
  }
  async signInWithPassword(e) {
    try {
      let t;
      if ("email" in e) {
        let { email: n3, password: o3, options: a } = e;
        t = await f(this.fetch, "POST", `${this.url}/token?grant_type=password`, { headers: this.headers, body: { email: n3, password: o3, gotrue_meta_security: { captcha_token: a?.captchaToken } }, xform: xe });
      } else if ("phone" in e) {
        let { phone: n3, password: o3, options: a } = e;
        t = await f(this.fetch, "POST", `${this.url}/token?grant_type=password`, { headers: this.headers, body: { phone: n3, password: o3, gotrue_meta_security: { captcha_token: a?.captchaToken } }, xform: xe });
      } else throw new J("You must provide either an email or phone number and a password");
      let { data: r, error: s } = t;
      if (s) return this._returnResult({ data: { user: null, session: null }, error: s });
      if (!r || !r.session || !r.user) {
        let n3 = new K();
        return this._returnResult({ data: { user: null, session: null }, error: n3 });
      }
      return r.session && (await this._saveSession(r.session), await this._notifyAllSubscribers("SIGNED_IN", r.session)), this._returnResult({ data: Object.assign({ user: r.user, session: r.session }, r.weak_password ? { weakPassword: r.weak_password } : null), error: s });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: { user: null, session: null }, error: t });
      throw t;
    }
  }
  async signInWithOAuth(e) {
    var t, r, s, n3;
    return await this._handleProviderSignIn(e.provider, { redirectTo: (t = e.options) === null || t === void 0 ? void 0 : t.redirectTo, scopes: (r = e.options) === null || r === void 0 ? void 0 : r.scopes, queryParams: (s = e.options) === null || s === void 0 ? void 0 : s.queryParams, skipBrowserRedirect: (n3 = e.options) === null || n3 === void 0 ? void 0 : n3.skipBrowserRedirect });
  }
  async exchangeCodeForSession(e) {
    return await this.initializePromise, this.lock != null ? this._acquireLock(this.lockAcquireTimeout, async () => this._exchangeCodeForSession(e)) : this._exchangeCodeForSession(e);
  }
  async signInWithWeb3(e) {
    let { chain: t } = e;
    switch (t) {
      case "ethereum":
        return await this.signInWithEthereum(e);
      case "solana":
        return await this.signInWithSolana(e);
      default:
        throw new Error(`@supabase/auth-js: Unsupported chain "${t}"`);
    }
  }
  async signInWithEthereum(e) {
    var t, r, s, n3, o3, a, l, u3, c3, w6, d;
    let _6, v3;
    if ("message" in e) _6 = e.message, v3 = e.signature;
    else {
      let { chain: b4, wallet: y4, statement: m4, options: p3 } = e, g2;
      if (T()) if (typeof y4 == "object") g2 = y4;
      else {
        let D6 = globalThis;
        if ("ethereum" in D6 && typeof D6.ethereum == "object" && "request" in D6.ethereum && typeof D6.ethereum.request == "function") g2 = D6.ethereum;
        else throw new Error("@supabase/auth-js: No compatible Ethereum wallet interface on the window object (window.ethereum) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'ethereum', wallet: resolvedUserWallet }) instead.");
      }
      else {
        if (typeof y4 != "object" || !p3?.url) throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
        g2 = y4;
      }
      let R5 = new URL((t = p3?.url) !== null && t !== void 0 ? t : globalThis.location.href), j6 = await g2.request({ method: "eth_requestAccounts" }).then((D6) => D6).catch(() => {
        throw new Error("@supabase/auth-js: Wallet method eth_requestAccounts is missing or invalid");
      });
      if (!j6 || j6.length === 0) throw new Error("@supabase/auth-js: No accounts available. Please ensure the wallet is connected.");
      let k3 = je(j6[0]), I5 = (r = p3?.signInWithEthereum) === null || r === void 0 ? void 0 : r.chainId;
      if (!I5) {
        let D6 = await g2.request({ method: "eth_chainId" });
        I5 = wt(D6);
      }
      let kt = { domain: R5.host, address: k3, statement: m4, uri: R5.href, version: "1", chainId: I5, nonce: (s = p3?.signInWithEthereum) === null || s === void 0 ? void 0 : s.nonce, issuedAt: (o3 = (n3 = p3?.signInWithEthereum) === null || n3 === void 0 ? void 0 : n3.issuedAt) !== null && o3 !== void 0 ? o3 : /* @__PURE__ */ new Date(), expirationTime: (a = p3?.signInWithEthereum) === null || a === void 0 ? void 0 : a.expirationTime, notBefore: (l = p3?.signInWithEthereum) === null || l === void 0 ? void 0 : l.notBefore, requestId: (u3 = p3?.signInWithEthereum) === null || u3 === void 0 ? void 0 : u3.requestId, resources: (c3 = p3?.signInWithEthereum) === null || c3 === void 0 ? void 0 : c3.resources };
      _6 = yt(kt), v3 = await g2.request({ method: "personal_sign", params: [pt(_6), k3] });
    }
    try {
      let { data: b4, error: y4 } = await f(this.fetch, "POST", `${this.url}/token?grant_type=web3`, { headers: this.headers, body: Object.assign({ chain: "ethereum", message: _6, signature: v3 }, !((w6 = e.options) === null || w6 === void 0) && w6.captchaToken ? { gotrue_meta_security: { captcha_token: (d = e.options) === null || d === void 0 ? void 0 : d.captchaToken } } : null), xform: P });
      if (y4) throw y4;
      if (!b4 || !b4.session || !b4.user) {
        let m4 = new K();
        return this._returnResult({ data: { user: null, session: null }, error: m4 });
      }
      return b4.session && (await this._saveSession(b4.session), await this._notifyAllSubscribers("SIGNED_IN", b4.session)), this._returnResult({ data: Object.assign({}, b4), error: y4 });
    } catch (b4) {
      if (h(b4)) return this._returnResult({ data: { user: null, session: null }, error: b4 });
      throw b4;
    }
  }
  async signInWithSolana(e) {
    var t, r, s, n3, o3, a, l, u3, c3, w6, d, _6;
    let v3, b4;
    if ("message" in e) v3 = e.message, b4 = e.signature;
    else {
      let { chain: y4, wallet: m4, statement: p3, options: g2 } = e, R5;
      if (T()) if (typeof m4 == "object") R5 = m4;
      else {
        let k3 = globalThis;
        if ("solana" in k3 && typeof k3.solana == "object" && ("signIn" in k3.solana && typeof k3.solana.signIn == "function" || "signMessage" in k3.solana && typeof k3.solana.signMessage == "function")) R5 = k3.solana;
        else throw new Error("@supabase/auth-js: No compatible Solana wallet interface on the window object (window.solana) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'solana', wallet: resolvedUserWallet }) instead.");
      }
      else {
        if (typeof m4 != "object" || !g2?.url) throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
        R5 = m4;
      }
      let j6 = new URL((t = g2?.url) !== null && t !== void 0 ? t : globalThis.location.href);
      if ("signIn" in R5 && R5.signIn) {
        let k3 = await R5.signIn(Object.assign(Object.assign(Object.assign({ issuedAt: (/* @__PURE__ */ new Date()).toISOString() }, g2?.signInWithSolana), { version: "1", domain: j6.host, uri: j6.href }), p3 ? { statement: p3 } : null)), I5;
        if (Array.isArray(k3) && k3[0] && typeof k3[0] == "object") I5 = k3[0];
        else if (k3 && typeof k3 == "object" && "signedMessage" in k3 && "signature" in k3) I5 = k3;
        else throw new Error("@supabase/auth-js: Wallet method signIn() returned unrecognized value");
        if ("signedMessage" in I5 && "signature" in I5 && (typeof I5.signedMessage == "string" || I5.signedMessage instanceof Uint8Array) && I5.signature instanceof Uint8Array) v3 = typeof I5.signedMessage == "string" ? I5.signedMessage : new TextDecoder().decode(I5.signedMessage), b4 = I5.signature;
        else throw new Error("@supabase/auth-js: Wallet method signIn() API returned object without signedMessage and signature fields");
      } else {
        if (!("signMessage" in R5) || typeof R5.signMessage != "function" || !("publicKey" in R5) || typeof R5 != "object" || !R5.publicKey || !("toBase58" in R5.publicKey) || typeof R5.publicKey.toBase58 != "function") throw new Error("@supabase/auth-js: Wallet does not have a compatible signMessage() and publicKey.toBase58() API");
        v3 = [`${j6.host} wants you to sign in with your Solana account:`, R5.publicKey.toBase58(), ...p3 ? ["", p3, ""] : [""], "Version: 1", `URI: ${j6.href}`, `Issued At: ${(s = (r = g2?.signInWithSolana) === null || r === void 0 ? void 0 : r.issuedAt) !== null && s !== void 0 ? s : (/* @__PURE__ */ new Date()).toISOString()}`, ...!((n3 = g2?.signInWithSolana) === null || n3 === void 0) && n3.notBefore ? [`Not Before: ${g2.signInWithSolana.notBefore}`] : [], ...!((o3 = g2?.signInWithSolana) === null || o3 === void 0) && o3.expirationTime ? [`Expiration Time: ${g2.signInWithSolana.expirationTime}`] : [], ...!((a = g2?.signInWithSolana) === null || a === void 0) && a.chainId ? [`Chain ID: ${g2.signInWithSolana.chainId}`] : [], ...!((l = g2?.signInWithSolana) === null || l === void 0) && l.nonce ? [`Nonce: ${g2.signInWithSolana.nonce}`] : [], ...!((u3 = g2?.signInWithSolana) === null || u3 === void 0) && u3.requestId ? [`Request ID: ${g2.signInWithSolana.requestId}`] : [], ...!((w6 = (c3 = g2?.signInWithSolana) === null || c3 === void 0 ? void 0 : c3.resources) === null || w6 === void 0) && w6.length ? ["Resources", ...g2.signInWithSolana.resources.map((I5) => `- ${I5}`)] : []].join(`
`);
        let k3 = await R5.signMessage(new TextEncoder().encode(v3), "utf8");
        if (!k3 || !(k3 instanceof Uint8Array)) throw new Error("@supabase/auth-js: Wallet signMessage() API returned an recognized value");
        b4 = k3;
      }
    }
    try {
      let { data: y4, error: m4 } = await f(this.fetch, "POST", `${this.url}/token?grant_type=web3`, { headers: this.headers, body: Object.assign({ chain: "solana", message: v3, signature: W(b4) }, !((d = e.options) === null || d === void 0) && d.captchaToken ? { gotrue_meta_security: { captcha_token: (_6 = e.options) === null || _6 === void 0 ? void 0 : _6.captchaToken } } : null), xform: P });
      if (m4) throw m4;
      if (!y4 || !y4.session || !y4.user) {
        let p3 = new K();
        return this._returnResult({ data: { user: null, session: null }, error: p3 });
      }
      return y4.session && (await this._saveSession(y4.session), await this._notifyAllSubscribers("SIGNED_IN", y4.session)), this._returnResult({ data: Object.assign({}, y4), error: m4 });
    } catch (y4) {
      if (h(y4)) return this._returnResult({ data: { user: null, session: null }, error: y4 });
      throw y4;
    }
  }
  async _exchangeCodeForSession(e) {
    let t = await $(this.storage, `${this.storageKey}-code-verifier`), [r, s] = (t ?? "").split("/");
    try {
      if (!r && this.flowType === "pkce") throw new ge();
      let { data: n3, error: o3 } = await f(this.fetch, "POST", `${this.url}/token?grant_type=pkce`, { headers: this.headers, body: { auth_code: e, code_verifier: r }, xform: P });
      if (await A(this.storage, `${this.storageKey}-code-verifier`), o3) throw o3;
      if (!n3 || !n3.session || !n3.user) {
        let a = new K();
        return this._returnResult({ data: { user: null, session: null, redirectType: null }, error: a });
      }
      return n3.session && (await this._saveSession(n3.session), await this._notifyAllSubscribers(s === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", n3.session)), this._returnResult({ data: Object.assign(Object.assign({}, n3), { redirectType: s ?? null }), error: o3 });
    } catch (n3) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(n3)) return this._returnResult({ data: { user: null, session: null, redirectType: null }, error: n3 });
      throw n3;
    }
  }
  async signInWithIdToken(e) {
    try {
      let { options: t, provider: r, token: s, access_token: n3, nonce: o3 } = e, a = await f(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, { headers: this.headers, body: { provider: r, id_token: s, access_token: n3, nonce: o3, gotrue_meta_security: { captcha_token: t?.captchaToken } }, xform: P }), { data: l, error: u3 } = a;
      if (u3) return this._returnResult({ data: { user: null, session: null }, error: u3 });
      if (!l || !l.session || !l.user) {
        let c3 = new K();
        return this._returnResult({ data: { user: null, session: null }, error: c3 });
      }
      return l.session && (await this._saveSession(l.session), await this._notifyAllSubscribers("SIGNED_IN", l.session)), this._returnResult({ data: l, error: u3 });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: { user: null, session: null }, error: t });
      throw t;
    }
  }
  async signInWithOtp(e) {
    var t, r, s, n3, o3;
    try {
      if ("email" in e) {
        let { email: a, options: l } = e, u3 = null, c3 = null;
        this.flowType === "pkce" && ([u3, c3] = await F2(this.storage, this.storageKey));
        let { error: w6 } = await f(this.fetch, "POST", `${this.url}/otp`, { headers: this.headers, body: { email: a, data: (t = l?.data) !== null && t !== void 0 ? t : {}, create_user: (r = l?.shouldCreateUser) !== null && r !== void 0 ? r : true, gotrue_meta_security: { captcha_token: l?.captchaToken }, code_challenge: u3, code_challenge_method: c3 }, redirectTo: l?.emailRedirectTo });
        return this._returnResult({ data: { user: null, session: null }, error: w6 });
      }
      if ("phone" in e) {
        let { phone: a, options: l } = e, { data: u3, error: c3 } = await f(this.fetch, "POST", `${this.url}/otp`, { headers: this.headers, body: { phone: a, data: (s = l?.data) !== null && s !== void 0 ? s : {}, create_user: (n3 = l?.shouldCreateUser) !== null && n3 !== void 0 ? n3 : true, gotrue_meta_security: { captcha_token: l?.captchaToken }, channel: (o3 = l?.channel) !== null && o3 !== void 0 ? o3 : "sms" } });
        return this._returnResult({ data: { user: null, session: null, messageId: u3?.message_id }, error: c3 });
      }
      throw new J("You must provide either an email or phone number.");
    } catch (a) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(a)) return this._returnResult({ data: { user: null, session: null }, error: a });
      throw a;
    }
  }
  async verifyOtp(e) {
    var t, r;
    try {
      let s, n3;
      "options" in e && (s = (t = e.options) === null || t === void 0 ? void 0 : t.redirectTo, n3 = (r = e.options) === null || r === void 0 ? void 0 : r.captchaToken);
      let { data: o3, error: a } = await f(this.fetch, "POST", `${this.url}/verify`, { headers: this.headers, body: Object.assign(Object.assign({}, e), { gotrue_meta_security: { captcha_token: n3 } }), redirectTo: s, xform: P });
      if (a) throw a;
      if (!o3) throw new Error("An error occurred on token verification.");
      let l = o3.session, u3 = o3.user;
      return l?.access_token && (await this._saveSession(l), await this._notifyAllSubscribers(e.type == "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", l)), this._returnResult({ data: { user: u3, session: l }, error: null });
    } catch (s) {
      if (h(s)) return this._returnResult({ data: { user: null, session: null }, error: s });
      throw s;
    }
  }
  async signInWithSSO(e) {
    var t, r, s, n3, o3;
    try {
      let a = null, l = null;
      this.flowType === "pkce" && ([a, l] = await F2(this.storage, this.storageKey));
      let u3 = await f(this.fetch, "POST", `${this.url}/sso`, { body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, "providerId" in e ? { provider_id: e.providerId } : null), "domain" in e ? { domain: e.domain } : null), { redirect_to: (r = (t = e.options) === null || t === void 0 ? void 0 : t.redirectTo) !== null && r !== void 0 ? r : void 0 }), !((s = e?.options) === null || s === void 0) && s.captchaToken ? { gotrue_meta_security: { captcha_token: e.options.captchaToken } } : null), { skip_http_redirect: true, code_challenge: a, code_challenge_method: l }), headers: this.headers, xform: dt });
      return !((n3 = u3.data) === null || n3 === void 0) && n3.url && T() && !(!((o3 = e.options) === null || o3 === void 0) && o3.skipBrowserRedirect) && globalThis.location.assign(u3.data.url), this._returnResult(u3);
    } catch (a) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(a)) return this._returnResult({ data: null, error: a });
      throw a;
    }
  }
  async reauthenticate() {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._reauthenticate()) : await this._reauthenticate();
  }
  async _reauthenticate() {
    try {
      return await this._useSession(async (e) => {
        let { data: { session: t }, error: r } = e;
        if (r) throw r;
        if (!t) throw new E();
        let { error: s } = await f(this.fetch, "GET", `${this.url}/reauthenticate`, { headers: this.headers, jwt: t.access_token });
        return this._returnResult({ data: { user: null, session: null }, error: s });
      });
    } catch (e) {
      if (h(e)) return this._returnResult({ data: { user: null, session: null }, error: e });
      throw e;
    }
  }
  async resend(e) {
    try {
      let t = `${this.url}/resend`;
      if ("email" in e) {
        let { email: r, type: s, options: n3 } = e, o3 = null, a = null;
        this.flowType === "pkce" && ([o3, a] = await F2(this.storage, this.storageKey));
        let { error: l } = await f(this.fetch, "POST", t, { headers: this.headers, body: { email: r, type: s, gotrue_meta_security: { captcha_token: n3?.captchaToken }, code_challenge: o3, code_challenge_method: a }, redirectTo: n3?.emailRedirectTo });
        return l && await A(this.storage, `${this.storageKey}-code-verifier`), this._returnResult({ data: { user: null, session: null }, error: l });
      } else if ("phone" in e) {
        let { phone: r, type: s, options: n3 } = e, { data: o3, error: a } = await f(this.fetch, "POST", t, { headers: this.headers, body: { phone: r, type: s, gotrue_meta_security: { captcha_token: n3?.captchaToken } } });
        return this._returnResult({ data: { user: null, session: null, messageId: o3?.message_id }, error: a });
      }
      throw new J("You must provide either an email or phone number and a type");
    } catch (t) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(t)) return this._returnResult({ data: { user: null, session: null }, error: t });
      throw t;
    }
  }
  async getSession() {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => this._useSession(async (e) => e)) : await this._useSession(async (e) => e);
  }
  async _acquireLock(e, t) {
    this._debug("#_acquireLock", "begin", e);
    try {
      if (this.lockAcquired) {
        let r = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve(), s = (async () => (await r, await t()))();
        return this.pendingInLock.push((async () => {
          try {
            await s;
          } catch {
          }
        })()), s;
      }
      return await this.lock(`lock:${this.storageKey}`, e, async () => {
        this._debug("#_acquireLock", "lock acquired for storage key", this.storageKey);
        try {
          this.lockAcquired = true;
          let r = t();
          for (this.pendingInLock.push((async () => {
            try {
              await r;
            } catch {
            }
          })()), await r; this.pendingInLock.length; ) {
            let s = [...this.pendingInLock];
            await Promise.all(s), this.pendingInLock.splice(0, s.length);
          }
          return await r;
        } finally {
          this._debug("#_acquireLock", "lock released for storage key", this.storageKey), this.lockAcquired = false;
        }
      });
    } finally {
      this._debug("#_acquireLock", "end");
    }
  }
  async _useSession(e) {
    this._debug("#_useSession", "begin");
    try {
      let t = await this.__loadSession();
      return await e(t);
    } finally {
      this._debug("#_useSession", "end");
    }
  }
  async __loadSession() {
    this._debug("#__loadSession()", "begin"), this.lock != null && !this.lockAcquired && this._debug("#__loadSession()", "used outside of an acquired lock!", new Error().stack);
    try {
      let e = null, t = await $(this.storage, this.storageKey);
      if (this._debug("#getSession()", "session from storage", t), t !== null && (this._isValidSession(t) ? e = t : (this._debug("#getSession()", "session from storage is not valid"), await this._removeSession())), !e) return { data: { session: null }, error: null };
      let r = e.expires_at ? e.expires_at * 1e3 - Date.now() < fe : false;
      if (this._debug("#__loadSession()", `session has${r ? "" : " not"} expired`, "expires_at", e.expires_at), !r) {
        if (this.userStorage) {
          let o3 = await $(this.userStorage, this.storageKey + "-user");
          o3?.user ? e.user = o3.user : e.user = be();
        }
        if (this.storage.isServer && e.user && !e.user.__isUserNotAvailableProxy) {
          let o3 = { value: this.suppressGetSessionWarning };
          e.user = ct(e.user, o3), o3.value && (this.suppressGetSessionWarning = true);
        }
        return { data: { session: e }, error: null };
      }
      let { data: s, error: n3 } = await this._callRefreshToken(e.refresh_token);
      return n3 ? this._returnResult({ data: { session: null }, error: n3 }) : this._returnResult({ data: { session: s }, error: null });
    } finally {
      this._debug("#__loadSession()", "end");
    }
  }
  async getUser(e) {
    if (e) return await this._getUser(e);
    await this.initializePromise;
    let t;
    return this.lock != null ? t = await this._acquireLock(this.lockAcquireTimeout, async () => await this._getUser()) : t = await this._getUser(), t.data.user && (this.suppressGetSessionWarning = true), t;
  }
  async _getUser(e) {
    try {
      return e ? await f(this.fetch, "GET", `${this.url}/user`, { headers: this.headers, jwt: e, xform: L }) : await this._useSession(async (t) => {
        var r, s, n3;
        let { data: o3, error: a } = t;
        if (a) throw a;
        return !(!((r = o3.session) === null || r === void 0) && r.access_token) && !this.hasCustomAuthorizationHeader ? { data: { user: null }, error: new E() } : await f(this.fetch, "GET", `${this.url}/user`, { headers: this.headers, jwt: (n3 = (s = o3.session) === null || s === void 0 ? void 0 : s.access_token) !== null && n3 !== void 0 ? n3 : void 0, xform: L });
      });
    } catch (t) {
      if (h(t)) return ae(t) && (await this._removeSession(), await A(this.storage, `${this.storageKey}-code-verifier`)), this._returnResult({ data: { user: null }, error: t });
      throw t;
    }
  }
  async updateUser(e, t = {}) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._updateUser(e, t)) : await this._updateUser(e, t);
  }
  async _updateUser(e, t = {}) {
    try {
      return await this._useSession(async (r) => {
        let { data: s, error: n3 } = r;
        if (n3) throw n3;
        if (!s.session) throw new E();
        let o3 = s.session, a = null, l = null;
        this.flowType === "pkce" && e.email != null && ([a, l] = await F2(this.storage, this.storageKey));
        let { data: u3, error: c3 } = await f(this.fetch, "PUT", `${this.url}/user`, { headers: this.headers, redirectTo: t?.emailRedirectTo, body: Object.assign(Object.assign({}, e), { code_challenge: a, code_challenge_method: l }), jwt: o3.access_token, xform: L });
        if (c3) throw c3;
        return o3.user = u3.user, await this._saveSession(o3), await this._notifyAllSubscribers("USER_UPDATED", o3), this._returnResult({ data: { user: o3.user }, error: null });
      });
    } catch (r) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(r)) return this._returnResult({ data: { user: null }, error: r });
      throw r;
    }
  }
  async setSession(e) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._setSession(e)) : await this._setSession(e);
  }
  async _setSession(e) {
    try {
      if (!e.access_token || !e.refresh_token) throw new E();
      let t = Date.now() / 1e3, r = t, s = true, n3 = null, { payload: o3 } = ue(e.access_token);
      if (o3.exp && (r = o3.exp, s = r <= t), s) {
        let { data: a, error: l } = await this._callRefreshToken(e.refresh_token);
        if (l) return this._returnResult({ data: { user: null, session: null }, error: l });
        if (!a) return { data: { user: null, session: null }, error: null };
        n3 = a;
      } else {
        let { data: a, error: l } = await this._getUser(e.access_token);
        if (l) return this._returnResult({ data: { user: null, session: null }, error: l });
        n3 = { access_token: e.access_token, refresh_token: e.refresh_token, user: a.user, token_type: "bearer", expires_in: r - t, expires_at: r }, await this._saveSession(n3), await this._notifyAllSubscribers("SIGNED_IN", n3);
      }
      return this._returnResult({ data: { user: n3.user, session: n3 }, error: null });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: { session: null, user: null }, error: t });
      throw t;
    }
  }
  async refreshSession(e) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._refreshSession(e)) : await this._refreshSession(e);
  }
  async _refreshSession(e) {
    try {
      return await this._useSession(async (t) => {
        var r;
        if (!e) {
          let { data: o3, error: a } = t;
          if (a) throw a;
          e = (r = o3.session) !== null && r !== void 0 ? r : void 0;
        }
        if (!e?.refresh_token) throw new E();
        let { data: s, error: n3 } = await this._callRefreshToken(e.refresh_token);
        return n3 ? this._returnResult({ data: { user: null, session: null }, error: n3 }) : s ? this._returnResult({ data: { user: s.user, session: s }, error: null }) : this._returnResult({ data: { user: null, session: null }, error: null });
      });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: { user: null, session: null }, error: t });
      throw t;
    }
  }
  async _getSessionFromURL(e, t) {
    var r;
    try {
      if (!T()) throw new H("No browser detected.");
      if (e.error || e.error_description || e.error_code) throw new H(e.error_description || "Error in URL with unspecified error_description", { error: e.error || "unspecified_error", code: e.error_code || "unspecified_code" });
      switch (t) {
        case "implicit":
          if (this.flowType === "pkce") throw new ie("Not a valid PKCE flow url.");
          break;
        case "pkce":
          if (this.flowType === "implicit") throw new H("Not a valid implicit grant flow url.");
          break;
        default:
      }
      if (t === "pkce") {
        if (this._debug("#_initialize()", "begin", "is PKCE flow", true), !e.code) throw new ie("No code detected.");
        let { data: g2, error: R5 } = await this._exchangeCodeForSession(e.code);
        if (R5) throw R5;
        let j6 = new URL(globalThis.location.href);
        return j6.searchParams.delete("code"), globalThis.history.replaceState(globalThis.history.state, "", j6.toString()), { data: { session: g2.session, redirectType: (r = g2.redirectType) !== null && r !== void 0 ? r : null }, error: null };
      }
      let { provider_token: s, provider_refresh_token: n3, access_token: o3, refresh_token: a, expires_in: l, expires_at: u3, token_type: c3 } = e;
      if (!o3 || !l || !a || !c3) throw new H("No session defined in URL");
      let w6 = Math.round(Date.now() / 1e3), d = parseInt(l), _6 = w6 + d;
      u3 && (_6 = parseInt(u3));
      let v3 = _6 - w6;
      v3 * 1e3 <= q && console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${v3}s, should have been closer to ${d}s`);
      let b4 = _6 - d;
      w6 - b4 >= 120 ? console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale", b4, _6, w6) : w6 - b4 < 0 && console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew", b4, _6, w6);
      let { data: y4, error: m4 } = await this._getUser(o3);
      if (m4) throw m4;
      let p3 = { provider_token: s, provider_refresh_token: n3, access_token: o3, expires_in: d, expires_at: _6, refresh_token: a, token_type: c3, user: y4.user };
      return globalThis.location.hash = "", this._debug("#_getSessionFromURL()", "clearing window.location.hash"), this._returnResult({ data: { session: p3, redirectType: e.type }, error: null });
    } catch (s) {
      if (h(s)) return this._returnResult({ data: { session: null, redirectType: null }, error: s });
      throw s;
    }
  }
  _isImplicitGrantCallback(e) {
    return typeof this.detectSessionInUrl == "function" ? this.detectSessionInUrl(new URL(globalThis.location.href), e) : !!(e.access_token || e.error || e.error_description || e.error_code);
  }
  async _isPKCECallback(e) {
    let t = await $(this.storage, `${this.storageKey}-code-verifier`);
    return !!(e.code && t);
  }
  async signOut(e = { scope: "global" }) {
    return await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => await this._signOut(e)) : await this._signOut(e);
  }
  async _signOut({ scope: e } = { scope: "global" }) {
    return await this._useSession(async (t) => {
      var r;
      let { data: s, error: n3 } = t;
      if (n3 && !ae(n3)) return this._returnResult({ error: n3 });
      let o3 = (r = s.session) === null || r === void 0 ? void 0 : r.access_token;
      if (o3) {
        let { error: a } = await this.admin.signOut(o3, e);
        if (a && !(Je(a) && (a.status === 404 || a.status === 401 || a.status === 403) || ae(a))) return this._returnResult({ error: a });
      }
      return e !== "others" && (await this._removeSession(), await A(this.storage, `${this.storageKey}-code-verifier`)), this._returnResult({ error: null });
    });
  }
  onAuthStateChange(e) {
    let t = rt(), r = { id: t, callback: e, unsubscribe: () => {
      this._debug("#unsubscribe()", "state change callback with id removed", t), this.stateChangeEmitters.delete(t);
    } };
    return this._debug("#onAuthStateChange()", "registered callback with id", t), this.stateChangeEmitters.set(t, r), (async () => (await this.initializePromise, this.lock != null ? await this._acquireLock(this.lockAcquireTimeout, async () => {
      this._emitInitialSession(t);
    }) : await this._emitInitialSession(t)))(), { data: { subscription: r } };
  }
  async _emitInitialSession(e) {
    return await this._useSession(async (t) => {
      var r, s;
      try {
        let { data: { session: n3 }, error: o3 } = t;
        if (o3) throw o3;
        await ((r = this.stateChangeEmitters.get(e)) === null || r === void 0 ? void 0 : r.callback("INITIAL_SESSION", n3)), this._debug("INITIAL_SESSION", "callback id", e, "session", n3);
      } catch (n3) {
        await ((s = this.stateChangeEmitters.get(e)) === null || s === void 0 ? void 0 : s.callback("INITIAL_SESSION", null)), this._debug("INITIAL_SESSION", "callback id", e, "error", n3), ae(n3) ? console.warn(n3) : console.error(n3);
      }
    });
  }
  async resetPasswordForEmail(e, t = {}) {
    let r = null, s = null;
    this.flowType === "pkce" && ([r, s] = await F2(this.storage, this.storageKey, true));
    try {
      return await f(this.fetch, "POST", `${this.url}/recover`, { body: { email: e, code_challenge: r, code_challenge_method: s, gotrue_meta_security: { captcha_token: t.captchaToken } }, headers: this.headers, redirectTo: t.redirectTo });
    } catch (n3) {
      if (await A(this.storage, `${this.storageKey}-code-verifier`), h(n3)) return this._returnResult({ data: null, error: n3 });
      throw n3;
    }
  }
  async getUserIdentities() {
    var e;
    try {
      let { data: t, error: r } = await this.getUser();
      if (r) throw r;
      return this._returnResult({ data: { identities: (e = t.user.identities) !== null && e !== void 0 ? e : [] }, error: null });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async linkIdentity(e) {
    return "token" in e ? this.linkIdentityIdToken(e) : this.linkIdentityOAuth(e);
  }
  async linkIdentityOAuth(e) {
    var t;
    try {
      let { data: r, error: s } = await this._useSession(async (n3) => {
        var o3, a, l, u3, c3;
        let { data: w6, error: d } = n3;
        if (d) throw d;
        let _6 = await this._getUrlForProvider(`${this.url}/user/identities/authorize`, e.provider, { redirectTo: (o3 = e.options) === null || o3 === void 0 ? void 0 : o3.redirectTo, scopes: (a = e.options) === null || a === void 0 ? void 0 : a.scopes, queryParams: (l = e.options) === null || l === void 0 ? void 0 : l.queryParams, skipBrowserRedirect: true });
        return await f(this.fetch, "GET", _6, { headers: this.headers, jwt: (c3 = (u3 = w6.session) === null || u3 === void 0 ? void 0 : u3.access_token) !== null && c3 !== void 0 ? c3 : void 0 });
      });
      if (s) throw s;
      return T() && !(!((t = e.options) === null || t === void 0) && t.skipBrowserRedirect) && globalThis.location.assign(r?.url), this._returnResult({ data: { provider: e.provider, url: r?.url }, error: null });
    } catch (r) {
      if (h(r)) return this._returnResult({ data: { provider: e.provider, url: null }, error: r });
      throw r;
    }
  }
  async linkIdentityIdToken(e) {
    return await this._useSession(async (t) => {
      var r;
      try {
        let { error: s, data: { session: n3 } } = t;
        if (s) throw s;
        let { options: o3, provider: a, token: l, access_token: u3, nonce: c3 } = e, w6 = await f(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, { headers: this.headers, jwt: (r = n3?.access_token) !== null && r !== void 0 ? r : void 0, body: { provider: a, id_token: l, access_token: u3, nonce: c3, link_identity: true, gotrue_meta_security: { captcha_token: o3?.captchaToken } }, xform: P }), { data: d, error: _6 } = w6;
        return _6 ? this._returnResult({ data: { user: null, session: null }, error: _6 }) : !d || !d.session || !d.user ? this._returnResult({ data: { user: null, session: null }, error: new K() }) : (d.session && (await this._saveSession(d.session), await this._notifyAllSubscribers("USER_UPDATED", d.session)), this._returnResult({ data: d, error: _6 }));
      } catch (s) {
        if (await A(this.storage, `${this.storageKey}-code-verifier`), h(s)) return this._returnResult({ data: { user: null, session: null }, error: s });
        throw s;
      }
    });
  }
  async unlinkIdentity(e) {
    try {
      return await this._useSession(async (t) => {
        var r, s;
        let { data: n3, error: o3 } = t;
        if (o3) throw o3;
        return await f(this.fetch, "DELETE", `${this.url}/user/identities/${e.identity_id}`, { headers: this.headers, jwt: (s = (r = n3.session) === null || r === void 0 ? void 0 : r.access_token) !== null && s !== void 0 ? s : void 0 });
      });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async _refreshAccessToken(e) {
    let t = "#_refreshAccessToken()";
    this._debug(t, "begin");
    try {
      let r = Date.now();
      return await ot(async (s) => (s > 0 && await nt(200 * Math.pow(2, s - 1)), this._debug(t, "refreshing attempt", s), await f(this.fetch, "POST", `${this.url}/token?grant_type=refresh_token`, { body: { refresh_token: e }, headers: this.headers, xform: P })), (s, n3) => {
        let o3 = 200 * Math.pow(2, s);
        return n3 && we(n3) && Date.now() + o3 - r < q;
      });
    } catch (r) {
      if (this._debug(t, "error", r), h(r)) return this._returnResult({ data: { session: null, user: null }, error: r });
      throw r;
    } finally {
      this._debug(t, "end");
    }
  }
  _isValidSession(e) {
    return typeof e == "object" && e !== null && "access_token" in e && "refresh_token" in e && "expires_at" in e;
  }
  async _handleProviderSignIn(e, t) {
    let r = await this._getUrlForProvider(`${this.url}/authorize`, e, { redirectTo: t.redirectTo, scopes: t.scopes, queryParams: t.queryParams });
    return this._debug("#_handleProviderSignIn()", "provider", e, "options", t, "url", r), T() && !t.skipBrowserRedirect && globalThis.location.assign(r), { data: { provider: e, url: r }, error: null };
  }
  async _recoverAndRefresh() {
    var e, t;
    let r = "#_recoverAndRefresh()";
    this._debug(r, "begin");
    try {
      let s = await $(this.storage, this.storageKey);
      if (s && this.userStorage) {
        let o3 = await $(this.userStorage, this.storageKey + "-user");
        !this.storage.isServer && Object.is(this.storage, this.userStorage) && !o3 && (o3 = { user: s.user }, await X(this.userStorage, this.storageKey + "-user", o3)), s.user = (e = o3?.user) !== null && e !== void 0 ? e : be();
      } else if (s && !s.user && !s.user) {
        let o3 = await $(this.storage, this.storageKey + "-user");
        o3 && o3?.user ? (s.user = o3.user, await A(this.storage, this.storageKey + "-user"), await X(this.storage, this.storageKey, s)) : s.user = be();
      }
      if (this._debug(r, "session from storage", s), !this._isValidSession(s)) {
        this._debug(r, "session is not valid"), s !== null && await this._removeSession();
        return;
      }
      let n3 = ((t = s.expires_at) !== null && t !== void 0 ? t : 1 / 0) * 1e3 - Date.now() < fe;
      if (this._debug(r, `session has${n3 ? "" : " not"} expired with margin of ${fe}s`), n3) {
        if (this.autoRefreshToken && s.refresh_token) {
          let { error: o3 } = await this._callRefreshToken(s.refresh_token);
          o3 && (Ye(o3) ? this._debug(r, "refresh discarded by commit guard", o3) : (this._debug(r, "refresh failed", o3), we(o3) || (this._debug(r, "refresh failed with a non-retryable error, removing the session", o3), await this._removeSession())));
        }
      } else if (s.user && s.user.__isUserNotAvailableProxy === true) try {
        let { data: o3, error: a } = await this._getUser(s.access_token);
        !a && o3?.user ? (s.user = o3.user, await this._saveSession(s), await this._notifyAllSubscribers("SIGNED_IN", s)) : this._debug(r, "could not get user data, skipping SIGNED_IN notification");
      } catch (o3) {
        console.error("Error getting user data:", o3), this._debug(r, "error getting user data, skipping SIGNED_IN notification", o3);
      }
      else await this._notifyAllSubscribers("SIGNED_IN", s);
    } catch (s) {
      this._debug(r, "error", s), console.error(s);
      return;
    } finally {
      this._debug(r, "end");
    }
  }
  async _callRefreshToken(e) {
    var t, r;
    if (!e) throw new E();
    if (this.refreshingDeferred) return this.refreshingDeferred.promise;
    let s = "#_callRefreshToken()";
    this._debug(s, "begin");
    try {
      this.refreshingDeferred = new le();
      let n3 = await $(this.storage, this.storageKey), { data: o3, error: a } = await this._refreshAccessToken(e);
      if (a) throw a;
      if (!o3.session) throw new E();
      let l = await $(this.storage, this.storageKey);
      if (n3 !== null && (l === null || l.refresh_token !== n3.refresh_token)) {
        this._debug(s, "commit guard: storage changed since refresh started, discarding rotated tokens", { startedWith: "present", nowHolds: l ? "replaced" : "cleared" });
        let d = { data: null, error: new ne() };
        return this.refreshingDeferred.resolve(d), d;
      }
      let c3 = this._sessionRemovalEpoch;
      if (await this._saveSession(o3.session), this._sessionRemovalEpoch !== c3) {
        this._debug(s, "commit guard (post-save): _removeSession ran during _saveSession, undoing write"), await A(this.storage, this.storageKey), this.userStorage && await A(this.userStorage, this.storageKey + "-user");
        let d = { data: null, error: new ne() };
        return this.refreshingDeferred.resolve(d), d;
      }
      await this._notifyAllSubscribers("TOKEN_REFRESHED", o3.session);
      let w6 = { data: o3.session, error: null };
      return this.refreshingDeferred.resolve(w6), w6;
    } catch (n3) {
      if (this._debug(s, "error", n3), h(n3)) {
        let o3 = { data: null, error: n3 };
        return we(n3) || await this._removeSession(), (t = this.refreshingDeferred) === null || t === void 0 || t.resolve(o3), o3;
      }
      throw (r = this.refreshingDeferred) === null || r === void 0 || r.reject(n3), n3;
    } finally {
      this.refreshingDeferred = null, this._debug(s, "end");
    }
  }
  async _notifyAllSubscribers(e, t, r = true) {
    let s = `#_notifyAllSubscribers(${e})`;
    this._debug(s, "begin", t, `broadcast = ${r}`);
    try {
      this.broadcastChannel && r && this.broadcastChannel.postMessage({ event: e, session: t });
      let n3 = [], o3 = Array.from(this.stateChangeEmitters.values()).map(async (a) => {
        try {
          await a.callback(e, t);
        } catch (l) {
          n3.push(l);
        }
      });
      if (await Promise.all(o3), n3.length > 0) {
        for (let a = 0; a < n3.length; a += 1) console.error(n3[a]);
        throw n3[0];
      }
    } finally {
      this._debug(s, "end");
    }
  }
  async _saveSession(e) {
    this._debug("#_saveSession()", e), this.suppressGetSessionWarning = true, await A(this.storage, `${this.storageKey}-code-verifier`);
    let t = Object.assign({}, e), r = t.user && t.user.__isUserNotAvailableProxy === true;
    if (this.userStorage) {
      !r && t.user && await X(this.userStorage, this.storageKey + "-user", { user: t.user });
      let s = Object.assign({}, t);
      delete s.user;
      let n3 = Ie(s);
      await X(this.storage, this.storageKey, n3);
    } else {
      let s = Ie(t);
      await X(this.storage, this.storageKey, s);
    }
  }
  async _removeSession() {
    this._sessionRemovalEpoch += 1, this._debug("#_removeSession()"), this.suppressGetSessionWarning = false, await A(this.storage, this.storageKey), await A(this.storage, this.storageKey + "-code-verifier"), await A(this.storage, this.storageKey + "-user"), this.userStorage && await A(this.userStorage, this.storageKey + "-user"), await this._notifyAllSubscribers("SIGNED_OUT", null);
  }
  _removeVisibilityChangedCallback() {
    this._debug("#_removeVisibilityChangedCallback()");
    let e = this.visibilityChangedCallback;
    this.visibilityChangedCallback = null;
    try {
      e && T() && globalThis?.removeEventListener && globalThis.removeEventListener("visibilitychange", e);
    } catch (t) {
      console.error("removing visibilitychange callback failed", t);
    }
  }
  async _startAutoRefresh() {
    await this._stopAutoRefresh(), this._debug("#_startAutoRefresh()");
    let e = setInterval(() => this._autoRefreshTokenTick(), q);
    this.autoRefreshTicker = e, e && typeof e == "object" && typeof e.unref == "function" ? e.unref() : typeof Deno < "u" && typeof Deno.unrefTimer == "function" && Deno.unrefTimer(e);
    let t = setTimeout(async () => {
      await this.initializePromise, await this._autoRefreshTokenTick();
    }, 0);
    this.autoRefreshTickTimeout = t, t && typeof t == "object" && typeof t.unref == "function" ? t.unref() : typeof Deno < "u" && typeof Deno.unrefTimer == "function" && Deno.unrefTimer(t);
  }
  async _stopAutoRefresh() {
    this._debug("#_stopAutoRefresh()");
    let e = this.autoRefreshTicker;
    this.autoRefreshTicker = null, e && clearInterval(e);
    let t = this.autoRefreshTickTimeout;
    this.autoRefreshTickTimeout = null, t && clearTimeout(t);
  }
  async startAutoRefresh() {
    this._removeVisibilityChangedCallback(), await this._startAutoRefresh();
  }
  async stopAutoRefresh() {
    this._removeVisibilityChangedCallback(), await this._stopAutoRefresh();
  }
  async dispose() {
    var e;
    this._removeVisibilityChangedCallback(), await this._stopAutoRefresh(), (e = this.broadcastChannel) === null || e === void 0 || e.close(), this.broadcastChannel = null, this.stateChangeEmitters.clear();
  }
  async _autoRefreshTokenTick() {
    if (this._debug("#_autoRefreshTokenTick()", "begin"), this.lock != null) {
      try {
        await this._acquireLock(0, async () => {
          try {
            let e = Date.now();
            try {
              return await this._useSession(async (t) => {
                let { data: { session: r } } = t;
                if (!r || !r.refresh_token || !r.expires_at) {
                  this._debug("#_autoRefreshTokenTick()", "no session");
                  return;
                }
                let s = Math.floor((r.expires_at * 1e3 - e) / q);
                this._debug("#_autoRefreshTokenTick()", `access token expires in ${s} ticks, a tick lasts ${q}ms, refresh threshold is ${ee} ticks`), s <= ee && await this._callRefreshToken(r.refresh_token);
              });
            } catch (t) {
              console.error("Auto refresh tick failed with error. This is likely a transient error.", t);
            }
          } finally {
            this._debug("#_autoRefreshTokenTick()", "end");
          }
        });
      } catch (e) {
        if (e instanceof V) this._debug("auto refresh token tick lock not available");
        else throw e;
      }
      return;
    }
    if (this.refreshingDeferred !== null) {
      this._debug("#_autoRefreshTokenTick()", "refresh already in flight, skipping");
      return;
    }
    try {
      let e = Date.now();
      try {
        await this._useSession(async (t) => {
          let { data: { session: r } } = t;
          if (!r || !r.refresh_token || !r.expires_at) {
            this._debug("#_autoRefreshTokenTick()", "no session");
            return;
          }
          let s = Math.floor((r.expires_at * 1e3 - e) / q);
          this._debug("#_autoRefreshTokenTick()", `access token expires in ${s} ticks, a tick lasts ${q}ms, refresh threshold is ${ee} ticks`), s <= ee && await this._callRefreshToken(r.refresh_token);
        });
      } catch (t) {
        console.error("Auto refresh tick failed with error. This is likely a transient error.", t);
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
        } catch (e) {
          this._debug("#visibilityChangedCallback", "error", e);
        }
      }, globalThis?.addEventListener("visibilitychange", this.visibilityChangedCallback), await this._onVisibilityChanged(true);
    } catch (e) {
      console.error("_handleVisibilityChange", e);
    }
  }
  async _onVisibilityChanged(e) {
    let t = `#_onVisibilityChanged(${e})`;
    if (this._debug(t, "visibilityState", document.visibilityState), document.visibilityState === "visible") {
      if (this.autoRefreshToken && this._startAutoRefresh(), !e) if (await this.initializePromise, this.lock != null) await this._acquireLock(this.lockAcquireTimeout, async () => {
        if (document.visibilityState !== "visible") {
          this._debug(t, "acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting");
          return;
        }
        await this._recoverAndRefresh();
      });
      else {
        if (document.visibilityState !== "visible") {
          this._debug(t, "visibilityState is no longer visible, skipping recovery");
          return;
        }
        await this._recoverAndRefresh();
      }
    } else document.visibilityState === "hidden" && this.autoRefreshToken && this._stopAutoRefresh();
  }
  async _getUrlForProvider(e, t, r) {
    let s = [`provider=${encodeURIComponent(t)}`];
    if (r?.redirectTo && s.push(`redirect_to=${encodeURIComponent(r.redirectTo)}`), r?.scopes && s.push(`scopes=${encodeURIComponent(r.scopes)}`), this.flowType === "pkce") {
      let [n3, o3] = await F2(this.storage, this.storageKey), a = new URLSearchParams({ code_challenge: `${encodeURIComponent(n3)}`, code_challenge_method: `${encodeURIComponent(o3)}` });
      s.push(a.toString());
    }
    if (r?.queryParams) {
      let n3 = new URLSearchParams(r.queryParams);
      s.push(n3.toString());
    }
    return r?.skipBrowserRedirect && s.push(`skip_http_redirect=${r.skipBrowserRedirect}`), `${e}?${s.join("&")}`;
  }
  async _unenroll(e) {
    try {
      return await this._useSession(async (t) => {
        var r;
        let { data: s, error: n3 } = t;
        return n3 ? this._returnResult({ data: null, error: n3 }) : await f(this.fetch, "DELETE", `${this.url}/factors/${e.factorId}`, { headers: this.headers, jwt: (r = s?.session) === null || r === void 0 ? void 0 : r.access_token });
      });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async _enroll(e) {
    try {
      return await this._useSession(async (t) => {
        var r, s;
        let { data: n3, error: o3 } = t;
        if (o3) return this._returnResult({ data: null, error: o3 });
        let a = Object.assign({ friendly_name: e.friendlyName, factor_type: e.factorType }, e.factorType === "phone" ? { phone: e.phone } : e.factorType === "totp" ? { issuer: e.issuer } : {}), { data: l, error: u3 } = await f(this.fetch, "POST", `${this.url}/factors`, { body: a, headers: this.headers, jwt: (r = n3?.session) === null || r === void 0 ? void 0 : r.access_token });
        return u3 ? this._returnResult({ data: null, error: u3 }) : (e.factorType === "totp" && l.type === "totp" && (!((s = l?.totp) === null || s === void 0) && s.qr_code) && (l.totp.qr_code = `data:image/svg+xml;utf-8,${l.totp.qr_code}`), this._returnResult({ data: l, error: null }));
      });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async _verify(e) {
    let t = async () => {
      try {
        return await this._useSession(async (r) => {
          var s;
          let { data: n3, error: o3 } = r;
          if (o3) return this._returnResult({ data: null, error: o3 });
          let a = Object.assign({ challenge_id: e.challengeId }, "webauthn" in e ? { webauthn: Object.assign(Object.assign({}, e.webauthn), { credential_response: e.webauthn.type === "create" ? De(e.webauthn.credential_response) : qe(e.webauthn.credential_response) }) } : { code: e.code }), { data: l, error: u3 } = await f(this.fetch, "POST", `${this.url}/factors/${e.factorId}/verify`, { body: a, headers: this.headers, jwt: (s = n3?.session) === null || s === void 0 ? void 0 : s.access_token });
          return u3 ? this._returnResult({ data: null, error: u3 }) : (await this._saveSession(Object.assign({ expires_at: Math.round(Date.now() / 1e3) + l.expires_in }, l)), await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", l), this._returnResult({ data: l, error: u3 }));
        });
      } catch (r) {
        if (h(r)) return this._returnResult({ data: null, error: r });
        throw r;
      }
    };
    return this.lock != null ? this._acquireLock(this.lockAcquireTimeout, t) : t();
  }
  async _challenge(e) {
    let t = async () => {
      try {
        return await this._useSession(async (r) => {
          var s;
          let { data: n3, error: o3 } = r;
          if (o3) return this._returnResult({ data: null, error: o3 });
          let a = await f(this.fetch, "POST", `${this.url}/factors/${e.factorId}/challenge`, { body: e, headers: this.headers, jwt: (s = n3?.session) === null || s === void 0 ? void 0 : s.access_token });
          if (a.error) return a;
          let { data: l } = a;
          if (l.type !== "webauthn") return { data: l, error: null };
          switch (l.webauthn.type) {
            case "create":
              return { data: Object.assign(Object.assign({}, l), { webauthn: Object.assign(Object.assign({}, l.webauthn), { credential_options: Object.assign(Object.assign({}, l.webauthn.credential_options), { publicKey: Ne(l.webauthn.credential_options.publicKey) }) }) }), error: null };
            case "request":
              return { data: Object.assign(Object.assign({}, l), { webauthn: Object.assign(Object.assign({}, l.webauthn), { credential_options: Object.assign(Object.assign({}, l.webauthn.credential_options), { publicKey: Le(l.webauthn.credential_options.publicKey) }) }) }), error: null };
          }
        });
      } catch (r) {
        if (h(r)) return this._returnResult({ data: null, error: r });
        throw r;
      }
    };
    return this.lock != null ? this._acquireLock(this.lockAcquireTimeout, t) : t();
  }
  async _challengeAndVerify(e) {
    let { data: t, error: r } = await this._challenge({ factorId: e.factorId });
    return r ? this._returnResult({ data: null, error: r }) : await this._verify({ factorId: e.factorId, challengeId: t.id, code: e.code });
  }
  async _listFactors() {
    var e;
    let { data: { user: t }, error: r } = await this.getUser();
    if (r) return { data: null, error: r };
    let s = { all: [], phone: [], totp: [], webauthn: [] };
    for (let n3 of (e = t?.factors) !== null && e !== void 0 ? e : []) s.all.push(n3), n3.status === "verified" && s[n3.factor_type].push(n3);
    return { data: s, error: null };
  }
  async _getAuthenticatorAssuranceLevel(e) {
    var t, r, s, n3;
    if (e) try {
      let { payload: _6 } = ue(e), v3 = null;
      _6.aal && (v3 = _6.aal);
      let b4 = v3, { data: { user: y4 }, error: m4 } = await this.getUser(e);
      if (m4) return this._returnResult({ data: null, error: m4 });
      ((r = (t = y4?.factors) === null || t === void 0 ? void 0 : t.filter((R5) => R5.status === "verified")) !== null && r !== void 0 ? r : []).length > 0 && (b4 = "aal2");
      let g2 = _6.amr || [];
      return { data: { currentLevel: v3, nextLevel: b4, currentAuthenticationMethods: g2 }, error: null };
    } catch (_6) {
      if (h(_6)) return this._returnResult({ data: null, error: _6 });
      throw _6;
    }
    let { data: { session: o3 }, error: a } = await this.getSession();
    if (a) return this._returnResult({ data: null, error: a });
    if (!o3) return { data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] }, error: null };
    let { payload: l } = ue(o3.access_token), u3 = null;
    l.aal && (u3 = l.aal);
    let c3 = u3;
    ((n3 = (s = o3.user.factors) === null || s === void 0 ? void 0 : s.filter((_6) => _6.status === "verified")) !== null && n3 !== void 0 ? n3 : []).length > 0 && (c3 = "aal2");
    let d = l.amr || [];
    return { data: { currentLevel: u3, nextLevel: c3, currentAuthenticationMethods: d }, error: null };
  }
  async _getAuthorizationDetails(e) {
    try {
      return await this._useSession(async (t) => {
        let { data: { session: r }, error: s } = t;
        return s ? this._returnResult({ data: null, error: s }) : r ? await f(this.fetch, "GET", `${this.url}/oauth/authorizations/${e}`, { headers: this.headers, jwt: r.access_token, xform: (n3) => ({ data: n3, error: null }) }) : this._returnResult({ data: null, error: new E() });
      });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async _approveAuthorization(e, t) {
    try {
      return await this._useSession(async (r) => {
        let { data: { session: s }, error: n3 } = r;
        if (n3) return this._returnResult({ data: null, error: n3 });
        if (!s) return this._returnResult({ data: null, error: new E() });
        let o3 = await f(this.fetch, "POST", `${this.url}/oauth/authorizations/${e}/consent`, { headers: this.headers, jwt: s.access_token, body: { action: "approve" }, xform: (a) => ({ data: a, error: null }) });
        return o3.data && o3.data.redirect_url && T() && !t?.skipBrowserRedirect && globalThis.location.assign(o3.data.redirect_url), o3;
      });
    } catch (r) {
      if (h(r)) return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  async _denyAuthorization(e, t) {
    try {
      return await this._useSession(async (r) => {
        let { data: { session: s }, error: n3 } = r;
        if (n3) return this._returnResult({ data: null, error: n3 });
        if (!s) return this._returnResult({ data: null, error: new E() });
        let o3 = await f(this.fetch, "POST", `${this.url}/oauth/authorizations/${e}/consent`, { headers: this.headers, jwt: s.access_token, body: { action: "deny" }, xform: (a) => ({ data: a, error: null }) });
        return o3.data && o3.data.redirect_url && T() && !t?.skipBrowserRedirect && globalThis.location.assign(o3.data.redirect_url), o3;
      });
    } catch (r) {
      if (h(r)) return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  async _listOAuthGrants() {
    try {
      return await this._useSession(async (e) => {
        let { data: { session: t }, error: r } = e;
        return r ? this._returnResult({ data: null, error: r }) : t ? await f(this.fetch, "GET", `${this.url}/user/oauth/grants`, { headers: this.headers, jwt: t.access_token, xform: (s) => ({ data: s, error: null }) }) : this._returnResult({ data: null, error: new E() });
      });
    } catch (e) {
      if (h(e)) return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  async _revokeOAuthGrant(e) {
    try {
      return await this._useSession(async (t) => {
        let { data: { session: r }, error: s } = t;
        return s ? this._returnResult({ data: null, error: s }) : r ? (await f(this.fetch, "DELETE", `${this.url}/user/oauth/grants`, { headers: this.headers, jwt: r.access_token, query: { client_id: e.clientId }, noResolveJson: true }), { data: {}, error: null }) : this._returnResult({ data: null, error: new E() });
      });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async fetchJwk(e, t = { keys: [] }) {
    let r = t.keys.find((a) => a.kid === e);
    if (r) return r;
    let s = Date.now();
    if (r = this.jwks.keys.find((a) => a.kid === e), r && this.jwks_cached_at + Ve > s) return r;
    let { data: n3, error: o3 } = await f(this.fetch, "GET", `${this.url}/.well-known/jwks.json`, { headers: this.headers });
    if (o3) throw o3;
    return !n3.keys || n3.keys.length === 0 || (this.jwks = n3, this.jwks_cached_at = s, r = n3.keys.find((a) => a.kid === e), !r) ? null : r;
  }
  async getClaims(e, t = {}) {
    try {
      let r = e;
      if (!r) {
        let { data: _6, error: v3 } = await this.getSession();
        if (v3 || !_6.session) return this._returnResult({ data: null, error: v3 });
        r = _6.session.access_token;
      }
      let { header: s, payload: n3, signature: o3, raw: { header: a, payload: l } } = ue(r);
      if (!t?.allowExpired) try {
        lt(n3.exp);
      } catch (_6) {
        throw new G(_6 instanceof Error ? _6.message : "JWT validation failed");
      }
      let u3 = !s.alg || s.alg.startsWith("HS") || !s.kid || !("crypto" in globalThis && "subtle" in globalThis.crypto) ? null : await this.fetchJwk(s.kid, t?.keys ? { keys: t.keys } : t?.jwks);
      if (!u3) {
        let { error: _6 } = await this.getUser(r);
        if (_6) throw _6;
        return { data: { claims: n3, header: s, signature: o3 }, error: null };
      }
      let c3 = ut(s.alg), w6 = await crypto.subtle.importKey("jwk", u3, c3, true, ["verify"]);
      if (!await crypto.subtle.verify(c3, w6, o3, et(`${a}.${l}`))) throw new G("Invalid JWT signature");
      return { data: { claims: n3, header: s, signature: o3 }, error: null };
    } catch (r) {
      if (h(r)) return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  async signInWithPasskey(e) {
    var t, r, s;
    O(this.experimental);
    try {
      if (!he()) return this._returnResult({ data: null, error: new x("Browser does not support WebAuthn", null) });
      let { data: n3, error: o3 } = await this._startPasskeyAuthentication({ options: { captchaToken: (t = e?.options) === null || t === void 0 ? void 0 : t.captchaToken } });
      if (o3 || !n3) return this._returnResult({ data: null, error: o3 });
      let a = Le(n3.options), l = (s = (r = e?.options) === null || r === void 0 ? void 0 : r.signal) !== null && s !== void 0 ? s : Se.createNewAbortSignal(), { data: u3, error: c3 } = await We({ publicKey: a, signal: l });
      if (c3 || !u3) return this._returnResult({ data: null, error: c3 ?? new x("WebAuthn ceremony failed", null) });
      let w6 = qe(u3);
      return this._verifyPasskeyAuthentication({ challengeId: n3.challenge_id, credential: w6 });
    } catch (n3) {
      if (h(n3)) return this._returnResult({ data: null, error: n3 });
      throw n3;
    }
  }
  async registerPasskey(e) {
    var t, r;
    O(this.experimental);
    try {
      if (!he()) return this._returnResult({ data: null, error: new x("Browser does not support WebAuthn", null) });
      let { data: s, error: n3 } = await this._startPasskeyRegistration();
      if (n3 || !s) return this._returnResult({ data: null, error: n3 });
      let o3 = Ne(s.options), a = (r = (t = e?.options) === null || t === void 0 ? void 0 : t.signal) !== null && r !== void 0 ? r : Se.createNewAbortSignal(), { data: l, error: u3 } = await Ke({ publicKey: o3, signal: a });
      if (u3 || !l) return this._returnResult({ data: null, error: u3 ?? new x("WebAuthn ceremony failed", null) });
      let c3 = De(l);
      return this._verifyPasskeyRegistration({ challengeId: s.challenge_id, credential: c3 });
    } catch (s) {
      if (h(s)) return this._returnResult({ data: null, error: s });
      throw s;
    }
  }
  async _startPasskeyRegistration() {
    O(this.experimental);
    try {
      return await this._useSession(async (e) => {
        let { data: { session: t }, error: r } = e;
        if (r) return this._returnResult({ data: null, error: r });
        if (!t) return this._returnResult({ data: null, error: new E() });
        let { data: s, error: n3 } = await f(this.fetch, "POST", `${this.url}/passkeys/registration/options`, { headers: this.headers, jwt: t.access_token, body: {} });
        return n3 ? this._returnResult({ data: null, error: n3 }) : this._returnResult({ data: s, error: null });
      });
    } catch (e) {
      if (h(e)) return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  async _verifyPasskeyRegistration(e) {
    O(this.experimental);
    try {
      return await this._useSession(async (t) => {
        let { data: { session: r }, error: s } = t;
        if (s) return this._returnResult({ data: null, error: s });
        if (!r) return this._returnResult({ data: null, error: new E() });
        let { data: n3, error: o3 } = await f(this.fetch, "POST", `${this.url}/passkeys/registration/verify`, { headers: this.headers, jwt: r.access_token, body: { challenge_id: e.challengeId, credential: e.credential } });
        return o3 ? this._returnResult({ data: null, error: o3 }) : this._returnResult({ data: n3, error: null });
      });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async _startPasskeyAuthentication(e) {
    var t;
    O(this.experimental);
    try {
      let { data: r, error: s } = await f(this.fetch, "POST", `${this.url}/passkeys/authentication/options`, { headers: this.headers, body: { gotrue_meta_security: { captcha_token: (t = e?.options) === null || t === void 0 ? void 0 : t.captchaToken } } });
      return s ? this._returnResult({ data: null, error: s }) : this._returnResult({ data: r, error: null });
    } catch (r) {
      if (h(r)) return this._returnResult({ data: null, error: r });
      throw r;
    }
  }
  async _verifyPasskeyAuthentication(e) {
    O(this.experimental);
    try {
      let { data: t, error: r } = await f(this.fetch, "POST", `${this.url}/passkeys/authentication/verify`, { headers: this.headers, body: { challenge_id: e.challengeId, credential: e.credential }, xform: P });
      return r ? this._returnResult({ data: null, error: r }) : (t.session && (await this._saveSession(t.session), await this._notifyAllSubscribers("SIGNED_IN", t.session)), this._returnResult({ data: t, error: null }));
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async _listPasskeys() {
    O(this.experimental);
    try {
      return await this._useSession(async (e) => {
        let { data: { session: t }, error: r } = e;
        if (r) return this._returnResult({ data: null, error: r });
        if (!t) return this._returnResult({ data: null, error: new E() });
        let { data: s, error: n3 } = await f(this.fetch, "GET", `${this.url}/passkeys`, { headers: this.headers, jwt: t.access_token, xform: (o3) => ({ data: o3, error: null }) });
        return n3 ? this._returnResult({ data: null, error: n3 }) : this._returnResult({ data: s, error: null });
      });
    } catch (e) {
      if (h(e)) return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  async _updatePasskey(e) {
    O(this.experimental);
    try {
      return await this._useSession(async (t) => {
        let { data: { session: r }, error: s } = t;
        if (s) return this._returnResult({ data: null, error: s });
        if (!r) return this._returnResult({ data: null, error: new E() });
        let { data: n3, error: o3 } = await f(this.fetch, "PATCH", `${this.url}/passkeys/${e.passkeyId}`, { headers: this.headers, jwt: r.access_token, body: { friendly_name: e.friendlyName } });
        return o3 ? this._returnResult({ data: null, error: o3 }) : this._returnResult({ data: n3, error: null });
      });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async _deletePasskey(e) {
    O(this.experimental);
    try {
      return await this._useSession(async (t) => {
        let { data: { session: r }, error: s } = t;
        if (s) return this._returnResult({ data: null, error: s });
        if (!r) return this._returnResult({ data: null, error: new E() });
        let { error: n3 } = await f(this.fetch, "DELETE", `${this.url}/passkeys/${e.passkeyId}`, { headers: this.headers, jwt: r.access_token, noResolveJson: true });
        return n3 ? this._returnResult({ data: null, error: n3 }) : this._returnResult({ data: null, error: null });
      });
    } catch (t) {
      if (h(t)) return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
};
Ee.nextInstanceID = {};
var Me = Ee;
var Jt = Me;
var Ht = Jt;

// supabase/functions/_vendor/esm.sh/@supabase/functions-js@2.108.1/denonext/functions-js.mjs
var O2 = (e) => e ? (...t) => e(...t) : (...t) => fetch(...t);
var c = class extends Error {
  constructor(t, p3 = "FunctionsError", n3) {
    super(t), this.name = p3, this.context = n3;
  }
  toJSON() {
    return { name: this.name, message: this.message, context: this.context };
  }
};
var x2 = class extends c {
  constructor(t) {
    super("Failed to send a request to the Edge Function", "FunctionsFetchError", t);
  }
};
var f2 = class extends c {
  constructor(t) {
    super("Relay Error invoking the Edge Function", "FunctionsRelayError", t);
  }
};
var u = class extends c {
  constructor(t) {
    super("Edge Function returned a non-2xx status code", "FunctionsHttpError", t);
  }
};
var E2;
(function(e) {
  e.Any = "any", e.ApNortheast1 = "ap-northeast-1", e.ApNortheast2 = "ap-northeast-2", e.ApSouth1 = "ap-south-1", e.ApSoutheast1 = "ap-southeast-1", e.ApSoutheast2 = "ap-southeast-2", e.CaCentral1 = "ca-central-1", e.EuCentral1 = "eu-central-1", e.EuWest1 = "eu-west-1", e.EuWest2 = "eu-west-2", e.EuWest3 = "eu-west-3", e.SaEast1 = "sa-east-1", e.UsEast1 = "us-east-1", e.UsWest1 = "us-west-1", e.UsWest2 = "us-west-2";
})(E2 || (E2 = {}));
var A2 = class {
  constructor(t, { headers: p3 = {}, customFetch: n3, region: h3 = E2.Any } = {}) {
    this.url = t, this.headers = p3, this.region = h3, this.fetch = O2(n3);
  }
  setAuth(t) {
    this.headers.Authorization = `Bearer ${t}`;
  }
  invoke(t) {
    return F(this, arguments, void 0, function* (p3, n3 = {}) {
      var h3;
      let g2, d;
      try {
        let { headers: o3, method: T7, body: r, signal: b4, timeout: v3 } = n3, y4 = {}, { region: i4 } = n3;
        i4 || (i4 = this.region);
        let C6 = new URL(`${this.url}/${p3}`);
        i4 && i4 !== "any" && (y4["x-region"] = i4, C6.searchParams.set("forceFunctionRegion", i4));
        let a;
        r && (o3 && !Object.prototype.hasOwnProperty.call(o3, "Content-Type") || !o3) ? typeof Blob < "u" && r instanceof Blob || r instanceof ArrayBuffer ? (y4["Content-Type"] = "application/octet-stream", a = r) : typeof r == "string" ? (y4["Content-Type"] = "text/plain", a = r) : typeof FormData < "u" && r instanceof FormData ? a = r : (y4["Content-Type"] = "application/json", a = JSON.stringify(r)) : r && typeof r != "string" && !(typeof Blob < "u" && r instanceof Blob) && !(r instanceof ArrayBuffer) && !(typeof FormData < "u" && r instanceof FormData) ? a = JSON.stringify(r) : a = r;
        let w6 = b4;
        v3 && (d = new AbortController(), g2 = setTimeout(() => d.abort(), v3), b4 ? (w6 = d.signal, b4.addEventListener("abort", () => d.abort())) : w6 = d.signal);
        let s = yield this.fetch(C6.toString(), { method: T7 || "POST", headers: Object.assign(Object.assign(Object.assign({}, y4), this.headers), o3), body: a, signal: w6 }).catch((F6) => {
          throw new x2(F6);
        }), S7 = s.headers.get("x-relay-error");
        if (S7 && S7 === "true") throw new f2(s);
        if (!s.ok) throw new u(s);
        let m4 = ((h3 = s.headers.get("Content-Type")) !== null && h3 !== void 0 ? h3 : "text/plain").split(";")[0].trim(), l;
        return m4 === "application/json" ? l = yield s.json() : m4 === "application/octet-stream" || m4 === "application/pdf" ? l = yield s.blob() : m4 === "text/event-stream" ? l = s : m4 === "multipart/form-data" ? l = yield s.formData() : l = yield s.text(), { data: l, error: null, response: s };
      } catch (o3) {
        return { data: null, error: o3, response: o3 instanceof u || o3 instanceof f2 ? o3.context : void 0 };
      } finally {
        g2 && clearTimeout(g2);
      }
    });
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/postgrest-js@2.108.1/denonext/postgrest-js.mjs
var L2 = (t) => Math.min(1e3 * 2 ** t, 3e4);
var D = [520, 503];
var j = ["GET", "HEAD", "OPTIONS"];
var b = class extends Error {
  constructor(t) {
    super(t.message), this.name = "PostgrestError", this.details = t.details, this.hint = t.hint, this.code = t.code;
  }
  toJSON() {
    return { name: this.name, message: this.message, details: this.details, hint: this.hint, code: this.code };
  }
};
function A3(t, e) {
  return new Promise((r) => {
    if (e?.aborted) {
      r();
      return;
    }
    let s = setTimeout(() => {
      e?.removeEventListener("abort", l), r();
    }, t);
    function l() {
      clearTimeout(s), r();
    }
    e?.addEventListener("abort", l);
  });
}
function N2(t, e, r, s) {
  return !(!s || r >= 3 || !j.includes(t) || !D.includes(e));
}
var E3 = class {
  constructor(t) {
    var e, r, s, l, a;
    this.shouldThrowOnError = false, this.retryEnabled = true, this.method = t.method, this.url = t.url, this.headers = new Headers(t.headers), this.schema = t.schema, this.body = t.body, this.shouldThrowOnError = (e = t.shouldThrowOnError) !== null && e !== void 0 ? e : false, this.signal = t.signal, this.isMaybeSingle = (r = t.isMaybeSingle) !== null && r !== void 0 ? r : false, this.shouldStripNulls = (s = t.shouldStripNulls) !== null && s !== void 0 ? s : false, this.urlLengthLimit = (l = t.urlLengthLimit) !== null && l !== void 0 ? l : 8e3, this.retryEnabled = (a = t.retry) !== null && a !== void 0 ? a : true, t.fetch ? this.fetch = t.fetch : this.fetch = fetch;
  }
  throwOnError() {
    return this.shouldThrowOnError = true, this;
  }
  stripNulls() {
    if (this.headers.get("Accept") === "text/csv") throw new Error("stripNulls() cannot be used with csv()");
    return this.shouldStripNulls = true, this;
  }
  setHeader(t, e) {
    return this.headers = new Headers(this.headers), this.headers.set(t, e), this;
  }
  retry(t) {
    return this.retryEnabled = t, this;
  }
  then(t, e) {
    var r = this;
    if (this.schema === void 0 || (["GET", "HEAD"].includes(this.method) ? this.headers.set("Accept-Profile", this.schema) : this.headers.set("Content-Profile", this.schema)), this.method !== "GET" && this.method !== "HEAD" && this.headers.set("Content-Type", "application/json"), this.shouldStripNulls) {
      let i4 = this.headers.get("Accept");
      i4 === "application/vnd.pgrst.object+json" ? this.headers.set("Accept", "application/vnd.pgrst.object+json;nulls=stripped") : (!i4 || i4 === "application/json") && this.headers.set("Accept", "application/vnd.pgrst.array+json;nulls=stripped");
    }
    let s = this.fetch, a = (async () => {
      let i4 = 0;
      for (; ; ) {
        let o3 = {};
        r.headers.forEach((n3, d) => {
          o3[d] = n3;
        }), i4 > 0 && (o3["X-Retry-Count"] = String(i4));
        let c3;
        try {
          c3 = await s(r.url.toString(), { method: r.method, headers: o3, body: JSON.stringify(r.body, (n3, d) => typeof d == "bigint" ? d.toString() : d), signal: r.signal });
        } catch (n3) {
          if (n3?.name === "AbortError" || n3?.code === "ABORT_ERR" || !j.includes(r.method)) throw n3;
          if (r.retryEnabled && i4 < 3) {
            let d = L2(i4);
            i4++, await A3(d, r.signal);
            continue;
          }
          throw n3;
        }
        if (N2(r.method, c3.status, i4, r.retryEnabled)) {
          var u3, h3;
          let n3 = (u3 = (h3 = c3.headers) === null || h3 === void 0 ? void 0 : h3.get("Retry-After")) !== null && u3 !== void 0 ? u3 : null, d = n3 !== null ? Math.max(0, parseInt(n3, 10) || 0) * 1e3 : L2(i4);
          await c3.text(), i4++, await A3(d, r.signal);
          continue;
        }
        return await r.processResponse(c3);
      }
    })();
    return this.shouldThrowOnError || (a = a.catch((i4) => {
      var u3;
      let h3 = "", o3 = "", c3 = "", n3 = i4?.cause;
      if (n3) {
        var d, p3, f5, P5;
        let k3 = (d = n3?.message) !== null && d !== void 0 ? d : "", $7 = (p3 = n3?.code) !== null && p3 !== void 0 ? p3 : "";
        h3 = `${(f5 = i4?.name) !== null && f5 !== void 0 ? f5 : "FetchError"}: ${i4?.message}`, h3 += `

Caused by: ${(P5 = n3?.name) !== null && P5 !== void 0 ? P5 : "Error"}: ${k3}`, $7 && (h3 += ` (${$7})`), n3?.stack && (h3 += `
${n3.stack}`);
      } else {
        var w6;
        h3 = (w6 = i4?.stack) !== null && w6 !== void 0 ? w6 : "";
      }
      let g2 = this.url.toString().length;
      return i4?.name === "AbortError" || i4?.code === "ABORT_ERR" ? (c3 = "", o3 = "Request was aborted (timeout or manual cancellation)", g2 > this.urlLengthLimit && (o3 += `. Note: Your request URL is ${g2} characters, which may exceed server limits. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [many IDs])), consider using an RPC function to pass values server-side.`)) : (n3?.name === "HeadersOverflowError" || n3?.code === "UND_ERR_HEADERS_OVERFLOW") && (c3 = "", o3 = "HTTP headers exceeded server limits (typically 16KB)", g2 > this.urlLengthLimit && (o3 += `. Your request URL is ${g2} characters. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [200+ IDs])), consider using an RPC function instead.`)), { success: false, error: { message: `${(u3 = i4?.name) !== null && u3 !== void 0 ? u3 : "FetchError"}: ${i4?.message}`, details: h3, hint: o3, code: c3 }, data: null, count: null, status: 0, statusText: "" };
    })), a.then(t, e);
  }
  async processResponse(t) {
    var e = this;
    let r = null, s = null, l = null, a = t.status, i4 = t.statusText;
    if (t.ok) {
      var u3, h3;
      if (e.method !== "HEAD") {
        var o3;
        let d = await t.text();
        if (d !== "") if (e.headers.get("Accept") === "text/csv") s = d;
        else if (e.headers.get("Accept") && (!((o3 = e.headers.get("Accept")) === null || o3 === void 0) && o3.includes("application/vnd.pgrst.plan+text"))) s = d;
        else try {
          s = JSON.parse(d);
        } catch {
          if (r = { message: d }, s = null, e.shouldThrowOnError) throw new b({ message: d, details: "", hint: "", code: "" });
        }
      }
      let c3 = (u3 = e.headers.get("Prefer")) === null || u3 === void 0 ? void 0 : u3.match(/count=(exact|planned|estimated)/), n3 = (h3 = t.headers.get("content-range")) === null || h3 === void 0 ? void 0 : h3.split("/");
      c3 && n3 && n3.length > 1 && (l = parseInt(n3[1])), e.isMaybeSingle && Array.isArray(s) && (s.length > 1 ? (r = { code: "PGRST116", details: `Results contain ${s.length} rows, application/vnd.pgrst.object+json requires 1 row`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }, s = null, l = null, a = 406, i4 = "Not Acceptable") : s.length === 1 ? s = s[0] : s = null);
    } else {
      let c3 = await t.text();
      try {
        r = JSON.parse(c3), Array.isArray(r) && t.status === 404 && (s = [], r = null, a = 200, i4 = "OK");
      } catch {
        t.status === 404 && c3 === "" ? (a = 204, i4 = "No Content") : r = { message: c3 };
      }
      if (r && e.shouldThrowOnError) throw new b(r);
    }
    return { success: r === null, error: r, data: s, count: l, status: a, statusText: i4 };
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
  select(t) {
    let e = false, r = (t ?? "*").split("").map((s) => /\s/.test(s) && !e ? "" : (s === '"' && (e = !e), s)).join("");
    return this.url.searchParams.set("select", r), this.headers.append("Prefer", "return=representation"), this;
  }
  order(t, { ascending: e = true, nullsFirst: r, foreignTable: s, referencedTable: l = s } = {}) {
    let a = l ? `${l}.order` : "order", i4 = this.url.searchParams.get(a);
    return this.url.searchParams.set(a, `${i4 ? `${i4},` : ""}${t}.${e ? "asc" : "desc"}${r === void 0 ? "" : r ? ".nullsfirst" : ".nullslast"}`), this;
  }
  limit(t, { foreignTable: e, referencedTable: r = e } = {}) {
    let s = typeof r > "u" ? "limit" : `${r}.limit`;
    return this.url.searchParams.set(s, `${t}`), this;
  }
  range(t, e, { foreignTable: r, referencedTable: s = r } = {}) {
    let l = typeof s > "u" ? "offset" : `${s}.offset`, a = typeof s > "u" ? "limit" : `${s}.limit`;
    return this.url.searchParams.set(l, `${t}`), this.url.searchParams.set(a, `${e - t + 1}`), this;
  }
  abortSignal(t) {
    return this.signal = t, this;
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
  explain({ analyze: t = false, verbose: e = false, settings: r = false, buffers: s = false, wal: l = false, format: a = "text" } = {}) {
    var i4;
    let u3 = [t ? "analyze" : null, e ? "verbose" : null, r ? "settings" : null, s ? "buffers" : null, l ? "wal" : null].filter(Boolean).join("|"), h3 = (i4 = this.headers.get("Accept")) !== null && i4 !== void 0 ? i4 : "application/json";
    return this.headers.set("Accept", `application/vnd.pgrst.plan+${a}; for="${h3}"; options=${u3};`), a === "json" ? this : this;
  }
  rollback() {
    return this.headers.append("Prefer", "tx=rollback"), this;
  }
  returns() {
    return this;
  }
  maxAffected(t) {
    return this.headers.append("Prefer", "handling=strict"), this.headers.append("Prefer", `max-affected=${t}`), this;
  }
};
var O3 = new RegExp("[,()]");
var m = class extends R {
  throwOnError() {
    return super.throwOnError();
  }
  eq(t, e) {
    return this.url.searchParams.append(t, `eq.${e}`), this;
  }
  neq(t, e) {
    return this.url.searchParams.append(t, `neq.${e}`), this;
  }
  gt(t, e) {
    return this.url.searchParams.append(t, `gt.${e}`), this;
  }
  gte(t, e) {
    return this.url.searchParams.append(t, `gte.${e}`), this;
  }
  lt(t, e) {
    return this.url.searchParams.append(t, `lt.${e}`), this;
  }
  lte(t, e) {
    return this.url.searchParams.append(t, `lte.${e}`), this;
  }
  like(t, e) {
    return this.url.searchParams.append(t, `like.${e}`), this;
  }
  likeAllOf(t, e) {
    return this.url.searchParams.append(t, `like(all).{${e.join(",")}}`), this;
  }
  likeAnyOf(t, e) {
    return this.url.searchParams.append(t, `like(any).{${e.join(",")}}`), this;
  }
  ilike(t, e) {
    return this.url.searchParams.append(t, `ilike.${e}`), this;
  }
  ilikeAllOf(t, e) {
    return this.url.searchParams.append(t, `ilike(all).{${e.join(",")}}`), this;
  }
  ilikeAnyOf(t, e) {
    return this.url.searchParams.append(t, `ilike(any).{${e.join(",")}}`), this;
  }
  regexMatch(t, e) {
    return this.url.searchParams.append(t, `match.${e}`), this;
  }
  regexIMatch(t, e) {
    return this.url.searchParams.append(t, `imatch.${e}`), this;
  }
  is(t, e) {
    return this.url.searchParams.append(t, `is.${e}`), this;
  }
  isDistinct(t, e) {
    return this.url.searchParams.append(t, `isdistinct.${e}`), this;
  }
  in(t, e) {
    let r = Array.from(new Set(e)).map((s) => typeof s == "string" && O3.test(s) ? `"${s}"` : `${s}`).join(",");
    return this.url.searchParams.append(t, `in.(${r})`), this;
  }
  notIn(t, e) {
    let r = Array.from(new Set(e)).map((s) => typeof s == "string" && O3.test(s) ? `"${s}"` : `${s}`).join(",");
    return this.url.searchParams.append(t, `not.in.(${r})`), this;
  }
  contains(t, e) {
    return typeof e == "string" ? this.url.searchParams.append(t, `cs.${e}`) : Array.isArray(e) ? this.url.searchParams.append(t, `cs.{${e.join(",")}}`) : this.url.searchParams.append(t, `cs.${JSON.stringify(e)}`), this;
  }
  containedBy(t, e) {
    return typeof e == "string" ? this.url.searchParams.append(t, `cd.${e}`) : Array.isArray(e) ? this.url.searchParams.append(t, `cd.{${e.join(",")}}`) : this.url.searchParams.append(t, `cd.${JSON.stringify(e)}`), this;
  }
  rangeGt(t, e) {
    return this.url.searchParams.append(t, `sr.${e}`), this;
  }
  rangeGte(t, e) {
    return this.url.searchParams.append(t, `nxl.${e}`), this;
  }
  rangeLt(t, e) {
    return this.url.searchParams.append(t, `sl.${e}`), this;
  }
  rangeLte(t, e) {
    return this.url.searchParams.append(t, `nxr.${e}`), this;
  }
  rangeAdjacent(t, e) {
    return this.url.searchParams.append(t, `adj.${e}`), this;
  }
  overlaps(t, e) {
    return typeof e == "string" ? this.url.searchParams.append(t, `ov.${e}`) : this.url.searchParams.append(t, `ov.{${e.join(",")}}`), this;
  }
  textSearch(t, e, { config: r, type: s } = {}) {
    let l = "";
    s === "plain" ? l = "pl" : s === "phrase" ? l = "ph" : s === "websearch" && (l = "w");
    let a = r === void 0 ? "" : `(${r})`;
    return this.url.searchParams.append(t, `${l}fts${a}.${e}`), this;
  }
  match(t) {
    return Object.entries(t).filter(([e, r]) => r !== void 0).forEach(([e, r]) => {
      this.url.searchParams.append(e, `eq.${r}`);
    }), this;
  }
  not(t, e, r) {
    return this.url.searchParams.append(t, `not.${e}.${r}`), this;
  }
  or(t, { foreignTable: e, referencedTable: r = e } = {}) {
    let s = r ? `${r}.or` : "or";
    return this.url.searchParams.append(s, `(${t})`), this;
  }
  filter(t, e, r) {
    return this.url.searchParams.append(t, `${e}.${r}`), this;
  }
};
var T2 = class {
  constructor(t, { headers: e = {}, schema: r, fetch: s, urlLengthLimit: l = 8e3, retry: a }) {
    this.url = t, this.headers = new Headers(e), this.schema = r, this.fetch = s, this.urlLengthLimit = l, this.retry = a;
  }
  cloneRequestState() {
    return { url: new URL(this.url.toString()), headers: new Headers(this.headers) };
  }
  select(t, e) {
    let { head: r = false, count: s } = e ?? {}, l = r ? "HEAD" : "GET", a = false, i4 = (t ?? "*").split("").map((o3) => /\s/.test(o3) && !a ? "" : (o3 === '"' && (a = !a), o3)).join(""), { url: u3, headers: h3 } = this.cloneRequestState();
    return u3.searchParams.set("select", i4), s && h3.append("Prefer", `count=${s}`), new m({ method: l, url: u3, headers: h3, schema: this.schema, fetch: this.fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  insert(t, { count: e, defaultToNull: r = true } = {}) {
    var s;
    let l = "POST", { url: a, headers: i4 } = this.cloneRequestState();
    if (e && i4.append("Prefer", `count=${e}`), r || i4.append("Prefer", "missing=default"), Array.isArray(t)) {
      let u3 = t.reduce((h3, o3) => h3.concat(Object.keys(o3)), []);
      if (u3.length > 0) {
        let h3 = [...new Set(u3)].map((o3) => `"${o3}"`);
        a.searchParams.set("columns", h3.join(","));
      }
    }
    return new m({ method: l, url: a, headers: i4, schema: this.schema, body: t, fetch: (s = this.fetch) !== null && s !== void 0 ? s : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  upsert(t, { onConflict: e, ignoreDuplicates: r = false, count: s, defaultToNull: l = true } = {}) {
    var a;
    let i4 = "POST", { url: u3, headers: h3 } = this.cloneRequestState();
    if (h3.append("Prefer", `resolution=${r ? "ignore" : "merge"}-duplicates`), e !== void 0 && u3.searchParams.set("on_conflict", e), s && h3.append("Prefer", `count=${s}`), l || h3.append("Prefer", "missing=default"), Array.isArray(t)) {
      let o3 = t.reduce((c3, n3) => c3.concat(Object.keys(n3)), []);
      if (o3.length > 0) {
        let c3 = [...new Set(o3)].map((n3) => `"${n3}"`);
        u3.searchParams.set("columns", c3.join(","));
      }
    }
    return new m({ method: i4, url: u3, headers: h3, schema: this.schema, body: t, fetch: (a = this.fetch) !== null && a !== void 0 ? a : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  update(t, { count: e } = {}) {
    var r;
    let s = "PATCH", { url: l, headers: a } = this.cloneRequestState();
    return e && a.append("Prefer", `count=${e}`), new m({ method: s, url: l, headers: a, schema: this.schema, body: t, fetch: (r = this.fetch) !== null && r !== void 0 ? r : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  delete({ count: t } = {}) {
    var e;
    let r = "DELETE", { url: s, headers: l } = this.cloneRequestState();
    return t && l.append("Prefer", `count=${t}`), new m({ method: r, url: s, headers: l, schema: this.schema, fetch: (e = this.fetch) !== null && e !== void 0 ? e : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
};
function y(t) {
  "@babel/helpers - typeof";
  return y = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
    return typeof e;
  } : function(e) {
    return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  }, y(t);
}
function H2(t, e) {
  if (y(t) != "object" || !t) return t;
  var r = t[Symbol.toPrimitive];
  if (r !== void 0) {
    var s = r.call(t, e || "default");
    if (y(s) != "object") return s;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e === "string" ? String : Number)(t);
}
function q2(t) {
  var e = H2(t, "string");
  return y(e) == "symbol" ? e : e + "";
}
function _(t, e, r) {
  return (e = q2(e)) in t ? Object.defineProperty(t, e, { value: r, enumerable: true, configurable: true, writable: true }) : t[e] = r, t;
}
function S3(t, e) {
  var r = Object.keys(t);
  if (Object.getOwnPropertySymbols) {
    var s = Object.getOwnPropertySymbols(t);
    e && (s = s.filter(function(l) {
      return Object.getOwnPropertyDescriptor(t, l).enumerable;
    })), r.push.apply(r, s);
  }
  return r;
}
function v(t) {
  for (var e = 1; e < arguments.length; e++) {
    var r = arguments[e] != null ? arguments[e] : {};
    e % 2 ? S3(Object(r), true).forEach(function(s) {
      _(t, s, r[s]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(r)) : S3(Object(r)).forEach(function(s) {
      Object.defineProperty(t, s, Object.getOwnPropertyDescriptor(r, s));
    });
  }
  return t;
}
var C2 = class x3 {
  constructor(e, { headers: r = {}, schema: s, fetch: l, timeout: a, urlLengthLimit: i4 = 8e3, retry: u3 } = {}) {
    this.url = e, this.headers = new Headers(r), this.schemaName = s, this.urlLengthLimit = i4;
    let h3 = l ?? globalThis.fetch;
    a !== void 0 && a > 0 ? this.fetch = (o3, c3) => {
      let n3 = new AbortController(), d = setTimeout(() => n3.abort(), a), p3 = c3?.signal;
      if (p3) {
        if (p3.aborted) return clearTimeout(d), h3(o3, c3);
        let f5 = () => {
          clearTimeout(d), n3.abort();
        };
        return p3.addEventListener("abort", f5, { once: true }), h3(o3, v(v({}, c3), {}, { signal: n3.signal })).finally(() => {
          clearTimeout(d), p3.removeEventListener("abort", f5);
        });
      }
      return h3(o3, v(v({}, c3), {}, { signal: n3.signal })).finally(() => clearTimeout(d));
    } : this.fetch = h3, this.retry = u3;
  }
  from(e) {
    if (!e || typeof e != "string" || e.trim() === "") throw new Error("Invalid relation name: relation must be a non-empty string.");
    return new T2(new URL(`${this.url}/${e}`), { headers: new Headers(this.headers), schema: this.schemaName, fetch: this.fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  schema(e) {
    return new x3(this.url, { headers: this.headers, schema: e, fetch: this.fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
  rpc(e, r = {}, { head: s = false, get: l = false, count: a } = {}) {
    var i4;
    let u3, h3 = new URL(`${this.url}/rpc/${e}`), o3, c3 = (p3) => p3 !== null && typeof p3 == "object" && (!Array.isArray(p3) || p3.some(c3)), n3 = s && Object.values(r).some(c3);
    n3 ? (u3 = "POST", o3 = r) : s || l ? (u3 = s ? "HEAD" : "GET", Object.entries(r).filter(([p3, f5]) => f5 !== void 0).map(([p3, f5]) => [p3, Array.isArray(f5) ? `{${f5.join(",")}}` : `${f5}`]).forEach(([p3, f5]) => {
      h3.searchParams.append(p3, f5);
    })) : (u3 = "POST", o3 = r);
    let d = new Headers(this.headers);
    return n3 ? d.set("Prefer", a ? `count=${a},return=minimal` : "return=minimal") : a && d.set("Prefer", `count=${a}`), new m({ method: u3, url: h3, headers: d, schema: this.schemaName, body: o3, fetch: (i4 = this.fetch) !== null && i4 !== void 0 ? i4 : fetch, urlLengthLimit: this.urlLengthLimit, retry: this.retry });
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/realtime-js@2.108.1/denonext/realtime-js.mjs
import __Process$ from "node:process";

// supabase/functions/_vendor/esm.sh/@supabase/phoenix@0.4.5/denonext/phoenix.mjs
var k = (e) => typeof e == "function" ? e : function() {
  return e;
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
  constructor(e, t, i4, s) {
    this.channel = e, this.event = t, this.payload = i4 || function() {
      return {};
    }, this.receivedResp = null, this.timeout = s, this.timeoutTimer = null, this.recHooks = [], this.sent = false, this.ref = void 0;
  }
  resend(e) {
    this.timeout = e, this.reset(), this.send();
  }
  send() {
    this.hasReceived("timeout") || (this.startTimeout(), this.sent = true, this.channel.socket.push({ topic: this.channel.topic, event: this.event, payload: this.payload(), ref: this.ref, join_ref: this.channel.joinRef() }));
  }
  receive(e, t) {
    return this.hasReceived(e) && t(this.receivedResp.response), this.recHooks.push({ status: e, callback: t }), this;
  }
  reset() {
    this.cancelRefEvent(), this.ref = null, this.refEvent = null, this.receivedResp = null, this.sent = false;
  }
  destroy() {
    this.cancelRefEvent(), this.cancelTimeout();
  }
  matchReceive({ status: e, response: t, _ref: i4 }) {
    this.recHooks.filter((s) => s.status === e).forEach((s) => s.callback(t));
  }
  cancelRefEvent() {
    this.refEvent && this.channel.off(this.refEvent);
  }
  cancelTimeout() {
    clearTimeout(this.timeoutTimer), this.timeoutTimer = null;
  }
  startTimeout() {
    this.timeoutTimer && this.cancelTimeout(), this.ref = this.channel.socket.makeRef(), this.refEvent = this.channel.replyEventName(this.ref), this.channel.on(this.refEvent, (e) => {
      this.cancelRefEvent(), this.cancelTimeout(), this.receivedResp = e, this.matchReceive(e);
    }), this.timeoutTimer = setTimeout(() => {
      this.trigger("timeout", {});
    }, this.timeout);
  }
  hasReceived(e) {
    return this.receivedResp && this.receivedResp.status === e;
  }
  trigger(e, t) {
    this.channel.trigger(this.refEvent, { status: e, response: t });
  }
};
var H3 = class {
  constructor(e, t) {
    this.callback = e, this.timerCalc = t, this.timer = void 0, this.tries = 0;
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
  constructor(e, t, i4) {
    this.state = f3.closed, this.topic = e, this.params = k(t || {}), this.socket = i4, this.bindings = [], this.bindingRef = 0, this.timeout = this.socket.timeout, this.joinedOnce = false, this.joinPush = new E4(this, T3.join, this.params, this.timeout), this.pushBuffer = [], this.stateChangeRefs = [], this.rejoinTimer = new H3(() => {
      this.socket.isConnected() && this.rejoin();
    }, this.socket.rejoinAfterMs), this.stateChangeRefs.push(this.socket.onError(() => this.rejoinTimer.reset())), this.stateChangeRefs.push(this.socket.onOpen(() => {
      this.rejoinTimer.reset(), this.isErrored() && this.rejoin();
    })), this.joinPush.receive("ok", () => {
      this.state = f3.joined, this.rejoinTimer.reset(), this.pushBuffer.forEach((s) => s.send()), this.pushBuffer = [];
    }), this.joinPush.receive("error", (s) => {
      this.state = f3.errored, this.socket.hasLogger() && this.socket.log("channel", `error ${this.topic}`, s), this.socket.isConnected() && this.rejoinTimer.scheduleTimeout();
    }), this.onClose(() => {
      this.rejoinTimer.reset(), this.socket.hasLogger() && this.socket.log("channel", `close ${this.topic}`), this.state = f3.closed, this.socket.remove(this);
    }), this.onError((s) => {
      this.socket.hasLogger() && this.socket.log("channel", `error ${this.topic}`, s), this.isJoining() && this.joinPush.reset(), this.state = f3.errored, this.socket.isConnected() && this.rejoinTimer.scheduleTimeout();
    }), this.joinPush.receive("timeout", () => {
      this.socket.hasLogger() && this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout), new E4(this, T3.leave, k({}), this.timeout).send(), this.state = f3.errored, this.joinPush.reset(), this.socket.isConnected() && this.rejoinTimer.scheduleTimeout();
    }), this.on(T3.reply, (s, n3) => {
      this.trigger(this.replyEventName(n3), s);
    });
  }
  join(e = this.timeout) {
    if (this.joinedOnce) throw new Error("tried to join multiple times. 'join' can only be called a single time per channel instance");
    return this.timeout = e, this.joinedOnce = true, this.rejoin(), this.joinPush;
  }
  teardown() {
    this.pushBuffer.forEach((e) => e.destroy()), this.pushBuffer = [], this.rejoinTimer.reset(), this.joinPush.destroy(), this.state = f3.closed, this.bindings = [];
  }
  onClose(e) {
    this.on(T3.close, e);
  }
  onError(e) {
    return this.on(T3.error, (t) => e(t));
  }
  on(e, t) {
    let i4 = this.bindingRef++;
    return this.bindings.push({ event: e, ref: i4, callback: t }), i4;
  }
  off(e, t) {
    this.bindings = this.bindings.filter((i4) => !(i4.event === e && (typeof t > "u" || t === i4.ref)));
  }
  canPush() {
    return this.socket.isConnected() && this.isJoined();
  }
  push(e, t, i4 = this.timeout) {
    if (t = t || {}, !this.joinedOnce) throw new Error(`tried to push '${e}' to '${this.topic}' before joining. Use channel.join() before pushing events`);
    let s = new E4(this, e, function() {
      return t;
    }, i4);
    return this.canPush() ? s.send() : (s.startTimeout(), this.pushBuffer.push(s)), s;
  }
  leave(e = this.timeout) {
    this.rejoinTimer.reset(), this.joinPush.cancelTimeout(), this.state = f3.leaving;
    let t = () => {
      this.socket.hasLogger() && this.socket.log("channel", `leave ${this.topic}`), this.trigger(T3.close, "leave");
    }, i4 = new E4(this, T3.leave, k({}), e);
    return i4.receive("ok", () => t()).receive("timeout", () => t()), i4.send(), this.canPush() || i4.trigger("ok", {}), i4;
  }
  onMessage(e, t, i4) {
    return t;
  }
  filterBindings(e, t, i4) {
    return true;
  }
  isMember(e, t, i4, s) {
    return this.topic !== e ? false : s && s !== this.joinRef() ? (this.socket.hasLogger() && this.socket.log("channel", "dropping outdated message", { topic: e, event: t, payload: i4, joinRef: s }), false) : true;
  }
  joinRef() {
    return this.joinPush.ref;
  }
  rejoin(e = this.timeout) {
    this.isLeaving() || (this.socket.leaveOpenTopic(this.topic), this.state = f3.joining, this.joinPush.resend(e));
  }
  trigger(e, t, i4, s) {
    let n3 = this.onMessage(e, t, i4, s);
    if (t && !n3) throw new Error("channel onMessage callbacks must return the payload, modified or unmodified");
    let o3 = this.bindings.filter((h3) => h3.event === e && this.filterBindings(h3, t, i4));
    for (let h3 = 0; h3 < o3.length; h3++) o3[h3].callback(n3, i4, s || this.joinRef());
  }
  replyEventName(e) {
    return `chan_reply_${e}`;
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
  static request(e, t, i4, s, n3, o3, h3) {
    if (m2.XDomainRequest) {
      let r = new m2.XDomainRequest();
      return this.xdomainRequest(r, e, t, s, n3, o3, h3);
    } else if (m2.XMLHttpRequest) {
      let r = new m2.XMLHttpRequest();
      return this.xhrRequest(r, e, t, i4, s, n3, o3, h3);
    } else {
      if (m2.fetch && m2.AbortController) return this.fetchRequest(e, t, i4, s, n3, o3, h3);
      throw new Error("No suitable XMLHttpRequest implementation found");
    }
  }
  static fetchRequest(e, t, i4, s, n3, o3, h3) {
    let r = { method: e, headers: i4, body: s }, a = null;
    if (n3) {
      a = new AbortController();
      let l = setTimeout(() => a.abort(), n3);
      r.signal = a.signal;
    }
    return m2.fetch(t, r).then((l) => l.text()).then((l) => this.parseJSON(l)).then((l) => h3 && h3(l)).catch((l) => {
      l.name === "AbortError" && o3 ? o3() : h3 && h3(null);
    }), a;
  }
  static xdomainRequest(e, t, i4, s, n3, o3, h3) {
    return e.timeout = n3, e.open(t, i4), e.onload = () => {
      let r = this.parseJSON(e.responseText);
      h3 && h3(r);
    }, o3 && (e.ontimeout = o3), e.onprogress = () => {
    }, e.send(s), e;
  }
  static xhrRequest(e, t, i4, s, n3, o3, h3, r) {
    e.open(t, i4, true), e.timeout = o3;
    for (let [a, l] of Object.entries(s)) e.setRequestHeader(a, l);
    return e.onerror = () => r && r(null), e.onreadystatechange = () => {
      if (e.readyState === x4.complete && r) {
        let a = this.parseJSON(e.responseText);
        r(a);
      }
    }, h3 && (e.ontimeout = h3), e.send(n3), e;
  }
  static parseJSON(e) {
    if (!e || e === "") return null;
    try {
      return JSON.parse(e);
    } catch {
      return console && console.log("failed to parse JSON response", e), null;
    }
  }
  static serialize(e, t) {
    let i4 = [];
    for (var s in e) {
      if (!Object.prototype.hasOwnProperty.call(e, s)) continue;
      let n3 = t ? `${t}[${s}]` : s, o3 = e[s];
      typeof o3 == "object" ? i4.push(this.serialize(o3, n3)) : i4.push(encodeURIComponent(n3) + "=" + encodeURIComponent(o3));
    }
    return i4.join("&");
  }
  static appendParams(e, t) {
    if (Object.keys(t).length === 0) return e;
    let i4 = e.match(/\?/) ? "&" : "?";
    return `${e}${i4}${this.serialize(t)}`;
  }
};
var M2 = (e) => {
  let t = "", i4 = new Uint8Array(e), s = i4.byteLength;
  for (let n3 = 0; n3 < s; n3++) t += String.fromCharCode(i4[n3]);
  return btoa(t);
};
var y2 = class {
  constructor(e, t) {
    t && t.length === 2 && t[1].startsWith(A4) && (this.authToken = atob(t[1].slice(A4.length))), this.endPoint = null, this.token = null, this.skipHeartbeat = true, this.reqs = /* @__PURE__ */ new Set(), this.awaitingBatchAck = false, this.currentBatch = null, this.currentBatchTimer = null, this.batchBuffer = [], this.onopen = function() {
    }, this.onerror = function() {
    }, this.onmessage = function() {
    }, this.onclose = function() {
    }, this.pollEndpoint = this.normalizeEndpoint(e), this.readyState = b2.connecting, setTimeout(() => this.poll(), 0);
  }
  normalizeEndpoint(e) {
    return e.replace("ws://", "http://").replace("wss://", "https://").replace(new RegExp("(.*)/" + w.websocket), "$1/" + w.longpoll);
  }
  endpointURL() {
    return j2.appendParams(this.pollEndpoint, { token: this.token });
  }
  closeAndRetry(e, t, i4) {
    this.close(e, t, i4), this.readyState = b2.connecting;
  }
  ontimeout() {
    this.onerror("timeout"), this.closeAndRetry(1005, "timeout", false);
  }
  isActive() {
    return this.readyState === b2.open || this.readyState === b2.connecting;
  }
  poll() {
    let e = { Accept: "application/json" };
    this.authToken && (e["X-Phoenix-AuthToken"] = this.authToken), this.ajax("GET", e, null, () => this.ontimeout(), (t) => {
      if (t) {
        var { status: i4, token: s, messages: n3 } = t;
        if (i4 === 410 && this.token !== null) {
          this.onerror(410), this.closeAndRetry(3410, "session_gone", false);
          return;
        }
        this.token = s;
      } else i4 = 0;
      switch (i4) {
        case 200:
          n3.forEach((o3) => {
            setTimeout(() => this.onmessage({ data: o3 }), 0);
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
          throw new Error(`unhandled poll status ${i4}`);
      }
    });
  }
  send(e) {
    typeof e != "string" && (e = M2(e)), this.currentBatch ? this.currentBatch.push(e) : this.awaitingBatchAck ? this.batchBuffer.push(e) : (this.currentBatch = [e], this.currentBatchTimer = setTimeout(() => {
      this.batchSend(this.currentBatch), this.currentBatch = null;
    }, 0));
  }
  batchSend(e, t = 0) {
    this.awaitingBatchAck = true;
    let i4 = t + N3, s = e.slice(t, i4);
    this.ajax("POST", { "Content-Type": "application/x-ndjson" }, s.join(`
`), () => this.onerror("timeout"), (n3) => {
      !n3 || n3.status !== 200 ? (this.awaitingBatchAck = false, this.onerror(n3 && n3.status), this.closeAndRetry(1011, "internal server error", false)) : i4 < e.length ? this.batchSend(e, i4) : this.batchBuffer.length > 0 ? (this.batchSend(this.batchBuffer), this.batchBuffer = []) : this.awaitingBatchAck = false;
    });
  }
  close(e, t, i4) {
    for (let n3 of this.reqs) n3.abort();
    this.readyState = b2.closed;
    let s = Object.assign({ code: 1e3, reason: void 0, wasClean: true }, { code: e, reason: t, wasClean: i4 });
    this.batchBuffer = [], clearTimeout(this.currentBatchTimer), this.currentBatchTimer = null, typeof CloseEvent < "u" ? this.onclose(new CloseEvent("close", s)) : this.onclose(s);
  }
  ajax(e, t, i4, s, n3) {
    let o3, h3 = () => {
      this.reqs.delete(o3), s();
    };
    o3 = j2.request(e, this.endpointURL(), t, i4, this.timeout, h3, (r) => {
      this.reqs.delete(o3), this.isActive() && n3(r);
    }), this.reqs.add(o3);
  }
};
var D2 = class S4 {
  constructor(t, i4 = {}) {
    let s = i4.events || { state: "presence_state", diff: "presence_diff" };
    this.state = /* @__PURE__ */ Object.create(null), this.pendingDiffs = [], this.channel = t, this.joinRef = null, this.caller = { onJoin: function() {
    }, onLeave: function() {
    }, onSync: function() {
    } }, this.channel.on(s.state, (n3) => {
      let { onJoin: o3, onLeave: h3, onSync: r } = this.caller;
      this.joinRef = this.channel.joinRef(), this.state = S4.syncState(this.state, n3, o3, h3), this.pendingDiffs.forEach((a) => {
        this.state = S4.syncDiff(this.state, a, o3, h3);
      }), this.pendingDiffs = [], r();
    }), this.channel.on(s.diff, (n3) => {
      let { onJoin: o3, onLeave: h3, onSync: r } = this.caller;
      this.inPendingSyncState() ? this.pendingDiffs.push(n3) : (this.state = S4.syncDiff(this.state, n3, o3, h3), r());
    });
  }
  onJoin(t) {
    this.caller.onJoin = t;
  }
  onLeave(t) {
    this.caller.onLeave = t;
  }
  onSync(t) {
    this.caller.onSync = t;
  }
  list(t) {
    return S4.list(this.state, t);
  }
  inPendingSyncState() {
    return !this.joinRef || this.joinRef !== this.channel.joinRef();
  }
  static syncState(t, i4, s, n3) {
    let o3 = this.toNullProtoObj(this.clone(t));
    i4 = this.toNullProtoObj(i4);
    let h3 = /* @__PURE__ */ Object.create(null), r = /* @__PURE__ */ Object.create(null);
    return this.map(o3, (a, l) => {
      i4[a] || (r[a] = l);
    }), this.map(i4, (a, l) => {
      let u3 = o3[a];
      if (u3) {
        let g2 = l.metas.map((c3) => c3.phx_ref), d = u3.metas.map((c3) => c3.phx_ref), p3 = l.metas.filter((c3) => d.indexOf(c3.phx_ref) < 0), v3 = u3.metas.filter((c3) => g2.indexOf(c3.phx_ref) < 0);
        p3.length > 0 && (h3[a] = l, h3[a].metas = p3), v3.length > 0 && (r[a] = this.clone(u3), r[a].metas = v3);
      } else h3[a] = l;
    }), this.syncDiff(o3, { joins: h3, leaves: r }, s, n3);
  }
  static syncDiff(t, i4, s, n3) {
    t = this.toNullProtoObj(t);
    let { joins: o3, leaves: h3 } = this.clone(i4);
    return s || (s = function() {
    }), n3 || (n3 = function() {
    }), this.map(o3, (r, a) => {
      let l = t[r];
      if (t[r] = this.clone(a), l) {
        let u3 = t[r].metas.map((d) => d.phx_ref), g2 = l.metas.filter((d) => u3.indexOf(d.phx_ref) < 0);
        t[r].metas.unshift(...g2);
      }
      s(r, l, a);
    }), this.map(h3, (r, a) => {
      let l = t[r];
      if (!l) return;
      let u3 = a.metas.map((g2) => g2.phx_ref);
      l.metas = l.metas.filter((g2) => u3.indexOf(g2.phx_ref) < 0), n3(r, l, a), l.metas.length === 0 && delete t[r];
    }), t;
  }
  static list(t, i4) {
    return i4 || (i4 = function(s, n3) {
      return n3;
    }), this.map(t, (s, n3) => i4(s, n3));
  }
  static map(t, i4) {
    return Object.getOwnPropertyNames(t).map((s) => i4(s, t[s]));
  }
  static toNullProtoObj(t) {
    if (Object.getPrototypeOf(t) === null) return t;
    let i4 = /* @__PURE__ */ Object.create(null);
    return Object.getOwnPropertyNames(t).forEach((s) => {
      i4[s] = t[s];
    }), i4;
  }
  static clone(t) {
    return JSON.parse(JSON.stringify(t));
  }
};
var R2 = { HEADER_LENGTH: 1, META_LENGTH: 4, KINDS: { push: 0, reply: 1, broadcast: 2 }, encode(e, t) {
  if (e.payload.constructor === ArrayBuffer) return t(this.binaryEncode(e));
  {
    let i4 = [e.join_ref, e.ref, e.topic, e.event, e.payload];
    return t(JSON.stringify(i4));
  }
}, decode(e, t) {
  if (e.constructor === ArrayBuffer) return t(this.binaryDecode(e));
  {
    let [i4, s, n3, o3, h3] = JSON.parse(e);
    return t({ join_ref: i4, ref: s, topic: n3, event: o3, payload: h3 });
  }
}, binaryEncode(e) {
  let { join_ref: t, ref: i4, event: s, topic: n3, payload: o3 } = e, h3 = new TextEncoder(), r = h3.encode(t), a = h3.encode(i4), l = h3.encode(n3), u3 = h3.encode(s);
  this.assertFieldSize(r.byteLength, "join_ref"), this.assertFieldSize(a.byteLength, "ref"), this.assertFieldSize(l.byteLength, "topic"), this.assertFieldSize(u3.byteLength, "event");
  let g2 = this.META_LENGTH + r.byteLength + a.byteLength + l.byteLength + u3.byteLength, d = new ArrayBuffer(this.HEADER_LENGTH + g2), p3 = new Uint8Array(d), v3 = new DataView(d), c3 = 0;
  v3.setUint8(c3++, this.KINDS.push), v3.setUint8(c3++, r.byteLength), v3.setUint8(c3++, a.byteLength), v3.setUint8(c3++, l.byteLength), v3.setUint8(c3++, u3.byteLength), p3.set(r, c3), c3 += r.byteLength, p3.set(a, c3), c3 += a.byteLength, p3.set(l, c3), c3 += l.byteLength, p3.set(u3, c3), c3 += u3.byteLength;
  var L6 = new Uint8Array(d.byteLength + o3.byteLength);
  return L6.set(p3, 0), L6.set(new Uint8Array(o3), d.byteLength), L6.buffer;
}, assertFieldSize(e, t) {
  if (e > 255) throw new Error(`unable to convert ${t} to binary: must be less than or equal to 255 bytes, but is ${e} bytes`);
}, binaryDecode(e) {
  let t = new DataView(e), i4 = t.getUint8(0), s = new TextDecoder();
  switch (i4) {
    case this.KINDS.push:
      return this.decodePush(e, t, s);
    case this.KINDS.reply:
      return this.decodeReply(e, t, s);
    case this.KINDS.broadcast:
      return this.decodeBroadcast(e, t, s);
  }
}, decodePush(e, t, i4) {
  let s = t.getUint8(1), n3 = t.getUint8(2), o3 = t.getUint8(3), h3 = this.HEADER_LENGTH + this.META_LENGTH - 1, r = i4.decode(e.slice(h3, h3 + s));
  h3 = h3 + s;
  let a = i4.decode(e.slice(h3, h3 + n3));
  h3 = h3 + n3;
  let l = i4.decode(e.slice(h3, h3 + o3));
  h3 = h3 + o3;
  let u3 = e.slice(h3, e.byteLength);
  return { join_ref: r, ref: null, topic: a, event: l, payload: u3 };
}, decodeReply(e, t, i4) {
  let s = t.getUint8(1), n3 = t.getUint8(2), o3 = t.getUint8(3), h3 = t.getUint8(4), r = this.HEADER_LENGTH + this.META_LENGTH, a = i4.decode(e.slice(r, r + s));
  r = r + s;
  let l = i4.decode(e.slice(r, r + n3));
  r = r + n3;
  let u3 = i4.decode(e.slice(r, r + o3));
  r = r + o3;
  let g2 = i4.decode(e.slice(r, r + h3));
  r = r + h3;
  let d = e.slice(r, e.byteLength), p3 = { status: g2, response: d };
  return { join_ref: a, ref: l, topic: u3, event: T3.reply, payload: p3 };
}, decodeBroadcast(e, t, i4) {
  let s = t.getUint8(1), n3 = t.getUint8(2), o3 = this.HEADER_LENGTH + 2, h3 = i4.decode(e.slice(o3, o3 + s));
  o3 = o3 + s;
  let r = i4.decode(e.slice(o3, o3 + n3));
  o3 = o3 + n3;
  let a = e.slice(o3, e.byteLength);
  return { join_ref: null, ref: null, topic: h3, event: r, payload: a };
} };
var U2 = class {
  constructor(e, t = {}) {
    this.stateChangeCallbacks = { open: [], close: [], error: [], message: [] }, this.channels = [], this.sendBuffer = [], this.ref = 0, this.fallbackRef = null, this.timeout = t.timeout || O4, this.transport = t.transport || m2.WebSocket || y2, this.conn = void 0, this.primaryPassedHealthCheck = false, this.longPollFallbackMs = t.longPollFallbackMs, this.fallbackTimer = null;
    let i4 = null;
    try {
      i4 = m2 && m2.sessionStorage;
    } catch {
    }
    this.sessionStore = t.sessionStorage || i4, this.establishedConnections = 0, this.defaultEncoder = R2.encode.bind(R2), this.defaultDecoder = R2.decode.bind(R2), this.closeWasClean = true, this.disconnecting = false, this.binaryType = t.binaryType || "arraybuffer", this.connectClock = 1, this.pageHidden = false, this.encode = void 0, this.decode = void 0, this.transport !== y2 ? (this.encode = t.encode || this.defaultEncoder, this.decode = t.decode || this.defaultDecoder) : (this.encode = this.defaultEncoder, this.decode = this.defaultDecoder);
    let s = null;
    C3 && C3.addEventListener && (C3.addEventListener("pagehide", (n3) => {
      this.conn && (this.disconnect(), s = this.connectClock);
    }), C3.addEventListener("pageshow", (n3) => {
      s === this.connectClock && (s = null, this.connect());
    }), C3.addEventListener("visibilitychange", () => {
      document.visibilityState === "hidden" ? this.pageHidden = true : (this.pageHidden = false, !this.isConnected() && !this.closeWasClean && this.teardown(() => this.connect()));
    })), this.heartbeatIntervalMs = t.heartbeatIntervalMs || 3e4, this.autoSendHeartbeat = t.autoSendHeartbeat ?? true, this.heartbeatCallback = t.heartbeatCallback ?? (() => {
    }), this.rejoinAfterMs = (n3) => t.rejoinAfterMs ? t.rejoinAfterMs(n3) : [1e3, 2e3, 5e3][n3 - 1] || 1e4, this.reconnectAfterMs = (n3) => t.reconnectAfterMs ? t.reconnectAfterMs(n3) : [10, 50, 100, 150, 200, 250, 500, 1e3, 2e3][n3 - 1] || 5e3, this.logger = t.logger || null, !this.logger && t.debug && (this.logger = (n3, o3, h3) => {
      console.log(`${n3}: ${o3}`, h3);
    }), this.longpollerTimeout = t.longpollerTimeout || 2e4, this.params = k(t.params || {}), this.endPoint = `${e}/${w.websocket}`, this.vsn = t.vsn || B2, this.heartbeatTimeoutTimer = null, this.heartbeatTimer = null, this.heartbeatSentAt = null, this.pendingHeartbeatRef = null, this.reconnectTimer = new H3(() => {
      if (this.pageHidden) {
        this.log("Not reconnecting as page is hidden!"), this.teardown();
        return;
      }
      this.teardown(async () => {
        t.beforeReconnect && await t.beforeReconnect(), this.connect();
      });
    }, this.reconnectAfterMs), this.authToken = t.authToken && k(t.authToken);
  }
  getLongPollTransport() {
    return y2;
  }
  replaceTransport(e) {
    this.connectClock++, this.closeWasClean = true, clearTimeout(this.fallbackTimer), this.reconnectTimer.reset(), this.conn && (this.conn.close(), this.conn = null), this.transport = e;
  }
  protocol() {
    return location.protocol.match(/^https/) ? "wss" : "ws";
  }
  endPointURL() {
    let e = j2.appendParams(j2.appendParams(this.endPoint, this.params()), { vsn: this.vsn });
    return e.charAt(0) !== "/" ? e : e.charAt(1) === "/" ? `${this.protocol()}:${e}` : `${this.protocol()}://${location.host}${e}`;
  }
  disconnect(e, t, i4) {
    this.connectClock++, this.disconnecting = true, this.closeWasClean = true, clearTimeout(this.fallbackTimer), this.reconnectTimer.reset(), this.teardown(() => {
      this.disconnecting = false, e && e();
    }, t, i4);
  }
  connect(e) {
    e && (console && console.log("passing params to connect is deprecated. Instead pass :params to the Socket constructor"), this.params = k(e)), !(this.conn && !this.disconnecting) && (this.longPollFallbackMs && this.transport !== y2 ? this.connectWithFallback(y2, this.longPollFallbackMs) : this.transportConnect());
  }
  log(e, t, i4) {
    this.logger && this.logger(e, t, i4);
  }
  hasLogger() {
    return this.logger !== null;
  }
  onOpen(e) {
    let t = this.makeRef();
    return this.stateChangeCallbacks.open.push([t, e]), t;
  }
  onClose(e) {
    let t = this.makeRef();
    return this.stateChangeCallbacks.close.push([t, e]), t;
  }
  onError(e) {
    let t = this.makeRef();
    return this.stateChangeCallbacks.error.push([t, e]), t;
  }
  onMessage(e) {
    let t = this.makeRef();
    return this.stateChangeCallbacks.message.push([t, e]), t;
  }
  onHeartbeat(e) {
    this.heartbeatCallback = e;
  }
  ping(e) {
    if (!this.isConnected()) return false;
    let t = this.makeRef(), i4 = Date.now();
    this.push({ topic: "phoenix", event: "heartbeat", payload: {}, ref: t });
    let s = this.onMessage((n3) => {
      n3.ref === t && (this.off([s]), e(Date.now() - i4));
    });
    return true;
  }
  transportName(e) {
    return e === y2 ? "LongPoll" : e.name;
  }
  transportConnect() {
    this.connectClock++, this.closeWasClean = false;
    let e;
    this.authToken && (e = ["phoenix", `${A4}${btoa(this.authToken()).replace(/=/g, "")}`]), this.conn = new this.transport(this.endPointURL(), e), this.conn.binaryType = this.binaryType, this.conn.timeout = this.longpollerTimeout, this.conn.onopen = () => this.onConnOpen(), this.conn.onerror = (t) => this.onConnError(t), this.conn.onmessage = (t) => this.onConnMessage(t), this.conn.onclose = (t) => this.onConnClose(t);
  }
  getSession(e) {
    return this.sessionStore && this.sessionStore.getItem(e);
  }
  storeSession(e, t) {
    this.sessionStore && this.sessionStore.setItem(e, t);
  }
  connectWithFallback(e, t = 2500) {
    clearTimeout(this.fallbackTimer);
    let i4 = false, s = true, n3, o3, h3 = this.transportName(e), r = (a) => {
      this.log("transport", `falling back to ${h3}...`, a), this.off([n3, o3]), s = false, this.replaceTransport(e), this.transportConnect();
    };
    if (this.getSession(`phx:fallback:${h3}`)) return r("memorized");
    this.fallbackTimer = setTimeout(r, t), o3 = this.onError((a) => {
      this.log("transport", "error", a), s && !i4 && (clearTimeout(this.fallbackTimer), r(a));
    }), this.fallbackRef && this.off([this.fallbackRef]), this.fallbackRef = this.onOpen(() => {
      if (i4 = true, !s) {
        let a = this.transportName(e);
        return this.primaryPassedHealthCheck || this.storeSession(`phx:fallback:${a}`, "true"), this.log("transport", `established ${a} fallback`);
      }
      clearTimeout(this.fallbackTimer), this.fallbackTimer = setTimeout(r, t), this.ping((a) => {
        this.log("transport", "connected to primary after", a), this.primaryPassedHealthCheck = true, clearTimeout(this.fallbackTimer);
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
      } catch (e) {
        this.log("error", "error in heartbeat callback", e);
      }
      this.triggerChanError(new Error("heartbeat timeout")), this.closeWasClean = false, this.teardown(() => this.reconnectTimer.scheduleTimeout(), P2, "heartbeat timeout");
    }
  }
  resetHeartbeat() {
    this.conn && this.conn.skipHeartbeat || (this.pendingHeartbeatRef = null, this.clearHeartbeats(), this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs));
  }
  teardown(e, t, i4) {
    if (!this.conn) return e && e();
    let s = this.conn;
    this.waitForBufferDone(s, () => {
      t ? s.close(t, i4 || "") : s.close(), this.waitForSocketClosed(s, () => {
        this.conn === s && (this.conn.onopen = function() {
        }, this.conn.onerror = function() {
        }, this.conn.onmessage = function() {
        }, this.conn.onclose = function() {
        }, this.conn = null), e && e();
      });
    });
  }
  waitForBufferDone(e, t, i4 = 1) {
    if (i4 === 5 || !e.bufferedAmount) {
      t();
      return;
    }
    setTimeout(() => {
      this.waitForBufferDone(e, t, i4 + 1);
    }, 150 * i4);
  }
  waitForSocketClosed(e, t, i4 = 1) {
    if (i4 === 5 || e.readyState === b2.closed) {
      t();
      return;
    }
    setTimeout(() => {
      this.waitForSocketClosed(e, t, i4 + 1);
    }, 150 * i4);
  }
  onConnClose(e) {
    this.conn && (this.conn.onclose = () => {
    }), this.hasLogger() && this.log("transport", "close", e), this.triggerChanError(e), this.clearHeartbeats(), this.closeWasClean || this.reconnectTimer.scheduleTimeout(), this.triggerStateCallbacks("close", e);
  }
  onConnError(e) {
    this.hasLogger() && this.log("transport", "error", e);
    let t = this.transport, i4 = this.establishedConnections;
    this.triggerStateCallbacks("error", e, t, i4), (t === this.transport || i4 > 0) && this.triggerChanError(e);
  }
  triggerChanError(e) {
    this.channels.forEach((t) => {
      t.isErrored() || t.isLeaving() || t.isClosed() || t.trigger(T3.error, e);
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
  remove(e) {
    this.off(e.stateChangeRefs), this.channels = this.channels.filter((t) => t !== e);
  }
  off(e) {
    for (let t in this.stateChangeCallbacks) this.stateChangeCallbacks[t] = this.stateChangeCallbacks[t].filter(([i4]) => e.indexOf(i4) === -1);
  }
  channel(e, t = {}) {
    let i4 = new $2(e, t, this);
    return this.channels.push(i4), i4;
  }
  push(e) {
    if (this.hasLogger()) {
      let { topic: t, event: i4, payload: s, ref: n3, join_ref: o3 } = e;
      this.log("push", `${t} ${i4} (${o3}, ${n3})`, s);
    }
    this.isConnected() ? this.encode(e, (t) => this.conn.send(t)) : this.sendBuffer.push(() => this.encode(e, (t) => this.conn.send(t)));
  }
  makeRef() {
    let e = this.ref + 1;
    return e === this.ref ? this.ref = 0 : this.ref = e, this.ref.toString();
  }
  sendHeartbeat() {
    if (!this.isConnected()) {
      try {
        this.heartbeatCallback("disconnected");
      } catch (e) {
        this.log("error", "error in heartbeat callback", e);
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
    } catch (e) {
      this.log("error", "error in heartbeat callback", e);
    }
    this.heartbeatTimeoutTimer = setTimeout(() => this.heartbeatTimeout(), this.heartbeatIntervalMs);
  }
  flushSendBuffer() {
    this.isConnected() && this.sendBuffer.length > 0 && (this.sendBuffer.forEach((e) => e()), this.sendBuffer = []);
  }
  onConnMessage(e) {
    this.decode(e.data, (t) => {
      let { topic: i4, event: s, payload: n3, ref: o3, join_ref: h3 } = t;
      if (o3 && o3 === this.pendingHeartbeatRef) {
        let r = this.heartbeatSentAt ? Date.now() - this.heartbeatSentAt : void 0;
        this.clearHeartbeats();
        try {
          this.heartbeatCallback(n3.status === "ok" ? "ok" : "error", r);
        } catch (a) {
          this.log("error", "error in heartbeat callback", a);
        }
        this.pendingHeartbeatRef = null, this.heartbeatSentAt = null, this.autoSendHeartbeat && (this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs));
      }
      this.hasLogger() && this.log("receive", `${n3.status || ""} ${i4} ${s} ${o3 && "(" + o3 + ")" || ""}`.trim(), n3);
      for (let r = 0; r < this.channels.length; r++) {
        let a = this.channels[r];
        a.isMember(i4, s, n3, h3) && a.trigger(s, n3, o3, h3);
      }
      this.triggerStateCallbacks("message", t);
    });
  }
  triggerStateCallbacks(e, ...t) {
    try {
      this.stateChangeCallbacks[e].forEach(([i4, s]) => {
        try {
          s(...t);
        } catch (n3) {
          this.log("error", `error in ${e} callback`, n3);
        }
      });
    } catch (i4) {
      this.log("error", `error triggering ${e} callbacks`, i4);
    }
  }
  leaveOpenTopic(e) {
    let t = this.channels.find((i4) => i4.topic === e && (i4.isJoined() || i4.isJoining()));
    t && (this.hasLogger() && this.log("transport", `leaving duplicate topic "${e}"`), t.leave());
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/realtime-js@2.108.1/denonext/realtime-js.mjs
var B3 = class {
  constructor() {
  }
  static detectEnvironment() {
    var e;
    if (typeof WebSocket < "u") return { type: "native", wsConstructor: WebSocket };
    let t = globalThis;
    if (typeof globalThis < "u" && typeof t.WebSocket < "u") return { type: "native", wsConstructor: t.WebSocket };
    let r = typeof globalThis < "u" ? globalThis : void 0;
    if (r && typeof r.WebSocket < "u") return { type: "native", wsConstructor: r.WebSocket };
    if (typeof globalThis < "u" && typeof t.WebSocketPair < "u" && typeof globalThis.WebSocket > "u") return { type: "cloudflare", error: "Cloudflare Workers detected. WebSocket clients are not supported in Cloudflare Workers.", workaround: "Use Cloudflare Workers WebSocket API for server-side WebSocket handling, or deploy to a different runtime." };
    if (typeof globalThis < "u" && t.EdgeRuntime || typeof navigator < "u" && (!((e = navigator.userAgent) === null || e === void 0) && e.includes("Vercel-Edge"))) return { type: "unsupported", error: "Edge runtime detected (Vercel Edge/Netlify Edge). WebSockets are not supported in edge functions.", workaround: "Use serverless functions or a different deployment target for WebSocket functionality." };
    let s = __Process$;
    if (s) {
      let i4 = s.versions;
      if (i4 && i4.node) {
        let o3 = i4.node, a = parseInt(o3.replace(/^v/, "").split(".")[0]);
        return a >= 22 ? typeof globalThis.WebSocket < "u" ? { type: "native", wsConstructor: globalThis.WebSocket } : { type: "unsupported", error: `Node.js ${a} detected but native WebSocket not found.`, workaround: "Provide a WebSocket implementation via the transport option." } : { type: "unsupported", error: `Node.js ${a} detected without native WebSocket support.`, workaround: `For Node.js < 22, install "ws" package and provide it via the transport option:
import ws from "ws"
new RealtimeClient(url, { transport: ws })` };
      }
    }
    return { type: "unsupported", error: "Unknown JavaScript runtime without WebSocket support.", workaround: "Ensure you're running in a supported environment (browser, Node.js, Deno) or provide a custom WebSocket implementation." };
  }
  static getWebSocketConstructor() {
    let e = this.detectEnvironment();
    if (e.wsConstructor) return e.wsConstructor;
    let t = e.error || "WebSocket not supported in this environment.";
    throw e.workaround && (t += `

Suggested solution: ${e.workaround}`), new Error(t);
  }
  static isWebSocketSupported() {
    try {
      let e = this.detectEnvironment();
      return e.type === "native" || e.type === "ws";
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
  constructor(e) {
    this.HEADER_LENGTH = 1, this.USER_BROADCAST_PUSH_META_LENGTH = 6, this.KINDS = { userBroadcastPush: 3, userBroadcast: 4 }, this.BINARY_ENCODING = 0, this.JSON_ENCODING = 1, this.BROADCAST_EVENT = "broadcast", this.allowedMetadataKeys = [], this.allowedMetadataKeys = e ?? [];
  }
  encode(e, t) {
    if (e.event === this.BROADCAST_EVENT && !(e.payload instanceof ArrayBuffer) && typeof e.payload.event == "string") return t(this._binaryEncodeUserBroadcastPush(e));
    let r = [e.join_ref, e.ref, e.topic, e.event, e.payload];
    return t(JSON.stringify(r));
  }
  _binaryEncodeUserBroadcastPush(e) {
    var t;
    return this._isArrayBuffer((t = e.payload) === null || t === void 0 ? void 0 : t.payload) ? this._encodeBinaryUserBroadcastPush(e) : this._encodeJsonUserBroadcastPush(e);
  }
  _encodeBinaryUserBroadcastPush(e) {
    var t, r;
    let s = (r = (t = e.payload) === null || t === void 0 ? void 0 : t.payload) !== null && r !== void 0 ? r : new ArrayBuffer(0);
    return this._encodeUserBroadcastPush(e, this.BINARY_ENCODING, s);
  }
  _encodeJsonUserBroadcastPush(e) {
    var t, r;
    let s = (r = (t = e.payload) === null || t === void 0 ? void 0 : t.payload) !== null && r !== void 0 ? r : {}, o3 = new TextEncoder().encode(JSON.stringify(s)).buffer;
    return this._encodeUserBroadcastPush(e, this.JSON_ENCODING, o3);
  }
  _encodeUserBroadcastPush(e, t, r) {
    var s, i4;
    let o3 = e.topic, a = (s = e.ref) !== null && s !== void 0 ? s : "", c3 = (i4 = e.join_ref) !== null && i4 !== void 0 ? i4 : "", d = e.payload.event, f5 = this.allowedMetadataKeys ? this._pick(e.payload, this.allowedMetadataKeys) : {}, p3 = Object.keys(f5).length === 0 ? "" : JSON.stringify(f5);
    if (c3.length > 255) throw new Error(`joinRef length ${c3.length} exceeds maximum of 255`);
    if (a.length > 255) throw new Error(`ref length ${a.length} exceeds maximum of 255`);
    if (o3.length > 255) throw new Error(`topic length ${o3.length} exceeds maximum of 255`);
    if (d.length > 255) throw new Error(`userEvent length ${d.length} exceeds maximum of 255`);
    if (p3.length > 255) throw new Error(`metadata length ${p3.length} exceeds maximum of 255`);
    let g2 = this.USER_BROADCAST_PUSH_META_LENGTH + c3.length + a.length + o3.length + d.length + p3.length, h3 = new ArrayBuffer(this.HEADER_LENGTH + g2), l = new DataView(h3), m4 = 0;
    l.setUint8(m4++, this.KINDS.userBroadcastPush), l.setUint8(m4++, c3.length), l.setUint8(m4++, a.length), l.setUint8(m4++, o3.length), l.setUint8(m4++, d.length), l.setUint8(m4++, p3.length), l.setUint8(m4++, t), Array.from(c3, (v3) => l.setUint8(m4++, v3.charCodeAt(0))), Array.from(a, (v3) => l.setUint8(m4++, v3.charCodeAt(0))), Array.from(o3, (v3) => l.setUint8(m4++, v3.charCodeAt(0))), Array.from(d, (v3) => l.setUint8(m4++, v3.charCodeAt(0))), Array.from(p3, (v3) => l.setUint8(m4++, v3.charCodeAt(0)));
    var b4 = new Uint8Array(h3.byteLength + r.byteLength);
    return b4.set(new Uint8Array(h3), 0), b4.set(new Uint8Array(r), h3.byteLength), b4.buffer;
  }
  decode(e, t) {
    if (this._isArrayBuffer(e)) {
      let r = this._binaryDecode(e);
      return t(r);
    }
    if (typeof e == "string") {
      let r = JSON.parse(e), [s, i4, o3, a, c3] = r;
      return t({ join_ref: s, ref: i4, topic: o3, event: a, payload: c3 });
    }
    return t({});
  }
  _binaryDecode(e) {
    let t = new DataView(e), r = t.getUint8(0), s = new TextDecoder();
    if (r === this.KINDS.userBroadcast) return this._decodeUserBroadcast(e, t, s);
  }
  _decodeUserBroadcast(e, t, r) {
    let s = t.getUint8(1), i4 = t.getUint8(2), o3 = t.getUint8(3), a = t.getUint8(4), c3 = this.HEADER_LENGTH + 4, d = r.decode(e.slice(c3, c3 + s));
    c3 = c3 + s;
    let f5 = r.decode(e.slice(c3, c3 + i4));
    c3 = c3 + i4;
    let p3 = r.decode(e.slice(c3, c3 + o3));
    c3 = c3 + o3;
    let g2 = e.slice(c3, e.byteLength), h3 = a === this.JSON_ENCODING ? JSON.parse(r.decode(g2)) : g2, l = { type: this.BROADCAST_EVENT, event: f5, payload: h3 };
    return o3 > 0 && (l.meta = JSON.parse(p3)), { join_ref: null, ref: null, topic: d, event: this.BROADCAST_EVENT, payload: l };
  }
  _isArrayBuffer(e) {
    var t;
    return e instanceof ArrayBuffer || ((t = e?.constructor) === null || t === void 0 ? void 0 : t.name) === "ArrayBuffer";
  }
  _pick(e, t) {
    return !e || typeof e != "object" ? {} : Object.fromEntries(Object.entries(e).filter(([r]) => t.includes(r)));
  }
};
var u2;
(function(n3) {
  n3.abstime = "abstime", n3.bool = "bool", n3.date = "date", n3.daterange = "daterange", n3.float4 = "float4", n3.float8 = "float8", n3.int2 = "int2", n3.int4 = "int4", n3.int4range = "int4range", n3.int8 = "int8", n3.int8range = "int8range", n3.json = "json", n3.jsonb = "jsonb", n3.money = "money", n3.numeric = "numeric", n3.oid = "oid", n3.reltime = "reltime", n3.text = "text", n3.time = "time", n3.timestamp = "timestamp", n3.timestamptz = "timestamptz", n3.timetz = "timetz", n3.tsrange = "tsrange", n3.tstzrange = "tstzrange";
})(u2 || (u2 = {}));
var H4 = (n3, e, t = {}) => {
  var r;
  let s = (r = t.skipTypes) !== null && r !== void 0 ? r : [];
  return e ? Object.keys(e).reduce((i4, o3) => (i4[o3] = Z2(o3, n3, e, s), i4), {}) : {};
};
var Z2 = (n3, e, t, r) => {
  let s = e.find((a) => a.name === n3), i4 = s?.type, o3 = t[n3];
  return i4 && !r.includes(i4) ? G2(i4, o3) : I(o3);
};
var G2 = (n3, e) => {
  if (n3.charAt(0) === "_") {
    let t = n3.slice(1, n3.length);
    return ne2(e, t);
  }
  switch (n3) {
    case u2.bool:
      return Q2(e);
    case u2.float4:
    case u2.float8:
    case u2.int2:
    case u2.int4:
    case u2.int8:
    case u2.numeric:
    case u2.oid:
      return ee2(e);
    case u2.json:
    case u2.jsonb:
      return te2(e);
    case u2.timestamp:
      return re2(e);
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
      return I(e);
    default:
      return I(e);
  }
};
var I = (n3) => n3;
var Q2 = (n3) => {
  switch (n3) {
    case "t":
      return true;
    case "f":
      return false;
    default:
      return n3;
  }
};
var ee2 = (n3) => {
  if (typeof n3 == "string") {
    let e = parseFloat(n3);
    if (!Number.isNaN(e)) return e;
  }
  return n3;
};
var te2 = (n3) => {
  if (typeof n3 == "string") try {
    return JSON.parse(n3);
  } catch {
    return n3;
  }
  return n3;
};
var ne2 = (n3, e) => {
  if (typeof n3 != "string") return n3;
  let t = n3.length - 1, r = n3[t];
  if (n3[0] === "{" && r === "}") {
    let i4, o3 = n3.slice(1, t);
    try {
      i4 = JSON.parse("[" + o3 + "]");
    } catch {
      i4 = o3 ? o3.split(",") : [];
    }
    return i4.map((a) => G2(e, a));
  }
  return n3;
};
var re2 = (n3) => typeof n3 == "string" ? n3.replace(" ", "T") : n3;
var U3 = (n3) => {
  let e = new URL(n3);
  return e.protocol = e.protocol.replace(/^ws/i, "http"), e.pathname = e.pathname.replace(/\/+$/, "").replace(/\/socket\/websocket$/i, "").replace(/\/socket$/i, "").replace(/\/websocket$/i, ""), e.pathname === "" || e.pathname === "/" ? e.pathname = "/api/broadcast" : e.pathname = e.pathname + "/api/broadcast", e.href;
};
var S5 = class n {
  constructor(e, t) {
    let r = ae2(t);
    this.presence = new D2(e.getChannel(), r), this.presence.onJoin((s, i4, o3) => {
      let a = n.onJoinPayload(s, i4, o3);
      e.getChannel().trigger("presence", a);
    }), this.presence.onLeave((s, i4, o3) => {
      let a = n.onLeavePayload(s, i4, o3);
      e.getChannel().trigger("presence", a);
    }), this.presence.onSync(() => {
      e.getChannel().trigger("presence", { event: "sync" });
    });
  }
  get state() {
    return n.transformState(this.presence.state);
  }
  static transformState(e) {
    return e = oe2(e), Object.getOwnPropertyNames(e).reduce((t, r) => {
      let s = e[r];
      return t[r] = L3(s), t;
    }, {});
  }
  static onJoinPayload(e, t, r) {
    let s = q3(t), i4 = L3(r);
    return { event: "join", key: e, currentPresences: s, newPresences: i4 };
  }
  static onLeavePayload(e, t, r) {
    let s = q3(t), i4 = L3(r);
    return { event: "leave", key: e, currentPresences: s, leftPresences: i4 };
  }
};
function L3(n3) {
  return n3.metas.map((e) => (e.presence_ref = e.phx_ref, delete e.phx_ref, delete e.phx_ref_prev, e));
}
function oe2(n3) {
  return JSON.parse(JSON.stringify(n3));
}
function ae2(n3) {
  return n3?.events && { events: n3.events };
}
function q3(n3) {
  return n3?.metas ? L3(n3) : [];
}
var M3;
(function(n3) {
  n3.SYNC = "sync", n3.JOIN = "join", n3.LEAVE = "leave";
})(M3 || (M3 = {}));
var A5 = class {
  get state() {
    return this.presenceAdapter.state;
  }
  constructor(e, t) {
    this.channel = e, this.presenceAdapter = new S5(this.channel.channelAdapter, t);
  }
};
function Y2(n3) {
  if (n3 instanceof Error) return n3;
  if (typeof n3 == "string") return new Error(n3);
  if (n3 && typeof n3 == "object") {
    let e = n3;
    if (typeof e.code == "number") {
      let t = typeof e.reason == "string" && e.reason ? ` (${e.reason})` : "";
      return new Error(`socket closed: ${e.code}${t}`, { cause: n3 });
    }
    return new Error("channel error: transport failure", { cause: n3 });
  }
  return new Error("channel error: connection lost");
}
var N4 = class {
  constructor(e, t, r) {
    let s = ce(r);
    this.channel = e.getSocket().channel(t, s), this.socket = e;
  }
  get state() {
    return this.channel.state;
  }
  set state(e) {
    this.channel.state = e;
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
  on(e, t) {
    return this.channel.on(e, t);
  }
  off(e, t) {
    this.channel.off(e, t);
  }
  subscribe(e) {
    return this.channel.join(e);
  }
  unsubscribe(e) {
    return this.channel.leave(e);
  }
  teardown() {
    this.channel.teardown();
  }
  onClose(e) {
    this.channel.onClose(e);
  }
  onError(e) {
    return this.channel.onError(e);
  }
  push(e, t, r) {
    let s;
    try {
      s = this.channel.push(e, t, r);
    } catch {
      throw new Error(`tried to push '${e}' to '${this.channel.topic}' before joining. Use channel.subscribe() before pushing events`);
    }
    if (this.channel.pushBuffer.length > K2) {
      let i4 = this.channel.pushBuffer.shift();
      i4.cancelTimeout(), this.socket.log("channel", `discarded push due to buffer overflow: ${i4.event}`, i4.payload());
    }
    return s;
  }
  updateJoinPayload(e) {
    let t = this.channel.joinPush.payload();
    this.channel.joinPush.payload = () => Object.assign(Object.assign({}, t), e);
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
  updateFilterBindings(e) {
    this.channel.filterBindings = e;
  }
  updatePayloadTransform(e) {
    this.channel.onMessage = e;
  }
  getChannel() {
    return this.channel;
  }
};
function ce(n3) {
  return { config: Object.assign({ broadcast: { ack: false, self: false }, presence: { key: "", enabled: false }, private: false }, n3.config) };
}
var W2;
(function(n3) {
  n3.ALL = "*", n3.INSERT = "INSERT", n3.UPDATE = "UPDATE", n3.DELETE = "DELETE";
})(W2 || (W2 = {}));
var E5;
(function(n3) {
  n3.BROADCAST = "broadcast", n3.PRESENCE = "presence", n3.POSTGRES_CHANGES = "postgres_changes", n3.SYSTEM = "system";
})(E5 || (E5 = {}));
var _3;
(function(n3) {
  n3.SUBSCRIBED = "SUBSCRIBED", n3.TIMED_OUT = "TIMED_OUT", n3.CLOSED = "CLOSED", n3.CHANNEL_ERROR = "CHANNEL_ERROR";
})(_3 || (_3 = {}));
var w2 = class n2 {
  get state() {
    return this.channelAdapter.state;
  }
  set state(e) {
    this.channelAdapter.state = e;
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
  constructor(e, t = { config: {} }, r) {
    var s, i4;
    if (this.topic = e, this.params = t, this.socket = r, this.bindings = {}, this.subTopic = e.replace(/^realtime:/i, ""), this.params.config = Object.assign({ broadcast: { ack: false, self: false }, presence: { key: "", enabled: false }, private: false }, t.config), this.channelAdapter = new N4(this.socket.socketAdapter, e, this.params), this.presence = new A5(this), this._onClose(() => {
      this.socket._remove(this);
    }), this._updateFilterTransform(), this.broadcastEndpointURL = U3(this.socket.socketAdapter.endPointURL()), this.private = this.params.config.private || false, !this.private && (!((i4 = (s = this.params.config) === null || s === void 0 ? void 0 : s.broadcast) === null || i4 === void 0) && i4.replay)) throw new Error(`tried to use replay on public channel '${this.topic}'. It must be a private channel.`);
  }
  subscribe(e, t = this.timeout) {
    var r, s, i4;
    if (this.socket.isConnected() || this.socket.connect(), this.channelAdapter.isClosed()) {
      let { config: { broadcast: o3, presence: a, private: c3 } } = this.params, d = (s = (r = this.bindings.postgres_changes) === null || r === void 0 ? void 0 : r.map((h3) => h3.filter)) !== null && s !== void 0 ? s : [], f5 = !!this.bindings[E5.PRESENCE] && this.bindings[E5.PRESENCE].length > 0 || ((i4 = this.params.config.presence) === null || i4 === void 0 ? void 0 : i4.enabled) === true, p3 = {}, g2 = { broadcast: o3, presence: Object.assign(Object.assign({}, a), { enabled: f5 }), postgres_changes: d, private: c3 };
      this.socket.accessTokenValue && (p3.access_token = this.socket.accessTokenValue), this._onError((h3) => {
        e?.(_3.CHANNEL_ERROR, Y2(h3));
      }), this._onClose(() => e?.(_3.CLOSED)), this.updateJoinPayload(Object.assign({ config: g2 }, p3)), this._updateFilterMessage(), this.channelAdapter.subscribe(t).receive("ok", async ({ postgres_changes: h3 }) => {
        if (this.socket._isManualToken() || this.socket.setAuth(), h3 === void 0) {
          e?.(_3.SUBSCRIBED);
          return;
        }
        this._updatePostgresBindings(h3, e);
      }).receive("error", (h3) => {
        this.state = k2.errored;
        let l = Object.values(h3).join(", ") || "error";
        e?.(_3.CHANNEL_ERROR, new Error(l, { cause: h3 }));
      }).receive("timeout", () => {
        e?.(_3.TIMED_OUT);
      });
    }
    return this;
  }
  _updatePostgresBindings(e, t) {
    var r;
    let s = this.bindings.postgres_changes, i4 = (r = s?.length) !== null && r !== void 0 ? r : 0, o3 = [];
    for (let a = 0; a < i4; a++) {
      let c3 = s[a], { filter: { event: d, schema: f5, table: p3, filter: g2 } } = c3, h3 = e && e[a];
      if (h3 && h3.event === d && n2.isFilterValueEqual(h3.schema, f5) && n2.isFilterValueEqual(h3.table, p3) && n2.isFilterValueEqual(h3.filter, g2)) o3.push(Object.assign(Object.assign({}, c3), { id: h3.id }));
      else {
        this.unsubscribe(), this.state = k2.errored, t?.(_3.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
        return;
      }
    }
    this.bindings.postgres_changes = o3, this.state != k2.errored && t && t(_3.SUBSCRIBED);
  }
  presenceState() {
    return this.presence.state;
  }
  async track(e, t = {}) {
    return await this.send({ type: "presence", event: "track", payload: e }, t.timeout || this.timeout);
  }
  async untrack(e = {}) {
    return await this.send({ type: "presence", event: "untrack" }, e);
  }
  on(e, t, r) {
    let s = this.channelAdapter.isJoined() || this.channelAdapter.isJoining(), i4 = e === E5.PRESENCE || e === E5.POSTGRES_CHANGES;
    if (s && i4) throw this.socket.log("channel", `cannot add \`${e}\` callbacks for ${this.topic} after \`subscribe()\`.`), new Error(`cannot add \`${e}\` callbacks for ${this.topic} after \`subscribe()\`.`);
    return this._on(e, t, r);
  }
  async httpSend(e, t, r = {}) {
    var s;
    if (t == null) return Promise.reject(new Error("Payload is required for httpSend()"));
    let i4 = t instanceof ArrayBuffer || ArrayBuffer.isView(t), o3 = { apikey: this.socket.apiKey ? this.socket.apiKey : "", "Content-Type": i4 ? "application/octet-stream" : "application/json" };
    this.socket.accessTokenValue && (o3.Authorization = `Bearer ${this.socket.accessTokenValue}`);
    let a = new URL(this.broadcastEndpointURL);
    a.pathname += `/${encodeURIComponent(this.subTopic)}/events/${encodeURIComponent(e)}`, this.private && a.searchParams.set("private", "true");
    let c3 = { method: "POST", headers: o3, body: i4 ? t : JSON.stringify(t) }, d = await this._fetchWithTimeout(a.toString(), c3, (s = r.timeout) !== null && s !== void 0 ? s : this.timeout);
    if (d.status === 202) return { success: true };
    let f5 = d.statusText;
    try {
      let p3 = await d.json();
      f5 = p3.error || p3.message || f5;
    } catch {
    }
    return Promise.reject(new Error(f5));
  }
  async send(e, t = {}) {
    var r, s;
    if (!this.channelAdapter.canPush() && e.type === "broadcast") {
      console.warn("Realtime send() is automatically falling back to REST API. This behavior will be deprecated in the future. Please use httpSend() explicitly for REST delivery.");
      let { event: i4, payload: o3 } = e, a = { apikey: this.socket.apiKey ? this.socket.apiKey : "", "Content-Type": "application/json" };
      this.socket.accessTokenValue && (a.Authorization = `Bearer ${this.socket.accessTokenValue}`);
      let c3 = { method: "POST", headers: a, body: JSON.stringify({ messages: [{ topic: this.subTopic, event: i4, payload: o3, private: this.private }] }) };
      try {
        let d = await this._fetchWithTimeout(this.broadcastEndpointURL, c3, (r = t.timeout) !== null && r !== void 0 ? r : this.timeout);
        return await ((s = d.body) === null || s === void 0 ? void 0 : s.cancel()), d.ok ? "ok" : "error";
      } catch (d) {
        return d instanceof Error && d.name === "AbortError" ? "timed out" : "error";
      }
    } else return new Promise((i4) => {
      var o3, a, c3;
      let d = this.channelAdapter.push(e.type, e, t.timeout || this.timeout);
      e.type === "broadcast" && !(!((c3 = (a = (o3 = this.params) === null || o3 === void 0 ? void 0 : o3.config) === null || a === void 0 ? void 0 : a.broadcast) === null || c3 === void 0) && c3.ack) && i4("ok"), d.receive("ok", () => i4("ok")), d.receive("error", () => i4("error")), d.receive("timeout", () => i4("timed out"));
    });
  }
  updateJoinPayload(e) {
    this.channelAdapter.updateJoinPayload(e);
  }
  async unsubscribe(e = this.timeout) {
    return new Promise((t) => {
      this.channelAdapter.unsubscribe(e).receive("ok", () => t("ok")).receive("timeout", () => t("timed out")).receive("error", () => t("error"));
    });
  }
  teardown() {
    this.channelAdapter.teardown();
  }
  async _fetchWithTimeout(e, t, r) {
    let s = new AbortController(), i4 = setTimeout(() => s.abort(), r), o3 = await this.socket.fetch(e, Object.assign(Object.assign({}, t), { signal: s.signal }));
    return clearTimeout(i4), o3;
  }
  _on(e, t, r) {
    let s = e.toLocaleLowerCase(), i4 = this.channelAdapter.on(e, r), o3 = { type: s, filter: t, callback: r, ref: i4 };
    return this.bindings[s] ? this.bindings[s].push(o3) : this.bindings[s] = [o3], this._updateFilterMessage(), this;
  }
  _onClose(e) {
    this.channelAdapter.onClose(e);
  }
  _onError(e) {
    this.channelAdapter.onError(e);
  }
  _updateFilterMessage() {
    this.channelAdapter.updateFilterBindings((e, t, r) => {
      var s, i4, o3, a, c3, d, f5;
      let p3 = e.event.toLocaleLowerCase();
      if (this._notThisChannelEvent(p3, r)) return false;
      let g2 = (s = this.bindings[p3]) === null || s === void 0 ? void 0 : s.find((h3) => h3.ref === e.ref);
      if (!g2) return true;
      if (["broadcast", "presence", "postgres_changes"].includes(p3)) if ("id" in g2) {
        let h3 = g2.id, l = (i4 = g2.filter) === null || i4 === void 0 ? void 0 : i4.event;
        return h3 && ((o3 = t.ids) === null || o3 === void 0 ? void 0 : o3.includes(h3)) && (l === "*" || l?.toLocaleLowerCase() === ((a = t.data) === null || a === void 0 ? void 0 : a.type.toLocaleLowerCase()));
      } else {
        let h3 = (d = (c3 = g2?.filter) === null || c3 === void 0 ? void 0 : c3.event) === null || d === void 0 ? void 0 : d.toLocaleLowerCase();
        return h3 === "*" || h3 === ((f5 = t?.event) === null || f5 === void 0 ? void 0 : f5.toLocaleLowerCase());
      }
      else return g2.type.toLocaleLowerCase() === p3;
    });
  }
  _notThisChannelEvent(e, t) {
    let { close: r, error: s, leave: i4, join: o3 } = O5;
    return t && [r, s, i4, o3].includes(e) && t !== this.joinPush.ref;
  }
  _updateFilterTransform() {
    this.channelAdapter.updatePayloadTransform((e, t, r) => {
      if (typeof t == "object" && "ids" in t) {
        let s = t.data, { schema: i4, table: o3, commit_timestamp: a, type: c3, errors: d } = s;
        return Object.assign(Object.assign({}, { schema: i4, table: o3, commit_timestamp: a, eventType: c3, new: {}, old: {}, errors: d }), this._getPayloadRecords(s));
      }
      return t;
    });
  }
  copyBindings(e) {
    if (this.joinedOnce) throw new Error("cannot copy bindings into joined channel");
    for (let t in e.bindings) for (let r of e.bindings[t]) this._on(r.type, r.filter, r.callback);
  }
  static isFilterValueEqual(e, t) {
    return (e ?? void 0) === (t ?? void 0);
  }
  _getPayloadRecords(e) {
    let t = { new: {}, old: {} };
    return (e.type === "INSERT" || e.type === "UPDATE") && (t.new = H4(e.columns, e.record)), (e.type === "UPDATE" || e.type === "DELETE") && (t.old = H4(e.columns, e.old_record)), t;
  }
};
var R3 = class {
  constructor(e, t) {
    this.socket = new U2(e, t);
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
  set heartbeatCallback(e) {
    this.socket.heartbeatCallback = e;
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
  disconnect(e, t, r, s = 1e4) {
    return new Promise((i4) => {
      setTimeout(() => i4("timeout"), s), this.socket.disconnect(() => {
        e(), i4("ok");
      }, t, r);
    });
  }
  push(e) {
    this.socket.push(e);
  }
  log(e, t, r) {
    this.socket.log(e, t, r);
  }
  makeRef() {
    return this.socket.makeRef();
  }
  onOpen(e) {
    this.socket.onOpen(e);
  }
  onClose(e) {
    this.socket.onClose(e);
  }
  onError(e) {
    this.socket.onError(e);
  }
  onMessage(e) {
    this.socket.onMessage(e);
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
  let n3 = /* @__PURE__ */ new Map();
  return { get length() {
    return n3.size;
  }, clear() {
    n3.clear();
  }, getItem(e) {
    return n3.has(e) ? n3.get(e) : null;
  }, key(e) {
    var t;
    return (t = Array.from(n3.keys())[e]) !== null && t !== void 0 ? t : null;
  }, removeItem(e) {
    n3.delete(e);
  }, setItem(e, t) {
    n3.set(e, String(t));
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
  constructor(e, t) {
    var r;
    if (this.channels = new Array(), this.accessTokenValue = null, this.accessToken = null, this.apiKey = null, this.httpEndpoint = "", this.headers = {}, this.params = {}, this.ref = 0, this.serializer = new C4(), this._manuallySetToken = false, this._authPromise = null, this._workerHeartbeatTimer = void 0, this._pendingWorkerHeartbeatRef = null, this._pendingDisconnectTimer = null, this._disconnectOnEmptyChannelsAfterMs = 0, this._resolveFetch = (i4) => i4 ? (...o3) => i4(...o3) : (...o3) => fetch(...o3), !(!((r = t?.params) === null || r === void 0) && r.apikey)) throw new Error("API key is required to connect to Realtime");
    this.apiKey = t.params.apikey;
    let s = this._initializeOptions(t);
    this.socketAdapter = new R3(e, s), this.httpEndpoint = U3(e), this.fetch = this._resolveFetch(t?.fetch);
  }
  connect() {
    if (!(this.isConnecting() || this.isDisconnecting() || this.isConnected())) {
      this.accessToken && !this._authPromise && this._setAuthSafely("connect"), this._setupConnectionHandlers();
      try {
        this.socketAdapter.connect();
      } catch (e) {
        let t = e.message;
        throw t.includes("Node.js") ? new Error(`${t}

To use Realtime in Node.js, you need to provide a WebSocket implementation:

Option 1: Use Node.js 22+ which has native WebSocket support
Option 2: Install and provide the "ws" package:

  npm install ws

  import ws from "ws"
  const client = new RealtimeClient(url, {
    ...options,
    transport: ws
  })`) : new Error(`WebSocket not available: ${t}`);
      }
      this._handleNodeJsRaceCondition();
    }
  }
  endpointURL() {
    return this.socketAdapter.endPointURL();
  }
  async disconnect(e, t) {
    return this._cancelPendingDisconnect(), this.isDisconnecting() ? "ok" : await this.socketAdapter.disconnect(() => {
      clearInterval(this._workerHeartbeatTimer), this._terminateWorker();
    }, e, t);
  }
  getChannels() {
    return this.channels;
  }
  async removeChannel(e) {
    let t = await e.unsubscribe();
    return t === "ok" && e.teardown(), t;
  }
  async removeAllChannels() {
    let e = this.channels.map(async (r) => {
      let s = await r.unsubscribe();
      return r.teardown(), s;
    }), t = await Promise.all(e);
    return await this.disconnect(), t;
  }
  log(e, t, r) {
    this.socketAdapter.log(e, t, r);
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
  channel(e, t = { config: {} }) {
    let r = `realtime:${e}`, s = this.getChannels().find((i4) => i4.topic === r);
    if (s) return s;
    {
      let i4 = new w2(`realtime:${e}`, t, this);
      return this._cancelPendingDisconnect(), this.channels.push(i4), i4;
    }
  }
  push(e) {
    this.socketAdapter.push(e);
  }
  async setAuth(e = null) {
    this._authPromise = this._performAuth(e);
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
  onHeartbeat(e) {
    this.socketAdapter.heartbeatCallback = this._wrapHeartbeatCallback(e);
  }
  _makeRef() {
    return this.socketAdapter.makeRef();
  }
  _remove(e) {
    this.channels = this.channels.filter((t) => t.topic !== e.topic), this.channels.length === 0 && (this.log("transport", "no channels remaining, scheduling disconnect"), this._schedulePendingDisconnect());
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
  async _performAuth(e = null) {
    let t, r = false;
    if (e) t = e, r = true;
    else if (this.accessToken) try {
      t = await this.accessToken();
    } catch (s) {
      this.log("error", "Error fetching access token from callback", s), t = this.accessTokenValue;
    }
    else t = this.accessTokenValue;
    r ? this._manuallySetToken = true : this.accessToken && (this._manuallySetToken = false), this.accessTokenValue != t && (this.accessTokenValue = t, this.channels.forEach((s) => {
      let i4 = { access_token: t, version: J2 };
      t && s.updateJoinPayload(i4), s.joinedOnce && s.channelAdapter.isJoined() && s.channelAdapter.push(O5.access_token, { access_token: t });
    }));
  }
  async _waitForAuthIfNeeded() {
    this._authPromise && await this._authPromise;
  }
  _setAuthSafely(e = "general") {
    this._isManualToken() || this.setAuth().catch((t) => {
      this.log("error", `Error setting auth in ${e}`, t);
    });
  }
  _setupConnectionHandlers() {
    this.socketAdapter.onOpen(() => {
      (this._authPromise || (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve())).catch((t) => {
        this.log("error", "error waiting for auth on connect", t);
      }), this.worker && !this.workerRef && this._startWorkerHeartbeat();
    }), this.socketAdapter.onClose(() => {
      this.worker && this.workerRef && this._terminateWorker();
    }), this.socketAdapter.onMessage((e) => {
      e.ref && e.ref === this._pendingWorkerHeartbeatRef && (this._pendingWorkerHeartbeatRef = null);
    });
  }
  _handleNodeJsRaceCondition() {
    this.socketAdapter.isConnected() && this.socketAdapter.getSocket().onConnOpen();
  }
  _wrapHeartbeatCallback(e) {
    return (t, r) => {
      t == "sent" && this._setAuthSafely(), e && e(t, r);
    };
  }
  _startWorkerHeartbeat() {
    this.workerUrl ? this.log("worker", `starting worker for from ${this.workerUrl}`) : this.log("worker", "starting default worker");
    let e = this._workerObjectUrl(this.workerUrl);
    this.workerRef = new Worker(e), this.workerRef.onerror = (t) => {
      this.log("worker", "worker error", t.message), this._terminateWorker(), this.disconnect();
    }, this.workerRef.onmessage = (t) => {
      t.data.event === "keepAlive" && this.sendHeartbeat();
    }, this.workerRef.postMessage({ event: "start", interval: this.heartbeatIntervalMs });
  }
  _terminateWorker() {
    this.workerRef && (this.log("worker", "terminating worker"), this.workerRef.terminate(), this.workerRef = void 0);
  }
  _workerObjectUrl(e) {
    let t;
    if (e) t = e;
    else {
      let r = new Blob([ge2], { type: "application/javascript" });
      t = URL.createObjectURL(r);
    }
    return t;
  }
  _initializeOptions(e) {
    var t, r, s, i4, o3, a, c3, d, f5, p3, g2, h3;
    this.worker = (t = e?.worker) !== null && t !== void 0 ? t : false, this.accessToken = (r = e?.accessToken) !== null && r !== void 0 ? r : null;
    let l = {};
    l.timeout = (s = e?.timeout) !== null && s !== void 0 ? s : z2, l.heartbeatIntervalMs = (i4 = e?.heartbeatIntervalMs) !== null && i4 !== void 0 ? i4 : X2.HEARTBEAT_INTERVAL, this._disconnectOnEmptyChannelsAfterMs = (o3 = e?.disconnectOnEmptyChannelsAfterMs) !== null && o3 !== void 0 ? o3 : 2 * ((a = e?.heartbeatIntervalMs) !== null && a !== void 0 ? a : X2.HEARTBEAT_INTERVAL), l.transport = (c3 = e?.transport) !== null && c3 !== void 0 ? c3 : x5.getWebSocketConstructor(), l.params = e?.params, l.logger = e?.logger, l.heartbeatCallback = this._wrapHeartbeatCallback(e?.heartbeatCallback), l.sessionStorage = (d = e?.sessionStorage) !== null && d !== void 0 ? d : fe2(), l.reconnectAfterMs = (f5 = e?.reconnectAfterMs) !== null && f5 !== void 0 ? f5 : (y4) => he2[y4 - 1] || ue2;
    let m4, b4, v3 = (p3 = e?.vsn) !== null && p3 !== void 0 ? p3 : F3;
    switch (v3) {
      case $3:
        m4 = (y4, P5) => P5(JSON.stringify(y4)), b4 = (y4, P5) => P5(JSON.parse(y4));
        break;
      case D3:
        m4 = this.serializer.encode.bind(this.serializer), b4 = this.serializer.decode.bind(this.serializer);
        break;
      default:
        throw new Error(`Unsupported serializer version: ${l.vsn}`);
    }
    if (l.vsn = v3, l.encode = (g2 = e?.encode) !== null && g2 !== void 0 ? g2 : m4, l.decode = (h3 = e?.decode) !== null && h3 !== void 0 ? h3 : b4, l.beforeReconnect = this._reconnectAuth.bind(this), (e?.logLevel || e?.log_level) && (this.logLevel = e.logLevel || e.log_level, l.params = Object.assign(Object.assign({}, l.params), { log_level: this.logLevel })), this.worker) {
      if (typeof globalThis < "u" && !globalThis.Worker) throw new Error("Web Worker is not supported");
      this.workerUrl = e?.workerUrl, l.autoSendHeartbeat = !this.worker;
    }
    return l;
  }
  async _reconnectAuth() {
    await this._waitForAuthIfNeeded(), this.isConnected() || this.connect();
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/storage-js@2.108.1/denonext/storage-js.mjs
import { Buffer as __Buffer$ } from "node:buffer";

// supabase/functions/_vendor/esm.sh/iceberg-js@0.8.1/denonext/iceberg-js.mjs
var o = class extends Error {
  constructor(e, t) {
    super(e), this.name = "IcebergError", this.status = t.status, this.icebergType = t.icebergType, this.icebergCode = t.icebergCode, this.details = t.details, this.isCommitStateUnknown = t.icebergType === "CommitStateUnknownException" || [500, 502, 504].includes(t.status) && t.icebergType?.includes("CommitState") === true;
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
function w3(e, t, a) {
  let s = new URL(t, e);
  if (a) for (let [c3, r] of Object.entries(a)) r !== void 0 && s.searchParams.set(c3, r);
  return s.toString();
}
async function $4(e) {
  return !e || e.type === "none" ? {} : e.type === "bearer" ? { Authorization: `Bearer ${e.token}` } : e.type === "header" ? { [e.name]: e.value } : e.type === "custom" ? await e.getHeaders() : {};
}
function N5(e) {
  let t = e.fetchImpl ?? globalThis.fetch;
  return { async request({ method: a, path: s, query: c3, body: r, headers: g2 }) {
    let x7 = w3(e.baseUrl, s, c3), E8 = await $4(e.auth), n3 = await t(x7, { method: a, headers: { ...r ? { "Content-Type": "application/json" } : {}, ...E8, ...g2 }, body: r ? JSON.stringify(r) : void 0 }), l = await n3.text(), u3 = (n3.headers.get("content-type") || "").includes("application/json"), m4 = u3 && l ? JSON.parse(l) : l;
    if (!n3.ok) {
      let d = u3 ? m4 : void 0, h3 = d?.error;
      throw new o(h3?.message ?? `Request failed with status ${n3.status}`, { status: n3.status, icebergType: h3?.type, icebergCode: h3?.code, details: d });
    }
    return { status: n3.status, headers: n3.headers, data: m4 };
  } };
}
function p(e) {
  return e.join("");
}
var O6 = class {
  constructor(e, t = "") {
    this.client = e, this.prefix = t;
  }
  async listNamespaces(e) {
    let t = e ? { parent: p(e.namespace) } : void 0;
    return (await this.client.request({ method: "GET", path: `${this.prefix}/namespaces`, query: t })).data.namespaces.map((s) => ({ namespace: s }));
  }
  async createNamespace(e, t) {
    let a = { namespace: e.namespace, properties: t?.properties };
    return (await this.client.request({ method: "POST", path: `${this.prefix}/namespaces`, body: a })).data;
  }
  async dropNamespace(e) {
    await this.client.request({ method: "DELETE", path: `${this.prefix}/namespaces/${p(e.namespace)}` });
  }
  async loadNamespaceMetadata(e) {
    return { properties: (await this.client.request({ method: "GET", path: `${this.prefix}/namespaces/${p(e.namespace)}` })).data.properties };
  }
  async namespaceExists(e) {
    try {
      return await this.client.request({ method: "HEAD", path: `${this.prefix}/namespaces/${p(e.namespace)}` }), true;
    } catch (t) {
      if (t instanceof o && t.status === 404) return false;
      throw t;
    }
  }
  async createNamespaceIfNotExists(e, t) {
    try {
      return await this.createNamespace(e, t);
    } catch (a) {
      if (a instanceof o && a.status === 409) return;
      throw a;
    }
  }
};
function i3(e) {
  return e.join("");
}
var D4 = class {
  constructor(e, t = "", a) {
    this.client = e, this.prefix = t, this.accessDelegation = a;
  }
  async listTables(e) {
    return (await this.client.request({ method: "GET", path: `${this.prefix}/namespaces/${i3(e.namespace)}/tables` })).data.identifiers;
  }
  async createTable(e, t) {
    let a = {};
    return this.accessDelegation && (a["X-Iceberg-Access-Delegation"] = this.accessDelegation), (await this.client.request({ method: "POST", path: `${this.prefix}/namespaces/${i3(e.namespace)}/tables`, body: t, headers: a })).data.metadata;
  }
  async updateTable(e, t) {
    let a = await this.client.request({ method: "POST", path: `${this.prefix}/namespaces/${i3(e.namespace)}/tables/${e.name}`, body: t });
    return { "metadata-location": a.data["metadata-location"], metadata: a.data.metadata };
  }
  async dropTable(e, t) {
    await this.client.request({ method: "DELETE", path: `${this.prefix}/namespaces/${i3(e.namespace)}/tables/${e.name}`, query: { purgeRequested: String(t?.purge ?? false) } });
  }
  async loadTable(e) {
    let t = {};
    return this.accessDelegation && (t["X-Iceberg-Access-Delegation"] = this.accessDelegation), (await this.client.request({ method: "GET", path: `${this.prefix}/namespaces/${i3(e.namespace)}/tables/${e.name}`, headers: t })).data.metadata;
  }
  async tableExists(e) {
    let t = {};
    this.accessDelegation && (t["X-Iceberg-Access-Delegation"] = this.accessDelegation);
    try {
      return await this.client.request({ method: "HEAD", path: `${this.prefix}/namespaces/${i3(e.namespace)}/tables/${e.name}`, headers: t }), true;
    } catch (a) {
      if (a instanceof o && a.status === 404) return false;
      throw a;
    }
  }
  async createTableIfNotExists(e, t) {
    try {
      return await this.createTable(e, t);
    } catch (a) {
      if (a instanceof o && a.status === 409) return await this.loadTable({ namespace: e.namespace, name: t.name });
      throw a;
    }
  }
};
var I2 = class {
  constructor(e) {
    let t = "v1";
    e.catalogName && (t += `/${e.catalogName}`);
    let a = e.baseUrl.endsWith("/") ? e.baseUrl : `${e.baseUrl}/`;
    this.client = N5({ baseUrl: a, auth: e.auth, fetchImpl: e.fetch }), this.accessDelegation = e.accessDelegation?.join(","), this.namespaceOps = new O6(this.client, t), this.tableOps = new D4(this.client, t, this.accessDelegation);
  }
  async listNamespaces(e) {
    return this.namespaceOps.listNamespaces(e);
  }
  async createNamespace(e, t) {
    return this.namespaceOps.createNamespace(e, t);
  }
  async dropNamespace(e) {
    await this.namespaceOps.dropNamespace(e);
  }
  async loadNamespaceMetadata(e) {
    return this.namespaceOps.loadNamespaceMetadata(e);
  }
  async listTables(e) {
    return this.tableOps.listTables(e);
  }
  async createTable(e, t) {
    return this.tableOps.createTable(e, t);
  }
  async updateTable(e, t) {
    return this.tableOps.updateTable(e, t);
  }
  async dropTable(e, t) {
    await this.tableOps.dropTable(e, t);
  }
  async loadTable(e) {
    return this.tableOps.loadTable(e);
  }
  async namespaceExists(e) {
    return this.namespaceOps.namespaceExists(e);
  }
  async tableExists(e) {
    return this.tableOps.tableExists(e);
  }
  async createNamespaceIfNotExists(e, t) {
    return this.namespaceOps.createNamespaceIfNotExists(e, t);
  }
  async createTableIfNotExists(e, t) {
    return this.tableOps.createTableIfNotExists(e, t);
  }
};

// supabase/functions/_vendor/esm.sh/@supabase/storage-js@2.108.1/denonext/storage-js.mjs
function g(t) {
  "@babel/helpers - typeof";
  return g = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
    return typeof e;
  } : function(e) {
    return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  }, g(t);
}
function F4(t, e) {
  if (g(t) != "object" || !t) return t;
  var r = t[Symbol.toPrimitive];
  if (r !== void 0) {
    var a = r.call(t, e || "default");
    if (g(a) != "object") return a;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e === "string" ? String : Number)(t);
}
function L4(t) {
  var e = F4(t, "string");
  return g(e) == "symbol" ? e : e + "";
}
function D5(t, e, r) {
  return (e = L4(e)) in t ? Object.defineProperty(t, e, { value: r, enumerable: true, configurable: true, writable: true }) : t[e] = r, t;
}
function j4(t, e) {
  var r = Object.keys(t);
  if (Object.getOwnPropertySymbols) {
    var a = Object.getOwnPropertySymbols(t);
    e && (a = a.filter(function(n3) {
      return Object.getOwnPropertyDescriptor(t, n3).enumerable;
    })), r.push.apply(r, a);
  }
  return r;
}
function c2(t) {
  for (var e = 1; e < arguments.length; e++) {
    var r = arguments[e] != null ? arguments[e] : {};
    e % 2 ? j4(Object(r), true).forEach(function(a) {
      D5(t, a, r[a]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(r)) : j4(Object(r)).forEach(function(a) {
      Object.defineProperty(t, a, Object.getOwnPropertyDescriptor(r, a));
    });
  }
  return t;
}
var w4 = class extends Error {
  constructor(t, e = "storage", r, a) {
    super(t), this.__isStorageError = true, this.namespace = e, this.name = e === "vectors" ? "StorageVectorsError" : "StorageError", this.status = r, this.statusCode = a;
  }
  toJSON() {
    return { name: this.name, message: this.message, status: this.status, statusCode: this.statusCode };
  }
};
function b3(t) {
  return typeof t == "object" && t !== null && "__isStorageError" in t;
}
var S6 = class extends w4 {
  constructor(t, e, r, a = "storage") {
    super(t, a, e, r), this.name = a === "vectors" ? "StorageVectorsApiError" : "StorageApiError", this.status = e, this.statusCode = r;
  }
  toJSON() {
    return c2({}, super.toJSON());
  }
};
var E6 = class extends w4 {
  constructor(t, e, r = "storage") {
    super(t, r), this.name = r === "vectors" ? "StorageVectorsUnknownError" : "StorageUnknownError", this.originalError = e;
  }
};
var de2 = function(t) {
  return t.InternalError = "InternalError", t.S3VectorConflictException = "S3VectorConflictException", t.S3VectorNotFoundException = "S3VectorNotFoundException", t.S3VectorBucketNotEmpty = "S3VectorBucketNotEmpty", t.S3VectorMaxBucketsExceeded = "S3VectorMaxBucketsExceeded", t.S3VectorMaxIndexesExceeded = "S3VectorMaxIndexesExceeded", t;
}({});
function O7(t, e, r) {
  let a = c2({}, t), n3 = e.toLowerCase();
  for (let s of Object.keys(a)) s.toLowerCase() === n3 && delete a[s];
  return a[n3] = r, a;
}
function R4(t) {
  let e = {};
  for (let [r, a] of Object.entries(t)) e[r.toLowerCase()] = a;
  return e;
}
var A6 = (t) => t ? (...e) => t(...e) : (...e) => fetch(...e);
var H5 = (t) => {
  if (typeof t != "object" || t === null) return false;
  let e = Object.getPrototypeOf(t);
  return (e === null || e === Object.prototype || Object.getPrototypeOf(e) === null) && !(Symbol.toStringTag in t) && !(Symbol.iterator in t);
};
var $5 = (t) => {
  if (Array.isArray(t)) return t.map((r) => $5(r));
  if (typeof t == "function" || t !== Object(t)) return t;
  let e = {};
  return Object.entries(t).forEach(([r, a]) => {
    let n3 = r.replace(/([-_][a-z])/gi, (s) => s.toUpperCase().replace(/[-_]/g, ""));
    e[n3] = $5(a);
  }), e;
};
var q4 = (t) => !t || typeof t != "string" || t.length === 0 || t.length > 100 || t.trim() !== t || t.includes("/") || t.includes("\\") ? false : /^[\w!.\*'() &$@=;:+,?-]+$/.test(t);
var T5 = (t) => {
  if (typeof t == "object" && t !== null) {
    let e = t;
    if (typeof e.msg == "string") return e.msg;
    if (typeof e.message == "string") return e.message;
    if (typeof e.error_description == "string") return e.error_description;
    if (typeof e.error == "string") return e.error;
    if (typeof e.error == "object" && e.error !== null) {
      let r = e.error;
      if (typeof r.message == "string") return r.message;
    }
  }
  return JSON.stringify(t);
};
var M4 = async (t, e, r, a) => {
  if (t !== null && typeof t == "object" && "json" in t && typeof t.json == "function") {
    let n3 = t, s = parseInt(String(n3.status), 10);
    Number.isFinite(s) || (s = 500), n3.json().then((o3) => {
      let u3 = o3?.statusCode || o3?.code || s + "";
      e(new S6(T5(o3), s, u3, a));
    }).catch(() => {
      let o3 = s + "";
      e(new S6(n3.statusText || `HTTP ${s} error`, s, o3, a));
    });
  } else e(new E6(T5(t), t, a));
};
var z3 = (t, e, r, a) => {
  let n3 = { method: t, headers: e?.headers || {} };
  if (t === "GET" || t === "HEAD" || !a) return c2(c2({}, n3), r);
  if (H5(a)) {
    var s;
    let o3 = e?.headers || {}, u3;
    for (let [i4, l] of Object.entries(o3)) i4.toLowerCase() === "content-type" && (u3 = l);
    n3.headers = O7(o3, "Content-Type", (s = u3) !== null && s !== void 0 ? s : "application/json"), n3.body = JSON.stringify(a);
  } else n3.body = a;
  return e?.duplex && (n3.duplex = e.duplex), c2(c2({}, n3), r);
};
async function v2(t, e, r, a, n3, s, o3) {
  return new Promise((u3, i4) => {
    t(r, z3(e, a, n3, s)).then((l) => {
      if (!l.ok) throw l;
      if (a?.noResolveJson) return l;
      if (o3 === "vectors") {
        let d = l.headers.get("content-type");
        if (l.headers.get("content-length") === "0" || l.status === 204) return {};
        if (!d || !d.includes("application/json")) return {};
      }
      return l.json();
    }).then((l) => u3(l)).catch((l) => M4(l, i4, a, o3));
  });
}
function N6(t = "storage") {
  return { get: async (e, r, a, n3) => v2(e, "GET", r, a, n3, void 0, t), post: async (e, r, a, n3, s) => v2(e, "POST", r, n3, s, a, t), put: async (e, r, a, n3, s) => v2(e, "PUT", r, n3, s, a, t), head: async (e, r, a, n3) => v2(e, "HEAD", r, c2(c2({}, a), {}, { noResolveJson: true }), n3, void 0, t), remove: async (e, r, a, n3, s) => v2(e, "DELETE", r, n3, s, a, t) };
}
var K3 = N6("storage");
var { get: m3, post: f4, put: B4, head: J3, remove: P3 } = K3;
var h2 = N6("vectors");
var p2 = class {
  constructor(t, e = {}, r, a = "storage") {
    this.shouldThrowOnError = false, this.url = t, this.headers = R4(e), this.fetch = A6(r), this.namespace = a;
  }
  throwOnError() {
    return this.shouldThrowOnError = true, this;
  }
  setHeader(t, e) {
    return this.headers = O7(this.headers, t, e), this;
  }
  async handleOperation(t) {
    var e = this;
    try {
      return { data: await t(), error: null };
    } catch (r) {
      if (e.shouldThrowOnError) throw r;
      if (b3(r)) return { data: null, error: r };
      throw r;
    }
  }
};
var V3;
V3 = Symbol.toStringTag;
var G3 = class {
  constructor(t, e) {
    this.downloadFn = t, this.shouldThrowOnError = e, this[V3] = "StreamDownloadBuilder", this.promise = null;
  }
  then(t, e) {
    return this.getPromise().then(t, e);
  }
  catch(t) {
    return this.getPromise().catch(t);
  }
  finally(t) {
    return this.getPromise().finally(t);
  }
  getPromise() {
    return this.promise || (this.promise = this.execute()), this.promise;
  }
  async execute() {
    var t = this;
    try {
      return { data: (await t.downloadFn()).body, error: null };
    } catch (e) {
      if (t.shouldThrowOnError) throw e;
      if (b3(e)) return { data: null, error: e };
      throw e;
    }
  }
};
var C5;
C5 = Symbol.toStringTag;
var Q3 = class {
  constructor(t, e) {
    this.downloadFn = t, this.shouldThrowOnError = e, this[C5] = "BlobDownloadBuilder", this.promise = null;
  }
  asStream() {
    return new G3(this.downloadFn, this.shouldThrowOnError);
  }
  then(t, e) {
    return this.getPromise().then(t, e);
  }
  catch(t) {
    return this.getPromise().catch(t);
  }
  finally(t) {
    return this.getPromise().finally(t);
  }
  getPromise() {
    return this.promise || (this.promise = this.execute()), this.promise;
  }
  async execute() {
    var t = this;
    try {
      return { data: await (await t.downloadFn()).blob(), error: null };
    } catch (e) {
      if (t.shouldThrowOnError) throw e;
      if (b3(e)) return { data: null, error: e };
      throw e;
    }
  }
};
var W3 = { limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } };
var I3 = { cacheControl: "3600", contentType: "text/plain;charset=UTF-8", upsert: false };
var X3 = class extends p2 {
  constructor(t, e = {}, r, a) {
    super(t, e, a, "storage"), this.bucketId = r;
  }
  async uploadOrUpdate(t, e, r, a) {
    var n3 = this;
    return n3.handleOperation(async () => {
      let s, o3 = c2(c2({}, I3), a), u3 = c2(c2({}, n3.headers), t === "POST" && { "x-upsert": String(o3.upsert) }), i4 = o3.metadata;
      if (typeof Blob < "u" && r instanceof Blob ? (s = new FormData(), s.append("cacheControl", o3.cacheControl), i4 && s.append("metadata", n3.encodeMetadata(i4)), s.append("", r)) : typeof FormData < "u" && r instanceof FormData ? (s = r, s.has("cacheControl") || s.append("cacheControl", o3.cacheControl), i4 && !s.has("metadata") && s.append("metadata", n3.encodeMetadata(i4))) : (s = r, u3["cache-control"] = `max-age=${o3.cacheControl}`, u3["content-type"] = o3.contentType, i4 && (u3["x-metadata"] = n3.toBase64(n3.encodeMetadata(i4))), (typeof ReadableStream < "u" && s instanceof ReadableStream || s && typeof s == "object" && "pipe" in s && typeof s.pipe == "function") && !o3.duplex && (o3.duplex = "half")), a?.headers) for (let [x7, k3] of Object.entries(a.headers)) u3 = O7(u3, x7, k3);
      let l = n3._removeEmptyFolders(e), d = n3._getFinalPath(l), y4 = await (t == "PUT" ? B4 : f4)(n3.fetch, `${n3.url}/object/${d}`, s, c2({ headers: u3 }, o3?.duplex ? { duplex: o3.duplex } : {}));
      return { path: l, id: y4.Id, fullPath: y4.Key };
    });
  }
  async upload(t, e, r) {
    return this.uploadOrUpdate("POST", t, e, r);
  }
  async uploadToSignedUrl(t, e, r, a) {
    var n3 = this;
    let s = n3._removeEmptyFolders(t), o3 = n3._getFinalPath(s), u3 = new URL(n3.url + `/object/upload/sign/${o3}`);
    return u3.searchParams.set("token", e), n3.handleOperation(async () => {
      let i4, l = c2(c2({}, I3), a), d = c2(c2({}, n3.headers), { "x-upsert": String(l.upsert) }), y4 = l.metadata;
      if (typeof Blob < "u" && r instanceof Blob ? (i4 = new FormData(), i4.append("cacheControl", l.cacheControl), y4 && i4.append("metadata", n3.encodeMetadata(y4)), i4.append("", r)) : typeof FormData < "u" && r instanceof FormData ? (i4 = r, i4.has("cacheControl") || i4.append("cacheControl", l.cacheControl), y4 && !i4.has("metadata") && i4.append("metadata", n3.encodeMetadata(y4))) : (i4 = r, d["cache-control"] = `max-age=${l.cacheControl}`, d["content-type"] = l.contentType, y4 && (d["x-metadata"] = n3.toBase64(n3.encodeMetadata(y4))), (typeof ReadableStream < "u" && i4 instanceof ReadableStream || i4 && typeof i4 == "object" && "pipe" in i4 && typeof i4.pipe == "function") && !l.duplex && (l.duplex = "half")), a?.headers) for (let [x7, k3] of Object.entries(a.headers)) d = O7(d, x7, k3);
      return { path: s, fullPath: (await B4(n3.fetch, u3.toString(), i4, c2({ headers: d }, l?.duplex ? { duplex: l.duplex } : {}))).Key };
    });
  }
  async createSignedUploadUrl(t, e) {
    var r = this;
    return r.handleOperation(async () => {
      let a = r._getFinalPath(t), n3 = c2({}, r.headers);
      e?.upsert && (n3["x-upsert"] = "true");
      let s = await f4(r.fetch, `${r.url}/object/upload/sign/${a}`, {}, { headers: n3 }), o3 = new URL(r.url + s.url), u3 = o3.searchParams.get("token");
      if (!u3) throw new w4("No token returned by API");
      return { signedUrl: o3.toString(), path: t, token: u3 };
    });
  }
  async update(t, e, r) {
    return this.uploadOrUpdate("PUT", t, e, r);
  }
  async move(t, e, r) {
    var a = this;
    return a.handleOperation(async () => await f4(a.fetch, `${a.url}/object/move`, { bucketId: a.bucketId, sourceKey: t, destinationKey: e, destinationBucket: r?.destinationBucket }, { headers: a.headers }));
  }
  async copy(t, e, r) {
    var a = this;
    return a.handleOperation(async () => ({ path: (await f4(a.fetch, `${a.url}/object/copy`, { bucketId: a.bucketId, sourceKey: t, destinationKey: e, destinationBucket: r?.destinationBucket }, { headers: a.headers })).Key }));
  }
  async createSignedUrl(t, e, r) {
    var a = this;
    return a.handleOperation(async () => {
      let n3 = a._getFinalPath(t), s = typeof r?.transform == "object" && r.transform !== null && Object.keys(r.transform).length > 0, o3 = await f4(a.fetch, `${a.url}/object/sign/${n3}`, c2({ expiresIn: e }, s ? { transform: r.transform } : {}), { headers: a.headers }), u3 = new URLSearchParams();
      r?.download && u3.set("download", r.download === true ? "" : r.download), r?.cacheNonce != null && u3.set("cacheNonce", String(r.cacheNonce));
      let i4 = u3.toString();
      return { signedUrl: encodeURI(`${a.url}${o3.signedURL}${i4 ? `&${i4}` : ""}`) };
    });
  }
  async createSignedUrls(t, e, r) {
    var a = this;
    return a.handleOperation(async () => {
      let n3 = await f4(a.fetch, `${a.url}/object/sign/${a.bucketId}`, { expiresIn: e, paths: t }, { headers: a.headers }), s = new URLSearchParams();
      r?.download && s.set("download", r.download === true ? "" : r.download), r?.cacheNonce != null && s.set("cacheNonce", String(r.cacheNonce));
      let o3 = s.toString();
      return n3.map((u3) => c2(c2({}, u3), {}, { signedUrl: u3.signedURL ? encodeURI(`${a.url}${u3.signedURL}${o3 ? `&${o3}` : ""}`) : null }));
    });
  }
  download(t, e, r) {
    let a = typeof e?.transform == "object" && e.transform !== null && Object.keys(e.transform).length > 0 ? "render/image/authenticated" : "object", n3 = new URLSearchParams();
    e?.transform && this.applyTransformOptsToQuery(n3, e.transform), e?.cacheNonce != null && n3.set("cacheNonce", String(e.cacheNonce));
    let s = n3.toString(), o3 = this._getFinalPath(t), u3 = () => m3(this.fetch, `${this.url}/${a}/${o3}${s ? `?${s}` : ""}`, { headers: this.headers, noResolveJson: true }, r);
    return new Q3(u3, this.shouldThrowOnError);
  }
  async info(t) {
    var e = this;
    let r = e._getFinalPath(t);
    return e.handleOperation(async () => $5(await m3(e.fetch, `${e.url}/object/info/${r}`, { headers: e.headers })));
  }
  async exists(t) {
    var e = this;
    let r = e._getFinalPath(t);
    try {
      return await J3(e.fetch, `${e.url}/object/${r}`, { headers: e.headers }), { data: true, error: null };
    } catch (n3) {
      if (e.shouldThrowOnError) throw n3;
      if (b3(n3)) {
        var a;
        let s = n3 instanceof S6 ? n3.status : n3 instanceof E6 ? (a = n3.originalError) === null || a === void 0 ? void 0 : a.status : void 0;
        if (s !== void 0 && [400, 404].includes(s)) return { data: false, error: n3 };
      }
      throw n3;
    }
  }
  getPublicUrl(t, e) {
    let r = this._getFinalPath(t), a = new URLSearchParams();
    e?.download && a.set("download", e.download === true ? "" : e.download), e?.transform && this.applyTransformOptsToQuery(a, e.transform), e?.cacheNonce != null && a.set("cacheNonce", String(e.cacheNonce));
    let n3 = a.toString(), s = typeof e?.transform == "object" && e.transform !== null && Object.keys(e.transform).length > 0 ? "render/image" : "object";
    return { data: { publicUrl: encodeURI(`${this.url}/${s}/public/${r}`) + (n3 ? `?${n3}` : "") } };
  }
  async remove(t) {
    var e = this;
    return e.handleOperation(async () => await P3(e.fetch, `${e.url}/object/${e.bucketId}`, { prefixes: t }, { headers: e.headers }));
  }
  async list(t, e, r) {
    var a = this;
    return a.handleOperation(async () => {
      let n3 = c2(c2(c2({}, W3), e), {}, { prefix: t || "" });
      return await f4(a.fetch, `${a.url}/object/list/${a.bucketId}`, n3, { headers: a.headers }, r);
    });
  }
  async listV2(t, e) {
    var r = this;
    return r.handleOperation(async () => {
      let a = c2({}, t);
      return await f4(r.fetch, `${r.url}/object/list-v2/${r.bucketId}`, a, { headers: r.headers }, e);
    });
  }
  encodeMetadata(t) {
    return JSON.stringify(t);
  }
  toBase64(t) {
    return typeof __Buffer$ < "u" ? __Buffer$.from(t).toString("base64") : btoa(t);
  }
  _getFinalPath(t) {
    return `${this.bucketId}/${t.replace(/^\/+/, "")}`;
  }
  _removeEmptyFolders(t) {
    return t.replace(/^\/|\/$/g, "").replace(/\/+/g, "/");
  }
  applyTransformOptsToQuery(t, e) {
    return e.width && t.set("width", e.width.toString()), e.height && t.set("height", e.height.toString()), e.resize && t.set("resize", e.resize), e.format && t.set("format", e.format), e.quality && t.set("quality", e.quality.toString()), t;
  }
};
var Y3 = "2.108.1";
var _4 = { "X-Client-Info": `storage-js/${Y3}` };
var Z3 = class extends p2 {
  constructor(t, e = {}, r, a) {
    let n3 = new URL(t);
    a?.useNewHostname && /supabase\.(co|in|red)$/.test(n3.hostname) && !n3.hostname.includes("storage.supabase.") && (n3.hostname = n3.hostname.replace("supabase.", "storage.supabase."));
    let s = n3.href.replace(/\/$/, ""), o3 = c2(c2({}, _4), e);
    super(s, o3, r, "storage");
  }
  async listBuckets(t) {
    var e = this;
    return e.handleOperation(async () => {
      let r = e.listBucketOptionsToQueryString(t);
      return await m3(e.fetch, `${e.url}/bucket${r}`, { headers: e.headers });
    });
  }
  async getBucket(t) {
    var e = this;
    return e.handleOperation(async () => await m3(e.fetch, `${e.url}/bucket/${t}`, { headers: e.headers }));
  }
  async createBucket(t, e = { public: false }) {
    var r = this;
    return r.handleOperation(async () => await f4(r.fetch, `${r.url}/bucket`, { id: t, name: t, type: e.type, public: e.public, file_size_limit: e.fileSizeLimit, allowed_mime_types: e.allowedMimeTypes }, { headers: r.headers }));
  }
  async updateBucket(t, e) {
    var r = this;
    return r.handleOperation(async () => await B4(r.fetch, `${r.url}/bucket/${t}`, { id: t, name: t, public: e.public, file_size_limit: e.fileSizeLimit, allowed_mime_types: e.allowedMimeTypes }, { headers: r.headers }));
  }
  async emptyBucket(t) {
    var e = this;
    return e.handleOperation(async () => await f4(e.fetch, `${e.url}/bucket/${t}/empty`, {}, { headers: e.headers }));
  }
  async deleteBucket(t) {
    var e = this;
    return e.handleOperation(async () => await P3(e.fetch, `${e.url}/bucket/${t}`, {}, { headers: e.headers }));
  }
  listBucketOptionsToQueryString(t) {
    let e = {};
    return t && ("limit" in t && (e.limit = String(t.limit)), "offset" in t && (e.offset = String(t.offset)), t.search && (e.search = t.search), t.sortColumn && (e.sortColumn = t.sortColumn), t.sortOrder && (e.sortOrder = t.sortOrder)), Object.keys(e).length > 0 ? "?" + new URLSearchParams(e).toString() : "";
  }
};
var ee3 = class extends p2 {
  constructor(t, e = {}, r) {
    let a = t.replace(/\/$/, ""), n3 = c2(c2({}, _4), e);
    super(a, n3, r, "storage");
  }
  async createBucket(t) {
    var e = this;
    return e.handleOperation(async () => await f4(e.fetch, `${e.url}/bucket`, { name: t }, { headers: e.headers }));
  }
  async listBuckets(t) {
    var e = this;
    return e.handleOperation(async () => {
      let r = new URLSearchParams();
      t?.limit !== void 0 && r.set("limit", t.limit.toString()), t?.offset !== void 0 && r.set("offset", t.offset.toString()), t?.sortColumn && r.set("sortColumn", t.sortColumn), t?.sortOrder && r.set("sortOrder", t.sortOrder), t?.search && r.set("search", t.search);
      let a = r.toString(), n3 = a ? `${e.url}/bucket?${a}` : `${e.url}/bucket`;
      return await m3(e.fetch, n3, { headers: e.headers });
    });
  }
  async deleteBucket(t) {
    var e = this;
    return e.handleOperation(async () => await P3(e.fetch, `${e.url}/bucket/${t}`, {}, { headers: e.headers }));
  }
  from(t) {
    var e = this;
    if (!q4(t)) throw new w4("Invalid bucket name: File, folder, and bucket names must follow AWS object key naming guidelines and should avoid the use of any other characters.");
    let r = new I2({ baseUrl: this.url, catalogName: t, auth: { type: "custom", getHeaders: async () => e.headers }, fetch: this.fetch }), a = this.shouldThrowOnError;
    return new Proxy(r, { get(n3, s) {
      let o3 = n3[s];
      return typeof o3 != "function" ? o3 : async (...u3) => {
        try {
          return { data: await o3.apply(n3, u3), error: null };
        } catch (i4) {
          if (a) throw i4;
          return { data: null, error: i4 };
        }
      };
    } });
  }
};
var te3 = class extends p2 {
  constructor(t, e = {}, r) {
    let a = t.replace(/\/$/, ""), n3 = c2(c2({}, _4), {}, { "Content-Type": "application/json" }, e);
    super(a, n3, r, "vectors");
  }
  async createIndex(t) {
    var e = this;
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/CreateIndex`, t, { headers: e.headers }) || {});
  }
  async getIndex(t, e) {
    var r = this;
    return r.handleOperation(async () => await h2.post(r.fetch, `${r.url}/GetIndex`, { vectorBucketName: t, indexName: e }, { headers: r.headers }));
  }
  async listIndexes(t) {
    var e = this;
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/ListIndexes`, t, { headers: e.headers }));
  }
  async deleteIndex(t, e) {
    var r = this;
    return r.handleOperation(async () => await h2.post(r.fetch, `${r.url}/DeleteIndex`, { vectorBucketName: t, indexName: e }, { headers: r.headers }) || {});
  }
};
var re3 = class extends p2 {
  constructor(t, e = {}, r) {
    let a = t.replace(/\/$/, ""), n3 = c2(c2({}, _4), {}, { "Content-Type": "application/json" }, e);
    super(a, n3, r, "vectors");
  }
  async putVectors(t) {
    var e = this;
    if (t.vectors.length < 1 || t.vectors.length > 500) throw new Error("Vector batch size must be between 1 and 500 items");
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/PutVectors`, t, { headers: e.headers }) || {});
  }
  async getVectors(t) {
    var e = this;
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/GetVectors`, t, { headers: e.headers }));
  }
  async listVectors(t) {
    var e = this;
    if (t.segmentCount !== void 0) {
      if (t.segmentCount < 1 || t.segmentCount > 16) throw new Error("segmentCount must be between 1 and 16");
      if (t.segmentIndex !== void 0 && (t.segmentIndex < 0 || t.segmentIndex >= t.segmentCount)) throw new Error(`segmentIndex must be between 0 and ${t.segmentCount - 1}`);
    }
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/ListVectors`, t, { headers: e.headers }));
  }
  async queryVectors(t) {
    var e = this;
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/QueryVectors`, t, { headers: e.headers }));
  }
  async deleteVectors(t) {
    var e = this;
    if (t.keys.length < 1 || t.keys.length > 500) throw new Error("Keys batch size must be between 1 and 500 items");
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/DeleteVectors`, t, { headers: e.headers }) || {});
  }
};
var ae3 = class extends p2 {
  constructor(t, e = {}, r) {
    let a = t.replace(/\/$/, ""), n3 = c2(c2({}, _4), {}, { "Content-Type": "application/json" }, e);
    super(a, n3, r, "vectors");
  }
  async createBucket(t) {
    var e = this;
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/CreateVectorBucket`, { vectorBucketName: t }, { headers: e.headers }) || {});
  }
  async getBucket(t) {
    var e = this;
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/GetVectorBucket`, { vectorBucketName: t }, { headers: e.headers }));
  }
  async listBuckets(t = {}) {
    var e = this;
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/ListVectorBuckets`, t, { headers: e.headers }));
  }
  async deleteBucket(t) {
    var e = this;
    return e.handleOperation(async () => await h2.post(e.fetch, `${e.url}/DeleteVectorBucket`, { vectorBucketName: t }, { headers: e.headers }) || {});
  }
};
var ne3 = class extends ae3 {
  constructor(t, e = {}) {
    super(t, e.headers || {}, e.fetch);
  }
  from(t) {
    return new se2(this.url, this.headers, t, this.fetch);
  }
  async createBucket(t) {
    var e = () => super.createBucket, r = this;
    return e().call(r, t);
  }
  async getBucket(t) {
    var e = () => super.getBucket, r = this;
    return e().call(r, t);
  }
  async listBuckets(t = {}) {
    var e = () => super.listBuckets, r = this;
    return e().call(r, t);
  }
  async deleteBucket(t) {
    var e = () => super.deleteBucket, r = this;
    return e().call(r, t);
  }
};
var se2 = class extends te3 {
  constructor(t, e, r, a) {
    super(t, e, a), this.vectorBucketName = r;
  }
  async createIndex(t) {
    var e = () => super.createIndex, r = this;
    return e().call(r, c2(c2({}, t), {}, { vectorBucketName: r.vectorBucketName }));
  }
  async listIndexes(t = {}) {
    var e = () => super.listIndexes, r = this;
    return e().call(r, c2(c2({}, t), {}, { vectorBucketName: r.vectorBucketName }));
  }
  async getIndex(t) {
    var e = () => super.getIndex, r = this;
    return e().call(r, r.vectorBucketName, t);
  }
  async deleteIndex(t) {
    var e = () => super.deleteIndex, r = this;
    return e().call(r, r.vectorBucketName, t);
  }
  index(t) {
    return new ce2(this.url, this.headers, this.vectorBucketName, t, this.fetch);
  }
};
var ce2 = class extends re3 {
  constructor(t, e, r, a, n3) {
    super(t, e, n3), this.vectorBucketName = r, this.indexName = a;
  }
  async putVectors(t) {
    var e = () => super.putVectors, r = this;
    return e().call(r, c2(c2({}, t), {}, { vectorBucketName: r.vectorBucketName, indexName: r.indexName }));
  }
  async getVectors(t) {
    var e = () => super.getVectors, r = this;
    return e().call(r, c2(c2({}, t), {}, { vectorBucketName: r.vectorBucketName, indexName: r.indexName }));
  }
  async listVectors(t = {}) {
    var e = () => super.listVectors, r = this;
    return e().call(r, c2(c2({}, t), {}, { vectorBucketName: r.vectorBucketName, indexName: r.indexName }));
  }
  async queryVectors(t) {
    var e = () => super.queryVectors, r = this;
    return e().call(r, c2(c2({}, t), {}, { vectorBucketName: r.vectorBucketName, indexName: r.indexName }));
  }
  async deleteVectors(t) {
    var e = () => super.deleteVectors, r = this;
    return e().call(r, c2(c2({}, t), {}, { vectorBucketName: r.vectorBucketName, indexName: r.indexName }));
  }
};
var fe3 = class extends Z3 {
  constructor(t, e = {}, r, a) {
    super(t, e, r, a);
  }
  from(t) {
    return new X3(this.url, this.headers, t, this.fetch);
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
function $6(e, t, r, n3) {
  function s(i4) {
    return i4 instanceof r ? i4 : new r(function(l) {
      l(i4);
    });
  }
  return new (r || (r = Promise))(function(i4, l) {
    function p3(c3) {
      try {
        f5(n3.next(c3));
      } catch (u3) {
        l(u3);
      }
    }
    function a(c3) {
      try {
        f5(n3.throw(c3));
      } catch (u3) {
        l(u3);
      }
    }
    function f5(c3) {
      c3.done ? i4(c3.value) : s(c3.value).then(p3, a);
    }
    f5((n3 = n3.apply(e, t || [])).next());
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
      let e = yield B5();
      if (!e || !e.propagation || !e.context) return null;
      let t = {};
      e.propagation.inject(e.context.active(), t);
      let r = t.traceparent;
      return r ? { traceparent: r, tracestate: t.tracestate, baggage: t.baggage } : null;
    } catch {
      return null;
    }
  });
}
function z4(e) {
  if (!e || typeof e != "string") return null;
  let t = e.split("-");
  if (t.length !== 4) return null;
  let [r, n3, s, i4] = t;
  if (r.length !== 2 || n3.length !== 32 || s.length !== 16 || i4.length !== 2) return null;
  let l = /^[0-9a-f]+$/i;
  return !l.test(r) || !l.test(n3) || !l.test(s) || !l.test(i4) || n3 === "00000000000000000000000000000000" || s === "0000000000000000" ? null : { version: r, traceId: n3, parentId: s, traceFlags: i4, isSampled: (parseInt(i4, 16) & 1) === 1 };
}
function W4(e, t) {
  if (!e || !t || t.length === 0) return false;
  let r;
  if (e instanceof URL) r = e;
  else try {
    r = new URL(e);
  } catch {
    return false;
  }
  for (let n3 of t) try {
    if (typeof n3 == "string") {
      if (V4(r.hostname, n3)) return true;
    } else if (n3 instanceof RegExp) {
      if (n3.test(r.hostname)) return true;
    } else if (typeof n3 == "function" && n3(r)) return true;
  } catch {
    continue;
  }
  return false;
}
function V4(e, t) {
  if (t === e) return true;
  if (t.startsWith("*.")) {
    let r = t.slice(2);
    if (e.endsWith(r) && (e === r || e.endsWith("." + r))) return true;
  }
  return false;
}
function q5(e) {
  let t = [];
  try {
    let r = new URL(e);
    t.push(r.hostname);
  } catch {
  }
  return t.push("*.supabase.co", "*.supabase.in"), t.push("localhost", "127.0.0.1", "[::1]"), t;
}
function y3(e) {
  "@babel/helpers - typeof";
  return y3 = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(t) {
    return typeof t;
  } : function(t) {
    return t && typeof Symbol == "function" && t.constructor === Symbol && t !== Symbol.prototype ? "symbol" : typeof t;
  }, y3(e);
}
function J4(e, t) {
  if (y3(e) != "object" || !e) return e;
  var r = e[Symbol.toPrimitive];
  if (r !== void 0) {
    var n3 = r.call(e, t || "default");
    if (y3(n3) != "object") return n3;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (t === "string" ? String : Number)(e);
}
function X4(e) {
  var t = J4(e, "string");
  return y3(t) == "symbol" ? t : t + "";
}
function Q4(e, t, r) {
  return (t = X4(t)) in e ? Object.defineProperty(e, t, { value: r, enumerable: true, configurable: true, writable: true }) : e[t] = r, e;
}
function E7(e, t) {
  var r = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var n3 = Object.getOwnPropertySymbols(e);
    t && (n3 = n3.filter(function(s) {
      return Object.getOwnPropertyDescriptor(e, s).enumerable;
    })), r.push.apply(r, n3);
  }
  return r;
}
function o2(e) {
  for (var t = 1; t < arguments.length; t++) {
    var r = arguments[t] != null ? arguments[t] : {};
    t % 2 ? E7(Object(r), true).forEach(function(n3) {
      Q4(e, n3, r[n3]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(r)) : E7(Object(r)).forEach(function(n3) {
      Object.defineProperty(e, n3, Object.getOwnPropertyDescriptor(r, n3));
    });
  }
  return e;
}
var Y4 = (e) => e ? (...t) => e(...t) : (...t) => fetch(...t);
var Z4 = () => Headers;
var ee4 = (e, t, r, n3, s) => {
  let i4 = Y4(n3), l = Z4(), p3 = s?.enabled === true, a = s?.respectSamplingDecision !== false, f5 = p3 ? q5(t) : null;
  return async (c3, u3) => {
    var m4;
    let b4 = (m4 = await r()) !== null && m4 !== void 0 ? m4 : e, h3 = new l(u3?.headers);
    if (h3.has("apikey") || h3.set("apikey", e), h3.has("Authorization") || h3.set("Authorization", `Bearer ${b4}`), f5) {
      let d = await te4(c3, f5, a);
      d && (d.traceparent && !h3.has("traceparent") && h3.set("traceparent", d.traceparent), d.tracestate && !h3.has("tracestate") && h3.set("tracestate", d.tracestate), d.baggage && !h3.has("baggage") && h3.set("baggage", d.baggage));
    }
    return i4(c3, o2(o2({}, u3), {}, { headers: h3 }));
  };
};
async function te4(e, t, r) {
  if (!W4(typeof e == "string" || e instanceof URL ? e : e.url, t)) return null;
  let n3 = await M5();
  if (!n3 || !n3.traceparent) return null;
  if (r) {
    let s = z4(n3.traceparent);
    if (s && !s.isSampled) return null;
  }
  return n3;
}
function P4(e) {
  return typeof e == "boolean" ? { enabled: e } : e;
}
function re4(e) {
  return e.endsWith("/") ? e : e + "/";
}
function ne4(e, t) {
  var r, n3, s, i4, l, p3;
  let { db: a, auth: f5, realtime: c3, global: u3 } = e, { db: m4, auth: b4, realtime: h3, global: d } = t, g2 = P4(e.tracePropagation), v3 = P4(t.tracePropagation), S7 = { db: o2(o2({}, m4), a), auth: o2(o2({}, b4), f5), realtime: o2(o2({}, h3), c3), storage: {}, global: o2(o2(o2({}, d), u3), {}, { headers: o2(o2({}, (r = d?.headers) !== null && r !== void 0 ? r : {}), (n3 = u3?.headers) !== null && n3 !== void 0 ? n3 : {}) }), tracePropagation: { enabled: (s = (i4 = g2?.enabled) !== null && i4 !== void 0 ? i4 : v3?.enabled) !== null && s !== void 0 ? s : false, respectSamplingDecision: (l = (p3 = g2?.respectSamplingDecision) !== null && p3 !== void 0 ? p3 : v3?.respectSamplingDecision) !== null && l !== void 0 ? l : true }, accessToken: async () => "" };
  return e.accessToken ? S7.accessToken = e.accessToken : delete S7.accessToken, S7;
}
function se3(e) {
  let t = e?.trim();
  if (!t) throw new Error("supabaseUrl is required.");
  if (!t.match(/^https?:\/\//i)) throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
  try {
    return new URL(re4(t));
  } catch {
    throw Error("Invalid supabaseUrl: Provided URL is malformed.");
  }
}
var ie2 = class extends Ht {
  constructor(e) {
    super(e);
  }
};
var ae4 = class {
  constructor(e, t, r) {
    var n3, s;
    this.supabaseUrl = e, this.supabaseKey = t;
    let i4 = se3(e);
    if (!t) throw new Error("supabaseKey is required.");
    this.realtimeUrl = new URL("realtime/v1", i4), this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws"), this.authUrl = new URL("auth/v1", i4), this.storageUrl = new URL("storage/v1", i4), this.functionsUrl = new URL("functions/v1", i4);
    let l = `sb-${i4.hostname.split(".")[0]}-auth-token`, p3 = { db: j5, realtime: H6, auth: o2(o2({}, x6), {}, { storageKey: l }), global: N7, tracePropagation: K4 }, a = ne4(r ?? {}, p3);
    if (this.settings = a, this.storageKey = (n3 = a.auth.storageKey) !== null && n3 !== void 0 ? n3 : "", this.headers = (s = a.global.headers) !== null && s !== void 0 ? s : {}, a.accessToken) this.accessToken = a.accessToken, this.auth = new Proxy({}, { get: (c3, u3) => {
      throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(u3)} is not possible`);
    } });
    else {
      var f5;
      this.auth = this._initSupabaseAuthClient((f5 = a.auth) !== null && f5 !== void 0 ? f5 : {}, this.headers, a.global.fetch);
    }
    this.fetch = ee4(t, e, this._getAccessToken.bind(this), a.global.fetch, a.tracePropagation), this.realtime = this._initRealtimeClient(o2({ headers: this.headers, accessToken: this._getAccessToken.bind(this), fetch: this.fetch }, a.realtime)), this.accessToken && Promise.resolve(this.accessToken()).then((c3) => this.realtime.setAuth(c3)).catch((c3) => console.warn("Failed to set initial Realtime auth token:", c3)), this.rest = new C2(new URL("rest/v1", i4).href, { headers: this.headers, schema: a.db.schema, fetch: this.fetch, timeout: a.db.timeout, urlLengthLimit: a.db.urlLengthLimit }), this.storage = new fe3(this.storageUrl.href, this.headers, this.fetch, r?.storage), a.accessToken || this._listenForAuthEvents();
  }
  get functions() {
    return new A2(this.functionsUrl.href, { headers: this.headers, customFetch: this.fetch });
  }
  from(e) {
    return this.rest.from(e);
  }
  schema(e) {
    return this.rest.schema(e);
  }
  rpc(e, t = {}, r = { head: false, get: false, count: void 0 }) {
    return this.rest.rpc(e, t, r);
  }
  channel(e, t = { config: {} }) {
    return this.realtime.channel(e, t);
  }
  getChannels() {
    return this.realtime.getChannels();
  }
  removeChannel(e) {
    return this.realtime.removeChannel(e);
  }
  removeAllChannels() {
    return this.realtime.removeAllChannels();
  }
  async _getAccessToken() {
    var e = this, t, r;
    if (e.accessToken) return await e.accessToken();
    let { data: n3 } = await e.auth.getSession();
    return (t = (r = n3.session) === null || r === void 0 ? void 0 : r.access_token) !== null && t !== void 0 ? t : e.supabaseKey;
  }
  _initSupabaseAuthClient({ autoRefreshToken: e, persistSession: t, detectSessionInUrl: r, storage: n3, userStorage: s, storageKey: i4, flowType: l, lock: p3, debug: a, throwOnError: f5, experimental: c3, lockAcquireTimeout: u3, skipAutoInitialize: m4 }, b4, h3) {
    let d = { Authorization: `Bearer ${this.supabaseKey}`, apikey: `${this.supabaseKey}` };
    return new ie2({ url: this.authUrl.href, headers: o2(o2({}, d), b4), storageKey: i4, autoRefreshToken: e, persistSession: t, detectSessionInUrl: r, storage: n3, userStorage: s, flowType: l, lock: p3, debug: a, throwOnError: f5, experimental: c3, fetch: h3, lockAcquireTimeout: u3, skipAutoInitialize: m4, hasCustomAuthorizationHeader: Object.keys(this.headers).some((g2) => g2.toLowerCase() === "authorization") });
  }
  _initRealtimeClient(e) {
    return new j3(this.realtimeUrl.href, o2(o2({}, e), {}, { params: o2(o2({}, { apikey: this.supabaseKey }), e?.params) }));
  }
  _listenForAuthEvents() {
    return this.auth.onAuthStateChange((e, t) => {
      this._handleTokenChanged(e, "CLIENT", t?.access_token);
    });
  }
  _handleTokenChanged(e, t, r) {
    (e === "TOKEN_REFRESHED" || e === "SIGNED_IN") && this.changedAccessToken !== r ? (this.changedAccessToken = r, this.realtime.setAuth(r)) : e === "SIGNED_OUT" && (this.realtime.setAuth(), t == "STORAGE" && this.auth.signOut(), this.changedAccessToken = void 0);
  }
};
var ye2 = (e, t, r) => new ae4(e, t, r);
function oe3() {
  if (typeof globalThis < "u") return false;
  let e = __Process$2;
  if (!e) return false;
  let t = e.version;
  if (t == null) return false;
  let r = t.match(/^v(\d+)\./);
  return r ? parseInt(r[1], 10) <= 18 : false;
}
oe3() && console.warn("\u26A0\uFE0F  Node.js 18 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 20 or later. For more information, visit: https://github.com/orgs/supabase/discussions/37217");

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/client/worker/worker.ts
var SMTPWorker = class {
  id = 1;
  #timeout;
  constructor(config) {
    this.#config = config;
    this.#timeout = config.pool.timeout;
  }
  #w;
  #idleTO = null;
  #idleMode2 = false;
  #noCon = true;
  #config;
  #resolver = /* @__PURE__ */ new Map();
  #startup() {
    this.#w = new Worker(new URL("./worker-file.ts", import.meta.url), {
      type: "module",
      deno: {
        permissions: {
          net: "inherit",
          // ts files
          read: true
        },
        namespace: true
      }
      // This allowes the deno option so only for pool and worker we need --unstable
      // deno-lint-ignore no-explicit-any
    });
    this.#w.addEventListener(
      "message",
      // deno-lint-ignore no-explicit-any
      (ev) => {
        if (typeof ev.data === "object") {
          if ("err" in ev.data) {
            this.#resolver.get(ev.data.__ret)?.rej(ev.data.err);
          }
          if ("res" in ev.data) {
            this.#resolver.get(ev.data.__ret)?.res(ev.data.res);
          }
          this.#resolver.delete(ev.data.__ret);
          return;
        }
        if (ev.data) {
          this.#stopIdle();
        } else {
          if (this.#idleMode2) {
            this.#cleanup();
          } else {
            this.#startIdle();
          }
        }
      }
    );
    this.#w.postMessage({
      __setup: {
        ...this.#config,
        client: {
          ...this.#config.client,
          preprocessors: []
        }
      }
    });
    this.#noCon = false;
  }
  #startIdle() {
    console.log("started idle");
    if (this.#idleTO) {
      return;
    }
    this.#idleTO = setTimeout(() => {
      console.log("idle mod 2");
      this.#idleMode2 = true;
      this.#w.postMessage({ __check_idle: true });
    }, this.#timeout);
  }
  #stopIdle() {
    if (this.#idleTO) {
      clearTimeout(this.#idleTO);
    }
    this.#idleMode2 = false;
    this.#idleTO = null;
  }
  #cleanup() {
    console.log("killed");
    this.#w.terminate();
    this.#stopIdle();
  }
  send(mail) {
    const myID = this.id;
    this.id++;
    this.#stopIdle();
    if (this.#noCon) {
      this.#startup();
    }
    this.#w.postMessage({
      __mail: myID,
      mail
    });
    return new Promise((res, rej) => {
      this.#resolver.set(myID, { res, rej });
    });
  }
  close() {
    if (this.#w) this.#w.terminate();
    if (this.#idleTO) {
      clearTimeout(this.#idleTO);
    }
  }
};

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/client/pool.ts
var SMTPWorkerPool = class {
  pool = [];
  constructor(config) {
    for (let i4 = 0; i4 < config.pool.size; i4++) {
      this.pool.push(new SMTPWorker(config));
    }
  }
  #lastUsed = -1;
  send(mail) {
    this.#lastUsed = (this.#lastUsed + 1) % this.pool.length;
    return this.pool[this.#lastUsed].send(mail);
  }
  close() {
    this.pool.forEach((v3) => v3.close());
  }
};

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/client/basic/QUE.ts
var QUE = class {
  running = false;
  #que = [];
  idle = Promise.resolve();
  #idbleCB;
  que() {
    if (!this.running) {
      this.running = true;
      this.idle = new Promise((res) => {
        this.#idbleCB = res;
      });
      return Promise.resolve();
    }
    return new Promise((res) => {
      this.#que.push(res);
    });
  }
  next() {
    if (this.#que.length === 0) {
      this.running = false;
      if (this.#idbleCB) {
        this.#idbleCB();
      }
      return;
    }
    this.#que[0]();
    this.#que.splice(0, 1);
  }
};

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/client/basic/transforms.ts
var TextEncoderOrIntArrayStream = class {
  #encoder = new TextEncoder();
  #transform = new TransformStream({
    transform: (chunk, ctx) => {
      if (typeof chunk === "string") {
        ctx.enqueue(this.#encoder.encode(chunk));
        return;
      }
      ctx.enqueue(chunk);
    }
  });
  get readable() {
    return this.#transform.readable;
  }
  get writable() {
    return this.#transform.writable;
  }
};
var TextLineStream = class {
  #buf = "";
  #transform = new TransformStream({
    transform: (chunk, controller) => this.#handle(chunk, controller),
    flush: (controler) => this.#handle("\r\n", controler)
  });
  get readable() {
    return this.#transform.readable;
  }
  get writable() {
    return this.#transform.writable;
  }
  #handle(chunk, controller) {
    chunk = this.#buf + chunk;
    const chunks = chunk.split("\r\n");
    if (chunks.length > 1) {
      for (let i4 = 0; i4 < chunks.length - 1; i4++) {
        controller.enqueue(chunks[i4]);
      }
    }
    this.#buf = chunks.at(-1) ?? "";
  }
};
var TextDecoderStream = class {
  #decoder;
  #transform;
  constructor(label = "utf-8", options = {}) {
    this.#decoder = new TextDecoder(label, options);
    this.#transform = new TransformStream({
      transform: (chunk, controller) => {
        const decoded = this.#decoder.decode(chunk, { stream: true });
        if (decoded) {
          controller.enqueue(decoded);
        }
      },
      flush: (controller) => {
        const final = this.#decoder.decode();
        if (final) {
          controller.enqueue(final);
        }
      }
    });
  }
  get readable() {
    return this.#transform.readable;
  }
  get writable() {
    return this.#transform.writable;
  }
  close() {
    this.#decoder.decode();
  }
};

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/client/basic/connection.ts
var SMTPConnection = class {
  constructor(conn, config) {
    this.conn = conn;
    this.config = config;
    this.#writableTransformStream.readable.pipeThrough(this.#outTransform).pipeTo(this.conn.writable);
    this.#readableStream = this.conn.readable.pipeThrough(this.#decoder).pipeThrough(this.#lineStream);
    this.#reader = this.#readableStream.getReader();
    this.#writer = this.#writableTransformStream.writable.getWriter();
  }
  #outTransform = new TextEncoderOrIntArrayStream();
  #decoder = new TextDecoderStream();
  #lineStream = new TextLineStream();
  #writableTransformStream = new TransformStream();
  #readableStream;
  #reader;
  #writer;
  #que = new QUE();
  async cleanupForStartTLS() {
    await this.#reader.cancel();
    await this.#writer.close();
  }
  async readLine() {
    const ret = await this.#reader.read();
    return ret.value ?? null;
  }
  async write(chunks) {
    if (chunks.length === 0) return;
    await this.#que.que();
    for (const chunk of chunks) {
      await this.#writer.write(chunk);
    }
    this.#que.next();
  }
  close() {
    try {
      this.conn.close();
    } catch (_ex) {
    }
    try {
      this.#decoder.close();
    } catch (_ex) {
    }
  }
  assertCode(cmd, code, msg) {
    if (!cmd) {
      throw new Error(`invalid cmd`);
    }
    if (cmd.code !== code) {
      throw new Error(msg || cmd.code + ": " + cmd.args);
    }
  }
  async readCmd() {
    const result = [];
    while (result.length === 0 || result.at(-1) && result.at(-1).at(3) === "-") {
      result.push(await this.readLine());
    }
    const nonNullResult = result.filter((v3) => v3 !== null);
    if (nonNullResult.length === 0) return null;
    const code = parseInt(nonNullResult[0].slice(0, 3));
    const data = nonNullResult.map((v3) => v3.slice(4).trim());
    if (this.config.debug.log) {
      nonNullResult.forEach((v3) => console.log(v3));
    }
    return {
      code,
      args: data
    };
  }
  writeCmd(...args) {
    if (this.config.debug.log) {
      console.table(args);
    }
    return this.write([args.join(" ") + "\r\n"]);
  }
  writeCmdBinary(...args) {
    if (this.config.debug.log) {
      console.table(args.map(() => "Uint8Array"));
    }
    return this.write(args);
  }
  async writeCmdAndRead(...args) {
    await this.writeCmd(...args);
    return this.readCmd();
  }
  async writeCmdAndAssert(code, ...args) {
    const res = await this.writeCmdAndRead(...args);
    this.assertCode(res, code);
    return res;
  }
};

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/client/basic/client.ts
var CommandCode = {
  READY: 220,
  AUTHO_NEXT: 334,
  AUTHO_SUCCESS: 235,
  OK: 250,
  BEGIN_DATA: 354,
  FAIL: 554
};
var SMTPClient = class {
  constructor(config) {
    this.config = config;
    this.#ready = (async () => {
      let conn;
      if (this.config.connection.tls) {
        conn = await Deno.connectTls({
          hostname: this.config.connection.hostname,
          port: this.config.connection.port
        });
        this.secure = true;
      } else {
        conn = await Deno.connect({
          hostname: this.config.connection.hostname,
          port: this.config.connection.port
        });
      }
      this.#connection = new SMTPConnection(conn, config);
      await this.#prepareConnection();
    })();
  }
  secure = false;
  #connection;
  #que = new QUE();
  #ready;
  close() {
    return this.#connection.close();
  }
  get isSending() {
    return this.#que.running;
  }
  get idle() {
    return this.#que.idle;
  }
  async send(config) {
    await this.#ready;
    let dataMode = false;
    try {
      await this.#que.que();
      await this.#connection.writeCmdAndAssert(
        CommandCode.OK,
        "MAIL",
        "FROM:",
        `<${config.from.mail}>`
      );
      for (let i4 = 0; i4 < config.to.length; i4++) {
        await this.#connection.writeCmdAndAssert(
          CommandCode.OK,
          "RCPT",
          "TO:",
          `<${config.to[i4].mail}>`
        );
      }
      for (let i4 = 0; i4 < config.cc.length; i4++) {
        await this.#connection.writeCmdAndAssert(
          CommandCode.OK,
          "RCPT",
          "TO:",
          `<${config.cc[i4].mail}>`
        );
      }
      for (let i4 = 0; i4 < config.bcc.length; i4++) {
        await this.#connection.writeCmdAndAssert(
          CommandCode.OK,
          "RCPT",
          "TO:",
          `<${config.bcc[i4].mail}>`
        );
      }
      dataMode = true;
      await this.#connection.writeCmdAndAssert(CommandCode.BEGIN_DATA, "DATA");
      this.#connection.writeCmd("Subject: ", config.subject);
      this.#connection.writeCmd(
        "From: ",
        `${config.from.name} <${config.from.mail}>`
      );
      if (config.to.length > 0) {
        this.#connection.writeCmd(
          "To: ",
          config.to.map((m4) => `${m4.name} <${m4.mail}>`).join(";")
        );
      }
      if (config.cc.length > 0) {
        this.#connection.writeCmd(
          "Cc: ",
          config.cc.map((m4) => `${m4.name} <${m4.mail}>`).join(";")
        );
      }
      this.#connection.writeCmd("Date: ", config.date);
      const obj = Object.entries(config.headers);
      for (let i4 = 0; i4 < obj.length; i4++) {
        const [name, value] = obj[i4];
        this.#connection.writeCmd(name + ": ", value);
      }
      if (config.inReplyTo) {
        this.#connection.writeCmd("InReplyTo: ", config.inReplyTo);
      }
      if (config.references) {
        this.#connection.writeCmd("References: ", config.references);
      }
      if (config.replyTo) {
        this.#connection.writeCmd(
          "Reply-To: ",
          `${config.replyTo.name} <${config.replyTo.mail}>`
        );
      }
      if (config.priority) {
        this.#connection.writeCmd("Priority:", config.priority);
      }
      this.#connection.writeCmd("MIME-Version: 1.0");
      let boundaryAdditionAtt = 100;
      config.mimeContent.map((v3) => v3.content).join("\n").replace(
        new RegExp("--attachment([0-9]+)", "g"),
        (_6, numb) => {
          boundaryAdditionAtt += parseInt(numb, 10);
          return "";
        }
      );
      config.attachments.map((v3) => {
        return v3.content;
      }).join("\n").replace(
        new RegExp("--attachment([0-9]+)", "g"),
        (_6, numb) => {
          boundaryAdditionAtt += parseInt(numb, 10);
          return "";
        }
      );
      const attachmentBoundary = `attachment${boundaryAdditionAtt}`;
      this.#connection.writeCmd(
        `Content-Type: multipart/mixed; boundary=${attachmentBoundary}`,
        "\r\n"
      );
      this.#connection.writeCmd(`--${attachmentBoundary}`);
      let boundaryAddition = 100;
      config.mimeContent.map((v3) => v3.content).join("\n").replace(
        new RegExp("--message([0-9]+)", "g"),
        (_6, numb) => {
          boundaryAddition += parseInt(numb, 10);
          return "";
        }
      );
      const messageBoundary = `message${boundaryAddition}`;
      this.#connection.writeCmd(
        `Content-Type: multipart/alternative; boundary=${messageBoundary}`,
        "\r\n"
      );
      for (let i4 = 0; i4 < config.mimeContent.length; i4++) {
        this.#connection.writeCmd(`--${messageBoundary}`);
        this.#connection.writeCmd(
          "Content-Type: " + config.mimeContent[i4].mimeType
        );
        if (config.mimeContent[i4].transferEncoding) {
          this.#connection.writeCmd(
            `Content-Transfer-Encoding: ${config.mimeContent[i4].transferEncoding}\r
`
          );
        } else {
          this.#connection.writeCmd("");
        }
        this.#connection.writeCmd(config.mimeContent[i4].content, "\r\n");
      }
      this.#connection.writeCmd(`--${messageBoundary}--\r
`);
      for (let i4 = 0; i4 < config.attachments.length; i4++) {
        const attachment = config.attachments[i4];
        this.#connection.writeCmd(`--${attachmentBoundary}`);
        this.#connection.writeCmd(
          "Content-Type:",
          attachment.contentType + ";",
          "name=" + attachment.filename
        );
        if (attachment.contentID) {
          this.#connection.writeCmd(
            `Content-ID: <${attachment.contentID}>`
          );
        }
        this.#connection.writeCmd(
          "Content-Disposition: attachment; filename=" + attachment.filename
        );
        if (attachment.encoding === "base64") {
          this.#connection.writeCmd(
            "Content-Transfer-Encoding: base64\r\n"
          );
          for (let line = 0; line < Math.ceil(attachment.content.length / 75); line++) {
            const lineOfBase64 = attachment.content.slice(
              line * 75,
              (line + 1) * 75
            );
            this.#connection.writeCmd(lineOfBase64);
          }
          this.#connection.writeCmd("\r\n");
        } else if (attachment.encoding === "text") {
          this.#connection.writeCmd(
            "Content-Transfer-Encoding: quoted-printable",
            "\r\n"
          );
          this.#connection.writeCmd(attachment.content, "\r\n");
        }
      }
      this.#connection.writeCmd(`--${attachmentBoundary}--\r
`);
      await this.#connection.writeCmdAndAssert(CommandCode.OK, ".\r\n");
      dataMode = false;
      await this.#cleanup();
      this.#que.next();
    } catch (ex) {
      if (dataMode) {
        console.error("Error while in datamode - connection not recoverable");
        queueMicrotask(() => {
          this.#connection.conn?.close();
        });
        throw ex;
      }
      await this.#cleanup();
      this.#que.next();
      throw ex;
    }
  }
  async #prepareConnection() {
    this.#connection.assertCode(
      await this.#connection.readCmd(),
      CommandCode.READY
    );
    await this.#connection.writeCmd("EHLO", this.config.connection.hostname);
    const cmd = await this.#connection.readCmd();
    if (!cmd) throw new Error("Unexpected empty response");
    if (typeof cmd.args === "string") {
      this.#supportedFeatures.add(cmd.args);
    } else {
      cmd.args.forEach((cmd2) => {
        this.#supportedFeatures.add(cmd2);
      });
    }
    if (
      // When in TLS don't use STARTTLS
      !this.secure && // Check for STARTTLS support
      this.#supportedFeatures.has("STARTTLS") && // Check that STARTTLS is allowed
      !this.config.debug.noStartTLS
    ) {
      this.#connection.writeCmdAndAssert(CommandCode.READY, "STARTTLS");
      await this.#connection.cleanupForStartTLS();
      const conn = await Deno.startTls(this.#connection.conn, {
        hostname: this.config.connection.hostname
      });
      this.#connection = new SMTPConnection(conn, this.config);
      this.secure = true;
      this.#connection.writeCmdAndRead("EHLO", this.config.connection.hostname);
    }
    if (!this.config.debug.allowUnsecure && !this.secure) {
      this.#connection.close();
      this.#connection = null;
      throw new Error(
        "Connection is not secure! Don't send authentication over non secure connection!"
      );
    }
    if (this.config.connection.auth) {
      await this.#connection.writeCmdAndAssert(
        CommandCode.AUTHO_NEXT,
        "AUTH",
        "LOGIN"
      );
      await this.#connection.writeCmdAndAssert(
        CommandCode.AUTHO_NEXT,
        btoa(this.config.connection.auth.username)
      );
      await this.#connection.writeCmdAndAssert(
        CommandCode.AUTHO_SUCCESS,
        btoa(this.config.connection.auth.password)
      );
    }
    await this.#cleanup();
  }
  #supportedFeatures = /* @__PURE__ */ new Set();
  async #cleanup() {
    this.#connection.writeCmd("NOOP");
    while (true) {
      const cmd = await this.#connection.readCmd();
      if (cmd && cmd.code === 250) return;
    }
  }
};

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/config/client.ts
function resolveClientOptions(config) {
  return {
    debug: {
      log: config.debug?.log ?? false,
      allowUnsecure: config.debug?.allowUnsecure ?? false,
      encodeLB: config.debug?.encodeLB ?? false,
      noStartTLS: config.debug?.noStartTLS ?? false
    },
    connection: {
      hostname: config.connection.hostname,
      port: config.connection.port ?? (config.connection.tls ? 465 : 25),
      tls: config.connection.tls ?? false,
      auth: config.connection.auth
    },
    pool: config.pool ? config.pool === true ? {
      size: 2,
      timeout: 6e4
    } : {
      size: config.pool.size ?? 2,
      timeout: config.pool.timeout ?? 6e4
    } : void 0,
    client: {
      warning: config.client?.warning ?? "log",
      preprocessors: config.client?.preprocessors ?? []
    }
  };
}

// supabase/functions/_vendor/deno.land/std@0.173.0/encoding/base64.ts
var base64abc = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "+",
  "/"
];
function encode(data) {
  const uint8 = typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let result = "", i4;
  const l = uint8.length;
  for (i4 = 2; i4 < l; i4 += 3) {
    result += base64abc[uint8[i4 - 2] >> 2];
    result += base64abc[(uint8[i4 - 2] & 3) << 4 | uint8[i4 - 1] >> 4];
    result += base64abc[(uint8[i4 - 1] & 15) << 2 | uint8[i4] >> 6];
    result += base64abc[uint8[i4] & 63];
  }
  if (i4 === l + 1) {
    result += base64abc[uint8[i4 - 2] >> 2];
    result += base64abc[(uint8[i4 - 2] & 3) << 4];
    result += "==";
  }
  if (i4 === l) {
    result += base64abc[uint8[i4 - 2] >> 2];
    result += base64abc[(uint8[i4 - 2] & 3) << 4 | uint8[i4 - 1] >> 4];
    result += base64abc[(uint8[i4 - 1] & 15) << 2];
    result += "=";
  }
  return result;
}

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/config/mail/encoding.ts
var encoder = new TextEncoder();
function quotedPrintableEncode(data, encLB = false) {
  data.replaceAll("=", "=3D");
  if (!encLB) {
    data = data.replaceAll(" \r\n", "=20\r\n").replaceAll(" \n", "=20\n");
  }
  const encodedData = Array.from(data).map((ch) => {
    const encodedChar = encoder.encode(ch);
    if (encodedChar.length === 1) {
      const code = encodedChar[0];
      if (code >= 32 && code <= 126 && code !== 61) return ch;
      if (!encLB && (code === 10 || code === 13)) return ch;
      if (code === 9) return ch;
    }
    let enc = "";
    encodedChar.forEach((i4) => {
      let c3 = i4.toString(16);
      if (c3.length === 1) c3 = "0" + c3;
      enc += `=${c3}`;
    });
    return enc;
  }).join("");
  let ret = "";
  const lines = Math.ceil(encodedData.length / 74) - 1;
  let offset = 0;
  for (let i4 = 0; i4 < lines; i4++) {
    let old = encodedData.slice(i4 * 74 + offset, (i4 + 1) * 74);
    offset = 0;
    if (old.at(-1) === "=") {
      old = old.slice(0, old.length - 1);
      offset = -1;
    }
    if (old.at(-2) === "=") {
      old = old.slice(0, old.length - 2);
      offset = -2;
    }
    if (old.endsWith("\r") || old.endsWith("\n")) {
      ret += old;
    } else {
      ret += `${old}=\r
`;
    }
  }
  ret += encodedData.slice(lines * 74);
  return ret;
}
function hasNonAsciiCharacters(str) {
  return /[^\u0000-\u007f]/.test(str);
}
function quotedPrintableEncodeInline(data) {
  if (hasNonAsciiCharacters(data) || data.startsWith("=?")) {
    return `=?utf-8?Q?${quotedPrintableEncode(data)}?=`;
  }
  return data;
}

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/config/mail/attachments.ts
function resolveAttachment(attachment) {
  if (attachment.encoding === "binary") {
    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      encoding: "base64",
      content: encode(attachment.content)
    };
  } else {
    return attachment;
  }
}

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/config/mail/content.ts
function resolveContent({
  text,
  html,
  mimeContent
}) {
  const newContent = [...mimeContent ?? []];
  if (text === "auto" && html) {
    text = html.replace(/<head((.|\n|\r)*?)<\/head>/g, "").replace(/<style((.|\n|\r)*?)<\/style>/g, "").replace(/<[^>]+>/g, "");
  }
  if (text) {
    newContent.push({
      mimeType: 'text/plain; charset="utf-8"',
      content: quotedPrintableEncode(text),
      transferEncoding: "quoted-printable"
    });
  }
  if (html) {
    newContent.push({
      mimeType: 'text/html; charset="utf-8"',
      content: quotedPrintableEncode(html),
      transferEncoding: "quoted-printable"
    });
  }
  return newContent;
}

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/config/mail/email.ts
function isSingleMail(mail) {
  return /^(([^<>()\[\]\\,;:\s@"]+@[a-zA-Z0-9\-]+\.([a-zA-Z0-9\-]+\.)*[a-zA-Z]{2,})|(<[^<>()\[\]\\,;:\s@"]+@[a-zA-Z0-9]+\.([a-zA-Z0-9\-]+\.)*[a-zA-Z]{2,}>)|([^<>]+ <[^<>()\[\]\\,;:\s@"]+@[a-zA-Z0-9]+\.([a-zA-Z0-9\-]+\.)*[a-zA-Z]{2,}>))$/.test(mail);
}
function parseSingleEmail(mail) {
  if (typeof mail !== "string") {
    return {
      mail: mail.mail,
      name: quotedPrintableEncodeInline(mail.name ?? "")
    };
  }
  const mailSplitRe = /^([^<]*)<([^>]+)>\s*$/;
  const res = mailSplitRe.exec(mail);
  if (!res) {
    return {
      mail,
      name: ""
    };
  }
  const [_6, name, email] = res;
  return {
    name: quotedPrintableEncodeInline(name.trim()),
    mail: email.trim()
  };
}
function parseMailList(list) {
  if (typeof list === "string") return [parseSingleEmail(list)];
  if (Array.isArray(list)) return list.map((v3) => parseSingleEmail(v3));
  if ("mail" in list) {
    return [{
      mail: list.mail,
      name: quotedPrintableEncodeInline(list.name ?? "")
    }];
  }
  return Object.entries(list).map(([name, mail]) => ({
    name: quotedPrintableEncodeInline(name),
    mail
  }));
}
function validateEmailList(list) {
  const ok = [];
  const bad = [];
  list.forEach((mail) => {
    if (isSingleMail(mail.mail)) {
      ok.push(mail);
    } else {
      bad.push(mail);
    }
  });
  return { ok, bad };
}

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/config/mail/headers.ts
function validateHeaders(headers) {
  return !(Object.keys(headers).some(
    (v3) => v3.includes("\n") || v3.includes("\r")
  ) || Object.values(headers).some(
    (v3) => v3.includes("\n") || v3.includes("\r")
  ));
}

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/config/mail/mod.ts
function resolveSendConfig(config) {
  const {
    to,
    cc = [],
    bcc = [],
    from,
    date = (/* @__PURE__ */ new Date()).toUTCString().split(",")[1].slice(1),
    subject,
    content,
    mimeContent,
    html,
    inReplyTo,
    replyTo,
    references,
    priority,
    attachments,
    internalTag,
    headers
  } = config;
  return {
    to: parseMailList(to),
    cc: parseMailList(cc),
    bcc: parseMailList(bcc),
    from: parseSingleEmail(from),
    date,
    mimeContent: resolveContent({
      mimeContent,
      html,
      text: content
    }),
    replyTo: replyTo ? parseSingleEmail(replyTo) : void 0,
    inReplyTo,
    subject: quotedPrintableEncodeInline(subject),
    attachments: attachments ? attachments.map((attachment) => resolveAttachment(attachment)) : [],
    references,
    priority,
    internalTag,
    headers: headers ?? {}
  };
}
function validateConfig(config, client) {
  const errors = [];
  const warn = [];
  if (!isSingleMail(config.from.mail)) {
    errors.push(`The specified from adress is not a valid email adress.`);
  }
  if (config.replyTo && !isSingleMail(config.replyTo.mail)) {
    errors.push(`The specified replyTo adress is not a valid email adress.`);
  }
  const valTo = validateEmailList(config.to);
  if (valTo.bad.length > 0) {
    config.to = valTo.ok;
    valTo.bad.forEach((m4) => {
      warn.push(`TO Email ${m4.mail} is not valid!`);
    });
  }
  const valCc = validateEmailList(config.cc);
  if (valCc.bad.length > 0) {
    config.to = valCc.ok;
    valCc.bad.forEach((m4) => {
      warn.push(`CC Email ${m4.mail} is not valid!`);
    });
  }
  const valBcc = validateEmailList(config.bcc);
  if (valBcc.bad.length > 0) {
    config.to = valBcc.ok;
    valBcc.bad.forEach((m4) => {
      warn.push(`BCC Email ${m4.mail} is not valid!`);
    });
  }
  if (config.to.length + config.cc.length + config.bcc.length === 0) {
    errors.push(`No valid emails provided!`);
  }
  if (config.mimeContent.length === 0) {
    errors.push(`No content provided!`);
  }
  if (!config.mimeContent.some(
    (v3) => v3.mimeType.includes("text/html") || v3.mimeType.includes("text/plain")
  )) {
    warn.push("You should provide at least html or text content!");
  }
  if (!validateHeaders(config.headers)) {
    errors.push(`Headers are not allowed to include linebreaks!`);
  }
  if (client.client.warning === "log" && warn.length > 0) {
    console.warn(warn.join("\n"));
  }
  if (client.client.warning === "error") {
    errors.push(...warn);
  }
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return config;
}

// supabase/functions/_vendor/deno.land/x/denomailer@1.6.0/client/mod.ts
var SMTPHandler = class {
  #internalClient;
  #clientConfig;
  /**
   * create a new SMTPClient
   *
   * ```ts
   * const client = new SMTPClient({
   *   connection: {
   *     hostname: "smtp.example.com",
   *     port: 465,
   *     tls: true,
   *     auth: {
   *       username: "example",
   *       password: "password",
   *     },
   *   },
   *   pool: {
   *     size: 2,
   *     timeout: 60000
   *   },
   *   client: {
   *     warning: 'log',
   *     preprocessors: [filterBurnerMails]
   *   },
   *   debug: {
   *     log: false,
   *     allowUnsecure: false,
   *     encodeLB: false,
   *     noStartTLS: false
   *   }
   * });
   *
   * ```
   *
   * @param config client config
   */
  constructor(config) {
    const resolvedConfig = resolveClientOptions(config);
    resolvedConfig.client.preprocessors.push(validateConfig);
    this.#clientConfig = resolvedConfig;
    if (resolvedConfig.debug.log) {
      console.log("used resolved config");
      console.log(".debug");
      console.table(resolvedConfig.debug);
      console.log(".connection");
      console.table({
        ...resolvedConfig.connection,
        ...resolvedConfig.connection.auth ? { auth: JSON.stringify(resolvedConfig.connection.auth) } : {}
      });
      console.log(".pool");
      console.table(resolvedConfig.pool);
    }
    const Client = resolvedConfig.pool ? resolvedConfig.pool.size > 1 ? SMTPWorkerPool : SMTPWorker : SMTPClient;
    this.#internalClient = new Client(resolvedConfig);
  }
  /**
   * Sends a E-Mail with the correspondig config.
   * ```ts
   * client.send({
   *   to: 'abc@example.com',
   *   cc: [
   *     'abc@example.com',
   *     'abc <abc@example.com>',
   *     {
   *       name: 'abc',
   *       mail: 'abc@example.com'
   *     }
   *   ],
   *   bcc: {
   *     abc: 'abc@example.com',
   *     other: 'abc@example.com'
   *   },
   *   from: 'me <abc@example.com>',
   *   replyTo: '<abc@example.com>',
   *   subject: 'example',
   *   content: 'auto',
   *   html: '<p>Hello World</p>',
   *   internalTag: 'newsletter',
   *   priority: 'low'
   * })
   * ```
   * @param config Email config
   * @returns nothing (for now as this might change in the future!)
   */
  send(config) {
    let resolvedConfig = resolveSendConfig(config);
    for (let i4 = 0; i4 < this.#clientConfig.client.preprocessors.length; i4++) {
      const cb = this.#clientConfig.client.preprocessors[i4];
      resolvedConfig = cb(resolvedConfig, this.#clientConfig);
    }
    return this.#internalClient.send(resolvedConfig);
  }
  /**
   * Closes the connection (kills all Worker / closes connection)
   */
  close() {
    return this.#internalClient.close();
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
  const fromSecret = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const o3 of fromSecret) set.add(stripTrailingSlash(o3));
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
function stripTrailingSlash(s) {
  return s.endsWith("/") ? s.slice(0, -1) : s;
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
  for (const e of opts.extraOrigins ?? []) allowed.add(stripTrailingSlash(e));
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
  if (Array.isArray(value)) return value.map((v3, i4) => redactValue(`${key}[${i4}]`, v3));
  const out = {};
  for (const [k3, v3] of Object.entries(value)) {
    out[k3] = redactValue(k3, v3);
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
var bearer = (req) => (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
async function isServiceCall(req) {
  const token = bearer(req);
  if (!token) return false;
  const own = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (own && token === own) return true;
  const looksService = token.startsWith("sb_secret_") || tokenClaims(token).role === "service_role";
  if (!looksService) return false;
  try {
    const probe = ye2(Deno.env.get("SUPABASE_URL"), token, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}
async function resolveCaller(req, admin) {
  if (await isServiceCall(req)) return { kind: "service" };
  const user = await getCallerUser(req, admin);
  return user ? { kind: "user", user } : null;
}
function sessionMeetsTwoFactor(user, token) {
  const hasFactor = (user.factors ?? []).some((f5) => f5.status === "verified");
  return !hasFactor || tokenAal(token) === "aal2";
}
async function getCallerUser(req, admin) {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    if (!sessionMeetsTwoFactor(data.user, token)) return null;
    return data.user;
  } catch {
    return null;
  }
}
async function isPlatformAdmin(admin, userId) {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}
async function getManagedEvent(admin, userId, eventId) {
  const { data: ev } = await admin.from("events").select("id, user_id, org_id, title").eq("id", eventId).maybeSingle();
  const event = ev;
  if (!event) return null;
  if (event.user_id === userId) return event;
  if (event.org_id) {
    const [{ data: org }, { data: member }] = await Promise.all([
      admin.from("organizations").select("owner_id").eq("id", event.org_id).maybeSingle(),
      admin.from("org_members").select("role").eq("org_id", event.org_id).eq("user_id", userId).maybeSingle()
    ]);
    if (org?.owner_id === userId) return event;
    const role = member?.role;
    if (role && role !== "viewer") return event;
  }
  if (await isPlatformAdmin(admin, userId)) return event;
  return null;
}

// supabase/functions/_shared/rate-limit.ts
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b4) => b4.toString(16).padStart(2, "0")).join("");
}
async function withinLimit(admin, bucket, key, max, windowMs) {
  const { data, error } = await admin.rpc("take_rate_limit", {
    _bucket: bucket,
    _key_hash: await sha256Hex(key),
    _max: max,
    _window_seconds: Math.max(1, Math.ceil(windowMs / 1e3))
  });
  return !error && data === true;
}

// supabase/functions/send-speaker-invite-email/index.ts
var log = createEdgeLogger("send-speaker-invite-email");
function smtpConfigured() {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USERNAME") && Deno.env.get("SMTP_PASSWORD"));
}
function defaultFromAddress() {
  const explicit = Deno.env.get("SMTP_FROM") ?? Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM");
  const username = Deno.env.get("SMTP_USERNAME") ?? "";
  const from = explicit || username || "Illuxus <noreply@example.com>";
  return from.includes("<") ? from : `Illuxus <${from}>`;
}
async function sendViaSmtp(opts) {
  let client = null;
  try {
    const host = Deno.env.get("SMTP_HOST");
    const port = Number(Deno.env.get("SMTP_PORT") || "465");
    const username = Deno.env.get("SMTP_USERNAME");
    const password = Deno.env.get("SMTP_PASSWORD");
    client = new SMTPHandler({
      connection: { hostname: host, port, tls: port === 465, auth: { username, password } }
    });
    await client.send({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      content: opts.text,
      html: opts.html
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
      }
    }
  }
}
function formatDateInTz(iso, tz) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: tz || "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function copyFor(kind, orgName, speakerName) {
  if (kind === "approved") {
    return {
      pill: "Application approved",
      headline: "Congratulations \u2014 you're in!",
      greetingLead: `${orgName} has approved your speaker application. You'll be on stage at the event below.`,
      subject: (t) => `Your speaker application is approved \u2014 ${t}`
    };
  }
  return {
    pill: "Speaker invitation",
    headline: "You're on stage!",
    greetingLead: `${orgName} has added ${speakerName} as a speaker for the event below.`,
    subject: (t) => `You've been added as a speaker for ${t}`
  };
}
function buildHtml(ctx) {
  const orgBlock = `
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
      <tr>
        ${ctx.orgLogoUrl ? `<td style="padding-right:8px;vertical-align:middle"><img src="${escapeHtml(ctx.orgLogoUrl)}" alt="" width="24" height="24" style="border-radius:4px;display:block;" /></td>` : ""}
        <td style="vertical-align:middle;font-size:13px;color:#6b7280;">Organised by <strong style="color:#374151">${escapeHtml(ctx.orgName)}</strong></td>
      </tr>
    </table>`;
  const bannerBlock = ctx.bannerUrl ? `<img src="${escapeHtml(ctx.bannerUrl)}" alt="${escapeHtml(ctx.eventTitle)}" width="560" style="width:100%;max-width:560px;display:block;border-radius:8px 8px 0 0;" />` : `<div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);height:120px;border-radius:8px 8px 0 0;"></div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(ctx.copy.subject(ctx.eventTitle))}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td>${bannerBlock}</td></tr>
        <tr><td style="padding:28px 32px 24px;">
          <div style="display:inline-block;background:#2563eb1a;color:#2563eb;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:16px;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(ctx.copy.pill)}</div>
          <p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px;">${escapeHtml(ctx.copy.headline)}</p>
          <p style="font-size:15px;color:#4b5563;margin:0 0 20px;">
            Hi <strong>${escapeHtml(ctx.speakerName.split(" ")[0] || ctx.speakerName)}</strong>,
            ${escapeHtml(ctx.copy.greetingLead)}
          </p>
          <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">${escapeHtml(ctx.eventTitle)}</p>
          ${orgBlock}
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:20px;">
            ${ctx.dateText ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:20px;vertical-align:top;">\u{1F4C5}</td><td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">${escapeHtml(ctx.dateText)}</td></tr>` : ""}
            ${ctx.venueText ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;vertical-align:top;">\u{1F4CD}</td><td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">${escapeHtml(ctx.venueText)}</td></tr>` : ""}
          </table>
          <div style="text-align:center;margin:8px 0 16px;">
            <a href="${escapeHtml(ctx.setupUrl ?? ctx.portalUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:6px;text-decoration:none;">
              ${ctx.setupUrl ? "Set up your account \u2192" : "Open the speaker portal \u2192"}
            </a>
          </div>
          <p style="font-size:13px;color:#4b5563;line-height:1.55;margin:0 0 12px;">
            ${ctx.setupUrl ? "Your details are already filled in from this invitation \u2014 check them, choose a password, and your speaker access is ready. The link works once and expires in 72 hours." : `Sign in to update your bio, headshot, session details, and any slides you'd like to share.
            If you don't have an Illuxus account yet, create one using this same email \u2014 your speaker access will be linked automatically.`}
          </p>
          <p style="font-size:12px;color:#9ca3af;margin:16px 0 0;text-align:center;">
            Questions? Reply to this email and the organising team will reach you.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Powered by <strong style="color:#6b7280;">illuxus</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;
  const json = (b4, status = 200) => new Response(JSON.stringify(b4), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const { speaker_id, event_id, kind: rawKind } = await req.json();
    if (!speaker_id || !event_id) return json({ error: "speaker_id and event_id are required" }, 400);
    const kind = rawKind === "approved" ? "approved" : "added";
    const supabase = ye2(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    const caller = await resolveCaller(req, supabase);
    if (!caller) return json({ error: "Sign in required" }, 401);
    if (caller.kind === "user" && !await getManagedEvent(supabase, caller.user.id, event_id)) {
      return json({ error: "You don't have access to this event" }, 403);
    }
    const { data: link } = await supabase.from("event_speakers").select("event_id").eq("event_id", event_id).eq("speaker_id", speaker_id).maybeSingle();
    if (!link) return json({ error: "This speaker isn't part of the event" }, 404);
    if (!await withinLimit(supabase, "speaker_invite_email", `${event_id}:${speaker_id}`, 5, 60 * 60 * 1e3)) {
      return json({ error: "This invitation was sent several times recently. Try again later." }, 429);
    }
    const [{ data: speaker }, { data: event }] = await Promise.all([
      supabase.from("speakers").select("id, name, email").eq("id", speaker_id).maybeSingle(),
      supabase.from("events").select("id, title, slug, date, timezone, venue, location, image_url, banner_landscape_url, organizations:org_id(name, logo_url)").eq("id", event_id).maybeSingle()
    ]);
    if (!speaker) {
      log.error("speaker not found", { speaker_id });
      return json({ error: "Speaker not found" }, 404);
    }
    if (!event) {
      log.error("event not found", { event_id });
      return json({ error: "Event not found" }, 404);
    }
    const recipient = (speaker.email || "").trim().toLowerCase();
    if (!recipient) return json({ ok: true, delivered: false, note: "Speaker has no email" });
    const org = event.organizations;
    const orgName = org?.name || "The organising team";
    const orgLogo = org?.logo_url || null;
    const eventTitle = event.title || "the event";
    const bannerUrl = event.banner_landscape_url || event.image_url || null;
    const dateText = event.date ? formatDateInTz(event.date, event.timezone ?? null) : "";
    const venueText = [event.venue, event.location].filter(Boolean).join(" \xB7 ");
    const publicOrigin = Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_ORIGIN") || "https://illuxus.com";
    const base = publicOrigin.startsWith("http") ? publicOrigin.replace(/\/+$/, "") : `https://${publicOrigin}`;
    const portalUrl = `${base}/speaker`;
    const { data: setupToken } = await supabase.rpc("issue_invitation_activation", {
      _email: recipient,
      _purpose: "speaker",
      _next_path: "/speaker"
    });
    const setupUrl = typeof setupToken === "string" && /^[0-9a-f]{64}$/.test(setupToken) ? `${base}/activate?token=${setupToken}` : null;
    const copy = copyFor(kind, orgName, speaker.name || "the speaker");
    const html = buildHtml({
      speakerName: speaker.name || "Speaker",
      eventTitle,
      orgName,
      orgLogoUrl: orgLogo,
      dateText,
      venueText,
      bannerUrl,
      portalUrl,
      setupUrl,
      copy
    });
    const textBody = [
      `Hi ${speaker.name?.trim().split(/\s+/)[0] || "there"},`,
      "",
      copy.greetingLead,
      "",
      dateText ? `When:  ${dateText}` : "",
      venueText ? `Where: ${venueText}` : "",
      "",
      ...setupUrl ? [`Set up your account (your details are already filled in): ${setupUrl}`, "", "The link works once and expires in 72 hours."] : [`Open the speaker portal: ${portalUrl}`, "", "Sign in to update your bio, headshot, session details, and any slides."],
      "",
      `\u2014 ${orgName}`
    ].filter((l) => l !== void 0).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!smtpConfigured()) {
      log.info("speaker invite skipped \u2014 SMTP not configured", { speaker_id, event_id, kind });
      return json({ ok: true, delivered: false, note: "SMTP not configured" });
    }
    const from = defaultFromAddress();
    const result = await sendViaSmtp({ from, to: recipient, subject: copy.subject(eventTitle), html, text: textBody });
    if (!result.ok) {
      log.error("speaker invite send failed", { speaker_id, event_id, kind, error_message: result.error });
      return json({ ok: false, error: result.error }, 500);
    }
    log.info("speaker invite sent", { speaker_id, event_id, kind, recipient });
    return json({ ok: true, delivered: true });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
