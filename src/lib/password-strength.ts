// Pure password-strength scorer used by the live meter.
// Deliberately tiny — no external dependencies — so it can run on every
// keystroke without bundle/perf impact.

export type PasswordRule = {
  /** Stable key for keying React lists. */
  key: string;
  /** Short user-facing label, shown in the rule checklist. */
  label: string;
  /** True when the rule is satisfied by the given password. */
  met: boolean;
};

export type PasswordStrengthLabel = "Too weak" | "Weak" | "Fair" | "Good" | "Strong";

export type PasswordStrength = {
  /** 0..4, mapped to the 4-segment progress bar. */
  score: 0 | 1 | 2 | 3 | 4;
  /** Human label matching the score bucket. */
  label: PasswordStrengthLabel;
  /** Tailwind color tokens for bar + text — chosen at one place to keep UI consistent. */
  color: {
    bar: string;   // background color for filled segments
    text: string;  // text color for the label
  };
  /** True when the password is strong enough to submit. */
  acceptable: boolean;
  /** All rules with their met/unmet flag for the checklist UI. */
  rules: PasswordRule[];
  /** First useful unmet hint to nudge the user toward a stronger password. */
  hint: string;
};

const COMMON_PATTERNS: RegExp[] = [
  /^(?:password|p@ssw0rd|passw0rd|pass1234)$/i,
  /^(?:qwerty|asdfgh|zxcvbn)\d*$/i,
  /^(?:welcome|letmein|admin|administrator|iloveyou|monkey|dragon|football|sunshine|princess)\d*$/i,
  /^(?:0123|1234|2345|3456|4567|5678|6789)+$/, // sequential digits
  /^(?:abcd|bcde|cdef)+$/i,                    // sequential letters
  /^(.)\1{3,}$/,                               // 4+ repeated of the same char
];

function looksCommon(pw: string): boolean {
  if (!pw) return false;
  return COMMON_PATTERNS.some((re) => re.test(pw));
}

const labelByScore: Record<number, PasswordStrengthLabel> = {
  0: "Too weak",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};

const colorByScore: Record<number, PasswordStrength["color"]> = {
  0: { bar: "bg-destructive",       text: "text-destructive" },
  1: { bar: "bg-destructive",       text: "text-destructive" },
  2: { bar: "bg-amber-500",         text: "text-amber-600" },
  3: { bar: "bg-blue-500",          text: "text-blue-600" },
  4: { bar: "bg-[hsl(var(--success))]", text: "text-[hsl(var(--success))]" },
};

/**
 * Score a password from 0 (terrible) to 4 (strong).
 *
 * Rules counted toward the score:
 * 1. length >= 8                   — hard minimum
 * 2. length >= 12                  — bonus
 * 3. lowercase letter
 * 4. uppercase letter
 * 5. digit
 * 6. symbol (anything not [A-Za-z0-9])
 *
 * Modifier: matching a known weak/common pattern caps the result at 2 ("Fair").
 */
export function scorePassword(password: string): PasswordStrength {
  const pw = password ?? "";
  const len = pw.length;

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const isLongEnough = len >= 8;
  const isVeryLong = len >= 12;
  const common = looksCommon(pw);

  const rules: PasswordRule[] = [
    { key: "len8",   label: "At least 8 characters",       met: isLongEnough },
    { key: "lower",  label: "A lowercase letter",          met: hasLower },
    { key: "upper",  label: "An uppercase letter",         met: hasUpper },
    { key: "digit",  label: "A number",                    met: hasDigit },
    { key: "symbol", label: "A symbol (e.g. !@#$)",        met: hasSymbol },
    { key: "long",   label: "12+ characters for extra strength", met: isVeryLong },
  ];

  // Pick the first useful unmet rule for the hint, but the length-8 rule
  // always wins until satisfied since nothing else matters below 8 chars.
  const firstUnmet =
    !isLongEnough
      ? rules.find((r) => r.key === "len8")
      : rules.find((r) => !r.met);

  // Below the hard minimum: always score 0.
  if (!isLongEnough || len === 0) {
    return {
      score: 0,
      label: labelByScore[0],
      color: colorByScore[0],
      acceptable: false,
      rules,
      hint: len === 0 ? "Enter a password" : firstUnmet?.label ?? "",
    };
  }

  // Count satisfied criteria: lower / upper / digit / symbol / very-long.
  let count = 0;
  if (hasLower) count++;
  if (hasUpper) count++;
  if (hasDigit) count++;
  if (hasSymbol) count++;
  if (isVeryLong) count++;

  // Map count -> score bucket.
  // 1 → Weak, 2 → Fair, 3 → Good, 4-5 → Strong.
  let score: PasswordStrength["score"] = 1;
  if (count >= 4) score = 4;
  else if (count === 3) score = 3;
  else if (count === 2) score = 2;
  else score = 1;

  // A password without a symbol cannot reach "Strong" — cap at "Good".
  if (!hasSymbol && score > 3) score = 3;

  // Common-pattern penalty caps at "Fair".
  if (common && score > 2) score = 2;

  // Submit gate: only a "Strong" password (score 4) is acceptable. This
  // means a symbol is effectively required, since a missing symbol caps
  // the score at "Good" above.
  const acceptable = score >= 4;

  return {
    score,
    label: labelByScore[score],
    color: colorByScore[score],
    acceptable,
    rules,
    hint: firstUnmet && !firstUnmet.met ? firstUnmet.label : (common ? "Avoid common patterns" : ""),
  };
}
