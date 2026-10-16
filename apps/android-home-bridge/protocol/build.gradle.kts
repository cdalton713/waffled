plugins { kotlin("jvm"); kotlin("plugin.serialization") }
kotlin { jvmToolchain(21); compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
dependencies {
    implementation("io.ktor:ktor-server-core-jvm:3.3.0")
    implementation("io.ktor:ktor-server-cio-jvm:3.3.0")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:3.3.0")
    implementation("io.ktor:ktor-server-status-pages-jvm:3.3.0")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:3.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    testImplementation(kotlin("test-junit"))
    testImplementation("io.ktor:ktor-server-test-host-jvm:3.3.0")
}
