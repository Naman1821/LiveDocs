/**
 * Runs a command with the package root as cwd (and as this process cwd before spawn),
 * so tools that use process.cwd() (e.g. Tailwind PostCSS) see the correct directory.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

process.chdir(projectRoot);

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("usage: node scripts/with-project-root.mjs <command> [args...]");
  process.exit(1);
}

let command = args[0];
const rest = args.slice(1);

if (!path.isAbsolute(command) && !command.includes(path.sep)) {
  const unixBin = path.join(projectRoot, "node_modules", ".bin", command);
  const winBin = path.join(projectRoot, "node_modules", ".bin", `${command}.cmd`);
  if (process.platform === "win32" && fs.existsSync(winBin)) {
    command = winBin;
  } else if (fs.existsSync(unixBin)) {
    command = unixBin;
  }
}

const env = {
  ...process.env,
  PWD: projectRoot,
  INIT_CWD: projectRoot,
};

/** Next.js 16+ mounts dev tools in a closed shadow root — CSS cannot hide the “N”. Official knob: `.next/cache/next-devtools-config.json`. */
function ensureNextDevToolsIndicatorDisabled() {
  const cmdBase = path.basename(command).replace(/\.cmd$/i, "");
  if (cmdBase !== "next" || rest[0] !== "dev") return;
  const cacheDir = path.join(projectRoot, ".next", "cache");
  const configPath = path.join(cacheDir, "next-devtools-config.json");
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    let data = {};
    if (fs.existsSync(configPath)) {
      try {
        data = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
      } catch {
        data = {};
      }
    }
    data.disableDevIndicator = true;
    fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
  } catch {
    /* ignore disk errors */
  }
}

ensureNextDevToolsIndicatorDisabled();

const result = spawnSync(command, rest, {
  cwd: projectRoot,
  stdio: "inherit",
  env,
});

process.exit(result.status === null ? 1 : result.status);
