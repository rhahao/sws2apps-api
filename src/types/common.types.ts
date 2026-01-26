export type GenericObject = Record<string, unknown>;

export type SyncResult<T> = { merged: T; hasChanges: boolean };

export interface GenericError {
	code?: string;
	name?: string;
	$metadata?: {
		httpStatusCode: number;
	};
}

export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: {
		message: string;
		code?: string;
		stack?: string;
	};
}

export interface PaginationParams {
	page?: number;
	limit?: number;
	sortBy?: string;
	sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
	pagination?: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

/**
 * Recursive Partial utility for nested object structures
 */
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends (infer U)[] ? DeepPartial<U>[] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};
