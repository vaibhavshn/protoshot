// Mirrors a real Astro config: Tailwind lives in `vite.plugins`, and there is no vite.config.
import tailwindcss from "@tailwindcss/vite";

export default {
  vite: {
    plugins: [tailwindcss()],
  },
};
