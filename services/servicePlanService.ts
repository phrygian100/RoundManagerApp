import { addWeeks, isBefore, parseISO } from 'date-fns';
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { ServicePlan } from '../types/servicePlan';

const SERVICE_PLANS_COLLECTION = 'servicePlans';

export async function createServicePlan(plan: Omit<ServicePlan, 'id'>): Promise<string> {
	const ownerId = await getDataOwnerId();
	if (!ownerId) throw new Error('Not authenticated');
	const plansRef = collection(db, SERVICE_PLANS_COLLECTION);
	const now = new Date().toISOString();
	const docRef = await addDoc(plansRef, { ...plan, ownerId, createdAt: now, updatedAt: now });
	return docRef.id;
}

export async function getServicePlansForClient(clientId: string): Promise<ServicePlan[]> {
	const ownerId = await getDataOwnerId();
	if (!ownerId) return [];
	const q = query(collection(db, SERVICE_PLANS_COLLECTION), where('ownerId', '==', ownerId), where('clientId', '==', clientId));
	const snapshot = await getDocs(q);
	return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

export async function getNextFutureAnchor(plan: ServicePlan): Promise<string | null> {
	// Determine the next future date to generate from, never in the past
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	if (plan.scheduleType === 'one_off') {
		return plan.scheduledDate || null;
	}

	// Recurring
	if (!plan.frequencyWeeks) return null;
	let anchor: Date | null = null;
	if (plan.startDate) {
		anchor = parseISO(plan.startDate);
		while (isBefore(anchor, today)) {
			anchor = addWeeks(anchor, plan.frequencyWeeks);
		}
	}

	return anchor ? anchor.toISOString().split('T')[0] : null;
}

export async function deactivatePlanIfPastLastService(planId: string): Promise<void> {
	const ref = doc(db, SERVICE_PLANS_COLLECTION, planId);
	const snap = await getDoc(ref);
	if (!snap.exists()) return;
	const plan = { id: snap.id, ...(snap.data() as any) } as ServicePlan;
	if (!plan.lastServiceDate) return;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const last = parseISO(plan.lastServiceDate);
	if (last < today && plan.isActive) {
		await updateDoc(ref, { isActive: false, updatedAt: new Date().toISOString() });
	}
}


