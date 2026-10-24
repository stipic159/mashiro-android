import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const isRelease = process.argv.includes("--release");
const profile = isRelease ? "release" : "debug";
const gradleTask = isRelease ? "assembleArm64Release" : "assembleArm64Debug";

console.log(`\n========================================`);
console.log(`🚀 Building Mashiro Android (${profile})...`);
console.log(`========================================\n`);

// 1. Build Frontend SPA
console.log("📦 1/4 Compiling Vue 3 / Quasar frontend...");
execSync("npm run build", { stdio: "inherit", cwd: rootDir });

// 2. Sync Assets to Android Assets folder
console.log("📂 2/4 Syncing frontend assets to Android package...");
const spaDir = path.join(rootDir, "dist", "spa");
const assetsDir = path.join(rootDir, "src-tauri", "gen", "android", "app", "src", "main", "assets");
fs.cpSync(spaDir, assetsDir, { recursive: true, force: true });

// 3. Setup Android & Rust Environment
const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME || "C:\\Program Files\\Microsoft\\jdk-21.0.10.7-hotspot\\",
  ANDROID_HOME: process.env.ANDROID_HOME || "F:\\android-sdk",
  NDK_HOME: process.env.NDK_HOME || "F:\\android-sdk\\ndk\\30.0.16248370",
  RUSTFLAGS: "--sysroot=R:",
};

// 4. Run Gradle Assemble
console.log(`🔨 3/4 Running Gradle ${gradleTask}...`);
const gradlewDir = path.join(rootDir, "src-tauri", "gen", "android");
const gradlewCmd = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

execSync(`${gradlewCmd} ${gradleTask}`, {
  stdio: "inherit",
  cwd: gradlewDir,
  env,
});

// 5. Locate produced APK
console.log("✅ 4/4 Locating output APK...");
const apkFolder = path.join(rootDir, "src-tauri", "gen", "android", "app", "build", "outputs", "apk", "arm64", profile);
const files = fs.readdirSync(apkFolder).filter((f) => f.endsWith(".apk"));

if (files.length > 0) {
  const apkPath = path.join(apkFolder, files[0]);
  const stats = fs.statSync(apkPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\n🎉 Success! APK generated:`);
  console.log(`📍 Path: ${apkPath}`);
  console.log(`📊 Size: ${sizeMb} MB\n`);
} else {
  console.log("\n⚠️ Build completed, but no APK file found in output directory.");
}
