const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appName = "InfiniMind";
const bundleId = "app.infinimind.desktop";
const sourceApp = path.join(root, "node_modules", "electron", "dist", "Electron.app");
const targetDir = path.join(root, ".desktop");
const targetApp = path.join(targetDir, `${appName}.app`);
const legacyExecutable = path.join(targetApp, "Contents", "MacOS", "Electron");
const targetExecutable = path.join(targetApp, "Contents", "MacOS", appName);
const targetPlist = path.join(targetApp, "Contents", "Info.plist");
const sourceVersion = path.join(root, "node_modules", "electron", "dist", "version");
const targetVersion = path.join(targetDir, "electron-version");
const iconSource = path.join(root, "assets", "icon.icns");
const iconTarget = path.join(targetApp, "Contents", "Resources", `${appName}.icns`);

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function run(command, args) {
  execFileSync(command, args, { stdio: "ignore" });
}

function replacePlistValue(key, value) {
  run("plutil", ["-replace", key, "-string", value, targetPlist]);
}

function prepareMacApp() {
  if (!fs.existsSync(sourceApp)) {
    throw new Error(`Electron.app was not found at ${sourceApp}. Run npm install first.`);
  }

  const electronVersion = readIfExists(sourceVersion);
  const bundleStamp = `mac-dev-bundle-v2:${electronVersion}`;
  const needsFreshCopy = !fs.existsSync(targetApp) || readIfExists(targetVersion) !== bundleStamp;

  fs.mkdirSync(targetDir, { recursive: true });

  if (needsFreshCopy) {
    fs.rmSync(targetApp, { recursive: true, force: true });
    run("ditto", [sourceApp, targetApp]);
    fs.writeFileSync(targetVersion, `${bundleStamp}\n`);
  }

  if (fs.existsSync(legacyExecutable) && !fs.existsSync(targetExecutable)) {
    fs.renameSync(legacyExecutable, targetExecutable);
  }

  replacePlistValue("CFBundleDisplayName", appName);
  replacePlistValue("CFBundleExecutable", appName);
  replacePlistValue("CFBundleName", appName);
  replacePlistValue("CFBundleIdentifier", bundleId);
  replacePlistValue("CFBundleIconFile", appName);

  if (fs.existsSync(iconSource)) {
    fs.copyFileSync(iconSource, iconTarget);
  }

  try {
    run("codesign", ["--force", "--deep", "--sign", "-", targetApp]);
  } catch {
    // The app is still usable for local development on most machines; signing is best effort.
  }
}

if (process.platform !== "darwin") {
  const electronBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
  const child = spawn(electronBin, [root], { stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    }
    process.exit(code ?? 0);
  });
} else {
  prepareMacApp();

  if (process.argv.includes("--prepare-only")) {
    process.exit(0);
  }

  const child = spawn(targetExecutable, [root], {
    cwd: root,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    }
    process.exit(code ?? 0);
  });
}
