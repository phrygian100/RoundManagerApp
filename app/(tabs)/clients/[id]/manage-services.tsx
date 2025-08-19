import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { ThemedText } from '../../../../components/ThemedText';
import { ThemedView } from '../../../../components/ThemedView';
import { db } from '../../../../core/firebase';
import { getDataOwnerId } from '../../../../core/session';
import type { ServicePlan } from '../../../../types/servicePlan';

type EditablePlan = ServicePlan & { _isEditing?: boolean };

export default function ManageServicesScreen() {
	const { id } = useLocalSearchParams();
	const router = useRouter();
	const clientId = typeof id === 'string' ? id : '';

	const [plans, setPlans] = useState<EditablePlan[]>([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);

	// New plan state
	const [newServiceType, setNewServiceType] = useState('window-cleaning');
	const [newScheduleType, setNewScheduleType] = useState<'recurring' | 'one_off'>('recurring');
	const [newFrequency, setNewFrequency] = useState('4');
	const [newStartDate, setNewStartDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
	const [newScheduledDate, setNewScheduledDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
	const [newLastServiceDate, setNewLastServiceDate] = useState<string>('');
	const [newPrice, setNewPrice] = useState<string>('25');
	const [showDatePickerKey, setShowDatePickerKey] = useState<string | null>(null);

	const loadPlans = useMemo(() => async () => {
		if (!clientId) return;
		setLoading(true);
		try {
			const ownerId = await getDataOwnerId();
			if (!ownerId) {
				setPlans([]);
				return;
			}
			const q = query(collection(db, 'servicePlans'), where('ownerId', '==', ownerId), where('clientId', '==', clientId));
			const snap = await getDocs(q);
			const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as EditablePlan[];
			setPlans(data);
		} catch (e) {
			console.error('Failed to load service plans', e);
		} finally {
			setLoading(false);
		}
	}, [clientId]);

	useEffect(() => {
		loadPlans();
	}, [loadPlans]);

	const handleCreate = async () => {
		if (!clientId) return;
		setCreating(true);
		try {
			const ownerId = await getDataOwnerId();
			if (!ownerId) {
				Alert.alert('Error', 'Could not determine account owner.');
				return;
			}
			const now = new Date().toISOString();
			const base: any = {
				ownerId,
				clientId,
				serviceType: newServiceType,
				scheduleType: newScheduleType,
				price: Number(newPrice) || 25,
				isActive: true,
				lastServiceDate: newLastServiceDate ? newLastServiceDate : null,
				createdAt: now,
				updatedAt: now,
			};
			if (newScheduleType === 'recurring') {
				const freq = Number(newFrequency);
				if (!freq || freq <= 0) {
					Alert.alert('Error', 'Frequency must be a positive number of weeks.');
					return;
				}
				base.frequencyWeeks = freq;
				base.startDate = newStartDate;
			} else {
				base.scheduledDate = newScheduledDate;
			}
			await addDoc(collection(db, 'servicePlans'), base);
			await loadPlans();
			Alert.alert('Success', 'Service plan created.');
		} catch (e) {
			console.error('Failed to create plan', e);
			Alert.alert('Error', 'Failed to create service plan.');
		} finally {
			setCreating(false);
		}
	};

	const updatePlan = async (planId: string, updates: Record<string, any>) => {
		try {
			await updateDoc(doc(db, 'servicePlans', planId), { ...updates, updatedAt: new Date().toISOString() });
			setPlans(prev => prev.map(p => (p.id === planId ? { ...p, ...updates } : p)));
		} catch (e) {
			console.error('Failed to update plan', e);
			Alert.alert('Error', 'Failed to update plan.');
		}
	};

	return (
		<ThemedView style={styles.container}>
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
						<ThemedText>No service plans found.</ThemedText>
					) : (
						plans.map(plan => (
							<View key={plan.id} style={styles.planCard}>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Service</ThemedText>
									<ThemedText style={styles.planValue}>{plan.serviceType}</ThemedText>
								</View>
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
												onChangeText={v => updatePlan(plan.id, { frequencyWeeks: Number(v) || 0 })}
												keyboardType="numeric"
											/>
										</View>
										<View style={styles.planRow}>
											<ThemedText style={styles.planLabel}>Next Anchor</ThemedText>
											{Platform.OS === 'web' ? (
												<input
													type="date"
													value={plan.startDate || ''}
													onChange={e => updatePlan(plan.id, { startDate: e.target.value })}
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
																if (selected) updatePlan(plan.id, { startDate: format(selected, 'yyyy-MM-dd') });
															}}
														/>
													)}
												</>
											)}
										</View>
									</>
								) : (
									<View style={styles.planRow}>
										<ThemedText style={styles.planLabel}>Scheduled Date</ThemedText>
										{Platform.OS === 'web' ? (
											<input
												type="date"
												value={plan.scheduledDate || ''}
												onChange={e => updatePlan(plan.id, { scheduledDate: e.target.value })}
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
															if (selected) updatePlan(plan.id, { scheduledDate: format(selected, 'yyyy-MM-dd') });
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
										onChangeText={v => updatePlan(plan.id, { price: Number(v) || 0 })}
										keyboardType="numeric"
									/>
								</View>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Last Service Date</ThemedText>
									{Platform.OS === 'web' ? (
										<input
											type="date"
											value={plan.lastServiceDate || ''}
											onChange={e => updatePlan(plan.id, { lastServiceDate: e.target.value || null })}
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
														updatePlan(plan.id, { lastServiceDate: selected ? format(selected, 'yyyy-MM-dd') : null });
													}}
												/>
											)}
										</>
									)}
								</View>
								<View style={styles.planRow}>
									<ThemedText style={styles.planLabel}>Active</ThemedText>
									<Switch value={!!plan.isActive} onValueChange={val => updatePlan(plan.id, { isActive: val })} />
								</View>
							</View>
						))
					)}
				</View>

				{/* Create new plan */}
				<View style={styles.section}>
					<ThemedText style={styles.sectionTitle}>Add Service Plan</ThemedText>
					<View style={styles.inputRow}> 
						<ThemedText style={styles.inputLabel}>Service Type</ThemedText>
						<TextInput style={styles.input} value={newServiceType} onChangeText={setNewServiceType} placeholder="e.g. window-cleaning" />
					</View>
					<View style={styles.inputRow}>
						<ThemedText style={styles.inputLabel}>Schedule</ThemedText>
						<Picker selectedValue={newScheduleType} onValueChange={v => setNewScheduleType(v)} style={styles.picker}>
							<Picker.Item label="Recurring" value="recurring" />
							<Picker.Item label="One-off" value="one_off" />
						</Picker>
					</View>
					{newScheduleType === 'recurring' ? (
						<>
							<View style={styles.inputRow}>
								<ThemedText style={styles.inputLabel}>Frequency (weeks)</ThemedText>
								<TextInput style={styles.input} value={newFrequency} onChangeText={setNewFrequency} keyboardType="numeric" placeholder="4" />
							</View>
							<View style={styles.inputRow}>
								<ThemedText style={styles.inputLabel}>Next Anchor</ThemedText>
								{Platform.OS === 'web' ? (
									<input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} style={styles.webDateInput as any} />
								) : (
									<>
										<Pressable style={styles.dateButton} onPress={() => setShowDatePickerKey('new_start')}>
											<ThemedText style={styles.dateButtonText}>{newStartDate ? format(parseISO(newStartDate), 'do MMM yyyy') : 'Set date'}</ThemedText>
										</Pressable>
										{showDatePickerKey === 'new_start' && (
											<DateTimePicker value={parseISO(newStartDate)} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowDatePickerKey(null); if (d) setNewStartDate(format(d, 'yyyy-MM-dd')); }} />
										)}
									</>
								)}
							</View>
						</>
					) : (
						<View style={styles.inputRow}>
							<ThemedText style={styles.inputLabel}>Scheduled Date</ThemedText>
							{Platform.OS === 'web' ? (
								<input type="date" value={newScheduledDate} onChange={e => setNewScheduledDate(e.target.value)} style={styles.webDateInput as any} />
							) : (
								<>
									<Pressable style={styles.dateButton} onPress={() => setShowDatePickerKey('new_sched')}>
										<ThemedText style={styles.dateButtonText}>{newScheduledDate ? format(parseISO(newScheduledDate), 'do MMM yyyy') : 'Set date'}</ThemedText>
									</Pressable>
									{showDatePickerKey === 'new_sched' && (
										<DateTimePicker value={parseISO(newScheduledDate)} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowDatePickerKey(null); if (d) setNewScheduledDate(format(d, 'yyyy-MM-dd')); }} />
									)}
								</>
							)}
						</View>
					)}
					<View style={styles.inputRow}>
						<ThemedText style={styles.inputLabel}>Last Service Date</ThemedText>
						{Platform.OS === 'web' ? (
							<input type="date" value={newLastServiceDate} onChange={e => setNewLastServiceDate(e.target.value)} style={styles.webDateInput as any} />
						) : (
							<>
								<Pressable style={styles.dateButton} onPress={() => setShowDatePickerKey('new_last')}>
									<ThemedText style={styles.dateButtonText}>{newLastServiceDate ? format(parseISO(newLastServiceDate), 'do MMM yyyy') : 'None'}</ThemedText>
								</Pressable>
								{showDatePickerKey === 'new_last' && (
									<DateTimePicker value={newLastServiceDate ? parseISO(newLastServiceDate) : new Date()} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowDatePickerKey(null); setNewLastServiceDate(d ? format(d, 'yyyy-MM-dd') : ''); }} />
								)}
							</>
						)}
					</View>
					<View style={styles.inputRow}>
						<ThemedText style={styles.inputLabel}>Price (£)</ThemedText>
						<TextInput style={styles.input} value={newPrice} onChangeText={setNewPrice} keyboardType="numeric" placeholder="25" />
					</View>
					<Button title={creating ? 'Creating...' : 'Create Plan'} onPress={handleCreate} disabled={creating} />
				</View>
			</ScrollView>
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
});


