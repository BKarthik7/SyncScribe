# SyncScribe App

Powered by Expo ❤️

## Getting Started

1. **Clone the repository**:

   ```bash
   git clone github.com/BKarthik7/SyncScribe
   cd SyncScribe
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Prebuild the app**:  
   ⚠️ _Note: This app isn't compatible with Expo Go._

   ```bash
   npx expo prebuild
   ```

4. **Enable `LibSQL` in your `app.json`**:
   ```json
   [
     "expo-sqlite",
     {
       "useLibSQL": true
     }
   ]
   ```

## Turso Setup

1. **Create a Turso account** (if needed).

2. **Set up your database**:
   - Go to the **Databases** tab.
   - Create a new group (e.g., `offline`).
   - Create a database in the new group.
   - Generate and copy a database token with write/read permissions.

## Environment Variables

1. Rename `.env.local.example` to `.env.local`.
2. Add the following variables:
   ```env
   EXPO_PUBLIC_TURSO_DB_URL=libsql://xxxx.aws-us-east-1.turso.io
   EXPO_PUBLIC_TURSO_DB_AUTH_TOKEN=your_token_here
   ```

## Adding Data in Turso

1. **Create a table** or **set the `DATABASE_VERSION` to `0`**:

   ```sql
   CREATE TABLE "main"."notes" (
     "id" INTEGER PRIMARY KEY,
     "title" TEXT,
     "content" TEXT,
     "modifiedDate" TEXT
   );
   ```

2. Run:

   ```bash
   npx expo run:android
   ```

3. **Start the app**:
   ```bash
   npx expo start
   ```
