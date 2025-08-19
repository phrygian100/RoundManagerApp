export type ServicePlanScheduleType = 'recurring' | 'one_off';

export type ServicePlan = {
	id: string;
	ownerId?: string; // Optional convenience for queries
	clientId: string;
	serviceType: string; // e.g., 'window-cleaning', 'Solar panel cleaning'
	scheduleType: ServicePlanScheduleType;

	// Recurring only
	frequencyWeeks?: number; // 4..52
	startDate?: string; // ISO date string representing the next future occurrence anchor
	lastServiceDate?: string | null; // Hard stop for auto-generation (inclusive)

	// One-off only
	scheduledDate?: string; // ISO date for the single occurrence

	price: number;
	isActive: boolean; // Auto-deactivate when past lastServiceDate
	createdAt?: string;
	updatedAt?: string;
};


