import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const fixtures = ["react-vite-tailwind", "react-plain", "monorepo", "astro-tailwind"];

export default function setup() {
  for (const name of fixtures) {
    const dir = join(root, "tests/fixtures", name);
    if (!existsSync(join(dir, "node_modules"))) {
      execFileSync("pnpm", ["install", "--ignore-workspace"], { cwd: dir, stdio: "inherit" });
    }
  }
  // CLI tests run the built binary.
  execFileSync("vp", ["pack"], { cwd: root, stdio: "ignore" });
}
