import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const isRelease = process.argv.includes("--release");
const noStrip = process.argv.includes("--no-strip");
const shouldStrip = !noStrip;

const profile = isRelease ? "release" : "debug";
const gradleTask = isRelease ? "assembleArm64Release" : "assembleArm64Debug";

console.log(`\n========================================`);
console.log(`🚀 Building Mashiro Android (${profile})...`);
console.log(`   Mode: ${isRelease ? "Release" : "Debug"}`);
console.log(`   Symbols: ${shouldStrip ? "Stripped (--strip-all)" : "Preserved (unstripped for debugging)"}`);
console.log(`========================================\n`);

function resolveAndroidHome() {
  if (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) {
    return process.env.ANDROID_HOME;
  }
  if (process.env.ANDROID_SDK_ROOT && fs.existsSync(process.env.ANDROID_SDK_ROOT)) {
    return process.env.ANDROID_SDK_ROOT;
  }
  const defaultLocal = path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
  if (fs.existsSync(defaultLocal)) {
    return defaultLocal;
  }
  throw new Error("ANDROID_HOME or ANDROID_SDK_ROOT not set and no standard Android SDK found.");
}

function resolveNdkHome(androidHome) {
  if (process.env.NDK_HOME && fs.existsSync(process.env.NDK_HOME)) {
    return process.env.NDK_HOME;
  }
  if (process.env.ANDROID_NDK_HOME && fs.existsSync(process.env.ANDROID_NDK_HOME)) {
    return process.env.ANDROID_NDK_HOME;
  }
  const ndkParent = path.join(androidHome, "ndk");
  if (fs.existsSync(ndkParent)) {
    const versions = fs.readdirSync(ndkParent).filter((v) => fs.statSync(path.join(ndkParent, v)).isDirectory());
    if (versions.length > 0) {
      versions.sort().reverse();
      return path.join(ndkParent, versions[0]);
    }
  }
  throw new Error("NDK_HOME not set and no NDK directory found in Android SDK.");
}

function resolveJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  try {
    const javaExe = execSync(process.platform === "win32" ? "where.exe java" : "which java", { encoding: "utf8" }).trim().split("\n")[0];
    if (javaExe) {
      return path.dirname(path.dirname(javaExe.trim()));
    }
  } catch {}
  throw new Error("JAVA_HOME is not set and java binary could not be found.");
}

const androidHome = resolveAndroidHome();
const ndkHome = resolveNdkHome(androidHome);
const javaHome = resolveJavaHome();

console.log(`   JAVA_HOME:    ${javaHome}`);
console.log(`   ANDROID_HOME: ${androidHome}`);
console.log(`   NDK_HOME:     ${ndkHome}\n`);

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  NDK_HOME: ndkHome,
};

// If Windows user profile contains non-ASCII characters (Cyrillic),
// LLVM ld.lld linker crashes when loading standard rlibs unless mapped to an ASCII drive.
if (process.platform === "win32") {
  try {
    const sysroot = execSync("rustc --print sysroot", { encoding: "utf8" }).trim();
    if (/[^\x00-\x7F]/.test(sysroot) && !fs.existsSync("R:\\lib\\rustlib")) {
      try {
        execSync(`subst R: "${sysroot}"`, { stdio: "ignore" });
      } catch (err) {
        console.warn("⚠️ Could not automatically map virtual drive R: ->", err.message);
      }
    }
  } catch {}
}

if (fs.existsSync("R:\\lib\\rustlib")) {
  env.RUSTFLAGS = (env.RUSTFLAGS ? env.RUSTFLAGS + " " : "") + "--sysroot=R:";
  console.log("ℹ️ Non-ASCII path mitigation active: using RUSTFLAGS=--sysroot=R:\n");
}

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

if (!fs.existsSync(builtSo)) {
  throw new Error(`Target native library not found: ${builtSo}`);
}

fs.mkdirSync(jniDir, { recursive: true });
const originalSizeMb = (fs.statSync(builtSo).size / (1024 * 1024)).toFixed(2);

function findStripExe(ndk) {
  const llvmBin = path.join(ndk, "toolchains", "llvm", "prebuilt");
  if (!fs.existsSync(llvmBin)) return null;
  const hosts = fs.readdirSync(llvmBin);
  for (const host of hosts) {
    const candidate = path.join(llvmBin, host, "bin", process.platform === "win32" ? "llvm-strip.exe" : "llvm-strip");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const stripExe = findStripExe(ndkHome);

if (shouldStrip && stripExe) {
  console.log(`✂️ Stripping debug symbols with llvm-strip (${stripExe})...`);
  try {
    execSync(`"${stripExe}" --strip-all "${builtSo}"`, { stdio: "inherit" });
    fs.copyFileSync(builtSo, jniSo);
    execSync(`"${stripExe}" --strip-all "${jniSo}"`, { stdio: "inherit" });
    const strippedSizeMb = (fs.statSync(jniSo).size / (1024 * 1024)).toFixed(2);
    console.log(`✨ Stripped libmashiro_lib.so size: ${strippedSizeMb} MB (was ${originalSizeMb} MB)`);
    // Delete existing APK to ensure Gradle repackages with the stripped .so
    const oldApk = path.join(rootDir, "src-tauri", "gen", "android", "app", "build", "outputs", "apk", "arm64", profile, `app-arm64-${profile}.apk`);
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
