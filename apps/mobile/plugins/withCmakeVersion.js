// plugins/withCmakeVersion.js
const fs = require('fs');
const path = require('path');

// Windows-only fix for the "Filename longer than 260 characters" ninja bug
// (ninja-build/ninja#1900). CMake resolves ninja.exe via the system PATH,
// which on this machine finds an older Ninja bundled with Strawberry Perl
// before it finds the fixed one shipped with a newer CMake SDK package.
// This forces the build to use that newer Ninja explicitly.

function findNewestNinja(sdkRoot) {
  const cmakeDir = path.join(sdkRoot, 'cmake');
  if (!fs.existsSync(cmakeDir)) {
    return null;
  }
  const versions = fs.readdirSync(cmakeDir).sort().reverse();
  for (const version of versions) {
    const ninjaPath = path.join(cmakeDir, version, 'bin', 'ninja.exe');
    if (fs.existsSync(ninjaPath)) {
      return ninjaPath;
    }
  }
  return null;
}

function withCmakeVersion(config) {
  if (process.platform !== 'win32') {
    return config;
  }

  let withAppBuildGradle;
  try {
    ({ withAppBuildGradle } = require('@expo/config-plugins'));
  } catch {
    console.warn('[withCmakeVersion] @expo/config-plugins not found; skipping.');
    return config;
  }

  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const ninjaPath = sdkRoot ? findNewestNinja(sdkRoot) : null;
  if (!ninjaPath) {
    console.warn('[withCmakeVersion] Could not locate a newer Ninja under the Android SDK; skipping.');
    return config;
  }

  return withAppBuildGradle(config, (config) => {
    const alreadyPatched = config.modResults.contents.includes('CMAKE_MAKE_PROGRAM');
    if (alreadyPatched) {
      return config;
    }
    const escapedPath = ninjaPath.replace(/\\/g, '\\\\');
    config.modResults.contents += `
android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_MAKE_PROGRAM=${escapedPath}"
            }
        }
    }
}
`;
    return config;
  });
}

module.exports = withCmakeVersion;