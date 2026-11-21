#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK directory}"
: "${SYNC_SCRIBE_KEYSTORE:?Set SYNC_SCRIBE_KEYSTORE to the release keystore}"
: "${SYNC_SCRIBE_KEYSTORE_PASSWORD_FILE:?Set SYNC_SCRIBE_KEYSTORE_PASSWORD_FILE to a private password file}"

version=$(node -p 'require("./app.json").expo.version')
output_dir="${1:-$PWD/dist/android}"
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)
build_tools="$ANDROID_HOME/build-tools/35.0.0"
key_alias="${SYNC_SCRIBE_KEY_ALIAS:-syncscribe-release}"

export EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1
unset EXPO_PUBLIC_TURSO_DB_URL EXPO_PUBLIC_TURSO_DB_AUTH_TOKEN
npx --no-install expo prebuild --platform android --no-install

for abi in arm64-v8a x86_64; do
  (
    cd android
    ./gradlew --console=plain :app:assembleRelease \
      "-PreactNativeArchitectures=$abi" -Pexpo.useLegacyPackaging=true
  )

  apk_dir="$PWD/android/app/build/outputs/apk/release"
  apk_name=$(node -p 'require(process.argv[1]).elements[0].outputFile' "$apk_dir/output-metadata.json")
  output="$output_dir/SyncScribe.v$version-$abi.apk"

  "$build_tools/apksigner" sign \
    --ks "$SYNC_SCRIBE_KEYSTORE" --ks-key-alias "$key_alias" \
    --ks-pass "file:$SYNC_SCRIBE_KEYSTORE_PASSWORD_FILE" \
    --out "$output" "$apk_dir/$apk_name"
  "$build_tools/apksigner" verify "$output"
  test "$("$build_tools/aapt" dump badging "$output" | awk '/^native-code:/ {print $2}')" = "'$abi'"
  printf 'Built %s\n' "$output"
done
