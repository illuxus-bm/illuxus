import { describe, expect, it } from "vitest";
import { greetingName, withGreeting } from "../greeting";

describe("greetingName", () => {
  it("uses the first name", () => {
    expect(greetingName("Sarvesh Patil")).toBe("Sarvesh");
    expect(greetingName("  Aman   Shaikh ")).toBe("Aman");
  });

  it("capitalises a name typed in lower case, and leaves other casing alone", () => {
    expect(greetingName("sarvesh patil")).toBe("Sarvesh");
    expect(greetingName("McKenzie Ray")).toBe("McKenzie");
    expect(greetingName("deShawn")).toBe("deShawn");
  });

  it("skips a leading title", () => {
    expect(greetingName("Dr. Priya Rao")).toBe("Priya");
    expect(greetingName("Mr Aman Shaikh")).toBe("Aman");
    expect(greetingName("Dr")).toBe("Dr");
  });

  it("has no name for an address or its local part", () => {
    expect(greetingName("sarvesh.p@x.com")).toBeNull();
    expect(greetingName("sarvesh.p", "Sarvesh.P@x.com")).toBeNull();
    expect(greetingName("", "a@b.com")).toBeNull();
    expect(greetingName(null)).toBeNull();
  });
});

describe("withGreeting", () => {
  const body = "Your badge is ready.\n\nSee you there!";

  it("adds a greeting above a body that has none", () => {
    expect(withGreeting(body, "Sarvesh Patil")).toBe(`Hi Sarvesh,\n\n${body}`);
  });

  it("greets as 'there' without a real name", () => {
    expect(withGreeting(body, null)).toBe(`Hi there,\n\n${body}`);
    expect(withGreeting(body, "sarvesh.p", "sarvesh.p@x.com")).toBe(`Hi there,\n\n${body}`);
  });

  it("leaves a body that already greets someone by name", () => {
    const named = "Hi Sarvesh,\n\nWelcome!";
    expect(withGreeting(named, "Someone Else")).toBe(named);
    expect(withGreeting("Dear Aman,\nThanks.", "Sarvesh")).toBe("Dear Aman,\nThanks.");
    expect(withGreeting("Good morning Priya!\nHello.", "Sarvesh")).toBe("Good morning Priya!\nHello.");
  });

  it("names the recipient in a greeting that names nobody", () => {
    expect(withGreeting("Hi,\n\nA new application.", "Aman Shaikh")).toBe("Hi Aman,\n\nA new application.");
    expect(withGreeting("Hello there!\nNews.", "Sarvesh")).toBe("Hello Sarvesh,\nNews.");
    expect(withGreeting("Hi!\n\nAccess shared.", "Priya")).toBe("Hi Priya,\n\nAccess shared.");
    expect(withGreeting("Dear all,\nAgenda.", "Priya")).toBe("Dear Priya,\nAgenda.");
  });

  it("keeps a nameless greeting when there is no name to put in", () => {
    expect(withGreeting("Hi!\n\nAccess shared.", null)).toBe("Hi!\n\nAccess shared.");
  });

  it("only treats a whole greeting word as one", () => {
    expect(withGreeting("History was made.", "Sarvesh")).toBe("Hi Sarvesh,\n\nHistory was made.");
    expect(withGreeting("Heyday sale!", "Sarvesh")).toBe("Hi Sarvesh,\n\nHeyday sale!");
  });

  it("drops leading blank lines under the added greeting and leaves an empty body alone", () => {
    expect(withGreeting("\n\nBody", "Sarvesh")).toBe("Hi Sarvesh,\n\nBody");
    expect(withGreeting("   ", "Sarvesh")).toBe("   ");
  });
});
