// plugins/withKotlinFix.js
// Parche mínimo y durable para SDK 57:
// El template de Expo 57 genera android/build.gradle con
// classpath('org.jetbrains.kotlin:kotlin-gradle-plugin') sin versión,
// que resuelve a 1.9.0 e incompatibiliza con Gradle 9.3.1 (Kotlin 2.2.21).
// expo-build-properties solo escribe android.kotlinVersion en gradle.properties,
// no versiona ese classpath. Este plugin lo pinnea a 2.1.20 de forma idiomática.
const { withProjectBuildGradle } = require('expo/config-plugins');

function withKotlinFix(config) {
  return withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')",
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20')"
    );
    return mod;
  });
}

module.exports = withKotlinFix;
