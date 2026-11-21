import { useState } from 'react';
import {
  Button,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

export interface TursoConnection {
  url: string;
  authToken: string;
}

export function getTursoHostname(url: string) {
  const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const pattern = new RegExp(`^(?:libsql|https)://((?:${label}\\.)+turso\\.io)/?$`, 'i');
  const hostname = pattern.exec(url.trim())?.[1]?.toLowerCase();
  return hostname && hostname.length <= 200 ? hostname : null;
}

interface Props {
  connection?: TursoConnection;
  onSave: (connection: TursoConnection) => Promise<void>;
  onCancel?: () => void;
}

export function TursoSetup({ connection, onSave, onCancel }: Props) {
  const [url, setUrl] = useState(connection?.url ?? '');
  const [authToken, setAuthToken] = useState(connection?.authToken ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const hostname = getTursoHostname(url);
    if (!hostname) {
      setError('Enter a valid Turso database URL.');
      return;
    }
    const token = authToken.trim();
    if (!token) {
      setError('Enter your database auth token.');
      return;
    }

    setSaving(true);
    setError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`https://${hostname}/v2/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            { type: 'execute', stmt: { sql: 'SELECT 1' } },
            { type: 'close' },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok || (await response.json()).results?.[0]?.type !== 'ok') {
        setError('Could not connect. Check the database URL and token.');
        return;
      }
      await onSave({ url: `libsql://${hostname}`, authToken: token });
    } catch {
      setError('Could not connect or save your settings. Please try again.');
    } finally {
      clearTimeout(timeout);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.container}>
      <Text style={styles.heading}>Connect to Turso</Text>
      <Text>Enter your database URL and a database token with read and write access.</Text>
      <TextInput
        accessibilityLabel="Turso database URL"
        placeholder="libsql://your-database.turso.io"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!saving}
        style={styles.input}
        value={url}
        onChangeText={setUrl}
      />
      <TextInput
        accessibilityLabel="Turso auth token"
        placeholder="Database auth token"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={!saving}
        style={styles.input}
        value={authToken}
        onChangeText={setAuthToken}
      />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      <Button title={saving ? 'Connecting…' : 'Connect'} disabled={saving} onPress={save} />
      {onCancel ? <Button title="Cancel" disabled={saving} onPress={onCancel} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  heading: { fontSize: 24, fontWeight: '600' },
  input: { borderColor: '#888', borderWidth: 1, borderRadius: 8, padding: 12 },
});
