import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const version = process.argv[2];

if (!version) {
  console.error("Missing version");
  process.exit(1);
}

console.log(`Preparing release ${version}`);

// 1. Update npm versions
execSync(`npm version ${version} --no-git-tag-version`, {
  stdio: "inherit"
});
console.log(`Updated package.json and package-lock.json -> ${version}`);

// 2. Update Cargo.toml
const cargoToml = "src-tauri/Cargo.toml";
let cargoContent = fs.readFileSync(cargoToml, "utf8");

cargoContent = cargoContent.replace(
  /^version\s*=\s*".*"/m,
  `version = "${version}"`
);

fs.writeFileSync(cargoToml, cargoContent);
console.log(`Updated ${cargoToml} -> ${version}`);

// 3. Update Cargo.lock

execSync("cargo update --workspace", { cwd: "src-tauri", stdio: "inherit" });

console.log(`Updated Cargo.lock -> ${version}`);

// 4. Update tauri.conf.json
const tauriConfigPath = "src-tauri/tauri.conf.json";
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath));

tauriConfig.version = version;

// WiX/MSI requires a numeric-only version (`major.minor.patch[.build]`) and
// rejects human-readable pre-releases like `-harrier.6-beta`, so the build
// number from the pre-release is mapped to the fourth field:
// `4.12.6-harrier.6-beta` -> `4.12.6.6`.
const semverMatch = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
if (!semverMatch) {
  console.error(`Cannot derive a numeric MSI version from "${version}"`);
  process.exit(1);
}
const [, major, minor, patch, pre = ""] = semverMatch;
const buildMatch = pre.match(/(\d+)(?!.*\d)/);
const wixVersion = buildMatch
  ? `${major}.${minor}.${patch}.${buildMatch[1]}`
  : `${major}.${minor}.${patch}`;

tauriConfig.bundle ??= {};
tauriConfig.bundle.windows ??= {};
tauriConfig.bundle.windows.wix ??= {};
tauriConfig.bundle.windows.wix.version = wixVersion;

fs.writeFileSync(
  tauriConfigPath,
  JSON.stringify(tauriConfig, null, 2) + "\n"
);
console.log(`Updated ${tauriConfigPath} -> ${version} (msi ${wixVersion})`);

console.log("Release preparation complete");