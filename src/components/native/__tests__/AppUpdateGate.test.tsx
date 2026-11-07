import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let native = true;
let installed = "1.0.0";
vi.mock("@/lib/native/platform", () => ({
  SITE_ORIGIN: "https://illuxus.com",
  isNativeApp: () => native,
  nativePlatform: () => (native ? "android" : "web"),
}));
vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: async () => ({ version: installed }),
    addListener: async () => ({ remove: async () => {} }),
  },
}));

import { AppUpdateGate } from "../AppUpdateGate";

const serve = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));

describe("AppUpdateGate", () => {
  beforeEach(() => {
    native = true;
    installed = "1.0.0";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("covers the app when this version is retired", async () => {
    serve({ minimumVersion: { android: "1.2.0" }, storeUrl: { android: "https://play.google.com/store/apps/details?id=com.illuxus.app" } });
    render(<AppUpdateGate />);
    expect(await screen.findByRole("alertdialog", { name: "Update illuxus" })).toBeInTheDocument();
    expect(screen.getByText(/latest version from Google Play/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update now" })).toBeInTheDocument();
  });

  it("names the store when there is no link yet", async () => {
    serve({ minimumVersion: { android: "1.2.0" } });
    render(<AppUpdateGate />);
    expect(await screen.findByText("Open Google Play and search for illuxus.")).toBeInTheDocument();
  });

  it("stays out of the way for a supported version", async () => {
    installed = "1.2.0";
    serve({ minimumVersion: { android: "1.2.0" } });
    render(<AppUpdateGate />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does nothing in a browser", () => {
    native = false;
    serve({ minimumVersion: { android: "9.0.0" } });
    render(<AppUpdateGate />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
