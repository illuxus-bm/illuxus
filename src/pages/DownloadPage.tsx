import { useMemo, useState, type ReactNode } from "react";
import { Check, Download, Laptop, MonitorSmartphone, MoreVertical, PlusSquare, Share, Smartphone, Tablet } from "lucide-react";
import PublicPageShell from "@/components/layout/PublicPageShell";
import RouteSeo from "@/components/RouteSeo";
import { Button } from "@/components/ui/button";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { detectDevice, sectionFor, type DeviceInfo } from "@/lib/device-platform";
import { promptInstall, useInstallPrompt } from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

/** The newest Android build, from the GitHub release the README also links to. */
const APK_URL = "https://github.com/illuxus-bm/illuxus/releases/latest/download/illuxus.apk";
const RELEASES_URL = "https://github.com/illuxus-bm/illuxus/releases";

function currentDevice(): DeviceInfo {
  if (typeof navigator === "undefined") return { platform: "unknown", browser: "other" };
  return detectDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** Numbered steps, each with the icon of the control to look for. */
function Steps({ items }: { items: Array<{ icon?: ReactNode; text: ReactNode }> }) {
  return (
    <ol className="mt-4 space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">
            {i + 1}
          </span>
          <span className="pt-0.5">
            {item.text}
            {item.icon && <span className="ml-1.5 inline-flex translate-y-0.5 text-muted-foreground">{item.icon}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One-click install where the browser offers it (Chrome, Edge). */
function InstallButton({ label = "Install illuxus" }: { label?: string }) {
  const { canInstall, installed } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  if (installed) {
    return (
      <p className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-primary">
        <Check className="h-4 w-4" /> Installed. Open illuxus from your apps.
      </p>
    );
  }
  if (!canInstall) return null;
  return (
    <Button
      size="lg"
      className="mt-5 gap-2"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await promptInstall(); } finally { setBusy(false); }
      }}
    >
      <Download className="h-4 w-4" /> {label}
    </Button>
  );
}

function Card({
  id,
  icon,
  title,
  subtitle,
  highlighted,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "scroll-mt-[calc(var(--app-header-h)+1rem)] rounded-2xl border bg-card p-6 sm:p-7",
        highlighted ? "border-primary shadow-lg shadow-primary/10" : "border-border",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
        <div>
          <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-tight">{title}</h2>
          <p className="text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
        {highlighted && (
          <span className="ml-auto rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
            This device
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * /download: every way to get illuxus, leading with the visitor's own device.
 *
 *  - Android: the APK from GitHub releases (Google Play to follow).
 *  - iPhone, iPad and Mac: installed from Safari (Add to Home Screen / Add to
 *    Dock) until the App Store listing is live; Apple allows no other route.
 *  - Windows, ChromeOS and Linux: installed from Chrome or Edge, one click.
 *
 * An installed copy opens in its own window with its own icon, keeps you
 * signed in and updates itself; it is the same app as the iOS / Android one.
 */
export default function DownloadPage() {
  const device = useMemo(currentDevice, []);
  const standalone = useStandaloneMode();
  const mine = sectionFor(device.platform);
  const safari = device.browser === "safari";
  const chromium = device.browser === "chrome" || device.browser === "edge";

  return (
    <PublicPageShell>
      <RouteSeo
        title="Download illuxus — Android, iPhone, iPad, Mac, Windows, ChromeOS and Linux"
        description="Get the illuxus app on every device: the Android app, and one-tap installs for iPhone, iPad, Mac, Windows, ChromeOS and Linux. Your events, tickets and communities, signed in everywhere."
        canonical="https://illuxus.com/download"
      />

      <section className="px-4 pb-10 pt-24 text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">Get the app</p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">illuxus on every device</h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          Your events, tickets and communities on your phone, tablet and computer. Sign in once on each; everything
          stays in step.
        </p>
        {standalone && (
          <p className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-[14px] font-medium text-primary">
            <Check className="h-4 w-4" /> You're using the installed app.
          </p>
        )}
      </section>

      <div className="mx-auto grid max-w-5xl gap-5 px-4 pb-24 sm:px-6 md:grid-cols-2">
        <Card
          id="android"
          icon={<Smartphone className="h-5 w-5" />}
          title="Android"
          subtitle="Phones, tablets and foldables · Android 7 or later"
          highlighted={mine === "android"}
        >
          <Button asChild size="lg" className="mt-5 gap-2">
            <a href={APK_URL}><Download className="h-4 w-4" /> Download the app (APK)</a>
          </Button>
          <Steps
            items={[
              { text: <>Open <strong>illuxus.apk</strong> when the download finishes.</> },
              { text: <>If Android asks, allow your browser to install apps, then tap <strong>Install</strong>.</> },
              { text: <>Later versions install over it and keep you signed in.</> },
            ]}
          />
          <p className="mt-4 text-[12px] text-muted-foreground">
            Coming to Google Play. Every version, with its checksum, is on{" "}
            <a href={RELEASES_URL} className="underline underline-offset-2">GitHub</a>.
          </p>
        </Card>

        <Card
          id="ios"
          icon={<Tablet className="h-5 w-5" />}
          title="iPhone and iPad"
          subtitle="In Safari · Chrome works too on iOS 16.4 or later"
          highlighted={mine === "ios"}
        >
          <Steps
            items={[
              { text: <>Open <strong>illuxus.com</strong> in Safari{mine === "ios" && !safari ? " (or Chrome)" : ""}.</> },
              { text: <>Tap <strong>Share</strong>.</>, icon: <Share className="h-4 w-4" aria-label="Share icon" /> },
              { text: <>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</>, icon: <PlusSquare className="h-4 w-4" aria-label="Add to Home Screen icon" /> },
            ]}
          />
          <p className="mt-4 text-[12px] text-muted-foreground">
            illuxus then opens from your Home Screen like any app, full screen and signed in. The App Store version is on
            its way; Apple allows no other way to install apps until then.
          </p>
        </Card>

        <Card
          id="mac"
          icon={<Laptop className="h-5 w-5" />}
          title="Mac"
          subtitle="macOS Sonoma or later in Safari · or Chrome and Edge"
          highlighted={mine === "mac"}
        >
          {mine === "mac" && chromium && <InstallButton />}
          <Steps
            items={
              mine === "mac" && chromium
                ? [
                    { text: <>Click <strong>Install illuxus</strong> above, or the install icon at the end of the address bar.</> },
                    { text: <>illuxus opens in its own window and joins your Dock and Launchpad.</> },
                  ]
                : [
                    { text: <>Open <strong>illuxus.com</strong> in Safari.</> },
                    { text: <>Choose <strong>File → Add to Dock</strong>, then <strong>Add</strong>.</> },
                    { text: <>illuxus opens from the Dock in its own window. In Chrome or Edge, use the install icon in the address bar instead.</> },
                  ]
            }
          />
          <p className="mt-4 text-[12px] text-muted-foreground">
            The iPad app will also run on Apple silicon Macs from the Mac App Store.
          </p>
        </Card>

        <Card
          id="desktop"
          icon={<MonitorSmartphone className="h-5 w-5" />}
          title="Windows, ChromeOS and Linux"
          subtitle="In Microsoft Edge, Google Chrome or Chromium"
          highlighted={mine === "desktop" && device.platform !== "unknown"}
        >
          {mine === "desktop" && chromium && <InstallButton />}
          {mine === "desktop" && device.browser === "firefox" && (
            <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-[13px]">
              Firefox can't install sites as apps. Open illuxus.com in Edge or Chrome to install it, or keep using it here.
            </p>
          )}
          <Steps
            items={[
              { text: <>Open <strong>illuxus.com</strong> in Edge or Chrome{mine === "desktop" && chromium ? ", or click Install above" : ""}.</> },
              { text: <>Click the install icon at the end of the address bar, or open the menu <MoreVertical className="inline h-3.5 w-3.5 align-[-2px]" aria-label="menu" /> and choose <strong>Install illuxus</strong> (Edge: <strong>Apps → Install this site as an app</strong>).</> },
              { text: <>illuxus gets its own window, a Start menu / launcher / taskbar icon, and updates itself.</> },
            ]}
          />
          <p className="mt-4 text-[12px] text-muted-foreground">
            Chromebooks can also install the Android app. On Linux, Chromium and Brave work too.
          </p>
        </Card>
      </div>
    </PublicPageShell>
  );
}
