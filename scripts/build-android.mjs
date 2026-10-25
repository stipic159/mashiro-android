import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const isRelease = process.argv.includes("--release");
const noStrip = process.argv.includes("--no-strip");
const shouldStrip = !noStrip;

const profile = isRelease ? "release" : "debug";
const profileCapitalized = isRelease ? "Release" : "Debug";

// Multi-ABI target configuration
const TARGET_MAP = {
  arm64: {
    name: "arm64",
    tauriTarget: "aarch64",
    rustTriple: "aarch64-linux-android",
    jniArch: "arm64-v8a",
    gradleFlavor: "Arm64",
    apkFolder: "arm64",
    description: "64-bit ARM (modern devices: arm64-v8a)",
  },
  arm: {
    name: "arm",
    tauriTarget: "armv7",
    rustTriple: "armv7-linux-androideabi",
    jniArch: "armeabi-v7a",
    gradleFlavor: "Arm",
    apkFolder: "arm",
    description: "32-bit ARM (legacy devices: armeabi-v7a)",
  },
  armv7: {
    name: "arm",
    tauriTarget: "armv7",
    rustTriple: "armv7-linux-androideabi",
    jniArch: "armeabi-v7a",
    gradleFlavor: "Arm",
    apkFolder: "arm",
    description: "32-bit ARM (legacy devices: armeabi-v7a)",
  },
  x86_64: {
    name: "x86_64",
    tauriTarget: "x86_64",
    rustTriple: "x86_64-linux-android",
    jniArch: "x86_64",
    gradleFlavor: "X86_64",
    apkFolder: "x86_64",
    description: "64-bit x86 (Android Studio emulators, ChromeOS, Waydroid)",
  },
  x86: {
    name: "x86",
    tauriTarget: "i686",
    rustTriple: "i686-linux-android",
    jniArch: "x86",
    gradleFlavor: "X86",
    apkFolder: "x86",
    description: "32-bit x86 (legacy emulators)",
  },
};

// Parse target CLI arguments
let chosenTarget = "arm64";
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--target=")) {
    chosenTarget = arg.split("=")[1].toLowerCase();
  } else if (arg === "--arm64") {
    chosenTarget = "arm64";
  } else if (arg === "--arm" || arg === "--armv7") {
    chosenTarget = "arm";
  } else if (arg === "--x86_64" || arg === "--x64") {
    chosenTarget = "x86_64";
  } else if (arg === "--universal" || arg === "--all") {
    chosenTarget = "universal";
  }
}

const isUniversal = chosenTarget === "universal" || chosenTarget === "all";
const targetConfigs = isUniversal
  ? [TARGET_MAP.arm64, TARGET_MAP.arm, TARGET_MAP.x86_64]
  : [TARGET_MAP[chosenTarget] || TARGET_MAP.arm64];

const gradleFlavor = isUniversal ? "Universal" : targetConfigs[0].gradleFlavor;
const gradleTask = `assemble${gradleFlavor}${profileCapitalized}`;
const apkOutputDir = isUniversal ? "universal" : targetConfigs[0].apkFolder;

console.log(`\n========================================`);
console.log(`🚀 Building Mashiro Android (${profile})...`);
console.log(`   Mode:    ${isRelease ? "Release" : "Debug"}`);
console.log(`   Target:  ${chosenTarget.toUpperCase()} ${isUniversal ? "(Universal multi-ABI APK)" : `(${targetConfigs[0].description})`}`);
console.log(`   Task:    ${gradleTask}`);
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

const androidHome = resolveAndroidHome();
const ndkHome = resolveNdkHome(androidHome);
const javaHome = resolveJavaHome();
const stripExe = findStripExe(ndkHome);

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
if (fs.existsSync(assetsDir)) {
  fs.rmSync(assetsDir, { recursive: true, force: true });
}
fs.cpSync(spaDir, assetsDir, { recursive: true, force: true });

// 3. Compile Rust engine for target ABI(s)
for (let i = 0; i < targetConfigs.length; i++) {
  const tConfig = targetConfigs[i];
  console.log(`\n🦀 3/4 [${i + 1}/${targetConfigs.length}] Compiling Rust engine for ${tConfig.name} (${tConfig.rustTriple})...`);

  const builtSo = path.join(rootDir, "src-tauri", "target", tConfig.rustTriple, profile, "libmashiro_lib.so");
  if (fs.existsSync(builtSo)) {
    fs.unlinkSync(builtSo);
  }

  const buildStartTime = Date.now();
  const releaseFlag = isRelease ? "" : "-d";
  const tauriCmd = `npx tauri android build ${releaseFlag} -t ${tConfig.tauriTarget} --apk --ignore-version-mismatches`;

  try {
    execSync(tauriCmd, {
      stdio: "inherit",
      cwd: rootDir,
      env,
    });
  } catch (e) {
    if (!fs.existsSync(builtSo)) {
      console.error(`\n❌ Rust compilation failed for target ${tConfig.name}. No target .so produced at: ${builtSo}`);
      throw e;
    }
    const stats = fs.statSync(builtSo);
    if (stats.mtimeMs < buildStartTime) {
      console.error(`\n❌ Rust compilation failed for target ${tConfig.name} (target .so is stale).`);
      throw e;
    }
    console.log(`ℹ️ Target ${tConfig.name} compiled successfully (symlink bypass active).`);
  }

  // Copy and strip into target jniLibs folder
  const jniDir = path.join(rootDir, "src-tauri", "gen", "android", "app", "src", "main", "jniLibs", tConfig.jniArch);
  const jniSo = path.join(jniDir, "libmashiro_lib.so");
  fs.mkdirSync(jniDir, { recursive: true });

  const originalSizeMb = (fs.statSync(builtSo).size / (1024 * 1024)).toFixed(2);
  if (shouldStrip && stripExe) {
    console.log(`✂️ Stripping ${tConfig.name} debug symbols with llvm-strip...`);
    try {
      execSync(`"${stripExe}" --strip-all "${builtSo}"`, { stdio: "inherit" });
      fs.copyFileSync(builtSo, jniSo);
      execSync(`"${stripExe}" --strip-all "${jniSo}"`, { stdio: "inherit" });
      const strippedSizeMb = (fs.statSync(jniSo).size / (1024 * 1024)).toFixed(2);
      console.log(`✨ Stripped ${tConfig.jniArch}/libmashiro_lib.so: ${strippedSizeMb} MB (was ${originalSizeMb} MB)`);
    } catch (stripErr) {
      console.warn("Warning: llvm-strip failed:", stripErr.message);
      fs.copyFileSync(builtSo, jniSo);
    }
  } else {
    fs.copyFileSync(builtSo, jniSo);
    console.log(`📦 Kept ${tConfig.jniArch}/libmashiro_lib.so unstripped (${originalSizeMb} MB)`);
  }
}

// 4. Run Gradle Assemble to produce final APK
console.log(`\n🔨 4/4 Running Gradle ${gradleTask}...`);
const gradlewDir = path.join(rootDir, "src-tauri", "gen", "android");
const gradlewCmd = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

// Clean old APKs from target folder to ensure fresh output
const targetApkFolder = path.join(rootDir, "src-tauri", "gen", "android", "app", "build", "outputs", "apk", apkOutputDir, profile);
if (fs.existsSync(targetApkFolder)) {
  for (const f of fs.readdirSync(targetApkFolder)) {
    if (f.endsWith(".apk")) {
      try { fs.unlinkSync(path.join(targetApkFolder, f)); } catch {}
    }
  }
}

execSync(`${gradlewCmd} ${gradleTask}`, {
  stdio: "inherit",
  cwd: gradlewDir,
  env,
});

// 5. Locate produced APK
console.log("\n✅ Locating output APK...");
if (fs.existsSync(targetApkFolder)) {
  const files = fs.readdirSync(targetApkFolder).filter((f) => f.endsWith(".apk"));
  if (files.length > 0) {
    for (const apkFile of files) {
      const apkPath = path.join(targetApkFolder, apkFile);
      const stats = fs.statSync(apkPath);
      const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`\n🎉 Success! APK generated:`);
      console.log(`📍 Path: ${apkPath}`);
      console.log(`📊 Size: ${sizeMb} MB (${profile}, ${apkOutputDir})\n`);
    }
  }
}
