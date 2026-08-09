import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import basicSsl from "@vitejs/plugin-basic-ssl";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleLocalAiRequest } from "./scripts/local-ai-ranker.mjs";

// Opt-in HTTPS dev server for WebXR room scanning (the phone camera flow at
// /wizard/scan requires a secure context). Normal dev is unchanged:
//   BOWER_DEV_HTTPS=1 npm run dev     (Windows: set BOWER_DEV_HTTPS=1&& npm run dev)
// then open https://<this-machine's-LAN-IP>:8080/wizard/scan on the phone and
// accept the self-signed certificate warning once.
const devHttps = process.env.BOWER_DEV_HTTPS === "1";

function localAiDesignerPlugin(options: { apiKey?: string; model?: string }): Plugin {
  const endpoint = '/__bower/local-ai-designer';

  const install = (middlewares: {
    use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => void;
  }) => {
    middlewares.use(endpoint, async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }

      try {
        let body = '';
        let tooLarge = false;
        for await (const chunk of req) {
          body += chunk.toString('utf8');
          if (body.length > 64_000) {
            tooLarge = true;
            break;
          }
        }
        if (tooLarge) {
          res.statusCode = 413;
          res.end(JSON.stringify({ error: 'local_ai_request_too_large' }));
          return;
        }
        const result = await handleLocalAiRequest(JSON.parse(body || '{}'), options);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'local_ai_failed';
        console.error('[local-ai-designer]', message);
        res.statusCode = message.startsWith('invalid_') || message.includes('requires_') ? 400 : 502;
        res.end(JSON.stringify({ error: 'local_ai_failed', detail: message.slice(0, 300) }));
      }
    });
  };

  return {
    name: 'bower-local-ai-designer',
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Vite exposes only VITE_* values to browser code. OPENAI_* stays inside
  // this local server process and is never included in the browser bundle.
  const serverEnv = loadEnv(mode, process.cwd(), '');
  const localAiEnabled = ['true', '1', 'on', 'enabled']
    .includes((serverEnv.VITE_LOCAL_AI_DESIGNER ?? '').trim().toLowerCase());

  return ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    devHttps && basicSsl(),
    localAiEnabled && localAiDesignerPlugin({
      apiKey: serverEnv.OPENAI_API_KEY,
      model: serverEnv.OPENAI_MODEL,
    }),
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
  // three.js is an intentionally lazy, reusable 3D vendor chunk. Route
  // splitting keeps it off the initial homeowner step; its standalone size
  // should not make an otherwise healthy production build warn.
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        // The customer's browser protection blocks dynamically imported
        // application modules with ERR_BLOCKED_BY_CLIENT. Keep the production
        // app self-contained so trade, homeowner and admin routes remain
        // usable without weakening browser protections or requiring users to
        // disable an extension for this site.
        inlineDynamicImports: true,
      },
    },
  },
  });
});
