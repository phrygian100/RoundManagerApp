import { getFunctions, httpsCallable } from 'firebase/functions';

export type VehicleRecord = {
  id: string;
  name: string;
  dailyRate: number;
};

/**
 * Returns all vehicles for the current account.
 */
export async function listVehicles(): Promise<VehicleRecord[]> {
  const listVehiclesFn = httpsCallable(getFunctions(), 'listVehicles');
  const result = await listVehiclesFn();
  return result.data as VehicleRecord[];
}

/**
 * Adds a new vehicle for the current account.
 */
export async function addVehicle(name: string, dailyRate: number = 0): Promise<void> {
  const addVehicleFn = httpsCallable(getFunctions(), 'addVehicle');
  await addVehicleFn({ name, dailyRate });
}

/**
 * Updates a vehicle.
 */
export async function updateVehicle(id: string, data: Partial<{ name: string; dailyRate: number }>): Promise<void> {
  const updateVehicleFn = httpsCallable(getFunctions(), 'updateVehicle');
  await updateVehicleFn({ id, data });
}

/**
 * Deletes a vehicle.
 */
export async function deleteVehicle(id: string): Promise<void> {
  const deleteVehicleFn = httpsCallable(getFunctions(), 'deleteVehicle');
  await deleteVehicleFn({ id });
} 