import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Opt-in HTTPS dev server for WebXR room scanning (the phone camera flow at
// /wizard/scan requires a secure context). Normal dev is unchanged:
//   BOWER_DEV_HTTPS=1 npm run dev     (Windows: set BOWER_DEV_HTTPS=1&& npm run dev)
// then open https://<this-machine's-LAN-IP>:8080/wizard/scan on the phone and
// accept the self-signed certificate warning once.
const devHttps = process.env.BOWER_DEV_HTTPS === "1";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    devHttps && basicSsl(),
  ].filter(Boolean),
  // Force dev mode for esbuild dep optimizer so React's CJS conditionals
  // (process.env.NODE_ENV === 'production') resolve to false and the
  // development builds (with jsxDEV, warnings etc.) are used.
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // All drei-importing pages are React.lazy() in App.tsx and NOT in
    // the trade barrel (index.ts), so drei is never in the eager startup chain.
    // drei + three + fiber are pre-bundled here so raw ESM CJS-compat issues
    // don't occur when lazy pages first load them.
    include: ["three", "@react-three/fiber", "@react-three/drei"],
    esbuildOptions: {
      // The dep optimizer runs its own esbuild instance that does NOT
      // automatically inherit the top-level `define`. Without this, esbuild
      // evaluates process.env.NODE_ENV as 'production' and the React CJS
      // conditionals select the production builds (jsxDEV = void 0).
      define: {
        "process.env.NODE_ENV": JSON.stringify(mode),
      },
    },
  },
}));
