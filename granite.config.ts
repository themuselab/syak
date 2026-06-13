import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "shak",
  brand: {
    displayName: "샥",
    primaryColor: "#ec4899",
    icon: "https://static.toss.im/appsintoss/46845/60a9b1e3-1a7d-4cf8-b91c-1422ce90ccb6.png",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [{ name: "geolocation", access: "access" }],
  outdir: "dist",
});
