import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import type { User } from '../types/models';

const USERS_COLLECTION = 'users';

export async function createUserProfile(user: User) {
  const userRef = doc(db, USERS_COLLECTION, user.id);
  await setDoc(userRef, user);
}

export async function getUserProfile(userId: string): Promise<User | null> {
  const userRef = doc(db, USERS_COLLECTION, userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data() as User;
  }
  return null;
}

export async function updateUserProfile(userId: string, data: Partial<User>) {
  const userRef = doc(db, USERS_COLLECTION, userId);
  await updateDoc(userRef, data);
} 