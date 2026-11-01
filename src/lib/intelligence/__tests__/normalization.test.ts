import { describe, expect, it } from "vitest";
import {
  cleanText,
  companyNameKey,
  emailDomain,
  isPersonalEmailDomain,
  jaroWinkler,
  normalizeCountryCode,
  normalizeEmailKey,
  normalizeLinkedInUrl,
  normalizePhone,
  normalizeWebsite,
  personNameKey,
  standardizeDesignation,
} from "../normalization";
import { COMPANY_KEY_VECTORS, EMAIL_VECTORS, NAME_KEY_VECTORS, PHONE_VECTORS, WEBSITE_VECTORS } from "./vectors";

describe("email", () => {
  it.each(EMAIL_VECTORS)("%s → %s", (input, expected) => {
    expect(normalizeEmailKey(input)).toBe(expected);
  });

  it("reads the domain and knows personal mail providers", () => {
    expect(emailDomain("Priya@Acme.COM")).toBe("acme.com");
    expect(isPersonalEmailDomain(emailDomain("x@gmail.com"))).toBe(true);
    expect(isPersonalEmailDomain(emailDomain("x@acme.com"))).toBe(false);
  });
});

describe("phone", () => {
  it.each(PHONE_VECTORS)("(%s) %s → %s", (cc, number, expected) => {
    expect(normalizePhone(cc, number)?.e164 ?? null).toBe(expected);
  });

  it("splits country code and national number", () => {
    expect(normalizePhone("+91", "098765 43210")).toEqual({ e164: "+919876543210", countryCode: "+91", national: "9876543210" });
  });

  it.each([
    ["+91", "+91"], ["91", "+91"], ["0091", "+91"], ["IN", "+91"], ["in", "+91"], [" +44 ", "+44"],
    ["XYZ", null], ["", null], ["+12345", null],
  ])("country code %s → %s", (input, expected) => {
    expect(normalizeCountryCode(input)).toBe(expected);
  });
});

describe("names", () => {
  it.each(NAME_KEY_VECTORS)("%s → %s", (input, expected) => {
    expect(personNameKey(input)).toBe(expected);
  });

  it("keeps the entered form apart from the key", () => {
    expect(cleanText("  Dr.  Priya   RAO ")).toBe("Dr. Priya RAO");
  });
});

describe("companies", () => {
  it.each(COMPANY_KEY_VECTORS)("%s → %s", (input, expected) => {
    expect(companyNameKey(input)).toBe(expected);
  });

  it("does not strip a word that is the whole name", () => {
    expect(companyNameKey("Limited")).toBe("limited");
  });
});

describe("websites and LinkedIn", () => {
  it.each(WEBSITE_VECTORS)("%s → %s", (input, expected) => {
    expect(normalizeWebsite(input)?.domain ?? null).toBe(expected);
  });

  it.each([
    ["linkedin.com/in/Priya-Rao", "https://www.linkedin.com/in/priya-rao"],
    ["https://in.linkedin.com/in/priya-rao/?trk=public", "https://www.linkedin.com/in/priya-rao"],
    ["www.linkedin.com/company/Acme-Corp/about", "https://www.linkedin.com/company/acme-corp"],
    ["https://twitter.com/priya", null],
    ["https://linkedin.com/feed", null],
    ["https://evil-linkedin.com/in/x", null],
  ])("%s → %s", (input, expected) => {
    expect(normalizeLinkedInUrl(input)).toBe(expected);
  });
});

describe("designations", () => {
  it("expands abbreviations so variants compare equal", () => {
    expect(standardizeDesignation("Sr. Mgr - Mktg").key).toBe("senior manager marketing");
    expect(standardizeDesignation("Senior Manager, Marketing").key).toBe("senior manager marketing");
    expect(standardizeDesignation("VP Engg").key).toBe("vice president engineering");
    expect(standardizeDesignation("CEO & Founder").key).toBe("chief executive officer and founder");
  });

  it("keeps what was typed for display", () => {
    expect(standardizeDesignation("  Sr.  Mgr ").display).toBe("Sr. Mgr");
  });
});

describe("jaroWinkler", () => {
  it("ranks near spellings high and different names low", () => {
    expect(jaroWinkler("priya rao", "priya rao")).toBe(1);
    expect(jaroWinkler("priya rao", "priyaa rao")).toBeGreaterThan(0.92);
    expect(jaroWinkler("priya rao", "aman shaikh")).toBeLessThan(0.6);
    expect(jaroWinkler("", "x")).toBe(0);
  });
});
