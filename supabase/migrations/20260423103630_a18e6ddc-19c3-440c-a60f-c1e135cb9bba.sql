-- Site content table: one row per landing-page section, with a flexible JSON payload
CREATE TABLE public.site_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL UNIQUE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Public can read landing page content
CREATE POLICY "Anyone can view site content"
  ON public.site_content
  FOR SELECT
  USING (true);

-- Only platform admins can manage
CREATE POLICY "Admins can insert site content"
  ON public.site_content
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update site content"
  ON public.site_content
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete site content"
  ON public.site_content
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER update_site_content_updated_at
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default content
INSERT INTO public.site_content (section, content) VALUES
('navbar', '{
  "brandName": "Backstage",
  "links": [
    {"label": "Features", "href": "#features"},
    {"label": "Pricing", "href": "#pricing"},
    {"label": "Testimonials", "href": "#testimonials"}
  ],
  "signInLabel": "Sign in",
  "ctaLabel": "Get Started"
}'::jsonb),
('hero', '{
  "badge": "New: AI-powered event insights",
  "title": "Run events your attendees won''t forget",
  "subtitle": "All-in-one platform to plan, promote, and manage events of any size.",
  "primaryCtaLabel": "Start free",
  "primaryCtaHref": "/login",
  "secondaryCtaLabel": "Browse events",
  "secondaryCtaHref": "/events"
}'::jsonb),
('features', '{
  "eyebrow": "Features",
  "title": "Everything you need to ship great events",
  "subtitle": "Built for organizers who care about the details.",
  "items": [
    {"title": "Event pages", "description": "Beautiful, customizable landing pages for every event.", "icon": "Sparkles"},
    {"title": "Registrations", "description": "Sell tickets, collect RSVPs, manage waitlists.", "icon": "Ticket"},
    {"title": "Check-in", "description": "Fast door check-in with QR scanning and bulk actions.", "icon": "ScanLine"},
    {"title": "Analytics", "description": "Track sales, attendance, and engagement in real time.", "icon": "BarChart3"},
    {"title": "Speakers & sponsors", "description": "Centralized profiles, sessions, and tiered sponsor placement.", "icon": "Users"},
    {"title": "Email & marketing", "description": "Reach attendees with built-in campaigns and reminders.", "icon": "Mail"}
  ]
}'::jsonb),
('pricing', '{
  "eyebrow": "Pricing",
  "title": "Simple plans that scale with you",
  "subtitle": "Start free. Upgrade when you grow.",
  "plans": [
    {"name": "Free", "price": "$0", "period": "forever", "description": "For trying things out", "highlight": false, "ctaLabel": "Start free", "ctaHref": "/login", "features": ["3 events", "50 attendees/event", "Basic analytics"]},
    {"name": "Starter", "price": "$29", "period": "/month", "description": "For growing organizers", "highlight": false, "ctaLabel": "Choose Starter", "ctaHref": "/login", "features": ["10 events", "200 attendees/event", "Custom branding", "Email notifications"]},
    {"name": "Pro", "price": "$79", "period": "/month", "description": "For serious teams", "highlight": true, "ctaLabel": "Choose Pro", "ctaHref": "/login", "features": ["50 events", "1,000 attendees/event", "Advanced analytics", "Sponsor management", "Custom domain"]},
    {"name": "Business", "price": "$199", "period": "/month", "description": "For agencies and enterprises", "highlight": false, "ctaLabel": "Contact sales", "ctaHref": "/login", "features": ["Unlimited events", "Unlimited attendees", "API access", "White label", "Priority support"]}
  ]
}'::jsonb),
('testimonials', '{
  "eyebrow": "Loved by organizers",
  "title": "Trusted by teams running world-class events",
  "items": [
    {"quote": "We replaced four tools with Backstage. Setup took an afternoon.", "author": "Aria Chen", "role": "Head of Events, Lumen", "avatarUrl": ""},
    {"quote": "Door check-in went from chaos to calm. The QR scanner is excellent.", "author": "Marcus Reyes", "role": "Operations, NorthBeat", "avatarUrl": ""},
    {"quote": "Our sponsors finally get the visibility they pay for.", "author": "Priya Shah", "role": "Founder, DevHaus", "avatarUrl": ""}
  ]
}'::jsonb),
('cta', '{
  "title": "Ready to host your next event?",
  "subtitle": "Set up in minutes. No credit card required.",
  "primaryCtaLabel": "Start free",
  "primaryCtaHref": "/login",
  "secondaryCtaLabel": "See pricing",
  "secondaryCtaHref": "#pricing"
}'::jsonb),
('footer', '{
  "brandName": "Backstage",
  "tagline": "The modern event platform.",
  "columns": [
    {"title": "Product", "links": [{"label": "Features", "href": "#features"}, {"label": "Pricing", "href": "#pricing"}]},
    {"title": "Company", "links": [{"label": "About", "href": "#"}, {"label": "Contact", "href": "mailto:hello@backstage.app"}]},
    {"title": "Legal", "links": [{"label": "Privacy", "href": "#"}, {"label": "Terms", "href": "#"}]}
  ],
  "copyright": "© 2025 Backstage. All rights reserved."
}'::jsonb);