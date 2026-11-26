import java.io.File
import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val keystoreProperties = Properties().apply {
    val propFile = rootProject.file("keystore.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val releaseKeystorePath = System.getenv("AURALIS_ANDROID_KEYSTORE_PATH")?.trim().orEmpty()
    .ifEmpty { keystoreProperties.getProperty("storeFile", "").trim() }
val releaseStorePassword = System.getenv("AURALIS_ANDROID_KEYSTORE_PASSWORD")?.trim().orEmpty()
    .ifEmpty { keystoreProperties.getProperty("storePassword", "").trim() }
val releaseKeyAlias = System.getenv("AURALIS_ANDROID_KEY_ALIAS")?.trim().orEmpty()
    .ifEmpty { keystoreProperties.getProperty("keyAlias", "").trim() }
val releaseKeyPassword = System.getenv("AURALIS_ANDROID_KEY_PASSWORD")?.trim().orEmpty()
    .ifEmpty { keystoreProperties.getProperty("keyPassword", "").trim() }

val signingInputs = listOf(
    releaseKeystorePath,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
)
val anySigningConfigured = signingInputs.any { it.isNotEmpty() }
val allSigningConfigured = signingInputs.all { it.isNotEmpty() }
if (anySigningConfigured && !allSigningConfigured) {
    throw GradleException(
        "Incomplete Android release signing configuration. Set all 4 of " +
            "AURALIS_ANDROID_KEYSTORE_PATH, AURALIS_ANDROID_KEYSTORE_PASSWORD, " +
            "AURALIS_ANDROID_KEY_ALIAS, AURALIS_ANDROID_KEY_PASSWORD (or keystore.properties)."
    )
}
val releaseKeystoreFile: File? = if (allSigningConfigured) {
    val rawFile = File(releaseKeystorePath)
    val resolved = if (rawFile.isAbsolute) rawFile else rootProject.file(releaseKeystorePath)
    if (!resolved.exists()) {
        throw GradleException("Android release keystore file not found: ${resolved.absolutePath}")
    }
    resolved
} else {
    null
}

val auralisAppTarget = (System.getenv("AURALIS_APP_TARGET") ?: "phone").trim().lowercase()
val isTabletTarget = auralisAppTarget == "tablet"

android {
    compileSdk = 37
    namespace = "com.auralis.mobile"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        manifestPlaceholders["appName"] = if (isTabletTarget) "Auralis HD" else "Auralis"
        manifestPlaceholders["screenOrientation"] = if (isTabletTarget) "sensorLandscape" else "portrait"
        applicationId = if (isTabletTarget) "com.auralis.hd" else "com.auralis.mobile"
        minSdk = 24
        targetSdk = 37
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        if (releaseKeystoreFile != null) {
            create("release") {
                storeFile = releaseKeystoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (releaseKeystoreFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
