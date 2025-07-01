import { format, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { getUserSession } from '../core/session';

export default function RunsheetScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    const checkPermissionsAndRedirect = async () => {
      try {
        console.log('🚀 RUNSHEET: Starting permission check...');
        
        const session = await getUserSession();
        console.log('🚀 RUNSHEET: Session loaded:', session);
        
        if (!session) {
          setError('Not logged in');
          setLoading(false);
          return;
        }

        // OWNER FIRST: Owners should ALWAYS have access
        const isOwner = session.isOwner;
        const hasRunsheetPerm = session.perms?.viewRunsheet;
        const canAccess = isOwner || hasRunsheetPerm;
        
        setDebugInfo(`isOwner: ${isOwner}, hasRunsheetPerm: ${hasRunsheetPerm}, canAccess: ${canAccess}`);
        console.log('🚀 RUNSHEET: Permission check result:', { isOwner, hasRunsheetPerm, canAccess });

        if (canAccess) {
          // Generate current week and redirect
          const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
          const weekParam = format(currentWeek, 'yyyy-MM-dd');
          console.log('🚀 RUNSHEET: Redirecting to week (param):', weekParam);
          
          // Use replace with explicit pathname + params to avoid issues with special characters in the slug
          router.replace({ pathname: '/runsheet/[week]', params: { week: weekParam } });
        } else {
          setError('No permission to view runsheets');
          setLoading(false);
        }
      } catch (err) {
        console.error('🚀 RUNSHEET: Error:', err);
        setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    checkPermissionsAndRedirect();
  }, [router]);

  if (loading) {
    return (
      <div style={{ padding: '20px', fontSize: '16px' }}>
        <h2>🔄 Loading Runsheet...</h2>
        <p>Checking permissions and redirecting...</p>
        {debugInfo && <p style={{ color: '#666' }}>Debug: {debugInfo}</p>}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', fontSize: '16px' }}>
        <h2>❌ Access Denied</h2>
        <p>{error}</p>
        {debugInfo && <p style={{ color: '#666' }}>Debug: {debugInfo}</p>}
        <button onClick={() => router.replace('/')} style={{ padding: '10px 20px', marginTop: '10px' }}>
          🏠 Go Home
        </button>
      </div>
    );
  }

  // This should not be reached due to redirect, but just in case
  return (
    <div style={{ padding: '20px', fontSize: '16px' }}>
      <h2>🔄 Redirecting to current week...</h2>
      <p>If you see this message, the redirect may have failed.</p>
      <button onClick={() => router.replace('/')} style={{ padding: '10px 20px', marginTop: '10px' }}>
        🏠 Go Home
      </button>
    </div>
  );
} 