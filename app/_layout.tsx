import { Stack } from 'expo-router';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NotesProvider } from '../context/NotesContext';
import { SQLiteDatabase, SQLiteProvider } from 'expo-sqlite';
import { Suspense, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getTursoHostname, TursoConnection, TursoSetup } from '../components/TursoSetup';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';

const connectionKey = 'turso-connection';
const developmentUrl = __DEV__ ? process.env.EXPO_PUBLIC_TURSO_DB_URL : undefined;
const developmentToken = __DEV__ ? process.env.EXPO_PUBLIC_TURSO_DB_AUTH_TOKEN : undefined;
const developmentConnection = developmentUrl && developmentToken
  ? { url: developmentUrl, authToken: developmentToken }
  : undefined;

export default function RootLayout() {
  useFrameworkReady();
  const [connection, setConnection] = useState<TursoConnection | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const databaseOptions = useMemo(() => ({ libSQLOptions: connection ?? undefined }), [connection]);

  useEffect(() => {
    let cancelled = false;
    async function loadConnection() {
      let saved: TursoConnection | null = null;
      try {
        const value = await SecureStore.getItemAsync(connectionKey);
        if (value) {
          const stored = JSON.parse(value) as Partial<TursoConnection>;
          if (typeof stored.url === 'string' && getTursoHostname(stored.url) &&
              typeof stored.authToken === 'string' && stored.authToken) {
            saved = { url: stored.url, authToken: stored.authToken };
          }
        }
      } catch {
        // An unavailable or invalid saved connection can be set up again.
      }
      if (!cancelled) setConnection(saved ?? developmentConnection ?? null);
    }
    void loadConnection();
    return () => { cancelled = true; };
  }, []);

  if (connection === undefined) return <DatabaseStartup />;
  if (connection === null || editing) {
    return (
      <TursoSetup
        connection={connection ?? undefined}
        onCancel={connection ? () => setEditing(false) : undefined}
        onSave={async (nextConnection) => {
          await SecureStore.setItemAsync(connectionKey, JSON.stringify(nextConnection));
          setConnection(nextConnection);
          setEditing(false);
        }}
      />
    );
  }

  const databaseName = connection === developmentConnection
    ? 'syncscribe'
    : `syncscribe-${getTursoHostname(connection.url)}`;

  return (
    <Suspense fallback={<DatabaseStartup />}>
      <NotesDatabase
        databaseName={databaseName}
        options={databaseOptions}
        editConnection={() => setEditing(true)}
      />
    </Suspense>
  );
}

async function initializeDatabase(db: SQLiteDatabase) {
  try {
    // Always sync libSQL first to prevent conflicts between local and remote databases
    await db.syncLibSQL();
  } catch (e) {
    console.log('Error onInit syncing libSQL:', e);
  }

  // Define the target database version.
  const DATABASE_VERSION = 2;

  // PRAGMA is a special command in SQLite used to query or modify database settings. For example, PRAGMA user_version retrieves or sets a custom schema version number, helping you track migrations.
  // Retrieve the current database version using PRAGMA.
  let result = await db.getFirstAsync<{
    user_version: number;
  } | null>('PRAGMA user_version');
  let currentDbVersion = result?.user_version ?? 0;

  // If the current version is already equal or newer, no migration is needed.
  if (currentDbVersion >= DATABASE_VERSION) {
    console.log('No migration needed, DB version:', currentDbVersion);
    return;
  }

  // For a new or uninitialized database (version 0), apply the initial migration.
  if (currentDbVersion === 0) {
    // Note: libSQL does not support WAL (Write-Ahead Logging) mode.
    // await db.execAsync(`PRAGMA journal_mode = 'wal';`);

    // Create the 'notes' table with three columns:
    // - id: an integer primary key that cannot be null.
    // - title: a text column.
    // - content: a text column.
    // - modifiedDate: a text column.
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY NOT NULL, title TEXT, content TEXT, modifiedDate TEXT);`
    );
    console.log(
      'Initial migration applied, DB version:',
      DATABASE_VERSION
    );
    // Update the current version after applying the initial migration.
    currentDbVersion = 1;
  } else {
    console.log('DB version:', currentDbVersion);
  }

  // Future migrations for later versions can be added here.
  // Example:
  // if (currentDbVersion === 1) {
  //   // Add migration steps for upgrading from version 1 to a higher version.
  // }

  // Set the database version to the target version after migration.
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

function NotesDatabase({ databaseName, options, editConnection }: {
  databaseName: string;
  options: { libSQLOptions?: TursoConnection };
  editConnection: () => void;
}) {
  return (
    <SQLiteProvider
      useSuspense
      databaseName={databaseName}
      options={options}
      onInit={initializeDatabase}
    >
      <NotesProvider editConnection={editConnection}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              gestureEnabled: true,
            }}
          >
            <Stack.Screen
              name="index"
              options={{
                headerShown: true,
                headerLargeTitle: true,
                headerTitle: 'Notes',
              }}
            />
            <Stack.Screen
              name="note/[id]"
              options={{
                headerShown: true,
              }}
            />
          </Stack>
          <StatusBar barStyle={'dark-content'} />
        </GestureHandlerRootView>
      </NotesProvider>
    </SQLiteProvider>
  );
}

function DatabaseStartup() {
  return (
    <View style={styles.startup} accessibilityRole="progressbar">
      <ActivityIndicator />
      <Text>Opening notes…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  startup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
