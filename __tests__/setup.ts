import "@testing-library/jest-dom";
import { server } from "./mocks/server";
import { beforeAll, afterEach, afterAll } from "vitest";

// MSW runs in both node (for Stripe/Prodigi/tax mocks) and jsdom (for component tests).
// Neon WebSocket connections are not intercepted by MSW — they pass through with a warning.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
