/**
 * Page frame shared by the Partner dashboard's event list and event view.
 * Uses the site header (no organiser sidebar: partners have no access to the
 * organiser dashboard) with the same content width and spacing as the
 * organiser's Events page.
 */
import { Link } from "react-router-dom";
import { ArrowLeft, Handshake } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";

export function PartnerShell({
  children, back,
}: {
  children: React.ReactNode;
  /** Where the back arrow goes; defaults to the home page. */
  back?: { to: string; label: string };
}) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <header className="border-b border-border">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link
            to={back?.to ?? "/"}
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 text-sm"
            aria-label={back?.label ?? "Back to home"}
          >
            <ArrowLeft className="h-4 w-4" />
            {back && <span className="hidden sm:inline">{back.label}</span>}
          </Link>
          <Handshake className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold">Partner dashboard</span>
        </div>
      </header>
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">{children}</main>
    </div>
  );
}

export function PartnerNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl card-shadow p-8 text-center max-w-lg mx-auto space-y-2">
      <Handshake className="h-10 w-10 text-muted-foreground mx-auto" />
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-sm text-muted-foreground space-y-2">{children}</div>
    </div>
  );
}
