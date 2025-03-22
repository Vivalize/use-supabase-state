# use-supabase-state

React hook for syncing a single Supabase row with local state — works like Firebase's `onSnapshot`, but for Supabase.

## ✨ Features
- 🔄 Real-time sync with Supabase row updates (INSERT, UPDATE, DELETE)
- 🧠 Optimistic local updates via `setRow`
- ✅ Auto-persist changes back to Supabase (opt-out)
- 🔌 One-time client setup with `initSupabaseState`
- 🛡️ Full TypeScript support with strict type safety
- 🎯 Custom primary key support
- 🚫 Skip option for conditional fetching
- 📝 Configurable logging

---

## 📦 Install
```bash
npm install use-supabase-state
```

---

## 🚀 Quickstart

### 1. Initialize once with your Supabase client
```ts
import { createClient } from '@supabase/supabase-js'
import { initSupabaseState } from 'use-supabase-state'

const supabase = createClient('https://your-project.supabase.co', 'public-anon-key')
initSupabaseState(supabase)
```

### 2. Use the hook in your component
```tsx
import { useSupabaseRowState } from 'use-supabase-state'

// With default 'id' primary key
type Profile = {
  id: string
  name: string
  email: string
}

function ProfileComponent({ userId }: { userId: string }) {
  const [profile, setProfile, isLoaded] = useSupabaseRowState<Profile>('profiles', userId)

  if (!isLoaded) return <Loading />

  return (
    <div>
      <p>{profile?.name}</p>
      <button onClick={() => setProfile(p => ({ ...p!, name: 'Updated Name' }))}>
        Rename
      </button>
    </div>
  )
}

// With custom primary key
type Project = {
  slug: string
  title: string
}

function ProjectComponent({ slug }: { slug: string }) {
  const [project, setProject, isLoaded] = useSupabaseRowState<Project, 'slug'>(
    'projects',
    slug,
    { primaryKey: 'slug' }
  )

  // ...
}
```

---

## 🛠 Options
```ts
interface UseSupabaseRowStateOptions<T, K extends keyof T> {
  /** The Postgres schema to use. Defaults to 'public'. */
  schema?: string
  /** The primary key column name. Defaults to 'id'. */
  primaryKey?: K
  /** Whether to automatically sync changes to the database. Defaults to true. */
  autoSync?: boolean
  /** Custom select query. Defaults to '*'. */
  select?: string
  /** Skip fetching if rowId is null/undefined. Defaults to false. */
  skip?: boolean
  /** Custom logger function. Defaults to console.warn */
  logger?: (message: string) => void
}

useSupabaseRowState<T, K extends keyof T = 'id'>(
  table: string,
  rowId: T[K] | null | undefined,
  options?: UseSupabaseRowStateOptions<T, K>
)
```

### Return Value
```ts
[
  data: T | null,              // The row data or null if not found/deleted
  setData: (updater: ((prev: T | null) => T) | T) => void,
  isLoaded: boolean,           // Whether initial fetch has completed
  unsubscribe: () => void     // Function to manually cleanup subscription
]
```

---

## 🧼 Cleanup
The hook automatically cleans up subscriptions on unmount, but you can also unsubscribe manually if needed:
```ts
const [data, setData, loaded, unsubscribe] = useSupabaseRowState('profiles', 'abc')

useEffect(() => {
  // Optional: manual cleanup
  return () => unsubscribe()
}, [])
```

## 🔍 Type Safety
The hook provides strong type safety:
- Generic type `T` for row data shape
- Generic type `K` for primary key (must be a key of `T`)
- Primary key values must be string, number, or bigint
- Null/undefined handling for rowId with skip option
- Type-safe optimistic updates via `setData`

Example with strict types:
```ts
interface User {
  id: string
  name: string
  age: number
}

// ✅ Works - 'id' is keyof User
const [user] = useSupabaseRowState<User>('users', 'abc')

// ✅ Works - 'name' is keyof User
const [user2] = useSupabaseRowState<User, 'name'>('users', 'john', {
  primaryKey: 'name'
})

// ❌ Error - 'invalid' is not keyof User
const [user3] = useSupabaseRowState<User, 'invalid'>('users', 'abc')

// ❌ Error - boolean is not string | number | bigint
const [user4] = useSupabaseRowState<User>('users', true)
```

---

## 📋 License
MIT © Marko Ritachka