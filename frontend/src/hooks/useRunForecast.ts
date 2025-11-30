import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ForecastConfigState } from "../types";

type RunFn = (override?: Partial<ForecastConfigState>) => Promise<void>;

export function useRunForecast(runForecast: RunFn) {
  const mutation = useMutation({
    mutationFn: (override?: Partial<ForecastConfigState>) => runForecast(override),
    onSuccess: () => toast.success("Forecast complete!"),
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to run forecast";
      toast.error(message);
    },
  });

  return {
    run: mutation.mutate,
    isPending: mutation.isPending,
  };
}
