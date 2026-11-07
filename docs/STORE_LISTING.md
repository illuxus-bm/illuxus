# Store listings: Google Play and the App Store

Everything to paste into the Play Console and App Store Connect for the illuxus app, with each
field's character limit. Building, signing and uploading the app is in [`MOBILE.md`](./MOBILE.md).

| | Google Play | App Store |
| --- | --- | --- |
| Account | Play Console, $25 once | Apple Developer Program, $99 a year |
| App ID | `com.illuxus.app` | Bundle ID `com.illuxus.app` |
| Upload | `android/app/build/outputs/bundle/release/app-release.aab` | Xcode → Product → Archive → Distribute |
| Devices | Phones, tablets, foldables, Chromebooks (Android 7+) | iPhone and iPad (iOS 15+); Apple silicon Macs run the iPad app |
| Category | Business (tag: Events) | Primary: Business. Secondary: Productivity |
| Price | Free | Free |

## Listing text

**App name** (Play 30, Apple 30): `illuxus: Events & Tickets`

**Apple subtitle** (30): `Events, tickets and check-in`

**Play short description** (80):
`Find events, keep your tickets, and run your own: registration and QR check-in.`

**Apple promotional text** (170, can change without a review):
`Your tickets, ready to scan at the door. Organisers: publish an event page, take registrations and check guests in by QR code, all from your phone.`

**Apple keywords** (100, comma-separated, no spaces after commas):
`events,tickets,event management,check-in,QR,registration,webinar,conference,meetup,community,RSVP`

**Full description** (Play 4000, Apple 4000):

```
illuxus is the all-in-one app for events — for the people who go to them and the people who run them.

GOING TO EVENTS
• Discover events near you and register in a tap
• Keep every ticket in one place, with a QR code ready to scan at the door
• Join live webinars and sessions from your phone
• Stay in touch with the people you met in each event's community

RUNNING EVENTS
• Publish a branded event page in minutes
• Take registrations, with approvals, waitlists and capacity limits
• Check guests in and out by scanning their QR codes with your phone's camera
• Design badges and issue certificates
• Email and WhatsApp updates to your attendees
• Manage speakers, sponsors and your team
• Live reports while the event runs

MADE FOR YOUR DEVICE
• Light and dark appearance that follows your device, or your own choice
• Text that follows your device's font size
• Works on phones, tablets and foldables

Your account works everywhere: the app, and illuxus.com on any computer.

Privacy: https://illuxus.com/privacy
Delete your data: https://illuxus.com/data-deletion
```

**What's new** (first release): `The first release of the illuxus app.`

## Links

| Field | Value |
| --- | --- |
| Website / marketing URL | https://illuxus.com |
| Support URL / email | https://illuxus.com/contact |
| Privacy policy | https://illuxus.com/privacy |
| Account deletion (Play: "Delete account URL") | https://illuxus.com/data-deletion |
| Apple copyright | `2026 illuxus` |

## Graphics

| Asset | Google Play | App Store |
| --- | --- | --- |
| Icon | 512 × 512 PNG (from `assets/icon-only.png`) | Taken from the build |
| Feature graphic | 1024 × 500 PNG or JPG | Not used |
| Phone screenshots | 2–8, 1080 × 1920 or larger, 9:16 | 6.9" iPhone: 1320 × 2868 (3–10) |
| Tablet screenshots | 7" and 10" tablet, recommended | 13" iPad: 2064 × 2752, required because the app runs on iPad |

Take them from a signed-in demo account with real-looking events: Discover, an event page, the
ticket with its QR code, the organiser's event list, check-in scanning, and dark mode.

## Privacy answers

Both stores ask what the app collects. These answers match [`/privacy`](https://illuxus.com/privacy);
keep them in step when either changes.

| Data | Collected | Why | Shared |
| --- | --- | --- | --- |
| Name, email, phone number | Yes, required for an account | Account, tickets, event communication | With the organiser of an event the person registers for |
| Company, job title, LinkedIn (optional) | Yes, optional | Registration forms, sponsor contact (only with the person's consent) | With the organiser; with sponsors only if the person agrees |
| Photos (profile, event covers) | Yes, optional | Shown in the app | Public where the person publishes them |
| Messages and posts in communities | Yes | Community features | Visible to that community |
| Crash and error reports | Only once crash reporting is set up (`VITE_OBSERVABILITY_DSN`; it isn't yet) | Fixing problems | No (Sentry would process them for us) |
| Usage analytics (GA4, Clarity) | Only after the person agrees to analytics cookies | Improving the app | No; not used for advertising |
| Payment information | No; payments are handled by the payment provider | — | — |
| Location | No | — | — |

- **Apple, "Data used to track you":** none. The app has no advertising and doesn't ask for
  tracking permission (`PrivacyInfo.xcprivacy` declares `NSPrivacyTracking` false).
- **Play, "Data is encrypted in transit":** yes. **"Users can request deletion":** yes, at
  `/data-deletion` and in the app (Settings → Request deletion of my data).

## Content rating and review notes

- **Play content rating (IARC):** a reference app for events, with user-generated content
  (community posts and chat) and user-to-user communication. No violence, gambling or purchases of
  digital goods.
- **Apple age rating:** 12+ (unrestricted web content is not offered; user-generated content is).
- **User-generated content (Apple 1.2):** posts can be reported (the flag on a post) and moderators
  can hide and remove them. Apple also asks that people can **block** abusive users. Confirm the
  community has this before submitting, or add it: it's the most common rejection for apps with
  feeds or chat.
- **Account deletion (Apple 5.1.1(v)):** deletion is requested in the app and carried out by the
  privacy team. Say in the review notes how long it takes (for example, "within 7 days").
- **Sign-in for review:** give a demo account (email and password) that belongs to an organisation
  with at least one published event, so the reviewer can see both the attendee and organiser sides.
- **Payments:** tickets for real-world events are physical services, so in-app purchase rules
  don't apply (Apple 3.1.3(e)); say so if asked.
- **Camera and microphone:** used for scanning tickets at check-in and for webinars. The purpose
  strings are in `ios/App/App/Info.plist`.

## Mac, Windows and Chromebook

- **Mac:** in App Store Connect → the app → Pricing and Availability, leave **iPhone and iPad Apps on
  Apple Silicon Macs** on. The iPad app then appears in the Mac App Store with no extra build.
- **Chromebooks:** the Play listing covers them (the app doesn't require a touchscreen).
- **Windows, and Macs or Linux in the meantime:** illuxus.com installs as an app from Edge or Chrome
  (the README shows how). To list it in the Microsoft Store as well, package illuxus.com with
  [PWABuilder](https://www.pwabuilder.com) and submit it from a Microsoft Partner Center account.
