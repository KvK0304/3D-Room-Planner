import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// "./" keeps asset paths relative so the build works on GitHub Pages
// project sites (username.github.io/<repo>/) without extra configuration.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
