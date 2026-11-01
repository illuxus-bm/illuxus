/**
 * Deciding whether a person being added is someone already on record.
 *
 * Three outcomes:
 *   • high     — a VERIFIED identifier (email, phone) proves it is the same
 *                person: the existing record is reused.
 *   • possible — something points at an existing record but proves nothing:
 *                an email or phone typed by someone else, a LinkedIn URL,
 *                or the same name at the same company. Shown for review;
 *                never merged automatically.
 *   • none     — a new person.
 *
 * What never counts as proof: an email nobody has verified, a name, a
 * company. Typing someone's address is not owning it. When identifiers
 * point at two different people, the answer is `possible`, never `high`.
 *
 * Pure: the database finds the candidates (migration 060,
 * `identity_candidates`) and enforces the same rule when it links records;
 * this decides what to show and is shared by every Add Person surface.
 */
import {
  companyNameKey,
  jaroWinkler,
  normalizeEmailKey,
  normalizeLinkedInUrl,
  normalizePhone,
  personNameKey,
} from "./normalization";

export type IdentifierKind = "email" | "phone" | "linkedin";

export interface Identifier {
  kind: IdentifierKind;
  /** Normalised key (normalization.ts). */
  value: string;
  /** Ownership proven — a confirmed sign-in address, a verified phone. */
  verified: boolean;
}

export interface PersonFacts {
  identifiers: Identifier[];
  nameKey: string;
  companyKey: string;
}

export interface CandidatePerson extends PersonFacts {
  personId: string;
}

export interface MatchReason {
  kind: IdentifierKind | "name_company";
  verified: boolean;
}

export interface RankedCandidate {
  personId: string;
  score: number;
  reasons: MatchReason[];
}

export type Resolution =
  | { outcome: "high"; personId: string; reasons: MatchReason[] }
  | { outcome: "possible"; candidates: RankedCandidate[] }
  | { outcome: "none" };

/** How close two name keys must be to count, with the same company. */
export const NAME_SIMILARITY_THRESHOLD = 0.92;

const WEIGHT: Record<IdentifierKind, number> = { email: 0.8, phone: 0.7, linkedin: 0.75 };

/** Builds `PersonFacts` from what a form or CSV row holds. */
export function factsFromInput(input: {
  email?: string | null;
  emailVerified?: boolean;
  phoneCountryCode?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  linkedin?: string | null;
  name?: string | null;
  company?: string | null;
}): PersonFacts {
  const identifiers: Identifier[] = [];
  const email = normalizeEmailKey(input.email);
  if (email) identifiers.push({ kind: "email", value: email, verified: !!input.emailVerified });
  const phone = normalizePhone(input.phoneCountryCode, input.phone);
  if (phone) identifiers.push({ kind: "phone", value: phone.e164, verified: !!input.phoneVerified });
  const linkedin = normalizeLinkedInUrl(input.linkedin);
  // A LinkedIn URL anyone can type; it is never proof.
  if (linkedin) identifiers.push({ kind: "linkedin", value: linkedin, verified: false });
  return { identifiers, nameKey: personNameKey(input.name), companyKey: companyNameKey(input.company) };
}

function compare(incoming: PersonFacts, candidate: CandidatePerson): RankedCandidate | null {
  const reasons: MatchReason[] = [];
  let score = 0;
  for (const mine of incoming.identifiers) {
    const theirs = candidate.identifiers.find((c) => c.kind === mine.kind && c.value === mine.value);
    if (!theirs) continue;
    const verified = mine.verified && theirs.verified && mine.kind !== "linkedin";
    reasons.push({ kind: mine.kind, verified });
    score = Math.max(score, verified ? 1 : WEIGHT[mine.kind]);
  }
  if (
    incoming.nameKey && candidate.nameKey && incoming.companyKey &&
    incoming.companyKey === candidate.companyKey &&
    jaroWinkler(incoming.nameKey, candidate.nameKey) >= NAME_SIMILARITY_THRESHOLD
  ) {
    reasons.push({ kind: "name_company", verified: false });
    score = Math.max(score, 0.5);
  }
  return reasons.length ? { personId: candidate.personId, score, reasons } : null;
}

export function resolveIdentity(incoming: PersonFacts, candidates: CandidatePerson[]): Resolution {
  // The same person can come back more than once from different lookups.
  const byId = new Map<string, CandidatePerson>();
  for (const c of candidates) {
    const seen = byId.get(c.personId);
    byId.set(c.personId, seen ? { ...seen, identifiers: [...seen.identifiers, ...c.identifiers] } : c);
  }
  const ranked = [...byId.values()]
    .map((c) => compare(incoming, c))
    .filter((r): r is RankedCandidate => r !== null)
    .sort((a, b) => b.score - a.score || a.personId.localeCompare(b.personId));

  if (!ranked.length) return { outcome: "none" };
  const proven = ranked.filter((r) => r.reasons.some((x) => x.verified));
  // Exactly one person proven, and no identifier points anywhere else.
  const sharesIdentifier = ranked.filter((r) => r.reasons.some((x) => x.kind !== "name_company"));
  if (proven.length === 1 && sharesIdentifier.length === 1) {
    return { outcome: "high", personId: proven[0].personId, reasons: proven[0].reasons };
  }
  return { outcome: "possible", candidates: ranked };
}
