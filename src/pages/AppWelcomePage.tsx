import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, QrCode, Users } from "lucide-react";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { useDarkScreenBars } from "@/lib/native/system-bars";

const POINTS = [
  { icon: CalendarDays, text: "Find events and register in a tap" },
  { icon: QrCode, text: "Your tickets, ready to scan at the door" },
  { icon: Users, text: "Stay in touch with the people you met" },
];

/**
 * The first screen of the iOS / Android app (and the installed PWA) for
 * someone who isn't signed in: what the app is for, then create an account,
 * sign in, or just look around. The website's `/` is the marketing page
 * instead, which an app has no use for (App.tsx, HomeRoute).
 */
export default function AppWelcomePage() {
  // The art is dark in both themes: light status-bar icons over it.
  useDarkScreenBars();
  return (
    <main className="login-art app-chrome flex min-h-[100dvh] flex-col px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+1.5rem)] text-white">
      <IlluxusWordmark height={26} variant="dark" className="self-start" ariaLabel="illuxus" />

      {/* Decorative: the shape of an event card, as on the sign-in page. */}
      {/* Gives way first on a short screen. */}
      <div className="flex min-h-0 flex-1 items-center justify-center py-6 [@media(max-height:720px)]:hidden" aria-hidden="true">
        <div className="login-art-card w-full max-w-[13rem] rounded-3xl p-3">
          <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-white/60">
            <div className="flex flex-col items-center rounded-2xl bg-white px-5 py-3 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.3)]">
              <span className="h-2 w-8 rounded-full bg-neutral-200" />
              <span className="mt-2 h-6 w-9 rounded-md bg-neutral-900" />
            </div>
          </div>
          <div className="px-2 pb-2 pt-4">
            <span className="block h-3 w-36 rounded-full bg-neutral-900/85" />
            <span className="mt-2 block h-2 w-24 rounded-full bg-neutral-900/25" />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-auto w-full max-w-md">
        <h1 className="text-[32px] font-medium leading-[1.08] tracking-[-0.04em] text-white">
          Every event,
          <br />
          in your pocket.
        </h1>
        <ul className="mt-4 space-y-2">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-[14.5px] text-white/85">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                <Icon className="h-4 w-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>

        <div className="mt-7 space-y-2.5">
          <Link
            to="/login?mode=signup"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-neutral-900 transition-transform active:scale-[0.98]"
          >
            Create an account
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            className="flex h-12 w-full items-center justify-center rounded-full bg-white/10 text-[15px] font-semibold text-white ring-1 ring-white/25 transition-transform active:scale-[0.98]"
          >
            Sign in
          </Link>
          <Link to="/discover" className="block py-2 text-center text-[13.5px] font-medium text-white/75">
            Just browsing? See what's on
          </Link>
        </div>
      </div>
    </main>
  );
}
