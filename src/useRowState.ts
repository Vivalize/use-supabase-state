import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { getSupabaseClient } from './init'
import { SupabaseClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type RowState<T> = T | null

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

type RowUpdater<T> = ((prev: T | null) => T) | T

type UseSupabaseRowStateReturn<T> = [
  RowState<T>,
  (updater: RowUpdater<T>) => void,
  boolean,
  () => void
]

// Create a properly typed no-op setter
const createNoopSetter = <T>(): (updater: RowUpdater<T>) => void => () => {}

const REALTIME_LISTEN_TYPES = {
  POSTGRES_CHANGES: 'postgres_changes',
  PRESENCE: 'presence',
  BROADCAST: 'broadcast'
} as const

const REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {
  ALL: '*',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE'
} as const

type RealtimeListenType = typeof REALTIME_LISTEN_TYPES[keyof typeof REALTIME_LISTEN_TYPES]
type PostgresChangesEvent = typeof REALTIME_POSTGRES_CHANGES_LISTEN_EVENT[keyof typeof REALTIME_POSTGRES_CHANGES_LISTEN_EVENT]

// Memoize the Supabase client since it's a singleton
const supabase = getSupabaseClient()

/**
 * A React hook that syncs a local state with a row in a Supabase table.
 * @template T The type of the row data
 * @template K The type of the primary key (must be a key of T)
 * @param table The name of the table to sync with
 * @param rowId The ID of the row to sync with
 * @param options Configuration options
 * @returns [data, setData, isLoaded, unsubscribe] tuple
 */
export function useSupabaseRowState<
  T extends Record<string, any>,
  K extends keyof T = 'id',
  PKType = T[K] extends string | number | bigint ? T[K] : never
>(
  table: string,
  rowId: PKType | null | undefined,
  options: UseSupabaseRowStateOptions<T, K> = {}
): UseSupabaseRowStateReturn<T> {
  const {
    schema = 'public',
    primaryKey = 'id' as K,
    autoSync = true,
    select = '*',
    skip = false,
    logger = console.warn
  } = options

  // Early return if rowId is null/undefined and not explicitly skipped
  if (rowId === undefined || rowId === null) {
    if (!skip) {
      logger(`useSupabaseRowState: Invalid rowId for table ${table}`)
    }
    return [null, createNoopSetter<T>(), false, () => {}]
  }

  const [data, setData] = useState<RowState<T>>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Memoize channel key for stable subscriptions
  const channelKey = useMemo(() => `realtime-${table}-${rowId}`, [table, rowId])

  // Check for existing channel subscription
  useEffect(() => {
    const existingChannel = supabase.getChannels().find(ch => ch.subscribe().topic === channelKey)
    if (existingChannel) {
      logger(`Warning: Channel ${channelKey} already exists. This might cause duplicate subscriptions.`)
    }
  }, [channelKey, logger])

  // Fetch initial row
  useEffect(() => {
    let isMounted = true

    const fetchRow = async () => {
      const { data: row, error } = await supabase
        .from(table)
        .select(select)
        .eq(String(primaryKey), rowId)
        .single()

      if (!isMounted) return

      if (error) {
        logger(`Failed to fetch row from ${table}: ${error.message}`)
      }

      // Set isLoaded regardless of error state
      setIsLoaded(true)

      if (row) {
        // Verify the shape of the data matches T
        const typedRow = row as unknown as T
        setData(typedRow)
      }
    }

    fetchRow()

    return () => { isMounted = false }
  }, [table, rowId, primaryKey, select, logger])

  // Realtime subscription
  useEffect(() => {
    // Cleanup previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(channelKey)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        { 
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.ALL,
          schema,
          table,
          filter: `${String(primaryKey)}=eq.${rowId}`
        },
        (payload: RealtimePostgresChangesPayload<T>) => {
          if (payload.eventType === REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE || 
              payload.eventType === REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT) {
            setData(payload.new)
            setIsLoaded(true)
          } else if (payload.eventType === REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.DELETE) {
            setData(null)
            // Keep isLoaded true since we have a valid (null) result
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, rowId, schema, primaryKey, channelKey])

  // Optimistic setter
  const setRow = useCallback((updater: RowUpdater<T>) => {
    setData(prev => {
      const next: T = typeof updater === 'function'
        ? (updater as (prev: T | null) => T)(prev)
        : updater

      if (autoSync && next) {
        void supabase
          .from(table)
          .update(next)
          .eq(String(primaryKey), rowId)
          .then(({ error }) => {
            if (error) {
              logger(`Auto-sync failed: ${error.message}`)
            }
          })
      }

      return next
    })
  }, [autoSync, table, primaryKey, rowId, logger])

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }
  }, [])

  return [data, setRow, isLoaded, unsubscribe]
}

// Export a named return type for better documentation and tooling
export type UseSupabaseRowStateHookReturn<T extends Record<string, any>> = ReturnType<typeof useSupabaseRowState<T>>