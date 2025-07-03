import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getUserSession } from '../core/session';

export type VehicleRecord = {
  id: string;
  name: string;
  dailyRate: number;
};

/**
 * Returns all vehicles for the current account.
 */
export async function listVehicles(): Promise<VehicleRecord[]> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const vehiclesCol = collection(db, `accounts/${sess.accountId}/vehicles`);
  const snap = await getDocs(vehiclesCol);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as VehicleRecord[];
}

/**
 * Adds a new vehicle for the current account.
 */
export async function addVehicle(name: string, dailyRate: number = 0): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const vehiclesCol = collection(db, `accounts/${sess.accountId}/vehicles`);
  const newDoc = doc(vehiclesCol);
  await setDoc(newDoc, { name, dailyRate });
}

/**
 * Updates a vehicle.
 */
export async function updateVehicle(id: string, data: Partial<{ name: string; dailyRate: number }>): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const vehicleRef = doc(db, `accounts/${sess.accountId}/vehicles/${id}`);
  await updateDoc(vehicleRef, data);
}

/**
 * Deletes a vehicle.
 */
export async function deleteVehicle(id: string): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const vehicleRef = doc(db, `accounts/${sess.accountId}/vehicles/${id}`);
  await deleteDoc(vehicleRef);
} 