/**
 * Normalisation cases shared by the TypeScript tests and the check of the
 * matching SQL functions (migration 060), so the two cannot drift apart.
 * Each entry: [input…, expected].
 */
export const EMAIL_VECTORS: Array<[string, string | null]> = [
  ["Priya.Rao@Acme.com", "priya.rao@acme.com"],
  ["  priya.rao@acme.com\t", "priya.rao@acme.com"],
  ["PRIYA.RAO+events@GMAIL.COM", "priya.rao+events@gmail.com"], // +tag kept
  ["p.r.i.y.a@gmail.com", "p.r.i.y.a@gmail.com"], // dots kept
  ["ｐｒｉｙａ@acme.com", "priya@acme.com"], // full-width folded
  ["not-an-email", null],
  ["a..b@acme.com", null],
  ["", null],
];

export const PHONE_VECTORS: Array<[string | null, string, string | null]> = [
  ["+91", "98765 43210", "+919876543210"],
  ["+91", "098765-43210", "+919876543210"], // trunk 0
  ["91", "(987) 654-3210", "+919876543210"],
  ["IN", "9876543210", "+919876543210"],
  ["+91", "+91 98765 43210", "+919876543210"], // code typed twice
  ["+91", "919876543210", "+919876543210"],
  [null, "+44 20 7946 0958", "+442079460958"],
  [null, "0044 20 7946 0958", "+442079460958"],
  ["+1", "415.555.2671", "+14155552671"],
  ["+1", "415-555-2671 ext 12", "+14155552671"],
  [null, "9876543210", null], // no country code anywhere
  ["+91", "12345", null], // too short
  ["+91", "call me", null],
];

export const NAME_KEY_VECTORS: Array<[string, string]> = [
  ["Priya Rao", "priya rao"],
  ["  PRIYA   rao ", "priya rao"],
  ["Dr. Priya Rao", "priya rao"],
  ["Zoë O'Brien-Smith", "zoe obrien smith"],
  ["Shri Aman Shaikh", "aman shaikh"],
  ["Dr", "dr"],
];

export const COMPANY_KEY_VECTORS: Array<[string, string]> = [
  ["Tata Consultancy Services Ltd.", "tata consultancy services"],
  ["TATA CONSULTANCY SERVICES LIMITED", "tata consultancy services"],
  ["Infosys Pvt. Ltd", "infosys"],
  ["Acme Private Limited", "acme"],
  ["Johnson & Johnson", "johnson and johnson"],
  ["The Acme Co.", "acme"],
  ["Société Générale S.A.", "societe generale"],
  ["Acme Inc", "acme"],
];

export const WEBSITE_VECTORS: Array<[string, string | null]> = [
  ["acme.com", "acme.com"],
  ["https://www.Acme.com/about?x=1", "acme.com"],
  ["http://shop.acme.co.in/", "shop.acme.co.in"],
  ["ftp://acme.com", null],
  ["not a site", null],
  ["192.168.0.1", null],
];
