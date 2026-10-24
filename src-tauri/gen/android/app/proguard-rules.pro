# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep native media plugin and service
-keep class app.mashiro.client.** { *; }
-keepclassmembers class app.mashiro.client.** { *; }

# Keep Tauri Invoke arguments and plugins
-keep @app.tauri.annotation.InvokeArg public class * { *; }
-keepclassmembers @app.tauri.annotation.InvokeArg public class * { *; }
-keep @app.tauri.annotation.TauriPlugin public class * { *; }
-keepclassmembers @app.tauri.annotation.TauriPlugin public class * { *; }

# Keep Jackson and Media3
-keep class com.fasterxml.jackson.** { *; }
-keep class androidx.media3.** { *; }
-keepclassmembers class androidx.media3.** { *; }
