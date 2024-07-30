import {
	CircuitRecordType,
	CongregationBackupType,
	CongregationPersonType,
	CongregationRequestPendingType,
	IncomingSpeakersType,
	MeetingRecordType,
	OutgoingSpeakersAccessStorageType,
	OutgoingSpeakersRecordType,
	SpeakersCongregationType,
	VisitingSpeakerType,
} from '../denifition/congregation.js';
import {
	dbCongregationLoadDetails,
	dbCongregationSaveBackup,
	dbCongregationSaveMasterKey,
	dbCongregationSaveAccessCode,
	dbCongregationRequestAccess,
	dbCongregationApproveAccessRequest,
	dbCongregationRejectAccessRequest,
} from '../services/firebase/congregations.js';
import { CongregationsList } from './Congregations.js';
import { User } from './User.js';
import { UsersList } from './Users.js';

export class Congregation {
	id: string;
	country_code: string;
	cong_name: string;
	cong_number: string;
	cong_location: { address: string; lat: number | null; lng: number | null };
	cong_circuit: CircuitRecordType[];
	midweek_meeting: MeetingRecordType[];
	weekend_meeting: MeetingRecordType[];
	cong_members: User[];
	cong_master_key: string;
	cong_access_code: string;
	cong_outgoing_speakers: OutgoingSpeakersRecordType;
	cong_discoverable: { value: boolean; updatedAt: string };
	last_backup: string;
	cong_persons: CongregationPersonType[];
	speakers_congregations: SpeakersCongregationType[];
	visiting_speakers: VisitingSpeakerType[];

	constructor(id: string) {
		this.id = id;
		this.country_code = '';
		this.cong_name = '';
		this.cong_number = '';
		this.cong_location = { lat: null, lng: null, address: '' };
		this.cong_circuit = [{ type: 'main', name: '' }];
		this.cong_members = [];
		this.cong_master_key = '';
		this.cong_access_code = '';
		this.midweek_meeting = [{ type: 'main', weekday: null, time: '' }];
		this.weekend_meeting = [{ type: 'main', weekday: null, time: '' }];
		this.cong_outgoing_speakers = { list: [], speakers_key: '', access: [] };
		this.cong_discoverable = { value: false, updatedAt: '' };
		this.last_backup = '';
		this.cong_persons = [];
		this.speakers_congregations = [];
		this.visiting_speakers = [];
	}

	async loadDetails() {
		const data = await dbCongregationLoadDetails(this.id);

		this.cong_master_key = data.cong_master_key;
		this.cong_access_code = data.cong_access_code;
		this.cong_name = data.cong_name;
		this.cong_number = data.cong_number;
		this.country_code = data.country_code;
		this.cong_location = data.cong_location;
		this.cong_circuit = data.cong_circuit;
		this.midweek_meeting = data.midweek_meeting;
		this.weekend_meeting = data.weekend_meeting;
		this.cong_discoverable = data.cong_discoverable;
		this.cong_persons = data.cong_persons;
		this.cong_outgoing_speakers = data.cong_outgoing_speakers;
		this.speakers_congregations = data.speakers_congregations;
		this.visiting_speakers = data.visiting_speakers;
		this.last_backup = data.last_backup || '';

		this.reloadMembers();
	}

	async saveBackup(cong_backup: CongregationBackupType) {
		const data: CongregationBackupType = {};

		if (cong_backup.cong_settings) {
			data.cong_settings = {};

			if (cong_backup.cong_settings.cong_discoverable) {
				if (cong_backup.cong_settings.cong_discoverable.updatedAt > this.cong_discoverable.updatedAt) {
					data.cong_settings.cong_discoverable = cong_backup.cong_settings.cong_discoverable;
				}
			}
		}

		data.cong_persons = cong_backup.cong_persons;
		data.speakers_key = cong_backup.speakers_key;
		data.outgoing_speakers = cong_backup.outgoing_speakers;
		data.speakers_congregations = cong_backup.speakers_congregations;
		data.visiting_speakers = cong_backup.visiting_speakers;

		const lastBackup = await dbCongregationSaveBackup(this.id, data);

		if (data.cong_persons) {
			this.cong_persons = data.cong_persons;
		}

		if (data.speakers_key) {
			this.cong_outgoing_speakers.speakers_key = data.speakers_key;
		}

		if (data.speakers_congregations) {
			this.speakers_congregations = data.speakers_congregations;
		}

		if (data.visiting_speakers) {
			this.visiting_speakers = data.visiting_speakers;
		}

		if (data.outgoing_speakers) {
			this.cong_outgoing_speakers.list = data.outgoing_speakers;
		}

		if (data.cong_settings) {
			if (data.cong_settings.cong_discoverable) {
				this.cong_discoverable = data.cong_settings.cong_discoverable;
			}
		}

		this.last_backup = lastBackup;
	}

	async saveMasterKey(key: string) {
		await dbCongregationSaveMasterKey(this.id, key);
		this.cong_master_key = key;
	}

	async saveAccessCode(code: string) {
		await dbCongregationSaveAccessCode(this.id, code);
		this.cong_access_code = code;
	}

	hasMember(auth_uid: string) {
		const user = UsersList.findByAuthUid(auth_uid);
		return user!.cong_id === this.id;
	}

	reloadMembers() {
		const cong_members: User[] = [];

		for (const user of UsersList.list) {
			if (user.cong_id === this.id) {
				cong_members.push(user);
			}
		}

		this.cong_members = cong_members;
	}

	getVisitingSpeakersAccessList() {
		const approvedCong = this.cong_outgoing_speakers.access.filter((record) => record.status === 'approved');

		const result = approvedCong.map((cong) => {
			const foundCong = CongregationsList.findById(cong.cong_id)!;

			return {
				cong_id: cong.cong_id,
				request_id: cong.request_id,
				cong_number: foundCong.cong_number,
				cong_name: foundCong.cong_name,
			};
		});

		return result;
	}

	async requestAccessCongregation(cong_id: string, key: string, request_id: string) {
		await dbCongregationRequestAccess(this.id, cong_id, key, request_id);
	}

	getPendingVisitingSpeakersAccessList() {
		const pendingCong = this.cong_outgoing_speakers.access.filter((record) => record.status === 'pending');

		const result: CongregationRequestPendingType[] = pendingCong.map((cong) => {
			const foundCong = CongregationsList.findById(cong.cong_id)!;

			return {
				cong_id: cong.cong_id,
				updatedAt: cong.updatedAt,
				cong_number: foundCong.cong_number,
				cong_name: foundCong.cong_name,
				country_code: foundCong.country_code,
				request_id: cong.request_id,
			};
		});

		return result;
	}

	async approveCongregationRequest(request_id: string, key: string) {
		await dbCongregationApproveAccessRequest(this.id, request_id, key);
	}

	async rejectCongregationRequest(request_id: string) {
		await dbCongregationRejectAccessRequest(this.id, request_id);
	}

	getRemoteCongregationsList() {
		const congs: (OutgoingSpeakersAccessStorageType & IncomingSpeakersType)[] = [];

		const approvedRequests = CongregationsList.list.filter((record) =>
			record.cong_outgoing_speakers.access.find((access) => access.cong_id === this.id && access.status === 'approved')
		);

		for (const cong of approvedRequests) {
			const requestDetails = cong.cong_outgoing_speakers.access.find(
				(access) => access.cong_id === this.id && access.status === 'approved'
			)!;

			congs.push({
				list: cong.cong_outgoing_speakers.list,
				cong_id: cong.id,
				key: requestDetails.key,
				status: 'approved',
				updatedAt: requestDetails.updatedAt,
				cong_name: cong.cong_name,
				cong_number: cong.cong_number,
				country_code: cong.country_code,
				request_id: requestDetails.request_id,
			});
		}

		return congs;
	}

	getRejectedRequests() {
		const congs: (OutgoingSpeakersAccessStorageType & IncomingSpeakersType)[] = [];

		const disapprovedRequests = CongregationsList.list.filter((record) =>
			record.cong_outgoing_speakers.access.find((access) => access.cong_id === this.id && access.status === 'disapproved')
		);

		for (const cong of disapprovedRequests) {
			const requestDetails = cong.cong_outgoing_speakers.access.find(
				(access) => access.cong_id === this.id && access.status === 'disapproved'
			)!;

			congs.push({
				cong_id: cong.id,
				status: 'disapproved',
				updatedAt: requestDetails.updatedAt,
				cong_name: cong.cong_name,
				cong_number: cong.cong_number,
				country_code: cong.country_code,
				request_id: requestDetails.request_id,
			});
		}

		return congs;
	}
}