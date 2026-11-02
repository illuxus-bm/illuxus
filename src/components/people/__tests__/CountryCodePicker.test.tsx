import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

const reply = (country: string | null) => vi.fn(async () => new Response(JSON.stringify({ country }), { status: 200, headers: { "Content-Type": "application/json" } }));

const Form = ({ initial = "" }: { initial?: string }) => {
  const [dial, setDial] = useState(initial);
  return <><CountryCodePicker value={dial} onChange={setDial} /><output data-testid="dial">{dial}</output></>;
};

let CountryCodePicker: typeof import("../CountryCodePicker").CountryCodePicker;

beforeEach(async () => {
  vi.resetModules();
  sessionStorage.clear();
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
  ({ CountryCodePicker } = await import("../CountryCodePicker"));
});
afterEach(() => vi.restoreAllMocks());

describe("CountryCodePicker", () => {
  it("replaces the browser-language guess with the visitor's country", async () => {
    vi.stubGlobal("fetch", reply("IN"));
    render(<Form />);
    await waitFor(() => expect(screen.getByTestId("dial").textContent).toBe("+91"));
  });

  it("keeps the language guess when the country is unknown", async () => {
    vi.stubGlobal("fetch", reply(null));
    render(<Form />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByTestId("dial").textContent).toBe("+1");
  });

  it("never replaces a saved code", async () => {
    vi.stubGlobal("fetch", reply("IN"));
    render(<Form initial="+44" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("dial").textContent).toBe("+44");
  });
});

describe("detectCountryFromIp", () => {
  it("asks again after a failed request", async () => {
    const { detectCountryFromIp } = await import("@/lib/phone-country");
    const fail = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fail);
    expect(await detectCountryFromIp()).toBeNull();
    vi.stubGlobal("fetch", reply("IN"));
    expect(await detectCountryFromIp()).toBe("IN");
  });
});
