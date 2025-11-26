import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

vi.mock("axios");
const mockedPost = vi.mocked(axios.post);
const mockedGet = vi.mocked(axios.get);

describe("Deep Forecasting frontend", () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedGet.mockReset();
    mockedGet.mockResolvedValue({ data: { datasets: [] } });
  });

  it("uploads a CSV and runs a forecast", async () => {
    mockedPost.mockImplementation((url: string) => {
      if (url.includes("/upload")) {
        return Promise.resolve({
          data: {
            upload_id: "mock-upload",
            preview: [
              { ds: "2024-01-01", y: 10 },
              { ds: "2024-01-02", y: 12 },
            ],
            rows: 20,
          },
        });
      }
      if (url.includes("/forecast")) {
        return Promise.resolve({
          data: {
            timestamps: ["2024-02-01", "2024-02-02"],
            forecast: [5.5, 6.1],
            bounds: [
              {
                level: 90,
                lower: [4.8, 5.2],
                upper: [6.1, 6.8],
              },
            ],
            metrics: { mae: 0.12, rmse: 0.22, mape: 2.1 },
            config: {
              module_type: "StatsForecast",
              model_type: "auto_arima",
              strategy: "multi_step_recursive",
              freq: "D",
              season_length: 7,
              horizon: 12,
              level: [90],
              log_transform: false,
              test_size_fraction: 0.2,
            },
          },
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<App />);

    const file = new File(["ds,y\n2024-01-01,1\n2024-01-02,2"], "data.csv", {
      type: "text/csv",
    });
    const input = screen.getByLabelText(/upload csv file/i);

    await waitFor(() => fireEvent.change(input, { target: { files: [file] } }));

    const uploadButton = await screen.findByRole("button", { name: /validate & upload/i });
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        expect.stringContaining("/upload"),
        expect.any(FormData),
        expect.any(Object),
      );
    });

    const runButton = screen.getByRole("button", { name: /run forecast/i });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        expect.stringContaining("/forecast"),
        expect.any(Object),
      );
    });

    expect(await screen.findByText(/horizon details/i)).toBeInTheDocument();
    expect(await screen.findByText(/Using AUTO_ARIMA/i)).toBeInTheDocument();
  });
});
