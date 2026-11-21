const { createHash } = require('node:crypto');
const { readFile, rename, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

const sqliteRoot = join(__dirname, '..', 'node_modules', 'expo-sqlite');
const binary = join(sqliteRoot, 'android', 'libsql', 'x86_64', 'libsql_experimental.so');

// Expo's libSQL 0.9.11 update changes the Android binary without changing its C header.
const upstream = 'https://raw.githubusercontent.com/expo/expo/18cdd91b933598ee168b0568bf2264ee43c05792/packages/expo-sqlite/android/libsql/x86_64/libsql_experimental.so';
const originalSha = 'b32d6a6ef4080026182766cf56627fa72875030179818d808c46948b7716af40';
const fixedSha = 'f5e5955a1ec91e2143f7e3f673f74002a2f162aec5946add145152e5f3dd55fb';

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function patchAndroidLibsql() {
  const { version } = JSON.parse(await readFile(join(sqliteRoot, 'package.json'), 'utf8'));
  if (version !== '15.1.4') return;

  const currentSha = sha256(await readFile(binary));
  if (currentSha === fixedSha) return;
  if (currentSha !== originalSha) {
    throw new Error('Unexpected Expo SQLite x86-64 library. Reinstall dependencies and retry.');
  }

  const response = await fetch(upstream, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Expo download returned HTTP ${response.status}`);
  const replacement = Buffer.from(await response.arrayBuffer());
  if (sha256(replacement) !== fixedSha) throw new Error('Expo library checksum did not match');

  const temporary = `${binary}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, replacement);
    await rename(temporary, binary);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log('Patched Expo SQLite libSQL for Android x86-64.');
}

patchAndroidLibsql().catch((error) => {
  console.error('Unable to patch Android libSQL:', error.message);
  process.exitCode = 1;
});
