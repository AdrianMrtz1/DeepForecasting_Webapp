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
      className="glass-panel relative overflow-hidden px-5 py-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-white/0" />
      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-slate-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-sky-100">
            <Paintbrush2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Look & feel</p>
            <p className="text-lg font-semibold text-white">Color + ambience</p>
          </div>
        </div>
        <span className="pill border border-white/10 bg-white/5 text-[11px] font-semibold text-emerald-100">
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
              className={`group relative overflow-hidden rounded-xl border p-[1px] text-left transition ${
                active
                  ? "border-emerald-200/70 shadow-[0_18px_50px_-28px_rgba(74,222,128,0.7)]"
                  : "border-white/10"
              }`}
              style={{
                background: `linear-gradient(135deg, ${palette.secondary}, ${palette.accent})`,
              }}
            >
              <div className="relative h-full rounded-[12px] bg-slate-950/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{palette.name}</p>
                    <p className="text-xs text-slate-200">{palette.description}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-100">
                    <Wand2 className="h-3.5 w-3.5" />
                    {active ? "Active" : "Preview"}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-100">
                  {[palette.secondary, palette.accent, palette.tertiary].map((color) => (
                    <span
                      key={color}
                      className="h-6 flex-1 rounded-lg shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
                      style={{ background: color }}
                    />
                  ))}
                  <Droplets className="h-4 w-4 text-white/70" />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-[280px,1fr]">
        <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3 text-slate-100">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Accent color</span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
              Fine tune
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-2">
            <div className="flex items-center gap-2">
              <span
                className="h-8 w-8 rounded-md border border-white/10 shadow-inner"
                style={{ background: accent }}
              />
              <input
                className="w-28 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-white focus:border-emerald-200 focus:outline-none"
                value={hexInput}
                onChange={(e) => handleHexInput(e.target.value)}
                spellCheck={false}
              />
            </div>
            <span className="text-[11px] text-slate-300">Pick or type any hex</span>
          </div>
          <div className="mt-3 text-xs text-slate-400">
            Accent feeds the gradients, button fills, and chart emphasis. Use the palettes above for
            quick moods, then fine tune here.
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3">
          <HexColorPicker color={accent} onChange={onAccentChange} className="w-full" />
        </div>
      </div>
    </motion.div>
  );
};
