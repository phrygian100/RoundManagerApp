import React from 'react';
import { getUserSession } from '../core/session';

interface PermissionGateProps {
  perm: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

const PermissionGate: React.FC<PermissionGateProps> = ({ perm, fallback = null, children }) => {
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    (async () => {
      const sess = await getUserSession();
      if (!sess) {
        setAllowed(false);
      } else if (perm === 'isOwner') {
        setAllowed(sess.isOwner);
      } else if (sess.isOwner) {
        setAllowed(true);
      } else {
        setAllowed(Boolean(sess.perms?.[perm]));
      }
    })();
  }, [perm]);

  if (allowed === null) return null; // or a spinner
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
};

export default PermissionGate; 