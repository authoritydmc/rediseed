import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  target: "es2022",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
