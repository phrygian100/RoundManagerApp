import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../core/firebase';
import { getCurrentUserId } from '../core/supabase';
import type { Client } from '../types/client';
import type { Job } from '../types/models';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  subscribers: Set<() => void>;
}

class FirestoreCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      subscribers: new Set(),
    });
  }

  subscribe(key: string, callback: () => void): () => void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.subscribers.add(callback);
      return () => entry.subscribers.delete(callback);
    }
    return () => {};
  }

  notify(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.subscribers.forEach(callback => callback());
    }
  }

  clear(): void {
    this.cache.clear();
  }

  clearEntry(key: string): void {
    this.cache.delete(key);
  }
}

const globalCache = new FirestoreCache();

export function useFirestoreCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  dependencies: any[] = []
): { data: T | null; loading: boolean; error: Error | null; refetch: () => Promise<void> } {
  const [data, setData] = useState<T | null>(() => globalCache.get(key));
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      if (!abortControllerRef.current.signal.aborted) {
        globalCache.set(key, result);
        setData(result);
        globalCache.notify(key);
      }
    } catch (err) {
      if (!abortControllerRef.current.signal.aborted) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    } finally {
      if (!abortControllerRef.current.signal.aborted) {
        setLoading(false);
      }
    }
  }, [key, ...dependencies]);

  useEffect(() => {
    if (!data) {
      fetchData();
    }
    
    const unsubscribe = globalCache.subscribe(key, () => {
      const cachedData = globalCache.get<T>(key);
      if (cachedData) {
        setData(cachedData);
        setLoading(false);
        setError(null);
      }
    });

    return () => {
      unsubscribe();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [key, data, fetchData]);

  const refetch = useCallback(async () => {
    globalCache.clearEntry(key);
    setData(null);
    await fetchData();
  }, [key, fetchData]);

  return { data, loading, error, refetch };
}

// Specialized hooks for common data types
export function useClients() {
  return useFirestoreCache<Client[]>(
    'clients',
    async () => {
      const ownerId = await getCurrentUserId();
      if (!ownerId) return [];
      const q = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
    }
  );
}

export function useJobsForWeek(startDate: string, endDate: string) {
  return useFirestoreCache<(Job & { client: Client | null })[]>(
    `jobs-${startDate}-${endDate}`,
    async () => {
      const ownerId = await getCurrentUserId();
      if (!ownerId) return [];
      const jobsRef = collection(db, 'jobs');
      const q = query(
        jobsRef,
        where('ownerId', '==', ownerId),
        where('scheduledTime', '>=', startDate + 'T00:00:00'),
        where('scheduledTime', '<', endDate + 'T00:00:00')
      );
      const querySnapshot = await getDocs(q);
      const jobs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      
      // Get unique client IDs
      const clientIds = [...new Set(jobs.map(job => job.clientId))];
      
      // Fetch clients in batches
      const clientChunks = [];
      for (let i = 0; i < clientIds.length; i += 30) {
        clientChunks.push(clientIds.slice(i, i + 30));
      }
      
      const clientsMap = new Map<string, Client>();
      const clientPromises = clientChunks.map(chunk => 
        getDocs(query(collection(db, 'clients'), where('__name__', 'in', chunk)))
      );
      const clientSnapshots = await Promise.all(clientPromises);
      
      clientSnapshots.forEach(snapshot => {
        snapshot.forEach(docSnap => {
          clientsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Client);
        });
      });
      
      return jobs.map(job => ({
        ...job,
        client: clientsMap.get(job.clientId) || null,
      }));
    },
    [startDate, endDate]
  );
}

export function useAccountedJobs() {
  return useFirestoreCache<(Job & { client: Client | null })[]>(
    'accounted-jobs',
    async () => {
      const ownerId = await getCurrentUserId();
      if (!ownerId) return [];
      const jobsRef = collection(db, 'jobs');
      const accountedJobsQuery = query(jobsRef, where('ownerId', '==', ownerId), where('status', '==', 'accounted'));
      const querySnapshot = await getDocs(accountedJobsQuery);
      
      const jobs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      
      // Get unique client IDs
      const clientIds = [...new Set(jobs.map(job => job.clientId))];
      
      // Fetch clients in batches
      const clientChunks = [];
      for (let i = 0; i < clientIds.length; i += 30) {
        clientChunks.push(clientIds.slice(i, i + 30));
      }
      
      const clientsMap = new Map<string, Client>();
      const clientPromises = clientChunks.map(chunk => 
        getDocs(query(collection(db, 'clients'), where('__name__', 'in', chunk)))
      );
      const clientSnapshots = await Promise.all(clientPromises);
      
      clientSnapshots.forEach(snapshot => {
        snapshot.forEach(docSnap => {
          clientsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Client);
        });
      });
      
      const jobsWithClients = jobs.map(job => ({
        ...job,
        client: clientsMap.get(job.clientId) || null,
      }));
      
      // Sort by scheduled time (most recent first)
      return jobsWithClients.sort((a, b) => 
        new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime()
      );
    }
  );
} 