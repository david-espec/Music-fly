plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Cada build do GitHub Actions ganha um numero maior, para o celular aceitar
// a nova versao por cima da anterior.
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "com.davidespec.foto"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.davidespec.foto"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"

        // So ARM 64 bits (Galaxy A04s e praticamente todo celular atual): as
        // bibliotecas nativas do ML Kit para x86/32 bits quase triplicavam o APK.
        ndk {
            abiFilters += listOf("arm64-v8a")
        }
    }

    // Bibliotecas nativas comprimidas: download bem menor.
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }

    // Chave fixa guardada no repositorio: todas as builds saem com a mesma
    // assinatura, entao uma versao nova instala por cima da antiga sem apagar
    // nada. E um app pessoal, instalado fora da Play Store.
    signingConfigs {
        create("foto") {
            storeFile = file("foto.keystore")
            storePassword = "fotofoto"
            keyAlias = "foto"
            keyPassword = "fotofoto"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = signingConfigs.getByName("foto")
        }
        debug {
            signingConfig = signingConfigs.getByName("foto")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    val camerax = "1.4.1"

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")

    implementation("androidx.camera:camera-core:$camerax")
    implementation("androidx.camera:camera-camera2:$camerax")
    implementation("androidx.camera:camera-lifecycle:$camerax")
    implementation("androidx.camera:camera-view:$camerax")
    implementation("androidx.camera:camera-video:$camerax")
    implementation("androidx.camera:camera-extensions:$camerax")

    implementation("androidx.exifinterface:exifinterface:1.3.7")

    // Visao computacional no proprio aparelho (modelos embutidos, sem rede).
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation("com.google.mlkit:face-detection:16.1.7")
    implementation("com.google.mlkit:segmentation-selfie:16.0.0-beta6")
    // Scanner de documentos do Google Play Services.
    implementation("com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1")
}
