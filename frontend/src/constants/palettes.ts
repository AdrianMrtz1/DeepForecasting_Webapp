export type ThemePalette = {
  id: string;
  name: string;
  description: string;
  accent: string;
  secondary: string;
  tertiary: string;
  background: [string, string, string];
  glow: [string, string, string];
  grid: string;
  panel: string;
};

export const THEME_PALETTES: ThemePalette[] = [
  {
    id: "aurora",
    name: "Aurora Mint",
    description: "Teal glass with sky gradients and soft gold accents.",
    accent: "#30E0A1",
    secondary: "#5CC9FF",
    tertiary: "#F6D365",
    background: ["#050b15", "#0a1628", "#0c2540"],
    glow: ["rgba(92,201,255,0.18)", "rgba(48,224,161,0.18)", "rgba(246,211,101,0.16)"],
    grid: "rgba(148, 199, 255, 0.18)",
    panel: "rgba(255,255,255,0.06)",
  },
  {
    id: "citrus",
    name: "Citrus Copper",
    description: "Warm copper energy with citrus and mint highlights.",
    accent: "#FF9153",
    secondary: "#FFD166",
    tertiary: "#7AE2AF",
    background: ["#0a0c14", "#131927", "#1b2736"],
    glow: ["rgba(255,145,83,0.18)", "rgba(255,210,102,0.16)", "rgba(122,226,175,0.14)"],
    grid: "rgba(255, 255, 255, 0.14)",
    panel: "rgba(17, 24, 39, 0.65)",
  },
  {
    id: "lagoon",
    name: "Lagoon",
    description: "Blue lagoon with mint edges and sunlit trims.",
    accent: "#5CD6FF",
    secondary: "#8BF5C1",
    tertiary: "#F2C94C",
    background: ["#050912", "#0a1526", "#0c2336"],
    glow: ["rgba(92,214,255,0.2)", "rgba(139,245,193,0.18)", "rgba(242,201,76,0.14)"],
    grid: "rgba(140, 212, 255, 0.18)",
    panel: "rgba(8, 18, 32, 0.7)",
  },
  {
    id: "storm",
    name: "Storm Glow",
    description: "Gunmetal base with neon mint and amber edges.",
    accent: "#6FFFE9",
    secondary: "#7CC0FF",
    tertiary: "#F5A524",
    background: ["#06080f", "#0d1322", "#101e2f"],
    glow: ["rgba(111,255,233,0.16)", "rgba(124,192,255,0.16)", "rgba(245,165,36,0.16)"],
    grid: "rgba(124, 192, 255, 0.18)",
    panel: "rgba(12, 18, 30, 0.72)",
  },
];

export const DEFAULT_PALETTE = THEME_PALETTES[0];
