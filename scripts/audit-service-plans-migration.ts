/**
 * Read-only audit to prepare migration from client-coupled routines to servicePlans.
 * - For each active client: derive candidate base plan (window-cleaning) anchor date
 * - For each additional service: derive candidate plan anchor date
 * - Anchor is the next future pending job date if available; otherwise roll forward from client/additional nextVisit
 * - Prints a summary; does not write any data
 */
import { addWeeks, format, isBefore, parseISO } from 'date-fns';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { AdditionalService, Client } from '../types/client';

async function getPendingJobsForClient(clientId: string) {
	const jobsSnap = await getDocs(query(collection(db, 'jobs'), where('clientId', '==', clientId), where('status', 'in', ['pending', 'scheduled', 'in_progress'])));
	return jobsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

function earliestPendingOnOrAfterToday(jobs: any[], serviceId?: string): string | null {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	let next: Date | null = null;
	for (const j of jobs) {
		if (!j.scheduledTime) continue;
		if (serviceId && j.serviceId !== serviceId) continue;
		const d = new Date(j.scheduledTime);
		if (d >= today && (!next || d < next)) next = d;
	}
	return next ? format(next, 'yyyy-MM-dd') : null;
}

function rollForwardToToday(seed: string, frequencyWeeks: number): string {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	let d = parseISO(seed);
	while (isBefore(d, today)) d = addWeeks(d, frequencyWeeks);
	return format(d, 'yyyy-MM-dd');
}

export async function auditServicePlansMigration() {
	const ownerId = await getDataOwnerId();
	if (!ownerId) throw new Error('Not authenticated');
	const clientsSnap = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
	const clients: (Client & { id: string })[] = clientsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

	const report: any[] = [];
	for (const client of clients) {
		const jobs = await getPendingJobsForClient(client.id);

		// Base window-cleaning plan (if applicable)
		if (client.frequency && client.frequency !== 'one-off') {
			const freq = Number(client.frequency);
			let anchor = earliestPendingOnOrAfterToday(jobs, 'window-cleaning');
			if (!anchor && client.nextVisit) anchor = rollForwardToToday(client.nextVisit, freq);
			report.push({
				clientId: client.id,
				clientName: client.name,
				serviceType: 'window-cleaning',
				frequencyWeeks: freq,
				candidateAnchor: anchor || 'MISSING',
				source: anchor ? 'pending_jobs_or_seed_rolled' : 'missing',
			});
		}

		// Additional services
		if (client.additionalServices) {
			for (const s of client.additionalServices as AdditionalService[]) {
				if (!s.isActive) continue;
				let anchor = earliestPendingOnOrAfterToday(jobs, s.serviceType);
				if (!anchor && s.nextVisit) anchor = rollForwardToToday(s.nextVisit, s.frequency);
				report.push({
					clientId: client.id,
					clientName: client.name,
					serviceType: s.serviceType,
					frequencyWeeks: s.frequency,
					candidateAnchor: anchor || 'MISSING',
					source: anchor ? 'pending_jobs_or_seed_rolled' : 'missing',
				});
			}
		}
	}

	// Output concise report
	console.log('Service Plans Migration Audit');
	console.table(report.slice(0, 100));
	console.log(`Total candidates: ${report.length}`);
	const missing = report.filter(r => r.candidateAnchor === 'MISSING');
	if (missing.length) {
		console.warn(`Missing anchors: ${missing.length}`);
	}
}

// If run directly via ts-node/esbuild-runner
if (require.main === module) {
	auditServicePlansMigration().catch(err => {
		console.error(err);
		process.exit(1);
	});
}


