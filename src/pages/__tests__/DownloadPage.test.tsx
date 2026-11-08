import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/PublicPageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/RouteSeo", () => ({ default: () => null }));
vi.mock("@/hooks/useStandaloneMode", () => ({ useStandaloneMode: () => false }));

import DownloadPage from "../DownloadPage";

const setUserAgent = (ua: string, touch = 0) => {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: touch, configurable: true });
};
const renderPage = () => render(<MemoryRouter><DownloadPage /></MemoryRouter>);
const card = (name: RegExp) => screen.getByRole("region", { name });

afterEach(() => vi.restoreAllMocks());

describe("DownloadPage", () => {
  it("leads with the iPhone steps on an iPhone", () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", 5);
    renderPage();
    const ios = card(/iPhone and iPad/);
    expect(within(ios).getByText("This device")).toBeInTheDocument();
    expect(within(ios).getByText("Add to Home Screen")).toBeInTheDocument();
    expect(within(card(/^Android$/)).queryByText("This device")).toBeNull();
  });

  it("always offers the Android APK", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36", 5);
    renderPage();
    const link = within(card(/^Android$/)).getByRole("link", { name: /Download the app/ });
    expect(link).toHaveAttribute("href", "https://github.com/illuxus-bm/illuxus/releases/latest/download/illuxus.apk");
  });

  it("installs in one click on Windows in Edge when the browser offers it", async () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0");
    renderPage();
    const desktop = card(/Windows, ChromeOS and Linux/);
    expect(within(desktop).getByText("This device")).toBeInTheDocument();
    expect(within(desktop).queryByRole("button", { name: /Install illuxus/ })).toBeNull();

    // The browser offers installation (pwa-install catches it).
    const prompt = vi.fn(async () => {});
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      platforms: ["web"],
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
      prompt,
    });
    await act(async () => { window.dispatchEvent(offer); });

    fireEvent.click(within(desktop).getByRole("button", { name: /Install illuxus/ }));
    await act(async () => {});
    expect(prompt).toHaveBeenCalled();
    expect(await within(desktop).findByText(/Installed\. Open illuxus/)).toBeInTheDocument();
  });

  it("tells Firefox users how to install", () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0");
    renderPage();
    expect(within(card(/Windows, ChromeOS and Linux/)).getByText(/Firefox can't install sites as apps/)).toBeInTheDocument();
  });
});
