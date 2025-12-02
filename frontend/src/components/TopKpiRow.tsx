import { BadgeDelta, Card, Metric, Text } from "@tremor/react";

type Kpi = {
  label: string;
  value: string;
  delta?: string;
  trend?: "increase" | "decrease" | "unchanged";
  hint?: string;
};

interface Props {
  rowsLabel: string;
  horizonLabel: string;
  confidenceLabel: string;
  statusLabel: string;
  bestMetric?: string;
}

export function TopKpiRow({
  rowsLabel,
  horizonLabel,
  confidenceLabel,
  statusLabel,
  bestMetric,
}: Props) {
  const formatHorizon = (value: string) => value.replace(/^h/i, "");

  const kpis: Kpi[] = [
    { label: "Data Rows", value: rowsLabel, hint: "Loaded records" },
    { label: "Horizon", value: horizonLabel, hint: "Forecast length" },
    { label: "Confidence", value: confidenceLabel, hint: "Bands" },
    { label: "Status", value: statusLabel, delta: bestMetric, trend: "unchanged" },
  ];

  return (
    <div className="dashboard-top-row grid w-full grid-cols-1 divide-y divide-[#d1cec4] border-y border-[#d1cec4] md:grid-cols-4 md:divide-y-0 md:divide-x">
      {kpis.map((kpi) => {
        const isStatus = kpi.label === "Status";
        const displayValue = kpi.label === "Horizon" ? formatHorizon(kpi.value) : kpi.value;
        return (
          <Card
            key={kpi.label}
            className="dashboard-kpi-card box-border flex h-full flex-1 rounded-none border-0 bg-[var(--kaito-surface)] p-0 text-[var(--kaito-ink)] shadow-none"
          >
            {isStatus ? (
              <div className="kaito-status-kpi h-full px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <Text className="text-[12px] uppercase tracking-[0.04em] text-[#5f594f]">
                      {kpi.label}
                    </Text>
                    {kpi.hint ? (
                      <Text className="text-xs text-[#6a6459]">{kpi.hint}</Text>
                    ) : null}
                  </div>
                </div>
                <div className="kaito-status-body">
                  <Metric className="text-base font-semibold text-[#1a1a19]">
                    {kpi.delta ?? displayValue}
                  </Metric>
                  <Text className="text-xs text-[#6a6459]">{kpi.value}</Text>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col gap-3 px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <Text className="text-[12px] uppercase tracking-[0.04em] text-[#5f594f]">
                      {kpi.label}
                    </Text>
                    {kpi.hint ? (
                      <Text className="text-xs text-[#6a6459]">{kpi.hint}</Text>
                    ) : null}
                  </div>
                  {kpi.delta ? (
                    <BadgeDelta className="ml-auto shrink-0" deltaType={kpi.trend ?? "unchanged"}>
                      {kpi.delta}
                    </BadgeDelta>
                  ) : null}
                </div>
                <Metric className="shrink-0 text-base font-semibold text-[#1a1a19]">
                  {displayValue}
                </Metric>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
