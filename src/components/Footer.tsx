import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
import { SiteContainer } from "@/components/layout/SiteContainer";

/** Render a footer link correctly depending on its href:
 *  - External (http/https) → <a target="_blank">
 *  - mailto / tel           → <a>
 *  - Hash-only (#…)         → <a> (same-page scroll)
 *  - Absolute path (/…)     → React Router <Link> (SPA nav, no reload)
 */
function FooterLink({ href, label }: { href: string; label: string }) {
  const className = "text-[13px] text-muted-foreground hover:text-foreground transition-colors";

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  if (href.startsWith("mailto:") || href.startsWith("tel:")) {
    return <a href={href} className={className}>{label}</a>;
  }
  if (href.startsWith("#")) {
    return <a href={href} className={className}>{label}</a>;
  }
  // Internal SPA route — use Link to avoid full-page reload
  return <Link to={href} className={className}>{label}</Link>;
}

const Footer = () => {
  const { content } = useSiteContent();
  const { theme } = useTheme();
  const f = content.footer;
  const { brandName, logoUrl, logoUrlDark } = content.navbar;
  const activeLogoUrl = theme === "dark" ? (logoUrlDark || logoUrl) : logoUrl;

  return (
    <footer className="border-t border-border py-12">
      <SiteContainer>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2">
              {activeLogoUrl ? (
                <img
                  src={activeLogoUrl}
                  alt={brandName}
                  className="h-7 w-auto max-w-[160px] object-contain"
                />
              ) : (
                <>
                  <div className="h-6 w-6 rounded-md bg-foreground flex items-center justify-center">
                    <span className="text-background text-[10px] font-bold">{brandName.charAt(0)}</span>
                  </div>
                  <span className="text-sm font-semibold tracking-tight">{brandName}</span>
                </>
              )}
            </Link>
            <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed">{f.tagline}</p>
          </div>

          {f.columns.map((col, ci) => (
            <div key={`${col.title}-${ci}`}>
              <h4 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-3">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link, li) => (
                  <li key={`${link.label}-${li}`}>
                    <FooterLink href={link.href} label={link.label} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[12px] text-muted-foreground">{f.copyright}</p>
        </div>
      </SiteContainer>
    </footer>
  );
};

export default Footer;
