import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// One shared lock manager for simulated tabs (module instances).
let cookieQueue: Promise<unknown> = Promise.resolve();
Object.defineProperty(navigator, 'locks', {configurable: true, value: {
  request: (_name: string, operation: () => Promise<unknown>) => {
    const result = cookieQueue.then(operation, operation);
    cookieQueue = result.catch(() => undefined);
    return result;
  },
}});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
