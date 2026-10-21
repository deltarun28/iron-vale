import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Hosted under a subpath on GitHub Pages (deltarun28.github.io/iron-vale/),
  // so all built asset URLs must be prefixed with this base. Without it the
  // app would request /assets/... from the domain root and 404.
  base: "/iron-vale/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        id: "/iron-vale/",
        name: "Iron Vale",
        short_name: "Iron Vale",
        description: "Real-time territory strategy — privacy-first, offline-first.",
        start_url: "/iron-vale/",
        scope: "/iron-vale/",
        // "fullscreen" is correct for a game: removes the Chrome URL bar and
        // requests true fullscreen when launched from the home screen on Android.
        display: "fullscreen",
        display_override: ["fullscreen", "standalone", "minimal-ui"],
        orientation: "any",
        background_color: "#efe4c8",
        theme_color: "#3d2b1b",
        categories: ["games"],
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        // Everything the game draws or plays is precached, so a phone with no
        // network can start a match on any map and hear every sound. That includes
        // the map art (about 3.5 MB each), which the earlier pattern left out.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,mp3,ogg,wav}"],
        // Workbox skips files over 2 MB by default, and the largest map is about 4 MB.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: ["bryn-thinkpad-t490.tail33cc1.ts.net"],
  },
});
