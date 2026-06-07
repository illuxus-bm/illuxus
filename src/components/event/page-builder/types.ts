export type BlockType =
  | "hero"
  | "heading"
  | "text"
  | "image"
  | "button"
  | "spacer"
  | "divider"
  | "columns"
  | "speakers"
  | "schedule"
  | "sponsors"
  | "cta"
  | "gallery"
  | "faq"
  | "countdown"
  | "video"
  | "testimonials"
  | "pricing"
  | "map";

export interface BlockStyles {
  padding?: string;
  backgroundColor?: string;
  textColor?: string;
  textAlign?: "left" | "center" | "right";
  backgroundImage?: string;
  backgroundOverlay?: string;
  borderRadius?: string;
  maxWidth?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  content: Record<string, any>;
  styles: BlockStyles;
}

export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}

export interface PageBuilderState {
  blocks: Block[];
  theme: ThemeConfig;
}

export interface WidgetDefinition {
  type: BlockType;
  label: string;
  icon: string;
  category: "layout" | "content" | "media" | "event" | "conversion";
  defaultContent: Record<string, any>;
  defaultStyles: BlockStyles;
}

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    type: "hero",
    label: "Hero Banner",
    icon: "🖼️",
    category: "layout",
    defaultContent: {
      headline: "Your Event Title",
      subheadline: "Join us for an incredible experience",
      buttonText: "Register Now",
      buttonLink: "#",
      showDate: true,
      showVenue: true,
    },
    defaultStyles: { padding: "80px 48px", textAlign: "left" },
  },
  {
    type: "heading",
    label: "Heading",
    icon: "𝐇",
    category: "content",
    defaultContent: { text: "Section Heading", level: "h2" },
    defaultStyles: { padding: "32px 48px", textAlign: "left" },
  },
  {
    type: "text",
    label: "Text Block",
    icon: "¶",
    category: "content",
    defaultContent: { text: "Write your content here. Click to edit this text block and add your own content." },
    defaultStyles: { padding: "24px 48px", textAlign: "left" },
  },
  {
    type: "image",
    label: "Image",
    icon: "🖼",
    category: "media",
    defaultContent: { src: "", alt: "Image", caption: "" },
    defaultStyles: { padding: "24px 48px", textAlign: "center" },
  },
  {
    type: "video",
    label: "Video Embed",
    icon: "▶️",
    category: "media",
    defaultContent: { url: "https://www.youtube.com/embed/dQw4w9WgXcQ", aspectRatio: "16/9" },
    defaultStyles: { padding: "24px 48px" },
  },
  {
    type: "button",
    label: "Button",
    icon: "🔘",
    category: "conversion",
    defaultContent: { text: "Click Me", link: "#", variant: "primary", size: "md" },
    defaultStyles: { padding: "24px 48px", textAlign: "center" },
  },
  {
    type: "spacer",
    label: "Spacer",
    icon: "↕️",
    category: "layout",
    defaultContent: { height: 48 },
    defaultStyles: {},
  },
  {
    type: "divider",
    label: "Divider",
    icon: "—",
    category: "layout",
    defaultContent: { style: "solid", width: "100%" },
    defaultStyles: { padding: "8px 48px" },
  },
  {
    type: "speakers",
    label: "Speakers",
    icon: "🎤",
    category: "event",
    defaultContent: { title: "Meet Our Speakers", layout: "grid" },
    defaultStyles: { padding: "48px 48px" },
  },
  {
    type: "schedule",
    label: "Schedule",
    icon: "📅",
    category: "event",
    defaultContent: { title: "Event Schedule" },
    defaultStyles: { padding: "48px 48px" },
  },
  {
    type: "sponsors",
    label: "Sponsors",
    icon: "🏢",
    category: "event",
    defaultContent: { title: "Our Sponsors" },
    defaultStyles: { padding: "48px 48px" },
  },
  {
    type: "cta",
    label: "Call to Action",
    icon: "🎯",
    category: "conversion",
    defaultContent: {
      headline: "Ready to Join?",
      subtext: "Don't miss out. Secure your spot today.",
      buttonText: "Register Now →",
    },
    defaultStyles: { padding: "64px 48px", textAlign: "center" },
  },
  {
    type: "faq",
    label: "FAQ",
    icon: "❓",
    category: "content",
    defaultContent: {
      title: "Frequently Asked Questions",
      items: [
        { question: "What is included?", answer: "Full access to all sessions, workshops, and networking events." },
        { question: "Is there parking?", answer: "Yes, complimentary parking is available at the venue." },
        { question: "Can I get a refund?", answer: "Refunds are available up to 7 days before the event." },
      ],
    },
    defaultStyles: { padding: "48px 48px" },
  },
  {
    type: "countdown",
    label: "Countdown",
    icon: "⏱️",
    category: "conversion",
    defaultContent: { label: "Event Starts In" },
    defaultStyles: { padding: "48px 48px", textAlign: "center" },
  },
  {
    type: "gallery",
    label: "Image Gallery",
    icon: "🖼️",
    category: "media",
    defaultContent: {
      title: "Gallery",
      images: [],
    },
    defaultStyles: { padding: "48px 48px" },
  },
  {
    type: "map",
    label: "Map / Location",
    icon: "📍",
    category: "layout",
    defaultContent: { title: "Event Location", address: "" },
    defaultStyles: { padding: "48px 48px" },
  },
];
