export type AppRoleType =
	| 'admin'
	| 'coordinator'
	| 'secretary'
	| 'service_overseer'
	| 'field_service_group_overseer'
	| 'midweek_schedule'
	| 'weekend_schedule'
	| 'public_talk_schedule'
	| 'attendance_tracking'
	| 'publisher'
	| 'view_schedules'
	| 'elder'
	| 'group_overseers'
	| 'language_group_overseers'
	| 'duties_schedule';

export interface FeatureFlag {
	id: string;
	name: string;
	description: string;
	availability: 'app' | 'user' | 'congregation';
	status: boolean;
	coverage: number;
	installations: string[];
	users: string[];
	congregations: string[];
}

export interface Installation {
	id: string;
	last_used: string
	user: string
}
