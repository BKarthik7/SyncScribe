import { useSQLiteContext } from 'expo-sqlite';
import { Alert } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from 'react';

if (
  !process.env.EXPO_PUBLIC_TURSO_DB_URL ||
  !process.env.EXPO_PUBLIC_TURSO_DB_AUTH_TOKEN
) {
  throw new Error('Turso DB URL and Auth Token must be set in .env.local');
}
export interface Note {
  id: string;
  title: string | null;
  content: string | null;
  modifiedDate: Date | null;
}

export const DB_NAME = 'syncscribe'; // Turso db name

export const tursoOptions = {
  url: process.env.EXPO_PUBLIC_TURSO_DB_URL,
  authToken: process.env.EXPO_PUBLIC_TURSO_DB_AUTH_TOKEN,
};

interface NotesContextType {
  notes: Note[];
  createNote: () => Promise<Note | undefined>;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => Promise<void>;
  syncNotesManually: () => void;
  isSyncingNow: boolean;
  toggleSync: (enabled: boolean) => void;
  isSyncing: boolean;
}

const NotesContext = createContext<NotesContextType | null>(null);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const syncInFlight = useRef<Promise<boolean> | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    fetchNotes();
  }, [db]);

  useEffect(() => {
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  const fetchNotes = useCallback(async () => {
    const notes = await db.getAllAsync<Note>(
      'SELECT * FROM notes ORDER BY modifiedDate DESC'
    );
    setNotes(notes);
  }, [db]);

  const syncNotes = useCallback(() => {
    if (syncInFlight.current) return syncInFlight.current;

    setIsSyncingNow(true);
    const sync = Promise.resolve()
      .then(() => db.syncLibSQL())
      .then(fetchNotes)
      .then(() => true)
      .catch((error) => {
        console.log('Could not sync notes with Turso:', error);
        return false;
      })
      .finally(() => {
        syncInFlight.current = null;
        setIsSyncingNow(false);
      });

    syncInFlight.current = sync;
    return sync;
  }, [db, fetchNotes]);

  const syncNotesManually = useCallback(async () => {
    if (await syncNotes()) return;
    Alert.alert(
      'Sync failed',
      'Your notes are still on this device. Check your connection and try again.'
    );
  }, [syncNotes]);

  const toggleSync = useCallback(
    (enabled: boolean) => {
      setIsSyncing(enabled);
      if (syncIntervalRef.current !== undefined) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = undefined;
      }
      if (enabled) {
        syncIntervalRef.current = setInterval(syncNotes, 2000);
        void syncNotes();
      }
    },
    [syncNotes]
  );

  const createNote = async () => {
    const newNote = {
      title: '',
      content: '',
      modifiedDate: new Date(),
    };

    try {
      const result = await db.runAsync(
        'INSERT INTO notes (title, content, modifiedDate) VALUES (?, ?, ?)',
        newNote.title,
        newNote.content,
        newNote.modifiedDate.toISOString()
      );
      fetchNotes();
      return { ...newNote, id: result.lastInsertRowId.toString() };
    } catch (e) {
      console.log(e);
    }
  };

  const updateNote = async (id: string, updates: Partial<Note>) => {
    // First get the existing note
    const existingNote = await db.getFirstAsync<Note>(
      'SELECT * FROM notes WHERE id = ?',
      [id]
    );

    if (!existingNote) return;

    // Merge existing values with updates
    const updatedNote = {
      title: updates.title ?? existingNote.title,
      content: updates.content ?? existingNote.content,
      modifiedDate: updates.modifiedDate ?? new Date(),
    };

    await db.runAsync(
      'UPDATE notes SET title = ?, content = ?, modifiedDate = ? WHERE id = ?',
      updatedNote.title,
      updatedNote.content,
      updatedNote.modifiedDate.toISOString(),
      id
    );
    fetchNotes();
  };
  const deleteNote = async (id: string) => {
    await db.runAsync('DELETE FROM notes WHERE id = ?', id);
    await fetchNotes();
  };

  return (
    <NotesContext.Provider
      value={{
        notes,
        createNote,
        updateNote,
        deleteNote,
        syncNotesManually,
        isSyncingNow,
        toggleSync,
        isSyncing,
      }}
    >
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotes must be used within a NotesProvider');
  }
  return context;
}
