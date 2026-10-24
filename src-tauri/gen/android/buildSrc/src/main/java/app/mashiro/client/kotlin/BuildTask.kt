import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import javax.inject.Inject
import org.gradle.process.ExecOperations
import java.nio.file.Files
import java.nio.file.StandardCopyOption

abstract class BuildTask : DefaultTask() {
    @get:Inject
    abstract val execOperations: ExecOperations

    @Input
    var rootDirRel: String? = null
    @Input
    var projectDir: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val pDir = File(projectDir ?: ".")
        val rootDir = File(pDir, rootDirRel ?: "../../../")
        val targetName = target ?: "aarch64"
        val isRelease = release == true
        val profile = if (isRelease) "release" else "debug"
        val rustTarget = when (targetName) {
            "aarch64" -> "aarch64-linux-android"
            "armv7" -> "armv7-linux-androideabi"
            "i686" -> "i686-linux-android"
            else -> "x86_64-linux-android"
        }
        val abiDirName = when (targetName) {
            "aarch64" -> "arm64-v8a"
            "armv7" -> "armeabi-v7a"
            "i686" -> "x86"
            else -> "x86_64"
        }

        val dstDir = File(pDir, "src/main/jniLibs/$abiDirName")
        dstDir.mkdirs()
        val dstSo = File(dstDir, "libmashiro_lib.so")

        val srcSo = File(rootDir, "target/$rustTarget/$profile/libmashiro_lib.so")

        // If target .so already exists (e.g. pre-compiled by build script or cargo), copy directly
        if (srcSo.exists()) {
            println("Copying $srcSo -> $dstSo (symlink bypass)")
            Files.copy(srcSo.toPath(), dstSo.toPath(), StandardCopyOption.REPLACE_EXISTING)
            return
        }

        // If already present in jniLibs, we're good
        if (dstSo.exists()) {
            return
        }

        // Otherwise try standard tauri CLI invocation via npx in workspace root
        val workspaceDir = File(rootDir, "..")
        val executable = if (Os.isFamily(Os.FAMILY_WINDOWS)) "npx.cmd" else "npx"
        try {
            runTauriCli(executable, workspaceDir)
        } catch (e: Exception) {
            // Check if .so was produced despite error
        }

        if (srcSo.exists()) {
            println("Copying $srcSo -> $dstSo (symlink bypass)")
            Files.copy(srcSo.toPath(), dstSo.toPath(), StandardCopyOption.REPLACE_EXISTING)
            return
        }

        if (dstSo.exists()) {
            return
        }

        throw GradleException("Could not build or locate Rust library at: ${srcSo.absolutePath}")
    }

    fun runTauriCli(executable: String, workDir: File) {
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = mutableListOf("tauri", "android", "android-studio-script")

        if (logger.isEnabled(LogLevel.DEBUG)) {
            args.add("-vv")
        } else if (logger.isEnabled(LogLevel.INFO)) {
            args.add("-v")
        }
        if (release) {
            args.add("--release")
        }
        args.addAll(listOf("--target", target))

        execOperations.exec {
            workingDir(workDir)
            executable(executable)
            args(args)
        }.assertNormalExitValue()
    }
}
