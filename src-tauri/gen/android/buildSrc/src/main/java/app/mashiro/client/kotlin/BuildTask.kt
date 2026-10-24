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

        // First try standard tauri CLI invocation
        var tauriSucceeded = false
        val executable = "node"
        val fallbacks = if (Os.isFamily(Os.FAMILY_WINDOWS)) {
            listOf(executable, "$executable.exe", "$executable.cmd", "$executable.bat")
        } else {
            listOf(executable)
        }

        for (cmd in fallbacks) {
            try {
                runTauriCli(cmd)
                tauriSucceeded = true
                break
            } catch (e: Exception) {
                // If symlink failed or script requires dev server, fallback below
            }
        }

        // If Tauri symlink succeeded and dst exists, we're done
        if (tauriSucceeded && dstSo.exists()) {
            return
        }

        // Fallback: If compiled .so exists, copy it directly (bypasses Windows symlink restriction)
        if (srcSo.exists()) {
            println("Copying $srcSo -> $dstSo (symlink bypass)")
            Files.copy(srcSo.toPath(), dstSo.toPath(), StandardCopyOption.REPLACE_EXISTING)
            return
        }

        // If neither succeeded, throw informative error
        throw GradleException("Could not build or locate Rust library at: ${srcSo.absolutePath}")
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("tauri", "android", "android-studio-script")

        execOperations.exec {
            workingDir(File(projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}
