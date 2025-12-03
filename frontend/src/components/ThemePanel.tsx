import { useEffect, useState } from "react";

import { motion } from "framer-motion";
import { Droplets, Paintbrush2, Wand2 } from "lucide-react";
import { HexColorPicker } from "react-colorful";

import type { ThemePalette } from "../constants/palettes";

interface ThemePanelProps {
  palettes: ThemePalette[];
  activeId: string;
  accent: string;
  onPaletteChange: (id: string) => void;
  onAccentChange: (color: string) => void;
}

export const ThemePanel = ({
  palettes,
  activeId,
  accent,
  onPaletteChange,
  onAccentChange,
}: ThemePanelProps) => {
  const [hexInput, setHexInput] = useState(accent);

  useEffect(() => {
    setHexInput(accent);
  }, [accent]);

  const handleHexInput = (value: string) => {
    const normalized = value.startsWith("#") ? value : `#${value}`;
    if (/^#([0-9a-fA-F]{0,6})$/.test(normalized)) {
      setHexInput(normalized);
      if (normalized.length === 7) {
        onAccentChange(normalized);
      }
    }
  };

  return (
    <motion.div
      className="panel relative overflow-hidden px-5 py-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='2' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.45'/></svg>\")",
          backgroundSize: "240px 240px",
        }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-[var(--kaito-ink)]">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--kaito-border)] bg-[var(--kaito-subtle)] text-[var(--kaito-ink)] shadow-sm">
            <Paintbrush2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.04em] text-[var(--kaito-muted)]">Look & feel</p>
            <p className="text-lg font-semibold text-[var(--kaito-ink)]">Color + ambience</p>
          </div>
        </div>
        <span className="pill border border-[var(--kaito-border)] bg-[var(--kaito-surface)] text-[11px] font-semibold text-[var(--kaito-muted)]">
          Live theming
        </span>
      </div>

      <div className="relative mt-4 grid gap-3 md:grid-cols-2">
        {palettes.map((palette) => {
          const active = palette.id === activeId;
          return (
            <motion.button
              key={palette.id}
              type="button"
              onClick={() => onPaletteChange(palette.id)}
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
              className={`group relative overflow-hidden rounded-xl border p-[1px] text-left transition ${
                active
                  ? "border-[var(--kaito-accent)] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.18)]"
                  : "border-[var(--kaito-border)]"
              }`}
              style={{
                background: `linear-gradient(135deg, ${palette.secondary}, ${palette.accent})`,
              }}
            >
              <div className="relative h-full rounded-[12px] bg-[var(--kaito-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--kaito-ink)]">{palette.name}</p>
                    <p className="text-xs text-[var(--kaito-muted)]">{palette.description}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-[var(--kaito-subtle)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-muted)]">
                    <Wand2 className="h-3.5 w-3.5" />
                    {active ? "Active" : "Preview"}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--kaito-muted)]">
                  {[palette.secondary, palette.accent, palette.tertiary].map((color) => (
                    <span
                      key={color}
                      className="h-6 flex-1 rounded-lg shadow-[0_0_0_1px_rgba(0,0,0,0.1)]"
                      style={{ background: color }}
                    />
                  ))}
                  <Droplets className="h-4 w-4 text-[var(--kaito-muted)]" />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-[280px,1fr]">
        <div className="rounded-xl border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-3 text-[var(--kaito-ink)] shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Accent color</span>
            <span className="text-[11px] uppercase tracking-[0.04em] text-[var(--kaito-muted)]">
              Fine tune
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-[var(--kaito-subtle)] px-2 py-2">
            <div className="flex items-center gap-2">
              <span
                className="h-8 w-8 rounded-md border border-[var(--kaito-border)] shadow-inner"
                style={{ background: accent }}
              />
              <input
                className="w-28 rounded-lg border border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-2 py-1 text-sm text-[var(--kaito-ink)] focus:border-[var(--kaito-border)] focus:outline-none"
                value={hexInput}
                onChange={(e) => handleHexInput(e.target.value)}
                spellCheck={false}
              />
            </div>
            <span className="text-[11px] text-[var(--kaito-muted)]">Pick or type any hex</span>
          </div>
          <div className="mt-3 text-xs text-[var(--kaito-muted)]">
            Accent feeds the gradients, button fills, and chart emphasis. Use the palettes above for
            quick moods, then fine tune here.
          </div>
        </div>

        <div className="rounded-xl border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-3 shadow-sm">
          <HexColorPicker color={accent} onChange={onAccentChange} className="w-full" />
        </div>
      </div>
    </motion.div>
  );
};
