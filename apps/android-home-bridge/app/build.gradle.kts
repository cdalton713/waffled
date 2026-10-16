plugins { id("com.android.application"); kotlin("android") }
android {
    namespace = "app.waffled.homebridge.android"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.waffled.homebridge"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
}
dependencies {
    implementation(project(":protocol"))
    implementation("androidx.activity:activity-ktx:1.12.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
    implementation("com.google.android.gms:play-services-home:17.1.0")
    implementation("com.google.android.gms:play-services-home-types:17.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.11.0")
    implementation("io.ktor:ktor-server-cio-jvm:3.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
}
