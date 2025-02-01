import { FeatureFlag } from '../../definition/flag.js';
import { Flag } from '../../classes/Flag.js';
import { getFileFromStorage, uploadFileToStorage } from './storage_utils.js';

export const loadFlags = async () => {
	const flags = JSON.parse((await getFileFromStorage({ type: 'api', path: 'flags.txt' })) || '[]');

	const result: Flag[] = [];

	for (const record of flags) {
		const flag = new Flag(record);
		result.push(flag);
	}

	return result;
};

export const setFlags = async (flags: FeatureFlag[]) => {
	const data = JSON.stringify(flags);
	const path = `flags.txt`;

	await uploadFileToStorage(data, { type: 'api', path });
};
