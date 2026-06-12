// Feature: observability-foundation, Property 1: Redaction is total over the Redaction_Set
//
// Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 8.7, 10.5, 11.2
//
// For any input value v — including arbitrarily nested plain objects, arrays,
// `Error` instances, cyclic graphs, and strings containing embedded
// email / JWT / E.164 phone substrings — `redact(v)` must:
//   1. Terminate within finite time (implicit: a non-terminating run aborts
//      the test before completion).
//   2. Walked exhaustively, contain zero substrings matching the email pattern.
//   3. Zero substrings matching the JWT pattern.
//   4. Zero substrings matching the E.164 phone pattern.
//   5. Zero values at deny-list key paths other than the literal `'[redacted]'`.
//
// Strategy:
//   - Build a recursive arbitrary via `fc.letrec` mixing primitives, arrays,
//     dictionaries, `fc.anything()` and `Error` instances, with PII fragments
//     (real-shaped emails, JWTs, phone numbers) embedded inside random
//     surrounding strings so the property exercises substring redaction
//     rather than only whole-string redaction.
//   - Bias dictionary keys toward the deny-list (`password|secret|token|...`)
//     so the deny-list collapse rule is reliably hit.
//   - Wrap each generated value in a post-construction mutation that may
//     introduce one or two cycles, exercising the redactor's WeakSet-based
//     `'[circular]'` handling.
//   - Walk the redacted output recursively. For every string, assert that
//     none of the three `REDACTION_REGEX` patterns matches. For every
//     deny-listed key encountered along the walk, assert the value is
//     exactly the literal `'[redacted]'`.
//   - Run with `numRuns: 500` per the design's testing-strategy budget for
//     the largest generator space.

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';

import { redact, REDACTION_REGEX } from '../redaction';

// ---------------------------------------------------------------------------
// Deny-list mirror.
//
// Duplicated from `redaction.ts` (where it is private) so the property test
// expresses the contract independently of the implementation's internal
// state. If the implementation list ever changes, this list must change too
// (the spec requires they remain in lock-step).
// ---------------------------------------------------------------------------

const DENY_KEY_FRAGMENTS: ReadonlyArray<string> = [
  'password',
  'passwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'p_token',
  'p_password',
];

function isDenyListedKey(key: string): boolean {
  const lower = key.toLowerCase();
  return DENY_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

// ---------------------------------------------------------------------------
// PII fragment library.
//
// Each entry is shaped to match exactly one of the three `REDACTION_REGEX`
// patterns. The arbitrary embeds them inside random prefix/suffix strings
// so the redactor must redact them as substrings, not whole strings.
// ---------------------------------------------------------------------------

const piiFragment = fc.constantFrom(
  // Emails
  'user@example.com',
  'admin+tag@subdomain.example.org',
  'foo.bar@baz-qux.io',
  'a@b.cd',
  // JWTs (header.payload.signature, all base64url segments ≥ 8 chars).
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  'eyJ12345abcde.SignaturePart98765.AnotherSegmentXYZ',
  // E.164-shaped phone numbers (with various separators).
  '+12025551234',
  '+44 207 183 8750',
  '+91 (98) 765-43210',
  '(415) 555-1234',
  '202-555-0143',
);

const piiString = fc.tuple(fc.string(), piiFragment, fc.string()).map(
  ([prefix, frag, suffix]) => `${prefix} ${frag} ${suffix}`,
);

// ---------------------------------------------------------------------------
// Deny-listed key arbitrary.
//
// Includes case-variant, suffixed, and prefixed forms so the
// `toLowerCase().includes(fragment)` rule is exercised on more than just
// the canonical literal.
// ---------------------------------------------------------------------------

const denyKey = fc.constantFrom(
  'password',
  'PASSWORD',
  'user_passwd',
  'secret',
  'mySecret',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'AuthorizationHeader',
  'cookie',
  'p_token',
  'p_password',
  'apiToken',
);

// ---------------------------------------------------------------------------
// Error branch.
//
// `redact()` has a dedicated branch for `Error` instances; the property
// must exercise it. A non-empty `name` is occasionally swapped in to make
// sure the redactor preserves it verbatim (it is not a string field that
// gets pattern-scrubbed because it is set on the output object directly).
// ---------------------------------------------------------------------------

const errorBranch = fc.tuple(fc.string(), fc.string(), fc.string()).map(
  ([name, msg, stack]) => {
    const e = new Error(msg);
    if (name.length > 0) e.name = name;
    e.stack = stack;
    return e;
  },
);

// ---------------------------------------------------------------------------
// Recursive generator.
//
// `fc.letrec` ties the `node` arbitrary back into `array` and `object`
// elements so PII strings, deny-listed keys, and Error instances appear at
// arbitrary nesting depths. `fc.anything()` is included as one branch so
// the generator covers shapes outside our hand-rolled mix (e.g. sparse
// objects, large numbers, BigInt, Symbol-keyed objects when supported).
// ---------------------------------------------------------------------------

const recursive = fc.letrec((tie) => ({
  primitive: fc.oneof(
    fc.boolean(),
    fc.integer(),
    fc.double(),
    fc.string(),
    fc.constant(null),
    fc.constant(undefined),
    piiString,
  ),
  array: fc.array(tie('node') as fc.Arbitrary<unknown>, { maxLength: 4 }),
  object: fc.dictionary(
    fc.oneof(fc.string({ minLength: 1 }), denyKey),
    tie('node') as fc.Arbitrary<unknown>,
    { maxKeys: 4 },
  ),
  node: fc.oneof(
    tie('primitive'),
    tie('array'),
    tie('object'),
    errorBranch,
    fc.anything(),
  ),
}));

// ---------------------------------------------------------------------------
// Cyclic-wrap.
//
// Post-construction mutation that may introduce a self-reference and/or a
// child→parent back-reference in the generated value. Catches frozen /
// non-extensible objects gracefully so they remain valid inputs.
// ---------------------------------------------------------------------------

const cyclicInput = fc
  .tuple(recursive.node, fc.boolean(), fc.boolean())
  .map(([v, addSelf, addBack]) => {
    if (typeof v !== 'object' || v === null) return v;
    try {
      if (addSelf) {
        if (Array.isArray(v)) {
          v.push(v);
        } else {
          (v as Record<string, unknown>).__self__ = v;
        }
      }
      if (addBack) {
        const children = Array.isArray(v)
          ? v
          : Object.values(v as Record<string, unknown>);
        for (const child of children) {
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              child.push(v);
            } else {
              (child as Record<string, unknown>).__parent__ = v;
            }
            break;
          }
        }
      }
    } catch {
      // Frozen / sealed / non-extensible objects are skipped — the
      // un-mutated value is still a valid (acyclic) input.
    }
    return v;
  });

// ---------------------------------------------------------------------------
// Recursive walker over the redacted output.
//
// Visits every string and every (own-enumerable) object key/value. Uses
// the same `REDACTION_REGEX` singletons the implementation uses, so the
// property can never disagree with the implementation's regex source of
// truth. Cycle-safe via WeakSet — `redact()` is documented to break input
// cycles by emitting `'[circular]'` strings, but a defensive walker
// protects against any surprise.
//
// `String.prototype.match(globalRegex)` resets `lastIndex` per ECMA-262,
// so reusing the frozen regex singletons across calls is safe.
// ---------------------------------------------------------------------------

function walkAndCheck(
  node: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (typeof node === 'string') {
    expect(node.match(REDACTION_REGEX.email)).toBeNull();
    expect(node.match(REDACTION_REGEX.jwt)).toBeNull();
    expect(node.match(REDACTION_REGEX.phone)).toBeNull();
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) walkAndCheck(item, seen);
    return;
  }

  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (isDenyListedKey(k)) {
      expect(v).toBe('[redacted]');
    } else {
      walkAndCheck(v, seen);
    }
  }
}

// ---------------------------------------------------------------------------
// Property.
// ---------------------------------------------------------------------------

describe('Property 1: Redaction is total over the Redaction_Set', () => {
  test('redact(v) yields no email / JWT / E.164 substrings and no non-redacted deny-list values', () => {
    fc.assert(
      fc.property(cyclicInput, (input) => {
        const output = redact(input);
        walkAndCheck(output);
      }),
      { numRuns: 500 },
    );
  });
});
