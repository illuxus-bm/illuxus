import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";

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
    <footer className="relative z-10 border-t border-border py-14">
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
                <IlluxusWordmark height={24} ariaLabel={brandName} />
              )}
            </Link>
            <p className="text-[13px] text-muted-foreground mt-4 leading-relaxed max-w-[220px]">{f.tagline}</p>
          </div>

          {f.columns.map((col, ci) => (
            <div key={`${col.title}-${ci}`}>
              <h4 className="eyebrow !text-[11px] text-foreground mb-4">
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
