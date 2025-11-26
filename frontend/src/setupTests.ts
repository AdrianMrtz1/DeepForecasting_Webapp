import "@testing-library/jest-dom";

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Provide minimal polyfills for jsdom rendering.
const globalWithResize = window as typeof window & { ResizeObserver?: typeof ResizeObserver };
globalWithResize.ResizeObserver = globalWithResize.ResizeObserver || ResizeObserver;

const originalError = console.error;
console.error = (...args: unknown[]) => {
  const message = args[0];
  if (
    typeof message === "string" &&
    message.includes("The width(") &&
    message.includes("height(")
  ) {
    return;
  }
  originalError(...args);
};

const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const message = args[0];
  if (
    typeof message === "string" &&
    message.includes("The width(") &&
    message.includes("height(")
  ) {
    return;
  }
  originalWarn(...args);
};
