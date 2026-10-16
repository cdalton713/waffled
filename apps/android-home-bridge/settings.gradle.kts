pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven {
            url = uri(rootDir.resolve("sdk-repository"))
            content { includeModule("com.google.android.gms", "play-services-home"); includeModule("com.google.android.gms", "play-services-home-types") }
        }
        google()
        mavenCentral()
    }
}
rootProject.name = "WaffledHomeBridge"
include(":protocol")
include(":app")
