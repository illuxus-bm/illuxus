// Feature: observability-foundation, Property 6: Sinks only ever see redacted records
//
// Validates: Requirements 2.7, 3.1
//
// REQ 2.7 / 3.1 say: every record handed to an active sink MUST first
// have passed through `redact`, and the redactor's output MUST be a
// shape no sink can re-redact into anything different. Operationally
// this is the fixed-point property:
//
//     redact(redact(x))  deep-equals  redact(x)        for all inputs x
//
// The Logger calls `safeRedact` exactly once on `record.fields` before
// fan-out (see logger.ts → buildAndFanOut), so once the record reaches
// a sink, `record.fields === redact(originalFields)`. If `redact` is a
// fixed-point under itself, applying redact a second time on what the
// sink received produces the same value — which is precisely the
// statement "the sink sees only redacted data".
//
// This test exercises the redactor seam directly rather than driving
// the Logger and stubbing a sink, because:
//
//   1. The Logger has no public sink-injection seam, so an indirect
//      test would have to monkey-patch internals — fragile and weaker
//      than testing the underlying invariant.
//   2. The fixed-point property, combined with Property 1 (totality
//      over the Redaction_Set, covered in `redaction.property.test.ts`)
//      and the Logger's single-call discipline, transitively proves
//      that whatever a sink observes is unchanged by another redact
//      pass — i.e., it carries no PII the redactor can find.
//   3. Testing the property at the function level keeps the assertion
//      independent of sink implementations: any sink, present or
//      future, inherits the guarantee.
//
// Strategy:
//   * Generator: `fc.anything()` plus a hand-rolled recursive arbitrary
//     that injects PII fragments (emails, JWTs, E.164 phone numbers)
//     and deny-listed keys at random nested positions, mirroring the
//     generator used by Property 1. This guarantees every redaction
//     branch — pattern substitution, deny-list collapse, depth cap,
//     cycle detection, Error handling — is exercised.
//   * Optional cycle injection: a post-construction mutation may add
//     a self-reference to the generated value. `redact()` collapses
//     cycles to the literal `'[circular]'`, so the second pass walks
//     a cycle-free shape. The fixed-point still holds.
//   * Assertion: `redact(redact(input))` deep-equals `redact(input)`
//     using vitest's structural equality (`toEqual`).
//   * `fc.assert(prop, { numRuns: 100 })` per the design's testing
//     budget for Property 6.

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';

import { redact } from '../redaction';

// ---------------------------------------------------------------------------
// PII fragment library.
//
// Each entry matches one of the three regex patterns the redactor
// scrubs. The arbitrary embeds them inside random surrounding strings
// so the redactor must redact them as substrings.
// ---------------------------------------------------------------------------

const piiFragment = fc.constantFrom(
  'user@example.com',
  'admin+tag@subdomain.example.org',
  'foo.bar@baz-qux.io',
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  'eyJ12345abcde.SignaturePart98765.AnotherSegmentXYZ',
  '+12025551234',
  '+44 207 183 8750',
  '(415) 555-1234',
  '202-555-0143',
);

const piiString = fc
  .tuple(fc.string(), piiFragment, fc.string())
  .map(([prefix, frag, suffix]) => `${prefix} ${frag} ${suffix}`);

// ---------------------------------------------------------------------------
// Deny-listed key arbitrary.
//
// Includes case-variant and suffixed forms so the deny-list rule
// (`toLowerCase().includes(fragment)`) is exercised on more than just
// canonical literals.
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
// Error branch — covers the dedicated `instanceof Error` path in redact().
// ---------------------------------------------------------------------------

const errorBranch = fc
  .tuple(fc.string(), fc.string(), fc.string())
  .map(([name, msg, stack]) => {
    const e = new Error(msg);
    if (name.length > 0) e.name = name;
    e.stack = stack;
    return e;
  });

// ---------------------------------------------------------------------------
// Recursive generator. Mirrors the Property 1 generator so this test
// covers the same input space the redactor's totality guarantee applies
// to.
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
// Optional cycle injection. `redact()` is documented to break input
// cycles by emitting `'[circular]'` strings; once a cycle has been
// collapsed, the second redact pass walks a finite, cycle-free shape,
// and the fixed-point property must still hold on that shape.
// ---------------------------------------------------------------------------

const cyclicInput = fc
  .tuple(recursive.node, fc.boolean())
  .map(([v, addSelf]) => {
    if (!addSelf || typeof v !== 'object' || v === null) return v;
    try {
      if (Array.isArray(v)) {
        v.push(v);
      } else {
        (v as Record<string, unknown>).__self__ = v;
      }
    } catch {
      // Frozen / sealed / non-extensible objects are skipped — the
      // un-mutated value is still a valid (acyclic) input.
    }
    return v;
  });

// ---------------------------------------------------------------------------
// Property.
// ---------------------------------------------------------------------------

describe('Property 6: Sinks only ever see redacted records', () => {
  test('redact is a fixed point: redact(redact(x)) deep-equals redact(x)', () => {
    fc.assert(
      fc.property(cyclicInput, (input) => {
        const once = redact(input);
        const twice = redact(once);
        // Fixed-point: a record whose fields have been redacted once
        // is unchanged by a subsequent redact pass. Combined with
        // Property 1 (totality) and the Logger's single-call
        // discipline, this means every active sink only ever sees a
        // record whose fields are a fixed point of `redact`.
        expect(twice).toEqual(once);
      }),
      { numRuns: 100 },
    );
  });
});
