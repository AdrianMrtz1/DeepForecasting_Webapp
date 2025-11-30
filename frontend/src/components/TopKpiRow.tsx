import { BadgeDelta, Card, Flex, Metric, Text } from "@tremor/react";

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
  const kpis: Kpi[] = [
    { label: "Data Rows", value: rowsLabel, hint: "Loaded records" },
    { label: "Horizon", value: horizonLabel, hint: "Forecast length" },
    { label: "Confidence", value: confidenceLabel, hint: "Bands" },
    { label: "Status", value: statusLabel, delta: bestMetric, trend: "unchanged" },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="bg-slate-900 border-slate-800 text-slate-50">
          <Flex justifyContent="between" alignItems="center">
            <div>
              <Text className="text-slate-300">{kpi.label}</Text>
              {kpi.hint ? <Text className="text-slate-500 text-xs">{kpi.hint}</Text> : null}
            </div>
            {kpi.delta ? (
              <BadgeDelta deltaType={kpi.trend ?? "unchanged"}>{kpi.delta}</BadgeDelta>
            ) : null}
          </Flex>
          <Metric className="text-slate-50">{kpi.value}</Metric>
        </Card>
      ))}
    </div>
  );
}
