import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
import { SiteContainer } from "@/components/layout/SiteContainer";

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
            <a href="/" className="flex items-center gap-2">
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
            </a>
            <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed">{f.tagline}</p>
          </div>

          {f.columns.map((col, ci) => (
            <div key={`${col.title}-${ci}`}>
              <h4 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-3">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link, li) => (
                  <li key={`${link.label}-${li}`}>
                    <a href={link.href} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                      {link.label}
                    </a>
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