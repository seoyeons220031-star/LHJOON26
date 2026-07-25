// Per-room chat themes. Each theme overrides CSS variables scoped to the
// chat container so the palette applies only inside that room and syncs in
// realtime via `conversations.theme_slug`.

export type ChatThemeSlug =
  "default" | "sf-fog" | "midnight-paris" | "morocco-desert" | "finland-ice" | "lake-tahoe";

export type ChatTheme = {
  slug: ChatThemeSlug;
  label: string;
  swatch: string;
  // Bubble/background hexes so components can force-bind Tailwind classes.
  bg: string;
  outBg: string;
  outFg: string;
  inBg: string;
  inFg: string;
  vars: Record<string, string>;
};

export const CHAT_THEMES: ChatTheme[] = [
  {
    slug: "default",
    label: "LJ 민트",
    swatch: "#00BFA5",
    bg: "#F4FBF9",
    outBg: "#00BFA5",
    outFg: "#FFFFFF",
    inBg: "#E0F2F1",
    inFg: "#004D40",
    vars: {
      "--background": "#F4FBF9",
      "--foreground": "#0F2A26",
      "--secondary": "#E6F4F1",
      "--muted": "#E6F4F1",
      "--muted-foreground": "#5C7A73",
      "--border": "#D6EAE5",
      "--input": "#D6EAE5",
      "--primary": "#00BFA5",
      "--primary-foreground": "#FFFFFF",
      "--ring": "#00BFA5",
      "--bubble-out": "#00BFA5",
      "--bubble-out-foreground": "#FFFFFF",
      "--bubble-in": "#E0F2F1",
      "--bubble-in-foreground": "#004D40",
    },
  },
  {
    slug: "sf-fog",
    label: "SF 포그",
    swatch: "#1E293B",
    bg: "#F0F4F8",
    outBg: "#1E293B",
    outFg: "#FFFFFF",
    inBg: "#FFFFFF",
    inFg: "#334155",
    vars: {
      "--background": "#F0F4F8",
      "--foreground": "#1E293B",
      "--secondary": "#E2E8F0",
      "--muted": "#E2E8F0",
      "--muted-foreground": "#64748B",
      "--border": "#E2E8F0",
      "--input": "#E2E8F0",
      "--primary": "#1E293B",
      "--primary-foreground": "#FFFFFF",
      "--ring": "#1E293B",
      "--bubble-out": "#1E293B",
      "--bubble-out-foreground": "#FFFFFF",
      "--bubble-in": "#FFFFFF",
      "--bubble-in-foreground": "#334155",
    },
  },
  {
    slug: "midnight-paris",
    label: "미드나잇 파리",
    swatch: "#DFBA73",
    bg: "#2D0B16",
    outBg: "#DFBA73",
    outFg: "#2D0B16",
    inBg: "#3D1D28",
    inFg: "#F3E8EE",
    vars: {
      "--background": "#2D0B16",
      "--foreground": "#F3E8EE",
      "--card": "#3D1D28",
      "--card-foreground": "#F3E8EE",
      "--popover": "#3D1D28",
      "--popover-foreground": "#F3E8EE",
      "--secondary": "#3D1D28",
      "--secondary-foreground": "#F3E8EE",
      "--muted": "#3D1D28",
      "--muted-foreground": "#C9A9B3",
      "--accent": "#3D1D28",
      "--accent-foreground": "#F3E8EE",
      "--border": "#4A2532",
      "--input": "#4A2532",
      "--primary": "#DFBA73",
      "--primary-foreground": "#2D0B16",
      "--ring": "#DFBA73",
      "--bubble-out": "#DFBA73",
      "--bubble-out-foreground": "#2D0B16",
      "--bubble-in": "#3D1D28",
      "--bubble-in-foreground": "#F3E8EE",
    },
  },
  {
    slug: "morocco-desert",
    label: "모로코 사막",
    swatch: "#C85A32",
    bg: "#F7F0EA",
    outBg: "#C85A32",
    outFg: "#FFFFFF",
    inBg: "#FFFFFF",
    inFg: "#4A3728",
    vars: {
      "--background": "#F7F0EA",
      "--foreground": "#4A3728",
      "--secondary": "#EDE1D4",
      "--muted": "#EDE1D4",
      "--muted-foreground": "#8B7355",
      "--border": "#E4D3C0",
      "--input": "#E4D3C0",
      "--primary": "#C85A32",
      "--primary-foreground": "#FFFFFF",
      "--ring": "#C85A32",
      "--bubble-out": "#C85A32",
      "--bubble-out-foreground": "#FFFFFF",
      "--bubble-in": "#FFFFFF",
      "--bubble-in-foreground": "#4A3728",
    },
  },
  {
    slug: "finland-ice",
    label: "핀란드 아이스",
    swatch: "#0284C7",
    bg: "#F1F9FC",
    outBg: "#0284C7",
    outFg: "#FFFFFF",
    inBg: "rgba(255,255,255,0.7)",
    inFg: "#0F172A",
    vars: {
      "--background": "#F1F9FC",
      "--foreground": "#0F172A",
      "--secondary": "#E0F2FE",
      "--muted": "#E0F2FE",
      "--muted-foreground": "#475569",
      "--border": "#CFE8F5",
      "--input": "#CFE8F5",
      "--primary": "#0284C7",
      "--primary-foreground": "#FFFFFF",
      "--ring": "#0284C7",
      "--bubble-out": "#0284C7",
      "--bubble-out-foreground": "#FFFFFF",
      "--bubble-in": "rgba(255,255,255,0.7)",
      "--bubble-in-foreground": "#0F172A",
    },
  },
  {
    slug: "lake-tahoe",
    label: "레이크 타호",
    swatch: "#475569",
    bg: "#0E2A30",
    outBg: "#475569",
    outFg: "#FFFFFF",
    inBg: "#1E3A40",
    inFg: "#CCFBF1",
    vars: {
      "--background": "#0E2A30",
      "--foreground": "#CCFBF1",
      "--card": "#153338",
      "--card-foreground": "#CCFBF1",
      "--popover": "#153338",
      "--popover-foreground": "#CCFBF1",
      "--secondary": "#1E3A40",
      "--secondary-foreground": "#CCFBF1",
      "--muted": "#1E3A40",
      "--muted-foreground": "#7FB3AE",
      "--accent": "#1E3A40",
      "--accent-foreground": "#CCFBF1",
      "--border": "#264449",
      "--input": "#264449",
      "--primary": "#475569",
      "--primary-foreground": "#FFFFFF",
      "--ring": "#475569",
      "--bubble-out": "#475569",
      "--bubble-out-foreground": "#FFFFFF",
      "--bubble-in": "#1E3A40",
      "--bubble-in-foreground": "#CCFBF1",
    },
  },
];

// Legacy slug aliases so rooms saved with older theme names still resolve.
const ALIASES: Record<string, ChatThemeSlug> = {
  mint: "default",
  imessage: "finland-ice",
  sunset: "morocco-desert",
  midnight: "midnight-paris",
  peach: "morocco-desert",
  lavender: "midnight-paris",
};

export function getChatTheme(slug: string | null | undefined): ChatTheme {
  const key = (slug && ALIASES[slug]) || (slug as ChatThemeSlug);
  return CHAT_THEMES.find((t) => t.slug === key) ?? CHAT_THEMES[0];
}
