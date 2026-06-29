// Default landing-page content. Used as fallback when DB rows are missing
// and as the schema reference for the admin editor.

export interface NavbarContent {
  brandName: string;
  /** Optional logo image URL (used in light mode, and as the default when no dark logo is set). */
  logoUrl?: string;
  /** Optional dark-mode logo image URL. When set, used whenever the dark theme is active. */
  logoUrlDark?: string;
  /** Logo render height in pixels. Width auto-scales. Defaults to 32. */
  logoHeight?: number;
  /** Extra padding above the logo in the header (px). Defaults to 0. */
  logoPaddingTop?: number;
  /** Extra padding below the logo in the header (px). Defaults to 0. */
  logoPaddingBottom?: number;
  links: { label: string; href: string }[];
  signInLabel: string;
  ctaLabel: string;
}

export interface HeroContent {
  badge: string;
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  theme?: HeroTheme;
}

export interface HeroTheme {
  /** Background mode: solid color, gradient, or the original cosmic preset. */
  mode: "preset" | "solid" | "gradient";
  /** Used when mode === 'solid'. Any valid CSS color (hsl, hex, rgb). */
  background: string;
  /** Used when mode === 'gradient'. Two stops blended diagonally. */
  gradientFrom: string;
  gradientTo: string;
  /** Heading + body text color. */
  textColor: string;
  /** Accent applied to the first word of the headline. */
  accentColor: string;
}

export interface FeaturesContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  items: { title: string; description: string; icon: string }[];
}

export interface PricingPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  highlight: boolean;
  ctaLabel: string;
  ctaHref: string;
  features: string[];
}

export interface PricingContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  plans: PricingPlan[];
}

export interface TestimonialItem {
  quote: string;
  author: string;
  role: string;
  avatarUrl: string;
}

export interface TestimonialsContent {
  eyebrow: string;
  title: string;
  items: TestimonialItem[];
}

export interface CTAContent {
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
}

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface FooterContent {
  brandName: string;
  tagline: string;
  columns: FooterColumn[];
  copyright: string;
}

export interface SiteIdentityContent {
  /** Browser tab title and default <title> tag */
  siteTitle: string;
  /** Meta description used for SEO and social cards */
  metaDescription: string;
  /** Author name (meta author tag) */
  author: string;
  /** Open Graph / Twitter share image URL (absolute) */
  ogImageUrl: string;
  /** Favicon URL — supports .ico, .png, .svg */
  faviconUrl: string;
  /** Canonical site URL (optional) */
  siteUrl: string;
  /** Theme color used by mobile browsers */
  themeColor: string;
}

export interface SiteContentMap {
  identity: SiteIdentityContent;
  navbar: NavbarContent;
  hero: HeroContent;
  features: FeaturesContent;
  pricing: PricingContent;
  testimonials: TestimonialsContent;
  cta: CTAContent;
  footer: FooterContent;
}

export const DEFAULT_SITE_CONTENT: SiteContentMap = {
  identity: {
    siteTitle: "Illuxus — The All-in-One Event Management Platform",
    metaDescription:
      "Create, manage, and scale unforgettable events with Illuxus. Ticketing, speaker management, analytics, and more — all in one platform.",
    author: "Illuxus",
    ogImageUrl:
      "https://dcfygmgjqldvynbvmwdy.supabase.co/storage/v1/object/public/site-assets/favicon/1777010462147-m60zhn.png",
    faviconUrl: "/favicon.ico",
    siteUrl: "",
    themeColor: "#0b0b1a",
  },
  navbar: {
    brandName: "Illuxus",
    logoUrl: "",
    logoUrlDark: "",
    logoHeight: 32,
    logoPaddingTop: 0,
    logoPaddingBottom: 0,
    links: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Testimonials", href: "#testimonials" },
    ],
    signInLabel: "Sign in",
    ctaLabel: "Get Started",
  },
  hero: {
    badge: "Event Management Platform",
    title: "Organize events that people remember",
    subtitle:
      "Ticketing, speakers, schedules, and analytics — everything you need to run world-class events, in one platform.",
    primaryCtaLabel: "Start for free",
    primaryCtaHref: "/login",
    secondaryCtaLabel: "See how it works",
    secondaryCtaHref: "#features",
    theme: {
      mode: "preset",
      background: "#0b0b1a",
      gradientFrom: "#1a1a3a",
      gradientTo: "#0b0b1a",
      textColor: "#ffffff",
      accentColor: "#f97316",
    },
  },
  features: {
    eyebrow: "Features",
    title: "Everything for world-class events",
    subtitle: "A comprehensive toolkit for every aspect of your event lifecycle.",
    items: [
      { title: "Event Creation", description: "Design stunning event pages with customizable templates and branding.", icon: "CalendarDays" },
      { title: "Smart Ticketing", description: "Flexible pricing tiers, promo codes, early bird discounts, and group packages.", icon: "Ticket" },
      { title: "Speaker Management", description: "Manage speakers, sessions, and schedules. Let speakers update their profiles.", icon: "Mic2" },
      { title: "Attendee Experience", description: "Personalized agendas, networking tools, and real-time event updates.", icon: "Users" },
      { title: "Analytics & Insights", description: "Track registrations, engagement, revenue with real-time dashboards.", icon: "BarChart3" },
      { title: "Virtual & Hybrid", description: "Host any format with integrated streaming and interactive features.", icon: "Globe" },
      { title: "Enterprise Security", description: "GDPR compliance, SSO, and role-based access controls built in.", icon: "Shield" },
      { title: "AI-Powered", description: "Smart attendee matching and personalized recommendations.", icon: "Sparkles" },
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    title: "Plans that scale with you",
    subtitle: "Start free and upgrade as you grow. No hidden fees.",
    plans: [
      { name: "Starter", price: "Free", period: "", description: "For small meetups and workshops", highlight: false, ctaLabel: "Start Free", ctaHref: "/login", features: ["Up to 100 attendees", "1 event at a time", "Basic event page", "Email support", "Standard analytics"] },
      { name: "Professional", price: "$49", period: "/mo", description: "For growing organizations", highlight: true, ctaLabel: "Start Trial", ctaHref: "/login", features: ["Up to 5,000 attendees", "Unlimited events", "Custom branding", "Priority support", "Advanced analytics", "Speaker management", "Promo codes"] },
      { name: "Enterprise", price: "Custom", period: "", description: "For large-scale operations", highlight: false, ctaLabel: "Contact Sales", ctaHref: "/login", features: ["Unlimited attendees", "Unlimited events", "White-label solution", "Dedicated manager", "Custom integrations", "SSO & security", "SLA guarantee"] },
    ],
  },
  testimonials: {
    eyebrow: "Testimonials",
    title: "Trusted by event organizers",
    items: [
      { quote: "Illuxus transformed how we manage our annual conference. The analytics alone saved us thousands of hours.", author: "Sarah Chen", role: "Head of Events, TechCrunch", avatarUrl: "" },
      { quote: "The speaker management and scheduling tools are phenomenal. We went from chaos to complete control overnight.", author: "Marcus Rivera", role: "Event Director, Summit Global", avatarUrl: "" },
      { quote: "We switched from three different tools to just Illuxus. The all-in-one approach is a game-changer.", author: "Anja Müller", role: "Community Lead, DevConf", avatarUrl: "" },
    ],
  },
  cta: {
    title: "Ready to create your next event?",
    subtitle: "Join thousands of organizers who trust Illuxus to deliver extraordinary experiences.",
    primaryCtaLabel: "Start Free Trial",
    primaryCtaHref: "/login",
    secondaryCtaLabel: "Talk to Sales",
    secondaryCtaHref: "mailto:sales@illuxus.com",
  },
  footer: {
    brandName: "Illuxus",
    tagline: "The all-in-one event management platform.",
    columns: [
      { title: "Product", links: [{ label: "Features", href: "/features" }, { label: "Pricing", href: "/pricing" }, { label: "Integrations", href: "/features" }, { label: "Changelog", href: "/" }] },
      { title: "Resources", links: [{ label: "Documentation", href: "/docs" }, { label: "FAQs", href: "/faqs" }, { label: "Community", href: "/community" }, { label: "Events", href: "/events" }] },
      { title: "Company", links: [{ label: "About", href: "/about" }, { label: "Contact", href: "/contact" }, { label: "Discover", href: "/discover" }, { label: "Partners", href: "/" }] },
      { title: "Legal", links: [{ label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }, { label: "Security", href: "/privacy" }, { label: "GDPR", href: "/privacy" }] },
    ],
    copyright: "© 2026 Illuxus. All rights reserved.",
  },
};

export type SiteSection = keyof SiteContentMap;

export const SECTION_ORDER: SiteSection[] = [
  "identity",
  "navbar",
  "hero",
  "features",
  "pricing",
  "testimonials",
  "cta",
  "footer",
];

// Allowed lucide icon names for the features section editor.
export const FEATURE_ICON_OPTIONS = [
  "CalendarDays",
  "Ticket",
  "Mic2",
  "Users",
  "BarChart3",
  "Globe",
  "Shield",
  "Sparkles",
  "Mail",
  "ScanLine",
  "Zap",
  "Crown",
  "Rocket",
] as const;