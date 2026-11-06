import { describe, expect, it } from "vitest";
import { neutralizeFormula, safeCsvCell, startsLikeFormula } from "../csv-safety";

describe("startsLikeFormula", () => {
  it.each([
    ["=1+1"], ["+cmd"], ["-2+3"], ["@SUM(A1)"],
    // Spreadsheets skip leading control characters and read what follows.
    ["\t=1+1"], ["\r=1+1"], ["\n=1+1"], ["\0=1+1"],
    // Full-width forms some locales accept as formula starts.
    ["＝1+1"], ["＋cmd"], ["－2"], ["＠SUM(A1)"],
  ])("flags %j", (value) => {
    expect(startsLikeFormula(value)).toBe(true);
  });

  it.each([["Acme"], ["a=b"], ["pat@acme.test"], [""], [" =1+1"], ["'=1+1"]])("leaves %j", (value) => {
    expect(startsLikeFormula(value)).toBe(false);
  });

  it("keeps phone numbers, but not + followed by anything else", () => {
    expect(startsLikeFormula("+91 9876500011")).toBe(false);
    expect(startsLikeFormula("+919876500011")).toBe(false);
    expect(startsLikeFormula("+91\t98765")).toBe(true);
    expect(startsLikeFormula("+1 555 HYPERLINK")).toBe(true);
  });
});

describe("neutralizeFormula", () => {
  it("marks a formula as text and leaves the rest", () => {
    expect(neutralizeFormula("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(neutralizeFormula("Acme")).toBe("Acme");
  });
});

describe("safeCsvCell", () => {
  it("quotes a marked value", () => {
    expect(safeCsvCell("=1+1")).toBe("\"'=1+1\"");
  });
  it("quotes and doubles inner quotes", () => {
    expect(safeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it("quotes separators, tabs and line breaks", () => {
    expect(safeCsvCell("Acme, Inc.")).toBe('"Acme, Inc."');
    expect(safeCsvCell("a\tb")).toBe('"a\tb"');
    expect(safeCsvCell("a\r\nb")).toBe('"a\r\nb"');
  });
  it("marks and quotes a formula hidden behind a tab or a line break", () => {
    expect(safeCsvCell("\t=cmd")).toBe("\"'\t=cmd\"");
    expect(safeCsvCell("\n@SUM(1)")).toBe("\"'\n@SUM(1)\"");
  });
  it("leaves plain text bare", () => {
    expect(safeCsvCell("Pat Kumar")).toBe("Pat Kumar");
    expect(safeCsvCell("")).toBe("");
  });
});
