import "./src/env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const config = {
  // Pin tracing root to this project so the stray /Users/datkou lockfile
  // doesn't confuse the build (Netlify only sees this dir anyway).
  outputFileTracingRoot: __dirname,
};

export default config;
