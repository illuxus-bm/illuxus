-- Reference data for supabase/install.sql (production values, 2026-11-08).
-- Only the catalogues the app needs to work on a new project: subscription
-- plans, the website's published content, vendor categories, community badge
-- definitions, phone dial codes and personal email domains. No user data, no
-- secrets. vendor_category_map is left out on purpose (it links specific
-- production vendors); cities is empty in production (seed-cities fills it).
-- Regenerate with a data-only dump that excludes every other table.

INSERT INTO "public"."community_badges" ("id", "label", "icon", "description", "rule_kind", "threshold") VALUES
	('new_member', 'New Member', '👋', 'Joined a community', 'manual', NULL),
	('contributor', 'Contributor', '✍️', 'Posted 5 times', 'posts_gte', 5),
	('active', 'Active Member', '🔥', 'Posted 25 times', 'posts_gte', 25),
	('expert', 'Expert', '🏆', 'Earned 500 points', 'points_gte', 500),
	('leader', 'Community Leader', '⭐', 'Earned 1500 points', 'points_gte', 1500),
	('speaker', 'Speaker', '🎤', 'Spoke at a community event', 'speaker', NULL);

INSERT INTO "public"."dial_codes" ("iso", "dial") VALUES
	('IN', '+91'),
	('US', '+1'),
	('GB', '+44'),
	('AE', '+971'),
	('SG', '+65'),
	('AU', '+61'),
	('CA', '+1'),
	('DE', '+49'),
	('FR', '+33'),
	('ES', '+34'),
	('IT', '+39'),
	('NL', '+31'),
	('CH', '+41'),
	('SE', '+46'),
	('NO', '+47'),
	('DK', '+45'),
	('IE', '+353'),
	('JP', '+81'),
	('KR', '+82'),
	('CN', '+86'),
	('HK', '+852'),
	('MY', '+60'),
	('ID', '+62'),
	('PH', '+63'),
	('TH', '+66'),
	('VN', '+84'),
	('BD', '+880'),
	('PK', '+92'),
	('LK', '+94'),
	('NP', '+977'),
	('SA', '+966'),
	('QA', '+974'),
	('KW', '+965'),
	('BH', '+973'),
	('OM', '+968'),
	('EG', '+20'),
	('ZA', '+27'),
	('NG', '+234'),
	('KE', '+254'),
	('BR', '+55'),
	('MX', '+52'),
	('AR', '+54'),
	('CL', '+56'),
	('CO', '+57'),
	('NZ', '+64'),
	('TR', '+90'),
	('RU', '+7'),
	('PL', '+48'),
	('PT', '+351'),
	('BE', '+32'),
	('AT', '+43'),
	('FI', '+358'),
	('GR', '+30'),
	('IL', '+972');

INSERT INTO "public"."personal_email_domains" ("domain") VALUES
	('gmail.com'),
	('googlemail.com'),
	('yahoo.com'),
	('yahoo.co.in'),
	('yahoo.co.uk'),
	('outlook.com'),
	('hotmail.com'),
	('live.com'),
	('msn.com'),
	('icloud.com'),
	('me.com'),
	('mac.com'),
	('aol.com'),
	('proton.me'),
	('protonmail.com'),
	('rediffmail.com'),
	('zoho.com'),
	('zohomail.in'),
	('yandex.com'),
	('gmx.com'),
	('mail.com');

INSERT INTO "public"."plans" ("key", "name", "description", "sort_order", "is_public", "limits", "features", "created_at", "updated_at", "price_monthly", "price_yearly", "currency") VALUES
	('free', 'Free', 'For trying things out', 0, true, '{"max_events": 3, "max_team_members": 1, "max_attendees_per_event": 50}', '{website_builder,agenda,speakers,sponsor_management,venue_sourcing,badges,self_checkin,communications,whatsapp,community,creatives,creatives_ai,brochure,certificates,utm_tracking,reports,marketing,landing_builder,custom_domain}', '2026-10-20 13:15:09.906971+00', '2026-11-07 09:22:16.160967+00', 0.00, NULL, 'USD'),
	('starter', 'Starter', 'For growing organisers', 1, true, '{"max_events": 10, "max_team_members": 3, "max_attendees_per_event": 200}', '{website_builder,agenda,speakers,sponsor_management,venue_sourcing,badges,self_checkin,communications,whatsapp,community,creatives,creatives_ai,brochure,certificates,utm_tracking,reports,marketing,landing_builder,custom_domain}', '2026-10-20 13:15:09.906971+00', '2026-11-07 09:22:16.160967+00', 29.00, NULL, 'USD'),
	('pro', 'Pro', 'For serious teams', 2, true, '{"max_events": 50, "max_team_members": 10, "max_attendees_per_event": 1000}', '{website_builder,agenda,speakers,sponsor_management,venue_sourcing,badges,self_checkin,communications,whatsapp,community,creatives,creatives_ai,brochure,certificates,utm_tracking,reports,marketing,landing_builder,custom_domain,advanced_analytics}', '2026-10-20 13:15:09.906971+00', '2026-11-07 09:22:16.160967+00', 79.00, NULL, 'USD'),
	('business', 'Business', 'For agencies & enterprises', 3, true, '{"max_events": -1, "max_team_members": -1, "max_attendees_per_event": -1}', '{website_builder,agenda,speakers,sponsor_management,venue_sourcing,badges,self_checkin,communications,whatsapp,community,creatives,creatives_ai,brochure,certificates,utm_tracking,reports,marketing,landing_builder,custom_domain,advanced_analytics,white_label,api_access,priority_support}', '2026-10-20 13:15:09.906971+00', '2026-11-07 09:22:16.160967+00', 199.00, NULL, 'USD');

INSERT INTO "public"."site_content" ("id", "section", "content", "draft_content", "published_at", "created_at", "updated_at") VALUES
	('48353bd8-ce3f-4e3d-996f-ad0019dbbf55', 'navbar', '{"links": [{"href": "#features", "label": "Features"}, {"href": "#pricing", "label": "Pricing"}, {"href": "#testimonials", "label": "Testimonials"}], "ctaLabel": "Get Started", "brandName": "Illuxus", "signInLabel": "Sign in"}', NULL, NULL, '2026-06-10 09:44:45.864454+00', '2026-06-10 09:44:45.864454+00'),
	('a286eb6c-3ce6-45a9-b751-549e9ed24905', 'hero', '{"badge": "New: AI-powered event insights", "title": "Run events your attendees won''t forget", "subtitle": "All-in-one platform to plan, promote, and manage events of any size.", "primaryCtaHref": "/login", "primaryCtaLabel": "Start free", "secondaryCtaHref": "/events", "secondaryCtaLabel": "Browse events"}', NULL, NULL, '2026-06-10 09:44:45.864454+00', '2026-06-10 09:44:45.864454+00'),
	('09a95547-f620-4f33-b941-71564e0a2ece', 'features', '{"items": [{"icon": "Sparkles", "title": "Event pages", "description": "Beautiful, customizable landing pages for every event."}, {"icon": "Ticket", "title": "Registrations", "description": "Sell tickets, collect RSVPs, manage waitlists."}, {"icon": "ScanLine", "title": "Check-in", "description": "Fast door check-in with QR scanning and bulk actions."}, {"icon": "BarChart3", "title": "Analytics", "description": "Track sales, attendance, and engagement in real time."}, {"icon": "Users", "title": "Speakers & sponsors", "description": "Centralized profiles, sessions, and tiered sponsor placement."}, {"icon": "Mail", "title": "Email & marketing", "description": "Reach attendees with built-in campaigns and reminders."}], "title": "Everything you need to ship great events", "eyebrow": "Features", "subtitle": "Built for organizers who care about the details."}', NULL, NULL, '2026-06-10 09:44:45.864454+00', '2026-06-10 09:44:45.864454+00'),
	('afdc7457-8430-434d-a6a4-565eaf24eb62', 'testimonials', '{"items": [{"role": "Head of Events, Lumen", "quote": "We replaced four tools with Illuxus. Setup took an afternoon.", "author": "Aria Chen", "avatarUrl": ""}, {"role": "Operations, NorthBeat", "quote": "Door check-in went from chaos to calm. The QR scanner is excellent.", "author": "Marcus Reyes", "avatarUrl": ""}, {"role": "Founder, DevHaus", "quote": "Our sponsors finally get the visibility they pay for.", "author": "Priya Shah", "avatarUrl": ""}], "title": "Trusted by teams running world-class events", "eyebrow": "Loved by organizers"}', NULL, NULL, '2026-06-10 09:44:45.864454+00', '2026-06-10 09:44:45.864454+00'),
	('a74503d0-cb4a-4cd7-aced-8f248e4ab4ea', 'cta', '{"title": "Ready to host your next event?", "subtitle": "Set up in minutes. No credit card required.", "primaryCtaHref": "/login", "primaryCtaLabel": "Start free", "secondaryCtaHref": "#pricing", "secondaryCtaLabel": "See pricing"}', NULL, NULL, '2026-06-10 09:44:45.864454+00', '2026-06-10 09:44:45.864454+00'),
	('b8b87ef8-f0c7-4ab6-94b7-42d1261a67e9', 'footer', '{"columns": [{"links": [{"href": "/features", "label": "Features"}, {"href": "/pricing", "label": "Pricing"}, {"href": "/features", "label": "Integrations"}], "title": "Product"}, {"links": [{"href": "/docs", "label": "Documentation"}, {"href": "/faqs", "label": "FAQs"}, {"href": "/community", "label": "Community"}, {"href": "/events", "label": "Events"}], "title": "Resources"}, {"links": [{"href": "/about", "label": "About"}, {"href": "/contact", "label": "Contact"}, {"href": "/discover", "label": "Discover"}], "title": "Company"}, {"links": [{"href": "/privacy", "label": "Privacy"}, {"href": "/terms", "label": "Terms"}, {"href": "/privacy", "label": "Security"}, {"href": "/privacy", "label": "GDPR"}], "title": "Legal"}], "tagline": "The modern event platform.", "brandName": "Illuxus", "copyright": "© 2026 Illuxus Technologies. All rights reserved."}', NULL, NULL, '2026-06-10 09:44:45.864454+00', '2026-06-29 19:09:36.308574+00'),
	('a419f518-d0eb-4c99-8050-2b82afdd246b', 'pricing', '{"plans": [{"name": "Starter", "price": "Free", "period": "", "ctaHref": "/login", "ctaLabel": "Start free", "features": ["Up to 100 attendees per event", "1 active event at a time", "QR check-in", "Standard analytics", "Email support"], "highlight": false, "description": "Perfect for meetups and small community events."}, {"name": "Professional", "price": "₹10,499", "period": "/mo", "ctaHref": "/login", "ctaLabel": "Start 14-day trial", "features": ["Up to 5,000 attendees per event", "Unlimited active events", "Custom branding + page builder", "Webinar studio + speaker management", "WhatsApp messaging & advanced analytics"], "highlight": true, "description": "For growing teams that run regular events."}, {"name": "Enterprise", "price": "Custom", "period": "", "ctaHref": "mailto:sales@illuxus.com", "ctaLabel": "Talk to sales", "features": ["Unlimited attendees & events", "White-label & custom domain", "SSO & advanced roles", "Dedicated account manager", "GDPR data processing agreement"], "highlight": false, "description": "Large-scale conferences and multi-org deployments."}], "title": "Plans that grow with you", "eyebrow": "Pricing", "subtitle": "Start free. Scale when you''re ready. No hidden fees, no lock-in."}', NULL, '2026-10-20 13:29:41.464781+00', '2026-06-10 09:44:45.864454+00', '2026-10-20 13:29:41.464781+00');

INSERT INTO "public"."vendor_categories" ("id", "name", "slug", "icon", "created_at") VALUES
	('48143b43-bc0a-4881-b6b8-a88237e15b4c', 'Catering', 'catering', 'UtensilsCrossed', '2026-07-12 11:00:58.66392+00'),
	('541dce8e-df66-44eb-a634-49dbde2d942e', 'Photography', 'photography', 'Camera', '2026-07-12 11:00:58.66392+00'),
	('50c02b73-7a7e-4ae4-93b2-191beef2c0fe', 'Videography', 'videography', 'Video', '2026-07-12 11:00:58.66392+00'),
	('891d45af-4d75-4944-aad2-92de19459eaf', 'DJ / Music', 'dj-music', 'Music', '2026-07-12 11:00:58.66392+00'),
	('c37378b8-3f25-484a-90a8-87d3db1259e4', 'Decor & Florals', 'decor-florals', 'Flower2', '2026-07-12 11:00:58.66392+00'),
	('72e44699-e8be-43c3-9262-87a922d389e4', 'AV & Lighting', 'av-lighting', 'Lightbulb', '2026-07-12 11:00:58.66392+00'),
	('735b7d40-9a48-42a4-ac17-a2cb6458d9a6', 'Event Planning', 'event-planning', 'CalendarDays', '2026-07-12 11:00:58.66392+00'),
	('6adb4541-c513-4578-8d9e-8e9535f17b50', 'Venue', 'venue', 'Building2', '2026-07-12 11:00:58.66392+00'),
	('4dd17da1-85c1-4d6e-9393-b62439276564', 'Security', 'security', 'Shield', '2026-07-12 11:00:58.66392+00'),
	('4e555430-0864-4430-8932-f4bcec7047dc', 'Transportation', 'transportation', 'Car', '2026-07-12 11:00:58.66392+00'),
	('739ee114-2eef-4cb3-8770-0f944332aa09', 'MC / Host', 'mc-host', 'Mic2', '2026-07-12 11:00:58.66392+00'),
	('609604c6-5ed7-43c8-9065-a7f7851ecd2b', 'Makeup & Styling', 'makeup-styling', 'Sparkles', '2026-07-12 11:00:58.66392+00'),
	('ed4eb6ed-99ac-4b0f-b871-7a196bc53327', 'Printing & Signage', 'printing-signage', 'Printer', '2026-07-12 11:00:58.66392+00'),
	('86164b61-378e-422e-aaf2-fdb6bec31f76', 'Rentals (Furniture)', 'rentals-furniture', 'Armchair', '2026-07-12 11:00:58.66392+00'),
	('c13cfa2c-def8-4db2-99d2-b46e80cbf065', 'Entertainment', 'entertainment', 'PartyPopper', '2026-07-12 11:00:58.66392+00');
