export interface ScheduledTask {
	name: string;
	interval: number; // in milliseconds
	run: () => Promise<void>;
	runOnInit?: boolean;
}
