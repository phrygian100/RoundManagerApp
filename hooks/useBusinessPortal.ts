import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../core/firebase';

const PORTAL_API_ORIGIN = 'https://roundmanagerapp.web.app';

export interface BusinessUser {
  id: string;
  businessName: string;
  email: string;
  name: string;
  bankSortCode?: string;
  bankAccountNumber?: string;
}

export { PORTAL_API_ORIGIN };

export function useBusinessPortal() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const [businessUser, setBusinessUser] = useState<BusinessUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState('');
  const isNarrowWeb = Platform.OS === 'web' && width < 640;

  useEffect(() => {
    const extractedName = typeof params.businessName === 'string'
      ? decodeURIComponent(params.businessName)
      : (typeof window !== 'undefined' ? decodeURIComponent(window.location.pathname.split('/')[1] || '') : '');

    if (extractedName) {
      setBusinessName(extractedName);
      lookupBusinessUser(extractedName);
    }
  }, [params.businessName]);

  const lookupBusinessUser = async (name: string) => {
    try {
      setLoading(true);
      const normalizedName = name.replace(/\s+/g, '').toLowerCase();
      const portalDoc = await getDoc(doc(db, 'businessPortals', normalizedName));

      if (portalDoc.exists()) {
        const portalData = portalDoc.data();
        setBusinessUser({
          id: portalData.ownerId,
          businessName: portalData.businessName,
          email: portalData.email || '',
          name: portalData.ownerName || '',
        });
      } else {
        if (typeof window !== 'undefined') {
          window.alert('Business not found. Please check the URL and try again.');
        }
        router.replace('/login');
      }
    } catch (error) {
      console.error('Error looking up business:', error);
      if (typeof window !== 'undefined') {
        window.alert('Unable to load business information. Please try again.');
      }
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigation = (path: string) => {
    if (Platform.OS === 'web') {
      window.location.href = path;
    } else {
      router.push(path as any);
    }
  };

  return {
    businessUser,
    setBusinessUser,
    loading,
    businessName,
    isNarrowWeb,
    handleNavigation,
    router,
  };
}
