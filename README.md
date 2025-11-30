# Deep Forecasting Web App

React + FastAPI implementation of the Nixtla project: upload a CSV, pick target/date columns, run econometric/ML/neural models, benchmark them with rolling backtests, and compare results in a single UI.

## Stack
- **Frontend:** Vite + React + Tailwind (lab-style layout, benchmark/backtest controls, config persistence)
- **Backend:** FastAPI with StatsForecast, MLForecast, NeuralForecast
- **Data contract:** single time-series with `ds` (timestamp) and `y` (numeric)

## Quickstart
1) **Backend**
   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\activate          # on Windows
   pip install -r requirements.txt
   # Python 3.13: install neuralforecast manually -> pip install --no-deps neuralforecast==3.1.2
   cp .env.example .env
   uvicorn app.main:app --reload --port 9000
   ```
   Docs: `http://localhost:9000/docs`, health: `/health`

2) **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev   # http://localhost:5173 (expects API at http://localhost:9000)
   ```
   Optional: set `VITE_API_BASE_URL` to point to a different backend.

## Features
- **Model breadth:** StatsForecast (AutoARIMA/AutoETS/Naive/etc.), MLForecast (LightGBM/XGBoost/CatBoost/RandomForest/Linear), NeuralForecast (MLP/RNN/LSTM/GRU)
- **Benchmarking:** `/forecast/batch` runs multiple configs at once and returns a leaderboard.
- **Rolling backtests:** `/backtest` performs multi-window evaluations (configurable windows/step) with aggregate metrics per model.
- **Preprocessing:** date-range filters, missing-value strategies (drop/ffill/bfill/interpolate), optional log transform, holdout splits.
- **Frequency handling:** automatic cadence detection on upload with override controls.
- **Config persistence:** `/configs` endpoints to save/reload named configurations (stored on disk).
- **Sample data:** `/datasets` + `/datasets/{id}` provide bundled series with recommended settings.

## Key Endpoints
- `POST /upload` — stream CSV upload, validate/remap columns, return preview + detected frequency.
- `POST /forecast` — single-model forecast with metrics/intervals and optional fitted values.
- `POST /forecast/batch` — run multiple configs on the same dataset; returns forecasts + leaderboard.
- `POST /backtest` — rolling windows backtest across configs; returns per-window + aggregate metrics.
- `GET /configs` / `POST /configs` — list/save reusable configurations.
- `GET /datasets`, `GET /datasets/{id}` — sample metadata and full records.

## Frontend UX Notes
- Sidebar status + theme toggle; central ribbon for upload, sample picker, configuration (module/model/strategy/frequency/test split/log transform, missing handling, date filters).
- Benchmark/backtest panel with predefined model set toggles, window controls, saved configs, and leaderboards.
- Forecast chart with confidence bands, fitted values, and test-set overlay; tables for horizon details and run history.

## Testing & Quality
- Backend: `pytest`, `ruff check .`, `black .`, `isort .` (see `backend/pyproject.toml`).
- Frontend: `npm run test` (Vitest), `npm run lint` (ESLint + Prettier).

## Deployment Tips
- Backend: run `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- Frontend: `npm run build` outputs to `frontend/dist/`; serve via any static host and set `VITE_API_BASE_URL` accordingly.

---

# DeepCast Workbench UI Refactor (shadcn + Tremor)

Production-grade frontend plan for the dark “Deep Navy” look, using shadcn/UI + Tailwind for controls, Tremor for KPIs/backtest cards, Recharts for the main chart, TanStack for data, Lucide for icons, Sonner for toasts, and Framer Motion for layout polish.

## package.json (key deps)
```json
{
  "dependencies": {
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-switch": "^1.0.0",
    "@radix-ui/react-slider": "^1.0.0",
    "@tremor/react": "^3.12.0",
    "@tanstack/react-query": "^5.36.0",
    "@tanstack/react-table": "^8.13.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.356.0",
    "recharts": "^2.8.0",
    "sonner": "^1.4.0",
    "tailwind-merge": "^2.2.0",
    "tailwindcss": "^3.4.0"
  }
}
```

## Tremor KPI row (Data Rows / Horizon / Confidence)
```tsx
// src/components/TopKpiRow.tsx
import { Card, Metric, Text, Flex, BadgeDelta } from "@tremor/react";

const kpis = [
  { label: "Data Rows", value: "124,581", delta: "2.1%", trend: "increase" },
  { label: "Horizon", value: "30 days" },
  { label: "Confidence", value: "95%", delta: "-0.4%", trend: "decrease" },
];

export function TopKpiRow() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="bg-slate-900 border-slate-800 text-slate-50">
          <Flex justifyContent="between" alignItems="center">
            <Text className="text-slate-300">{kpi.label}</Text>
            {kpi.delta && <BadgeDelta deltaType={kpi.trend ?? "unchanged"}>{kpi.delta}</BadgeDelta>}
          </Flex>
          <Metric className="text-slate-50">{kpi.value}</Metric>
        </Card>
      ))}
    </div>
  );
}
```

## Configuration sidebar (shadcn/UI primitives)
```tsx
// src/components/ConfigSidebar.tsx
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings2, Play } from "lucide-react";

export function ConfigSidebar({ onRun, disabled }: { onRun: () => void; disabled?: boolean }) {
  return (
    <aside className="w-full max-w-xs bg-slate-950/80 border-r border-slate-800 backdrop-blur-lg text-slate-100 flex flex-col gap-6 p-4">
      <header className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-slate-300" />
        <div>
          <p className="text-sm text-slate-400">Configuration</p>
          <p className="font-semibold text-slate-50">Model Controls</p>
        </div>
      </header>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Select defaultValue="tft">
            <SelectTrigger id="model" className="bg-slate-900 border-slate-800 text-slate-100">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
              <SelectItem value="tft">Temporal Fusion Transformer</SelectItem>
              <SelectItem value="nhits">N-HiTS</SelectItem>
              <SelectItem value="deepar">DeepAR</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Prediction Horizon</Label>
          <Slider defaultValue={[30]} max={90} min={7} step={1} />
          <div className="text-xs text-slate-400">30 days</div>
        </div>

        <div className="space-y-2">
          <Label>Confidence Interval</Label>
          <Slider defaultValue={[95]} max={99} min={50} step={1} />
          <div className="text-xs text-slate-400">95%</div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="exog">Use Exogenous Vars</Label>
            <p className="text-xs text-slate-400">Include weather, promos, etc.</p>
          </div>
          <Switch id="exog" defaultChecked />
        </div>

        <Separator className="bg-slate-800" />

        <Button
          disabled={disabled}
          onClick={onRun}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-60"
        >
          <Play className="h-4 w-4 mr-2" />
          Run Forecast
        </Button>
      </div>
    </aside>
  );
}
```

## Chart (Recharts) with zoom/pan and Tremor aesthetic
```tsx
// src/components/ForecastChart.tsx
import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export function ForecastChart({ data }: { data: { ts: string; y: number; yhat?: number; lower?: number; upper?: number }[] }) {
  const [domain, setDomain] = useState<[number, number] | undefined>();

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setDomain((prev) => {
      const curr = prev ?? [0, data.length - 1];
      const mid = (curr[0] + curr[1]) / 2;
      const width = (curr[1] - curr[0]) * factor;
      return [Math.max(0, mid - width / 2), Math.min(data.length - 1, mid + width / 2)];
    });
  };

  const handleDrag = (e: React.MouseEvent) => {
    if (!domain) return;
    if (e.buttons !== 1) return;
    const delta = e.movementX * 0.5;
    setDomain(([a, b]) => [Math.max(0, a - delta), Math.min(data.length - 1, b - delta)]);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-100" onWheel={handleWheel} onMouseMove={handleDrag}>
      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={data} syncId="forecast" margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="pred" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ts" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} width={60} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12 }}
            labelStyle={{ color: "#e2e8f0" }}
            itemStyle={{ color: "#cbd5e1" }}
          />
          <ReferenceLine x={data.length - 1} stroke="#f97316" strokeDasharray="4 4" />
          <Area type="monotone" dataKey="y" stroke="#cbd5e1" fill="url(#pred)" strokeWidth={2} />
          <Area type="monotone" dataKey="yhat" stroke="#38bdf8" fillOpacity={0} strokeWidth={2.5} />
          <Area type="monotone" dataKey="upper" stroke="#38bdf8" fillOpacity={0} strokeDasharray="4 4" />
          <Area type="monotone" dataKey="lower" stroke="#38bdf8" fillOpacity={0} strokeDasharray="4 4" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

## Data table + query hooks
- TanStack Table: sticky header + sort toggles:
```tsx
// src/components/ForecastTable.tsx
import { useReactTable, ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, SortingState } from "@tanstack/react-table";
import { useState } from "react";

export function ForecastTable({ data }: { data: { ts: string; actual: number; forecast: number; lower: number; upper: number }[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "ts", desc: false }]);
  const table = useReactTable({ data, columns: [
    { accessorKey: "ts", header: "Timestamp" },
    { accessorKey: "actual", header: "Actual" },
    { accessorKey: "forecast", header: "Forecast" },
    { accessorKey: "lower", header: "Lower" },
    { accessorKey: "upper", header: "Upper" },
  ], state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm text-slate-100">
          <thead className="sticky top-0 bg-slate-900 shadow-sm shadow-slate-900/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 text-left font-semibold cursor-pointer select-none" onClick={header.column.getToggleSortingHandler()}>
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="text-xs text-slate-400">
                        {header.column.getIsSorted() === "asc" ? "↑" : header.column.getIsSorted() === "desc" ? "↓" : ""}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-900">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 text-slate-200">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```
- TanStack Query + Sonner toast for `Run Forecast`:
```tsx
// src/hooks/useRunForecast.ts
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

async function runForecast(params: Record<string, unknown>) {
  const res = await fetch("/api/forecast", { method: "POST", body: JSON.stringify(params), headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error("Failed to run forecast");
  return res.json();
}

export function useRunForecast() {
  const mutation = useMutation({ mutationFn: runForecast, onSuccess: () => toast.success("Forecast complete!"), onError: (e) => toast.error(e.message) });
  return { run: mutation.mutate, isPending: mutation.isPending };
}
```

## Motion for collapsing sidebar
- Wrap layout columns with Framer Motion to spring-expand the chart when the sidebar closes:
```tsx
// src/layout/MainShell.tsx
import { motion } from "framer-motion";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function MainShell({ sidebar, content }: { sidebar: React.ReactNode; content: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <motion.aside layout transition={{ type: "spring", stiffness: 260, damping: 26 }} className={`${open ? "w-80" : "w-14"} overflow-hidden border-r border-slate-800 bg-slate-950/80`}>
        <button onClick={() => setOpen((o) => !o)} className="p-2 text-slate-300 hover:text-slate-50">
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </button>
        {open && sidebar}
      </motion.aside>
      <motion.main layout transition={{ type: "spring", stiffness: 260, damping: 26 }} className="flex-1 p-4 overflow-auto">
        {content}
      </motion.main>
    </div>
  );
}
```

## Tailwind theming for “Deep Navy”
```js
// tailwind.config.js
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        navy: { 950: "#0a1024", 900: "#0f172a", 800: "#1e293b" },
        accent: { emerald: "#22d3a6", sky: "#38bdf8", amber: "#f59e0b" },
      },
      borderRadius: { xl: "0.9rem" },
    },
  },
  plugins: [],
};
```
- Set the shell to `className="bg-navy-900 text-slate-100"` and default to `class="dark"` on `<body>`.
- Use `bg-slate-950/80` + `border-slate-800` for panels; keep CTAs in `accent.emerald`/`accent.sky`.
