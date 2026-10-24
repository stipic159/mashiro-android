import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const isRelease = process.argv.includes("--release");
const forceStrip = process.argv.includes("--strip");
const noStrip = process.argv.includes("--no-strip");
const shouldStrip = !noStrip;

const profile = isRelease ? "release" : "debug";
const gradleTask = isRelease ? "assembleArm64Release" : "assembleArm64Debug";

console.log(`\n========================================`);
console.log(`🚀 Building Mashiro Android (${profile})...`);
console.log(`   Mode: ${isRelease ? "Release" : "Debug"}`);
console.log(`   Symbols: ${shouldStrip ? "Stripped (--strip-all)" : "Preserved (unstripped for debugging)"}`);
console.log(`========================================\n`);

const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME || "C:\\Program Files\\Microsoft\\jdk-21.0.10.7-hotspot\\",
  ANDROID_HOME: process.env.ANDROID_HOME || "F:\\android-sdk",
  NDK_HOME: process.env.NDK_HOME || "F:\\android-sdk\\ndk\\30.0.16248370",
  RUSTFLAGS: "--sysroot=R:",
};

// 1. Build Frontend SPA
const quasarCmd = isRelease ? "npx quasar build" : "npx quasar build -d";
console.log(`📦 1/4 Compiling Vue 3 / Quasar frontend (${isRelease ? "production" : "debug"})...`);
execSync(quasarCmd, { stdio: "inherit", cwd: rootDir });

// 2. Sync Assets to Android Assets folder
console.log("📂 2/4 Syncing frontend assets to Android package...");
const spaDir = path.join(rootDir, "dist", "spa");
const assetsDir = path.join(rootDir, "src-tauri", "gen", "android", "app", "src", "main", "assets");
fs.cpSync(spaDir, assetsDir, { recursive: true, force: true });

// 3. Compile Rust target using Tauri CLI
console.log(`🦀 3/4 Compiling Rust aarch64 native engine (${profile})...`);
const builtSo = path.join(rootDir, "src-tauri", "target", "aarch64-linux-android", profile, "libmashiro_lib.so");

// Remove old .so before building so we never use a stale binary if compilation fails
if (fs.existsSync(builtSo)) {
  fs.unlinkSync(builtSo);
}

const buildStartTime = Date.now();
const releaseFlag = isRelease ? "" : "-d";
const tauriCmd = `npx tauri android build ${releaseFlag} -t aarch64 --apk --ignore-version-mismatches`;

try {
  execSync(tauriCmd, {
    stdio: "inherit",
    cwd: rootDir,
    env,
  });
} catch (e) {
  // If Tauri CLI failed due to Windows non-admin symlink creation, verify fresh target .so exists
  if (!fs.existsSync(builtSo)) {
    console.error("\n❌ Rust compilation failed. No target .so was produced.");
    throw e;
  }
  const stats = fs.statSync(builtSo);
  if (stats.mtimeMs < buildStartTime) {
    console.error("\n❌ Rust compilation failed (target .so is stale).");
    throw e;
  }
  console.log("ℹ️ Tauri finished compilation (symlink bypass active). Continuing with packaging...");
}

// Ensure .so is in jniLibs
const jniDir = path.join(rootDir, "src-tauri", "gen", "android", "app", "src", "main", "jniLibs", "arm64-v8a");
const jniSo = path.join(jniDir, "libmashiro_lib.so");
const stripExe = path.join(env.NDK_HOME, "toolchains", "llvm", "prebuilt", "windows-x86_64", "bin", "llvm-strip.exe");

if (!fs.existsSync(builtSo)) {
  throw new Error(`Target native library not found: ${builtSo}`);
}

fs.mkdirSync(jniDir, { recursive: true });
const originalSizeMb = (fs.statSync(builtSo).size / (1024 * 1024)).toFixed(2);

if (shouldStrip && fs.existsSync(stripExe)) {
  console.log("✂️ Stripping debug symbols with llvm-strip...");
  try {
    execSync(`"${stripExe}" --strip-all "${builtSo}"`, { stdio: "inherit" });
    fs.copyFileSync(builtSo, jniSo);
    execSync(`"${stripExe}" --strip-all "${jniSo}"`, { stdio: "inherit" });
    const strippedSizeMb = (fs.statSync(jniSo).size / (1024 * 1024)).toFixed(2);
    console.log(`✨ Stripped libmashiro_lib.so size: ${strippedSizeMb} MB (was ${originalSizeMb} MB)`);
    // Delete existing APK to ensure Gradle repackages with the stripped .so
    const oldApk = path.join(rootDir, "src-tauri", "gen", "android", "app", "build", "outputs", "apk", "arm64", profile, "app-arm64-debug.apk");
    if (fs.existsSync(oldApk)) fs.unlinkSync(oldApk);
  } catch (stripErr) {
    console.warn("Warning: llvm-strip failed:", stripErr.message);
  }
} else {
  fs.mkdirSync(jniDir, { recursive: true });
  fs.copyFileSync(builtSo, jniSo);
  console.log(`📦 Native library libmashiro_lib.so kept unstripped (${originalSizeMb} MB)`);
}

// 4. Run Gradle Assemble to produce final APK
console.log(`🔨 4/4 Running Gradle ${gradleTask}...`);
const gradlewDir = path.join(rootDir, "src-tauri", "gen", "android");
const gradlewCmd = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

execSync(`${gradlewCmd} ${gradleTask}`, {
  stdio: "inherit",
  cwd: gradlewDir,
  env,
});

// 5. Locate produced APK
console.log("✅ Locating output APK...");
const apkFolder = path.join(rootDir, "src-tauri", "gen", "android", "app", "build", "outputs", "apk", "arm64", profile);
if (fs.existsSync(apkFolder)) {
  const files = fs.readdirSync(apkFolder).filter((f) => f.endsWith(".apk"));
  if (files.length > 0) {
    const apkPath = path.join(apkFolder, files[0]);
    const stats = fs.statSync(apkPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`\n🎉 Success! APK generated:`);
    console.log(`📍 Path: ${apkPath}`);
    console.log(`📊 Size: ${sizeMb} MB (${profile})\n`);
  }
}
