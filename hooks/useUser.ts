import { useState } from 'react';
import { getUserProfile, updateUserProfile } from '../services/userService';
import type { User } from '../types/models';

export function useUser(initialUser: User | null = null) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(false);

  const fetchUserProfile = async (userId: string) => {
    setLoading(true);
    const profile = await getUserProfile(userId);
    setUser(profile);
    setLoading(false);
    return profile;
  };

  const updateProfile = async (userId: string, data: Partial<User>) => {
    setLoading(true);
    await updateUserProfile(userId, data);
    // Optionally refetch or update local state
    setUser((prev) => (prev ? { ...prev, ...data } : prev));
    setLoading(false);
  };

  return {
    user,
    setUser,
    loading,
    fetchUserProfile,
    updateProfile,
  };
} 