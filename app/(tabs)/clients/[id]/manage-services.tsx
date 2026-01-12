import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { ThemedText } from '../../../../components/ThemedText';
import { ThemedView } from '../../../../components/ThemedView';
import { db } from '../../../../core/firebase';
import { getDataOwnerId } from '../../../../core/session';
import type { AdditionalService, Client } from '../../../../types/client';
import type { ServicePlan } from '../../../../types/servicePlan';

type EditablePlan = ServicePlan & { _isEditing?: boolean };

export default function ManageServicesScreen() {
	const { id } = useLocalSearchParams();
	const router = useRouter();
	const clientId = typeof id === 'string' ? id : '';

	const [plans, setPlans] = useState<EditablePlan[]>([]);
	const [client, setClient] = useState<Client | null>(null);
	const [loading, setLoading] = useState(true);
	const [pendingJobs, setPendingJobs] = useState<any[]>([]);
	const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
	const [lastSavedField, setLastSavedField] = useState<string>('');
	const [serviceDrafts, setServiceDrafts] = useState<Record<string, string>>({});
	const [autoConvertAttempted, setAutoConvertAttempted] = useState(false);
	const [additionalServices, setAdditionalServices] = useState<AdditionalService[]>([]);

	// Add Service modal state (ported from client screen)
	const [addModalVisible, setAddModalVisible] = useState(false);
	const [modalMode, setModalMode] = useState<'one-time' | 'recurring'>('one-time');
	// One-time job fields
	const [jobDate, setJobDate] = useState(new Date());
	const [showDatePicker, setShowDatePicker] = useState(false);
	const [jobType, setJobType] = useState('Gutter cleaning');
	const [customJobType, setCustomJobType] = useState('');
	const [jobNotes, setJobNotes] = useState('');
	const [jobPrice, setJobPrice] = useState('');
	// Recurring additional service fields
	const [recurringServiceType, setRecurringServiceType] = useState('Gutter cleaning');
	const [customRecurringServiceType, setCustomRecurringServiceType] = useState('');
	const [recurringFrequency, setRecurringFrequency] = useState(12);
	const [recurringPrice, setRecurringPrice] = useState('');
	const [recurringNextVisit, setRecurringNextVisit] = useState(new Date());
	const [showRecurringDatePicker, setShowRecurringDatePicker] = useState(false);

	// Edit Additional Service modal state
	const [editModalVisible, setEditModalVisible] = useState(false);
	const [selectedService, setSelectedService] = useState<AdditionalService | null>(null);
	const [editServiceType, setEditServiceType] = useState('Gutter cleaning');
	const [editCustomServiceType, setEditCustomServiceType] = useState('');
	const [editServiceFrequency, setEditServiceFrequency] = useState(12);
	const [editServicePrice, setEditServicePrice] = useState('');
	const [editServiceNextVisit, setEditServiceNextVisit] = useState(new Date());
	const [showEditServiceDatePicker, setShowEditServiceDatePicker] = useState(false);

	const [showDatePickerKey, setShowDatePickerKey] = useState<string | null>(null);

	const loadPlans = useMemo(() => async () => {
		if (!clientId) return;
		setLoading(true);
		try {
			// 1) Attempt to load plans, but do not block legacy fetch if this fails
			try {
				const ownerId = await getDataOwnerId();
				if (!ownerId) throw new Error('Missing ownerId (data owner id) for service plan query');
				const plansQuery = query(
					collection(db, 'servicePlans'),
					where('ownerId', '==', ownerId),
					where('clientId', '==', clientId)
				);
				const snap = await getDocs(plansQuery);
				const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as EditablePlan[];
				setPlans(data);
			} catch (plansErr) {
				console.warn('Failed to load service plans', plansErr);
				setPlans([]);
			}

			// 2) Fetch client regardless of plan fetch result
			try {
				const clientSnap = await getDoc(doc(db, 'clients', clientId));
				if (clientSnap.exists()) {
					const c = { id: clientSnap.id, ...(clientSnap.data() as any) } as any;
					setClient(c);
					setAdditionalServices(Array.isArray(c.additionalServices) ? (c.additionalServices as AdditionalService[]) : []);
					console.log('[ManageServices] client legacy fields', {
						frequency: c.frequency,
						nextVisit: c.nextVisit,
						additionalServicesCount: Array.isArray(c.additionalServices) ? c.additionalServices.length : 0,
					});
				}
			} catch (clientErr) {
				console.error('Failed to load client', clientErr);
			}

			// 3) Fetch pending jobs regardless
			try {
				const ownerId = await getDataOwnerId();
				if (!ownerId) throw new Error('Missing ownerId (data owner id) for pending jobs query');
				const jobsSnap = await getDocs(
					query(
						collection(db, 'jobs'),
						where('ownerId', '==', ownerId),
						where('clientId', '==', clientId),
						where('status', 'in', ['pending', 'scheduled', 'in_progress'])
					)
				);
				const jobs = jobsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
				setPendingJobs(jobs);
				console.log('[ManageServices] pending jobs summary', {
					count: jobs.length,
					services: Array.from(new Set(jobs.map(j => j.serviceId))).slice(0, 10),
				});
			} catch (jobsErr) {
				console.error('Failed to load pending jobs', jobsErr);
			}
		} finally {
			setLoading(false);
		}
	}, [clientId]);

	useEffect(() => {
		loadPlans();
	}, [loadPlans]);

	// Auto-convert legacy base schedule on first load so users don't need to click
	useEffect(() => {
		if (autoConvertAttempted) return;
		if (loading) return;
		if (!client) return;
		if (plans.length > 0) return;

		// Determine if a legacy schedule exists (base window-cleaning)
		const c: any = client;
		const rawFreq = c.frequency;
		const parsed = typeof rawFreq === 'number' ? rawFreq : parseInt(String(rawFreq || '').replace(/[^0-9]/g, ''), 10);
		const isRecurring = !!rawFreq && String(rawFreq) !== 'one-off' && !isNaN(parsed);
		const hasWindowJobs = pendingJobs.some(j => (j.serviceId ? j.serviceId === 'window-cleaning' : true));
		const hasNextVisit = !!c.nextVisit;

		if (isRecurring || hasWindowJobs || hasNextVisit) {
			setAutoConvertAttempted(true);
			const nextDate = getNextDateForService(undefined, c.nextVisit) || undefined;
			// Fire-and-forget; loadPlans() runs inside on success
			handleConvertLegacy('window-cleaning', 'recurring', isNaN(parsed) ? 4 : parsed, nextDate, c.quote)
				.catch(err => console.error('Auto-convert legacy failed', err));
		}
	}, [autoConvertAttempted, loading, client, plans.length, pendingJobs]);

	// Helpers to derive legacy next date
	const getNextDateForService = (serviceType?: string, fallback?: string): string | null => {
		const today = new Date(); today.setHours(0,0,0,0);
		let next: string | null = null;
		pendingJobs.forEach(j => {
			if (serviceType) {
				if (j.serviceId !== serviceType) return;
			} else {
				// base window cleaning uses 'window-cleaning'
				if (j.serviceId && j.serviceId !== 'window-cleaning') return;
			}
			if (!j.scheduledTime) return;
			const d = new Date(j.scheduledTime);
			if (d >= today) {
				const iso = d.toISOString().split('T')[0];
				if (!next || iso < next) next = iso;
			}
		});
		return next || fallback || null;
	};

	const handleConvertLegacy = async (serviceType: string, scheduleType: 'recurring' | 'one_off', frequencyWeeks?: number, startDate?: string, price?: number) => {
		try {
			const ownerId = await getDataOwnerId();
			if (!ownerId || !clientId) return;
			const now = new Date().toISOString();
			const base: any = { ownerId, clientId, serviceType, scheduleType, price: Number(price) || 25, isActive: true, lastServiceDate: null, createdAt: now, updatedAt: now };
			if (scheduleType === 'recurring') {
				base.frequencyWeeks = frequencyWeeks || 4;
				base.startDate = startDate || format(new Date(), 'yyyy-MM-dd');
			} else {
				base.scheduledDate = startDate || format(new Date(), 'yyyy-MM-dd');
			}
			await addDoc(collection(db, 'servicePlans'), base);
			await loadPlans();
			Alert.alert('Success', 'Converted legacy service to a plan.');
		} catch (e) {
			console.error('convert legacy failed', e);
			Alert.alert('Error', 'Could not convert legacy service.');
		}
	};

	const updatePlan = async (planId: string, updates: Record<string, any>, fieldName?: string) => {
		try {
			// Find the plan being updated
			const plan = plans.find(p => p.id === planId);
			if (!plan) return;
			
			const batch = writeBatch(db);
			
			// Update the service plan
			const planRef = doc(db, 'servicePlans', planId);
			batch.update(planRef, { ...updates, updatedAt: new Date().toISOString() });
			
			// If service name changed, update pending/scheduled/in_progress jobs to the new serviceId
			if ('serviceType' in updates && updates.serviceType && updates.serviceType !== plan.serviceType) {
				const ownerIdForRename = await getDataOwnerId();
				if (ownerIdForRename) {
					const renameQuery = query(
						collection(db, 'jobs'),
						where('ownerId', '==', ownerIdForRename),
						where('clientId', '==', clientId),
						where('serviceId', '==', plan.serviceType),
						where('status', 'in', ['pending', 'scheduled', 'in_progress'])
					);
					const renameSnap = await getDocs(renameQuery);
					renameSnap.forEach(jobDoc => {
						batch.update(jobDoc.ref, { serviceId: String(updates.serviceType) });
					});
				}
			}
			
			// If price changed, update all pending jobs for this service
			if ('price' in updates && updates.price !== plan.price) {
				const ownerId = await getDataOwnerId();
				if (ownerId) {
					const jobsQuery = query(
						collection(db, 'jobs'),
						where('ownerId', '==', ownerId),
						where('clientId', '==', clientId),
						where('serviceId', '==', plan.serviceType),
						where('status', 'in', ['pending', 'scheduled'])
					);
					const jobsSnapshot = await getDocs(jobsQuery);
					
					jobsSnapshot.forEach(jobDoc => {
						const jobData = jobDoc.data();
						// Only update if the job doesn't have a custom price
						if (!jobData.hasCustomPrice) {
							batch.update(jobDoc.ref, { price: Number(updates.price) });
						}
					});
					
					console.log(`Updating ${jobsSnapshot.size} pending jobs with new price`);
				}
			}
			
			// If schedule changed (frequency or dates), offer to regenerate jobs
			if (('frequencyWeeks' in updates && updates.frequencyWeeks !== plan.frequencyWeeks) ||
			    ('startDate' in updates && updates.startDate !== plan.startDate) ||
			    ('scheduledDate' in updates && updates.scheduledDate !== plan.scheduledDate)) {
				// For now, just update the plan - in a future update we could offer to regenerate jobs
				console.log('Schedule changed - jobs may need to be regenerated');
			}
			
			// Commit all updates
			await batch.commit();
			
			// Update local state
			setPlans(prev => prev.map(p => (p.id === planId ? { ...p, ...updates } : p)));
			
			// Show save confirmation
			if (fieldName) {
				setLastSavedField(fieldName);
			} else {
				setLastSavedField('Changes');
			}
			setShowSaveConfirmation(true);
			setTimeout(() => setShowSaveConfirmation(false), 2000);
			
			// Reload plans to ensure we have the latest data
			await loadPlans();
		} catch (e) {
			console.error('Failed to update plan', e);
			Alert.alert('Error', 'Failed to update plan.');
		}
	};

	return (
		<ThemedView style={styles.container}>
			{showSaveConfirmation && (
				<View style={styles.saveConfirmation}>
					<ThemedText style={styles.saveConfirmationText}>✓ {lastSavedField} saved</ThemedText>
				</View>
			)}
			<View style={styles.headerBar}>
				<ThemedText style={styles.headerTitle}>Manage Services</ThemedText>
				<Pressable style={styles.homeButton} onPress={() => router.back()}>
					<ThemedText style={styles.homeButtonText}>Back</ThemedText>
				</Pressable>
			</View>
			<ScrollView contentContainerStyle={styles.scroll}>
				{/* Existing plans */}
				<View style={styles.section}>
					<ThemedText style={styles.sectionTitle}>Existing Service Plans</ThemedText>
					{loading ? (
						<ThemedText>Loading...</ThemedText>
					) : plans.length === 0 ? (
						<>
							<ThemedText>No service plans found.</ThemedText>
							{client && (
								<View style={[styles.planCard, { marginTop: 12 }]}> 
									{(() => {
										const rawFreq = (client as any).frequency;
										const parsed = typeof rawFreq === 'number' ? rawFreq : parseInt(String(rawFreq || '').replace(/[^0-9]/g, ''), 10);
										const isRecurring = !!rawFreq && String(rawFreq) !== 'one-off' && !isNaN(parsed);
										const hasWindowJobs = pendingJobs.some(j => (j.serviceId ? j.serviceId === 'window-cleaning' : true));
										const hasNextVisit = !!(client as any).nextVisit;
										if (!isRecurring && !hasWindowJobs && !hasNextVisit) return null;
										const nextDate = getNextDateForService(undefined, (client as any).nextVisit);
										const freqLabel = isNaN(parsed) ? '?' : parsed;
										return (
											<>
												<ThemedText style={{ fontWeight: '600', marginBottom: 8 }}>Legacy schedule detected</ThemedText>
												<View style={{ gap: 8 }}>
													<ThemedText>window-cleaning every {freqLabel} weeks — next service: {nextDate || 'N/A'}</ThemedText>
													<Pressable style={[styles.dateButton, { alignSelf: 'flex-start' }]} onPress={() => handleConvertLegacy('window-cleaning', 'recurring', parsed, nextDate || undefined, (client as any).quote)}>
														<ThemedText style={styles.dateButtonText}>Convert to editable plan</ThemedText>
													</Pressable>
												</View>
											</>
										);
									})()}
									{Array.isArray((client as any).additionalServices) && (client as any).additionalServices.length > 0 && (
										<View style={{ marginTop: 8 }}>
											<ThemedText style={{ fontWeight: '600', marginBottom: 4 }}>Legacy additional services</ThemedText>
											{(client as any).additionalServices.filter((s: any) => s.isActive).map((s: any) => {
												const nextDate = getNextDateForService(s.serviceType, s.nextVisit);
												return (
													<View key={s.id} style={{ marginBottom: 8 }}>
														<ThemedText>{s.serviceType} every {s.frequency} weeks — next service: {nextDate || 'N/A'}</ThemedText>
														<Pressable style={[styles.dateButton, { alignSelf: 'flex-start', marginTop: 4 }]} onPress={() => handleConvertLegacy(s.serviceType, 'recurring', s.frequency, nextDate || undefined, s.price)}>
															<ThemedText style={styles.dateButtonText}>Convert to editable plan</ThemedText>
														</Pressable>
													</View>
												);
											})}
										</View>
									)}
								</View>
							)}
						</>
					) : (
						plans.map(plan => (
							<View key={plan.id} style={styles.planCard}>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Service</ThemedText>
									<TextInput
										style={styles.input}
										value={serviceDrafts[plan.id] !== undefined ? serviceDrafts[plan.id] : String(plan.serviceType)}
										onChangeText={v => setServiceDrafts(prev => ({ ...prev, [plan.id]: v }))}
									/>
								</View>
								{serviceDrafts[plan.id] !== undefined && serviceDrafts[plan.id].trim() !== String(plan.serviceType) && (
									<View style={{ alignItems: 'flex-end', marginBottom: 8 }}>
										<Pressable
											style={[styles.dateButton, { backgroundColor: '#4CAF50', borderColor: '#388E3C' }]}
											onPress={async () => {
											const newName = (serviceDrafts[plan.id] || '').trim();
											if (!newName) {
												if (Platform.OS === 'web') {
													alert('Service name cannot be empty.');
												} else {
													Alert.alert('Validation', 'Service name cannot be empty.');
												}
												return;
											}
											await updatePlan(plan.id, { serviceType: newName }, 'Service');
											setServiceDrafts(prev => {
												const cp = { ...prev };
												delete cp[plan.id];
												return cp;
											});
										}}
									>
										<ThemedText style={[styles.dateButtonText, { color: '#fff', fontWeight: 'bold' }]}>Save changes</ThemedText>
									</Pressable>
								</View>
								)}
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Type</ThemedText>
									<ThemedText style={styles.planValue}>{plan.scheduleType === 'recurring' ? 'Recurring' : 'One-off'}</ThemedText>
								</View>

								{plan.scheduleType === 'recurring' ? (
									<>
										<View style={styles.planRow}>
											<ThemedText style={styles.planLabel}>Frequency (weeks)</ThemedText>
											<TextInput
												style={styles.input}
												value={String(plan.frequencyWeeks || '')}
												onChangeText={v => updatePlan(plan.id, { frequencyWeeks: Number(v) || 0 }, 'Frequency')}
												keyboardType="numeric"
											/>
										</View>
										<View style={styles.planRow}>
											<ThemedText style={styles.planLabel}>Next Service</ThemedText>
											{Platform.OS === 'web' ? (
												<input
													type="date"
																											value={plan.startDate || ''}
														onChange={e => updatePlan(plan.id, { startDate: e.target.value }, 'Next Service')}
														style={styles.webDateInput as any}
												/>
											) : (
												<>
													<Pressable style={styles.dateButton} onPress={() => setShowDatePickerKey(`start_${plan.id}`)}>
														<ThemedText style={styles.dateButtonText}>{plan.startDate ? format(parseISO(plan.startDate), 'do MMM yyyy') : 'Set date'}</ThemedText>
													</Pressable>
													{showDatePickerKey === `start_${plan.id}` && (
														<DateTimePicker
															value={plan.startDate ? parseISO(plan.startDate) : new Date()}
															mode="date"
															display={Platform.OS === 'ios' ? 'spinner' : 'default'}
															onChange={(_, selected) => {
																																setShowDatePickerKey(null);
																	if (selected) updatePlan(plan.id, { startDate: format(selected, 'yyyy-MM-dd') }, 'Next Service');
														}}
													/>
												)}
											</>
										)}
										</View>
									</>
								) : (
									<View style={styles.planRow}>
										<ThemedText style={styles.planLabel}>Next Service</ThemedText>
										{Platform.OS === 'web' ? (
											<input
												type="date"
																									value={plan.scheduledDate || ''}
													onChange={e => updatePlan(plan.id, { scheduledDate: e.target.value }, 'Next Service')}
													style={styles.webDateInput as any}
											/>
										) : (
											<>
												<Pressable style={styles.dateButton} onPress={() => setShowDatePickerKey(`sched_${plan.id}`)}>
													<ThemedText style={styles.dateButtonText}>{plan.scheduledDate ? format(parseISO(plan.scheduledDate), 'do MMM yyyy') : 'Set date'}</ThemedText>
												</Pressable>
												{showDatePickerKey === `sched_${plan.id}` && (
													<DateTimePicker
														value={plan.scheduledDate ? parseISO(plan.scheduledDate) : new Date()}
														mode="date"
														display={Platform.OS === 'ios' ? 'spinner' : 'default'}
														onChange={(_, selected) => {
																													setShowDatePickerKey(null);
															if (selected) updatePlan(plan.id, { scheduledDate: format(selected, 'yyyy-MM-dd') }, 'Next Service');
													}}
												/>
											)}
											</>
										)}
									</View>
								)}

																	<View style={styles.planRow}>
										<ThemedText style={styles.planLabel}>Price (£)</ThemedText>
										<TextInput
											style={styles.input}
											value={String(plan.price)}
											onChangeText={v => updatePlan(plan.id, { price: Number(v) || 0 }, 'Price')}
											keyboardType="numeric"
										/>
									</View>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Last Service Date</ThemedText>
									{Platform.OS === 'web' ? (
										<input
											type="date"
																								value={plan.lastServiceDate || ''}
													onChange={e => updatePlan(plan.id, { lastServiceDate: e.target.value || null }, 'Last Service Date')}
													style={styles.webDateInput as any}
										/>
									) : (
										<>
											<Pressable style={styles.dateButton} onPress={() => setShowDatePickerKey(`last_${plan.id}`)}>
												<ThemedText style={styles.dateButtonText}>{plan.lastServiceDate ? format(parseISO(plan.lastServiceDate), 'do MMM yyyy') : 'None'}</ThemedText>
											</Pressable>
											{showDatePickerKey === `last_${plan.id}` && (
												<DateTimePicker
													value={plan.lastServiceDate ? parseISO(plan.lastServiceDate) : new Date()}
													mode="date"
													display={Platform.OS === 'ios' ? 'spinner' : 'default'}
													onChange={(_, selected) => {
																												setShowDatePickerKey(null);
															updatePlan(plan.id, { lastServiceDate: selected ? format(selected, 'yyyy-MM-dd') : null }, 'Last Service Date');
												}}
											/>
											)}
										</>
									)}
								</View>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Active</ThemedText>
									<Switch value={!!plan.isActive} onValueChange={async val => {
										try {
											await updatePlan(plan.id, { isActive: val }, 'Active Status');
											const ownerId = await getDataOwnerId();
											if (!ownerId) return;

											// Build broad jobs query for this client (filter in memory to avoid index gaps)
											const jobsQuery = query(
												collection(db, 'jobs'),
												where('clientId', '==', clientId)
											);

											if (!val) {
												// Turning OFF: delete all future/scheduled jobs for this service
												const jobsSnapshot = await getDocs(jobsQuery);
												for (const jobDoc of jobsSnapshot.docs) {
													const jd: any = jobDoc.data();
													const status = jd.status;
													if (jd.serviceId === plan.serviceType && (status === 'pending' || status === 'scheduled' || status === 'in_progress')) {
														try { await deleteDoc(jobDoc.ref); } catch {}
													}
												}
											} else {
												// Turning ON: regenerate jobs based on current plan
												if (plan.scheduleType === 'recurring' && plan.frequencyWeeks && plan.startDate) {
													const { createJobsForServicePlan } = await import('../../../../services/jobService');
													await createJobsForServicePlan({ ...plan, isActive: true }, client as Client, 52);
												} else if (plan.scheduleType === 'one_off' && plan.scheduledDate) {
													await addDoc(collection(db, 'jobs'), {
														ownerId,
														accountId: ownerId, // Explicitly set accountId for Firestore rules
														clientId,
														providerId: 'test-provider-1',
														serviceId: plan.serviceType,
														propertyDetails: `${client?.address1 || client?.address || ''}, ${client?.town || ''}, ${client?.postcode || ''}`,
														scheduledTime: plan.scheduledDate + 'T09:00:00',
														status: 'pending',
														price: Number(plan.price),
														paymentStatus: 'unpaid',
													});
											}
										}
										await loadPlans();
									} catch (err) {
										console.error('Failed to toggle active state', err);
										if (Platform.OS === 'web') alert('Failed to update active state');
										else Alert.alert('Error', 'Failed to update active state');
									}
									}} />
								</View>
								<View style={[styles.planRow, { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8, marginTop: 8 }]}>
									<Pressable 
										style={[styles.dateButton, { backgroundColor: '#ff9800', borderColor: '#f57c00' }]}
										onPress={async () => {
											const performRegenerate = async () => {
												try {
													const ownerId = await getDataOwnerId();
													if (!ownerId) {
														console.error('No owner ID found');
														if (Platform.OS === 'web') {
															alert('Unable to determine account owner. Please try logging out and back in.');
														} else {
															Alert.alert('Error', 'Unable to determine account owner. Please try logging out and back in.');
														}
														return;
													}
													
													console.log('Starting regenerate for service:', plan.serviceType, 'with ownerId:', ownerId);
													
													// Delete pending jobs for this service
													const jobsQuery = query(
														collection(db, 'jobs'),
														where('ownerId', '==', ownerId),
														where('clientId', '==', clientId),
														where('serviceId', '==', plan.serviceType),
														where('status', 'in', ['pending', 'scheduled'])
													);
													const jobsSnapshot = await getDocs(jobsQuery);
													
													console.log('Found', jobsSnapshot.size, 'jobs to delete');
													
													// Delete jobs one by one instead of batch to handle permission issues better
													let deletedCount = 0;
													
													for (const jobDoc of jobsSnapshot.docs) {
														try {
															const jobData = jobDoc.data();
															console.log('Deleting job:', jobDoc.id, 'with ownerId:', jobData.ownerId);
															
															// Delete directly instead of using batch
															await deleteDoc(jobDoc.ref);
															deletedCount++;
														} catch (deleteError) {
															console.error('Failed to delete job:', jobDoc.id, deleteError);
															// Continue with other deletions even if one fails
														}
													}
													
													console.log('Successfully deleted', deletedCount, 'jobs');
													
													// Generate new jobs based on current schedule
													try {
														if (plan.scheduleType === 'recurring' && plan.frequencyWeeks && plan.startDate) {
															console.log('Creating recurring jobs for plan:', plan);
															const { createJobsForServicePlan } = await import('../../../../services/jobService');
															const jobsCreated = await createJobsForServicePlan(plan, client as Client, 52); // Generate 1 year of jobs
															console.log('Created', jobsCreated, 'new jobs');
														} else if (plan.scheduleType === 'one_off' && plan.scheduledDate) {
															console.log('Creating one-off job for plan:', plan);
															// Create single job for one-off service
															const jobData = {
																ownerId,
																accountId: ownerId, // Explicitly set accountId for Firestore rules
																clientId: clientId,
																providerId: 'test-provider-1',
																serviceId: plan.serviceType,
																propertyDetails: `${client?.address1 || client?.address || ''}, ${client?.town || ''}, ${client?.postcode || ''}`,
																scheduledTime: plan.scheduledDate + 'T09:00:00',
																status: 'pending' as const,
																price: Number(plan.price),
																paymentStatus: 'unpaid' as const,
															};
															await addDoc(collection(db, 'jobs'), jobData);
															console.log('Created one-off job');
														}
													} catch (createError) {
														console.error('Failed to create new jobs:', createError);
														const message = createError instanceof Error ? createError.message : String(createError);
														throw new Error(`Failed to create new jobs: ${message}`);
													}
													
													if (Platform.OS === 'web') {
														alert(`Success! Deleted ${deletedCount} old jobs and regenerated schedule with new settings.`);
													} else {
														Alert.alert('Success', `Deleted ${deletedCount} old jobs and regenerated schedule with new settings.`);
													}
													await loadPlans();
												} catch (error: any) {
													console.error('Failed to regenerate schedule:', error);
													const errorMessage = error?.message || 'Unknown error occurred';
													
													if (Platform.OS === 'web') {
														alert(`Failed to regenerate schedule: ${errorMessage}\n\nPlease check the browser console for more details.`);
													} else {
														Alert.alert('Error', `Failed to regenerate schedule: ${errorMessage}`);
													}
												}
											};
											
											// Show confirmation dialog
											if (Platform.OS === 'web') {
												if (window.confirm('This will delete all pending jobs for this service and create new ones based on the current schedule. Continue?')) {
													await performRegenerate();
												}
											} else {
												Alert.alert(
													'Regenerate Schedule',
													'This will delete all pending jobs for this service and create new ones based on the current schedule. Continue?',
													[
														{ text: 'Cancel', style: 'cancel' },
														{
															text: 'Regenerate',
															style: 'destructive',
															onPress: performRegenerate
														}
													]
												);
											}
										}}
									>
										<ThemedText style={[styles.dateButtonText, { color: '#fff', fontWeight: 'bold' }]}>Regenerate Schedule</ThemedText>
									</Pressable>
									<Pressable 
										style={[styles.dateButton, { backgroundColor: '#1976d2', borderColor: '#0d47a1' }]}
										onPress={() => setAddModalVisible(true)}
									>
										<ThemedText style={[styles.dateButtonText, { color: '#fff', fontWeight: 'bold' }]}>Add Service</ThemedText>
									</Pressable>
								</View>
							</View>
						))
					)}
				</View>

				{/* Additional Services (legacy) */}
				{additionalServices.filter(s => s.isActive).length > 0 && (
				<View style={styles.section}>
						<ThemedText style={styles.sectionTitle}>Additional Services</ThemedText>
						{additionalServices.filter(s => s.isActive).map(s => (
							<Pressable key={s.id} onPress={() => {
								setSelectedService(s);
								const predefinedTypes = ['Gutter cleaning', 'Solar panel cleaning', 'Conservatory roof', 'Soffit and fascias', 'Pressure washing'];
								if (predefinedTypes.includes(s.serviceType)) {
									setEditServiceType(s.serviceType);
									setEditCustomServiceType('');
								} else {
									setEditServiceType('Other');
									setEditCustomServiceType(s.serviceType);
								}
								setEditServiceFrequency(s.frequency);
								setEditServicePrice(String(s.price));
								setEditServiceNextVisit(new Date(s.nextVisit));
								setShowEditServiceDatePicker(false);
								setEditModalVisible(true);
							}}>
							<View style={styles.planCard}>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Service</ThemedText>
									<ThemedText style={styles.planValue}>{s.serviceType}</ThemedText>
								</View>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Frequency (weeks)</ThemedText>
									<ThemedText style={styles.planValue}>{s.frequency}</ThemedText>
								</View>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Next Service</ThemedText>
									<ThemedText style={styles.planValue}>{s.nextVisit}</ThemedText>
								</View>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Price (£)</ThemedText>
									<ThemedText style={styles.planValue}>{s.price}</ThemedText>
								</View>
								<View style={[styles.planRow, { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8, marginTop: 8 }]}>
									<Pressable 
										style={[styles.dateButton, { backgroundColor: '#ff5252', borderColor: '#d32f2f' }]}
										onPress={async () => {
										try {
											if (!clientId) return;
											// Remove from client doc
											const updated = additionalServices.filter(x => x.id !== s.id);
											await updateDoc(doc(db, 'clients', clientId), { additionalServices: updated });
											setAdditionalServices(updated);
											// Delete related jobs (pending/scheduled/in_progress)
											const ownerId = await getDataOwnerId();
											if (!ownerId) throw new Error('Missing ownerId (data owner id) for job cleanup');
											const jobsSnap = await getDocs(
												query(
													collection(db, 'jobs'),
													where('ownerId', '==', ownerId),
													where('clientId', '==', clientId)
												)
											);
											for (const jobDoc of jobsSnap.docs) {
												const jd: any = jobDoc.data();
												const st = jd.status;
												if (jd.serviceId === s.serviceType && (st === 'pending' || st === 'scheduled' || st === 'in_progress')) {
													try { await deleteDoc(jobDoc.ref); } catch {}
												}
											}
										} catch (err) {
											console.error('Failed to delete additional service', err);
										}
									}}
								>
									<ThemedText style={[styles.dateButtonText, { color: '#fff', fontWeight: 'bold' }]}>Delete Service</ThemedText>
								</Pressable>
							</View>
							</View>
							</Pressable>
						))}
					</View>
				)}
			</ScrollView>
		{/* Add Service Modal */}
		<Modal
			animationType="slide"
			transparent={true}
			visible={addModalVisible}
			onRequestClose={() => setAddModalVisible(false)}
		>
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
				<View style={{ width: '90%', maxWidth: 800, backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
					<ThemedText style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Add a New Job</ThemedText>
					<View style={{ flexDirection: 'row', marginBottom: 12 }}>
						<Pressable style={[{ padding: 8, borderRadius: 6, marginRight: 8 }, modalMode === 'one-time' ? { backgroundColor: '#e3f2fd' } : { backgroundColor: '#f5f5f5' }]} onPress={() => setModalMode('one-time')}>
							<ThemedText>One-time Job</ThemedText>
						</Pressable>
						<Pressable style={[{ padding: 8, borderRadius: 6 }, modalMode === 'recurring' ? { backgroundColor: '#e3f2fd' } : { backgroundColor: '#f5f5f5' }]} onPress={() => setModalMode('recurring')}>
							<ThemedText>Additional Recurring Work</ThemedText>
						</Pressable>
					</View>

					{modalMode === 'one-time' ? (
						<>
							<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
								<ThemedText style={{ marginRight: 8 }}>{format(jobDate, 'do MMMM yyyy')}</ThemedText>
								{Platform.OS === 'web' ? (
									<input type="date" value={format(jobDate, 'yyyy-MM-dd')} onChange={e => setJobDate(new Date(e.target.value + 'T00:00:00'))} style={{ padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: 16 }} />
								) : (
									<Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}><ThemedText>📅</ThemedText></Pressable>
								)}
							</View>
							{showDatePicker && Platform.OS !== 'web' && (
								<DateTimePicker value={jobDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowDatePicker(false); if (d) setJobDate(d); }} />
							)}
							<Picker selectedValue={jobType} onValueChange={setJobType} style={styles.picker}>
								<Picker.Item label="Gutter cleaning" value="Gutter cleaning" />
								<Picker.Item label="Conservatory roof" value="Conservatory roof" />
								<Picker.Item label="Soffit and fascias" value="Soffit and fascias" />
								<Picker.Item label="One-off window cleaning" value="One-off window cleaning" />
								<Picker.Item label="Other" value="Other" />
							</Picker>
							{jobType === 'Other' && (
								<TextInput style={styles.input} placeholder="Enter custom job type" value={customJobType} onChangeText={setCustomJobType} />
							)}
							<TextInput style={[styles.input, { minHeight: 80 }]} placeholder="Job Notes" value={jobNotes} onChangeText={setJobNotes} multiline textAlignVertical="top" />
							<TextInput style={styles.input} placeholder="Job Price (£)" value={jobPrice} onChangeText={setJobPrice} keyboardType="numeric" />
							<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
								<Button title="Cancel" color="red" onPress={() => setAddModalVisible(false)} />
								<Button title="Add Job" onPress={async () => {
									if (!clientId) return;
									try {
										const ownerId = await getDataOwnerId();
										if (!ownerId) {
											Alert.alert('Error', 'Could not determine account owner.');
											return;
										}
										await addDoc(collection(db, 'jobs'), {
											ownerId,
											accountId: ownerId, // Explicitly set accountId for Firestore rules
											clientId,
											providerId: 'test-provider-1',
											serviceId: jobType === 'Other' ? customJobType.trim() : jobType,
											propertyDetails: `${client?.address1 || client?.address || ''}, ${client?.town || ''}, ${client?.postcode || ''}`,
											scheduledTime: format(jobDate, 'yyyy-MM-dd') + 'T09:00:00',
											status: 'pending',
											price: Number(jobPrice) || 0,
											paymentStatus: 'unpaid'
										});
										setAddModalVisible(false);
									} catch (e) {
										Alert.alert('Error', 'Failed to add job');
									}
								}} />
							</View>
						</>
					) : (
						<>
							<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
								<ThemedText style={{ marginRight: 8 }}>First visit: {format(recurringNextVisit, 'do MMMM yyyy')}</ThemedText>
							{Platform.OS === 'web' ? (
									<input type="date" value={format(recurringNextVisit, 'yyyy-MM-dd')} onChange={e => setRecurringNextVisit(new Date(e.target.value + 'T00:00:00'))} style={{ padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: 16 }} />
								) : (
									<Pressable style={styles.dateButton} onPress={() => setShowRecurringDatePicker(true)}><ThemedText>📅</ThemedText></Pressable>
								)}
							</View>
							{showRecurringDatePicker && Platform.OS !== 'web' && (
								<DateTimePicker value={recurringNextVisit} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowRecurringDatePicker(false); if (d) setRecurringNextVisit(d); }} />
							)}
							<Picker selectedValue={recurringServiceType} onValueChange={setRecurringServiceType} style={styles.picker}>
								<Picker.Item label="Gutter cleaning" value="Gutter cleaning" />
								<Picker.Item label="Solar panel cleaning" value="Solar panel cleaning" />
								<Picker.Item label="Conservatory roof" value="Conservatory roof" />
								<Picker.Item label="Soffit and fascias" value="Soffit and fascias" />
								<Picker.Item label="Pressure washing" value="Pressure washing" />
								<Picker.Item label="Other" value="Other" />
							</Picker>
							{recurringServiceType === 'Other' && (
								<TextInput style={styles.input} placeholder="Enter custom service type" value={customRecurringServiceType} onChangeText={setCustomRecurringServiceType} />
							)}
							<ThemedText style={{ marginTop: 8, marginBottom: 4 }}>Frequency (weeks)</ThemedText>
							<Picker selectedValue={recurringFrequency} onValueChange={setRecurringFrequency} style={styles.picker}>
								{[4,8,12,16,20,24,28,32,36,40,44,48,52].map(w => <Picker.Item key={w} label={`${w} weeks`} value={w} />)}
							</Picker>
							<TextInput style={styles.input} placeholder="Service Price (£)" value={recurringPrice} onChangeText={setRecurringPrice} keyboardType="numeric" />
							<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
								<Button title="Cancel" color="red" onPress={() => setAddModalVisible(false)} />
								<Button title="Add Recurring Service" onPress={async () => {
									if (!client || !clientId) return;
									const finalType = recurringServiceType === 'Other' ? customRecurringServiceType.trim() : recurringServiceType;
									if (!finalType) { Alert.alert('Error', 'Service type required'); return; }
									try {
										const newService: AdditionalService = { id: Date.now().toString(), serviceType: finalType, frequency: recurringFrequency, price: Number(recurringPrice) || 0, nextVisit: format(recurringNextVisit, 'yyyy-MM-dd'), isActive: true } as any;
										const updated = [...(client.additionalServices || []), newService];
										await updateDoc(doc(db, 'clients', clientId), { additionalServices: updated });
										setAdditionalServices(updated);
										setAddModalVisible(false);
									} catch (e) {
										Alert.alert('Error', 'Failed to add service');
									}
								}} />
							</View>
								</>
							)}
						</View>
			</View>
		</Modal>

		{/* Edit Additional Service Modal */}
		<Modal
			animationType="slide"
			transparent={true}
			visible={editModalVisible}
			onRequestClose={() => setEditModalVisible(false)}
		>
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
				<View style={{ width: '90%', maxWidth: 800, backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
					<ThemedText style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Edit Additional Service</ThemedText>
					<Picker selectedValue={editServiceType} onValueChange={setEditServiceType} style={styles.picker}>
						<Picker.Item label="Gutter cleaning" value="Gutter cleaning" />
						<Picker.Item label="Solar panel cleaning" value="Solar panel cleaning" />
						<Picker.Item label="Conservatory roof" value="Conservatory roof" />
						<Picker.Item label="Soffit and fascias" value="Soffit and fascias" />
						<Picker.Item label="Pressure washing" value="Pressure washing" />
						<Picker.Item label="Other" value="Other" />
					</Picker>
					{editServiceType === 'Other' && (
						<TextInput style={styles.input} placeholder="Enter custom service type" value={editCustomServiceType} onChangeText={setEditCustomServiceType} />
					)}
					<ThemedText style={{ marginTop: 8, marginBottom: 4 }}>Frequency (weeks between visits):</ThemedText>
					<Picker selectedValue={editServiceFrequency} onValueChange={setEditServiceFrequency} style={styles.picker}>
						{[4,8,12,16,20,24,28,32,36,40,44,48,52].map(w => <Picker.Item key={w} label={`${w} weeks`} value={w} />)}
					</Picker>
					<TextInput style={styles.input} placeholder="Service Price (£)" value={editServicePrice} onChangeText={setEditServicePrice} keyboardType="numeric" />
					<View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
						<ThemedText style={{ marginRight: 8 }}>Next visit: {format(editServiceNextVisit, 'do MMMM yyyy')}</ThemedText>
						{Platform.OS === 'web' ? (
							<input type="date" value={format(editServiceNextVisit, 'yyyy-MM-dd')} onChange={e => setEditServiceNextVisit(new Date(e.target.value + 'T00:00:00'))} style={{ padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: 16 }} />
						) : (
							<Pressable style={styles.dateButton} onPress={() => setShowEditServiceDatePicker(true)}><ThemedText>📅</ThemedText></Pressable>
						)}
					</View>
					{showEditServiceDatePicker && Platform.OS !== 'web' && (
						<DateTimePicker value={editServiceNextVisit} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowEditServiceDatePicker(false); if (d) setEditServiceNextVisit(d); }} />
					)}
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
						<Button title="Cancel" color="red" onPress={() => setEditModalVisible(false)} />
						<Button title="Save Changes" onPress={async () => {
							if (!selectedService || !clientId) return;
							const finalType = editServiceType === 'Other' ? editCustomServiceType.trim() : editServiceType;
							try {
								const updatedService: AdditionalService = { ...selectedService, serviceType: finalType, frequency: editServiceFrequency, price: Number(editServicePrice), nextVisit: format(editServiceNextVisit, 'yyyy-MM-dd'), isActive: true } as any;
								const updated = additionalServices.map(s => s.id === updatedService.id ? updatedService : s);
								await updateDoc(doc(db, 'clients', clientId), { additionalServices: updated });
								setAdditionalServices(updated);
								setEditModalVisible(false);
							} catch (e) {
								Alert.alert('Error', 'Failed to update service');
							}
						}} />
					</View>
					</View>
				</View>
		</Modal>

		</ThemedView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	headerBar: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingTop: 50,
		paddingBottom: 10,
		backgroundColor: '#f8f9fa',
		borderBottomWidth: 1,
		borderBottomColor: '#eee',
	},
	headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
	homeButton: { padding: 8, borderRadius: 6, backgroundColor: '#eaf2ff' },
	homeButtonText: { fontSize: 16 },
	scroll: { padding: 20, paddingBottom: 80 },
	section: { marginBottom: 24 },
	sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#333' },
	planCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#eee', marginBottom: 12 },
	planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12 },
	planLabel: { fontWeight: '600', color: '#444', flex: 1 },
	planValue: { color: '#222', flex: 1, textAlign: 'right' },
	input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, backgroundColor: '#fff', minWidth: 80, textAlign: 'right' },
	webDateInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, backgroundColor: '#fff', minWidth: 140 },
	inputRow: { marginBottom: 12 },
	inputLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 6 },
	picker: { height: 44 },
	dateButton: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, backgroundColor: '#fff', minWidth: 140 },
	dateButtonText: { color: '#333' },
	saveConfirmation: {
		position: 'absolute',
		top: 60,
		right: 20,
		backgroundColor: '#4CAF50',
		padding: 12,
		borderRadius: 8,
		zIndex: 1000,
		elevation: 5,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
	},
	saveConfirmationText: {
		color: '#fff',
		fontWeight: 'bold',
		fontSize: 14,
	},
});


