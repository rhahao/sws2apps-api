import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { UsersList } from '../classes/Users.js';
import { CongregationsList } from '../classes/Congregations.js';
import { generateTokenDev } from '../dev/setup.js';
import { formatError } from '../utils/format_log.js';
import { StandardRecord } from '../definition/app.js';
import { BackupData } from '../definition/congregation.js';
import { ROLE_MASTER_KEY } from '../constant/base.js';

const isDev = process.env.NODE_ENV === 'development';

export const validateUser = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const user = res.locals.currentUser;

		if (!user.profile.congregation) {
			res.locals.type = 'warn';
			res.locals.message = 'email address not associated with a congregation';
			res.status(404).json({ message: 'CONG_NOT_FOUND' });
			return;
		}

		const cong = CongregationsList.findById(user.profile.congregation.id)!;

		const masterKeyNeeded = user.profile.congregation.cong_role.includes('admin');

		const obj = {
			id: user.id,
			mfa: user.profile.mfa_enabled,
			cong_id: cong.id,
			country_code: cong.settings.country_code,
			cong_name: cong.settings.cong_name,
			cong_number: cong.settings.cong_number,
			cong_role: user.profile.congregation.cong_role,
			user_local_uid: user.profile.congregation.user_local_uid,
			user_delegates: user.profile.congregation.user_members_delegate,
			cong_master_key: masterKeyNeeded ? cong.settings.cong_master_key : undefined,
			cong_access_code: cong.settings.cong_access_code,
		};

		res.locals.type = 'info';
		res.locals.message = 'visitor id has been validated';
		res.status(200).json(obj);
	} catch (err) {
		next(err);
	}
};

export const getUserSecretToken = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id } = req.params;

		if (!id) {
			res.locals.type = 'warn';
			res.locals.message = `invalid input: user id is required`;
			res.status(400).json({ message: 'USER_ID_INVALID' });

			return;
		}

		const user = UsersList.findById(id)!;
		await user.generateSecret();
		const { secret, uri } = user.decryptSecret();

		res.locals.type = 'info';
		res.locals.message = `the user has fetched 2fa successfully`;

		if (!user.profile.mfa_enabled && isDev) {
			const tokenDev = generateTokenDev(user.profile.email!, user.profile.secret!);
			res.status(200).json({ secret: secret, qrCode: uri, mfaEnabled: user.profile.mfa_enabled, MFA_CODE: tokenDev });
		} else {
			res.status(200).json({
				secret: secret,
				qrCode: uri,
				mfaEnabled: user.profile.mfa_enabled,
			});
		}
	} catch (err) {
		next(err);
	}
};

export const getUserSessions = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id } = req.params;

		if (!id) {
			res.locals.type = 'warn';
			res.locals.message = `invalid input: user id is required`;
			res.status(400).json({ message: 'USER_ID_INVALID' });
		}

		const user = UsersList.findById(id)!;
		const sessions = user.getActiveSessions(req.signedCookies.visitorid);

		res.locals.type = 'info';
		res.locals.message = `the user has fetched sessions successfully`;
		res.status(200).json(sessions);
	} catch (err) {
		next(err);
	}
};

export const deleteUserSession = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id } = req.params;

		if (!id) {
			res.locals.type = 'warn';
			res.locals.message = `invalid input: user and session id are required`;
			res.status(400).json({ message: 'USER_ID_INVALID' });
		}

		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			const msg = formatError(errors);

			res.locals.type = 'warn';
			res.locals.message = `invalid input: ${msg}`;

			res.status(400).json({
				message: 'Bad request: provided inputs are invalid.',
			});

			return;
		}

		const identifier = req.body.identifier as string;

		const user = UsersList.findById(id)!;
		const sessions = await user.revokeSession(identifier);

		if (user.profile.congregation && user.profile.congregation.id.length > 0) {
			const cong = CongregationsList.findById(user.profile.congregation.id);

			if (cong) {
				cong.reloadMembers();
			}
		}

		res.locals.type = 'info';
		res.locals.message = `the user has revoked session successfully`;
		res.status(200).json(sessions);
	} catch (err) {
		next(err);
	}
};

export const userLogout = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const visitorid = req.headers.visitorid as string;

		const user = res.locals.currentUser;

		if (user) {
			await user.revokeSession(visitorid);
		}

		res.locals.type = 'info';
		res.locals.message = `the current user has logged out`;

		res.clearCookie('visitorid', { path: '/' });
		res.status(200).json({ message: 'OK' });
	} catch (err) {
		next(err);
	}
};

export const disableUser2FA = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id } = req.params;

		if (!id) {
			res.locals.type = 'warn';
			res.locals.message = `invalid input: user id is required`;
			res.status(400).json({ message: 'USER_ID_INVALID' });

			return;
		}

		const user = UsersList.findById(id)!;
		await user.disableMFA();

		res.locals.type = 'info';
		res.locals.message = `the user disabled 2fa successfully`;
		res.status(200).json({ message: 'MFA_DISABLED' });
	} catch (err) {
		next(err);
	}
};

export const getAuxiliaryApplications = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			const msg = formatError(errors);

			res.locals.type = 'warn';
			res.locals.message = `invalid input: ${msg}`;

			res.status(400).json({
				message: 'Bad request: provided inputs are invalid.',
			});

			return;
		}

		const { id } = req.params;

		if (!id) {
			res.locals.type = 'warn';
			res.locals.message = `invalid input: user id is required`;
			res.status(400).json({ message: 'USER_ID_INVALID' });

			return;
		}

		const user = UsersList.findById(id)!;

		if (!user.profile.congregation) {
			res.locals.type = 'warn';
			res.locals.message = `user does not have an assigned congregation`;
			res.status(400).json({ message: 'CONG_NOT_ASSIGNED' });

			return;
		}

		const cong = CongregationsList.findById(user.profile.congregation?.id);

		if (!cong) {
			res.locals.type = 'warn';
			res.locals.message = 'user congregation is invalid';
			res.status(404).json({ message: 'CONGREGATION_NOT_FOUND' });

			return;
		}

		const results = user.getApplications();

		res.locals.type = 'info';
		res.locals.message = `user get submitted auxiliary pioneer application list`;
		res.status(200).json(results);
	} catch (err) {
		next(err);
	}
};

export const submitAuxiliaryApplication = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			const msg = formatError(errors);

			res.locals.type = 'warn';
			res.locals.message = `invalid input: ${msg}`;

			res.status(400).json({
				message: 'Bad request: provided inputs are invalid.',
			});

			return;
		}

		const { id } = req.params;

		if (!id) {
			res.locals.type = 'warn';
			res.locals.message = `invalid input: user id is required`;
			res.status(400).json({ message: 'USER_ID_INVALID' });

			return;
		}

		const user = UsersList.findById(id)!;

		if (!user.profile.congregation) {
			res.locals.type = 'warn';
			res.locals.message = `user does not have an assigned congregation`;
			res.status(400).json({ message: 'CONG_NOT_ASSIGNED' });

			return;
		}

		const cong = CongregationsList.findById(user.profile.congregation?.id);

		if (!cong) {
			res.locals.type = 'warn';
			res.locals.message = 'user congregation is invalid';
			res.status(404).json({ message: 'CONGREGATION_NOT_FOUND' });

			return;
		}

		const form = req.body.application as StandardRecord;

		const application = {
			request_id: crypto.randomUUID().toUpperCase(),
			person_uid: user.profile.congregation.user_local_uid,
			months: form.months,
			continuous: form.continuous,
			submitted: form.submitted,
			updatedAt: new Date().toISOString(),
			expired: null,
		};

		cong.saveApplication(application);

		res.locals.type = 'info';
		res.locals.message = `user submitted auxiliary pioneer application`;
		res.status(200).json({ message: 'APPLICATION_SENT' });
	} catch (err) {
		next(err);
	}
};

export const postUserReport = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			const msg = formatError(errors);

			res.locals.type = 'warn';
			res.locals.message = `invalid input: ${msg}`;

			res.status(400).json({
				message: 'Bad request: provided inputs are invalid.',
			});

			return;
		}

		const { id } = req.params;

		if (!id) {
			res.locals.type = 'warn';
			res.locals.message = `invalid input: user id is required`;
			res.status(400).json({ message: 'USER_ID_INVALID' });

			return;
		}

		const user = UsersList.findById(id)!;

		if (!user.profile.congregation) {
			res.locals.type = 'warn';
			res.locals.message = `user does not have an assigned congregation`;
			res.status(400).json({ message: 'CONG_NOT_ASSIGNED' });

			return;
		}

		const cong = CongregationsList.findById(user.profile.congregation?.id);

		if (!cong) {
			res.locals.type = 'warn';
			res.locals.message = 'user congregation is invalid';
			res.status(404).json({ message: 'CONGREGATION_NOT_FOUND' });

			return;
		}

		const report = req.body.report as StandardRecord;
		user.postReport(report);

		res.locals.type = 'info';
		res.locals.message = `user sent report successfully`;
		res.status(200).json({ message: 'REPORT_SENT' });
	} catch (err) {
		next(err);
	}
};

export const retrieveUserBackup = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			const msg = formatError(errors);

			res.locals.type = 'warn';
			res.locals.message = `invalid input: ${msg}`;

			res.status(400).json({
				message: 'Bad request: provided inputs are invalid.',
			});

			return;
		}

		const { id } = req.params;

		if (!id) {
			res.locals.type = 'warn';
			res.locals.message = `invalid input: user id is required`;
			res.status(400).json({ message: 'USER_ID_INVALID' });

			return;
		}

		const user = UsersList.findById(id)!;

		if (!user.profile.congregation) {
			res.locals.type = 'warn';
			res.locals.message = `user does not have an assigned congregation`;
			res.status(400).json({ message: 'CONG_NOT_ASSIGNED' });

			return;
		}

		const cong = CongregationsList.findById(user.profile.congregation?.id);

		if (!cong) {
			res.locals.type = 'warn';
			res.locals.message = 'user congregation is invalid';
			res.status(404).json({ message: 'CONGREGATION_NOT_FOUND' });

			return;
		}

		const result = {} as BackupData;

		const userRole = user.profile.congregation!.cong_role;

		const masterKeyNeed = userRole.some((role) => ROLE_MASTER_KEY.includes(role));

		const secretaryRole = userRole.includes('secretary');
		const adminRole = userRole.some((role) => role === 'admin' || role === 'coordinator') || secretaryRole;

		const scheduleEditor =
			adminRole ||
			userRole.some((role) => role === 'midweek_schedule' || role === 'weekend_schedule' || role === 'public_talk_schedule');

		const personViewer = scheduleEditor || userRole.some((role) => role === 'elder');

		const publicTalkEditor = adminRole || userRole.some((role) => role === 'public_talk_schedule');

		const isPublisher = userRole.includes('publisher');

		const personMinimal = !personViewer;
		const userUid = user.profile.congregation!.user_local_uid;

		if (cong.settings.data_sync.value) {
			result.app_settings = {
				cong_settings: structuredClone(cong.settings),
				user_settings: {
					cong_role: user.profile.congregation?.cong_role,
					firstname: user.profile.firstname,
					lastname: user.profile.lastname,
					user_local_uid: user.profile.congregation?.user_local_uid,
					user_members_delegate: user.profile.congregation?.user_members_delegate,
					backup_automatic: user.settings.backup_automatic?.length > 0 ? user.settings.backup_automatic : undefined,
					theme_follow_os_enabled:
						user.settings.theme_follow_os_enabled?.length > 0 ? user.settings.theme_follow_os_enabled : undefined,
					hour_credits_enabled: user.settings.hour_credits_enabled?.length > 0 ? user.settings.hour_credits_enabled : undefined,
					data_view: user.settings.data_view?.length > 0 ? user.settings.data_view : undefined,
				},
			};

			if (!masterKeyNeed) {
				result.app_settings.cong_settings.cong_master_key = undefined;
			}

			if (scheduleEditor) {
				result.persons = cong.persons;
			}

			if (publicTalkEditor) {
				result.speakers_key = cong.outgoing_speakers.speakers_key;
				result.speakers_congregations = cong.speakers_congregations;
				result.visiting_speakers = cong.visiting_speakers;
				result.outgoing_talks =
					cong.public_schedules.incoming_talks === '' ? [] : JSON.parse(cong.public_schedules.incoming_talks);
			}

			if (isPublisher) {
				result.user_bible_studies = user.bible_studies;
				result.user_field_service_reports = user.field_service_reports;
				result.field_service_groups = cong.field_service_groups;
			}

			if (personMinimal) {
				const minimalPersons = cong.persons.map((record) => {
					const includeTimeAway = cong.settings.time_away_public.value;

					const personData = record.person_data as StandardRecord;

					return {
						_deleted: record._deleted,
						person_uid: record.person_uid,
						person_data: {
							person_firstname: personData.person_firstname,
							person_lastname: personData.person_lastname,
							person_display_name: personData.person_display_name,
							male: personData.male,
							female: personData.female,
							publisher_unbaptized: userUid === record.person_uid ? personData.publisher_unbaptized : undefined,
							publisher_baptized: userUid === record.person_uid ? personData.publisher_baptized : undefined,
							emergency_contacts: userUid === record.person_uid ? personData.emergency_contacts : undefined,
							assignments: userUid === record.person_uid ? personData.assignments : undefined,
							privileges: userUid === record.person_uid ? personData.privileges : undefined,
							enrollments: userUid === record.person_uid ? personData.enrollments : undefined,
							timeAway: includeTimeAway || userUid === record.person_uid ? personData.timeAway : undefined,
						},
					};
				});

				result.persons = minimalPersons;

				result.public_sources = cong.public_schedules.sources.length === 0 ? [] : JSON.parse(cong.public_schedules.sources);

				result.public_schedules = cong.public_schedules.schedules.length === 0 ? [] : JSON.parse(cong.public_schedules.schedules);
			}

			if (secretaryRole) {
				result.incoming_reports = cong.incoming_reports;
			}
		}

		if (!cong.settings.data_sync.value) {
			const midweek = cong.settings.midweek_meeting.map((record) => {
				return { type: record.type, time: record.time, weekday: record.weekday };
			});

			const weekend = cong.settings.weekend_meeting.map((record) => {
				return { type: record.type, time: record.time, weekday: record.weekday };
			});

			result.app_settings = {
				cong_settings: {
					cong_access_code: cong.settings.cong_access_code,
					cong_master_key: masterKeyNeed ? cong.settings.cong_master_key : undefined,
					cong_circuit: cong.settings.cong_circuit,
					cong_discoverable: cong.settings.cong_discoverable,
					cong_location: cong.settings.cong_location,
					data_sync: cong.settings.data_sync,
					time_away_public: cong.settings.time_away_public,
					midweek_meeting: midweek,
					weekend_meeting: weekend,
					cong_name: cong.settings.cong_name,
					cong_number: cong.settings.cong_number,
					country_code: cong.settings.country_code,
					last_backup: cong.settings.last_backup,
				},
				user_settings: {
					cong_role: user.profile.congregation?.cong_role,
					firstname: user.profile.firstname,
					lastname: user.profile.lastname,
					user_local_uid: user.profile.congregation?.user_local_uid,
					user_members_delegate: user.profile.congregation?.user_members_delegate,
				},
			};
		}

		res.locals.type = 'info';
		res.locals.message = 'user retrieve backup successfully';
		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
};

export const saveUserBackup = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			const msg = formatError(errors);

			res.locals.type = 'warn';
			res.locals.message = `invalid input: ${msg}`;

			res.status(400).json({
				message: 'Bad request: provided inputs are invalid.',
			});

			return;
		}

		const { id } = req.params;

		if (!id) {
			res.locals.type = 'warn';
			res.locals.message = `invalid input: user id is required`;
			res.status(400).json({ message: 'USER_ID_INVALID' });

			return;
		}

		const user = UsersList.findById(id)!;

		if (!user.profile.congregation) {
			res.locals.type = 'warn';
			res.locals.message = `user does not have an assigned congregation`;
			res.status(400).json({ message: 'CONG_NOT_ASSIGNED' });

			return;
		}

		const cong = CongregationsList.findById(user.profile.congregation?.id);

		if (!cong) {
			res.locals.type = 'warn';
			res.locals.message = 'user congregation is invalid';
			res.status(404).json({ message: 'CONGREGATION_NOT_FOUND' });

			return;
		}

		const last_backup = req.headers.lastbackup as string;

		if (last_backup !== cong.settings.last_backup) {
			res.locals.type = 'info';
			res.locals.message = 'backup action rejected since it was changed recently';
			res.status(400).json({ message: 'BACKUP_OUTDATED' });
			return;
		}

		const userRole = user.profile.congregation!.cong_role;

		const adminRole = userRole.some((role) => role === 'admin' || role === 'coordinator' || role === 'secretary');

		const scheduleEditor = userRole.some(
			(role) => role === 'midweek_schedule' || role === 'weekend_schedule' || role === 'public_talk_schedule'
		);

		const congBackupAllowed = adminRole || scheduleEditor;

		const cong_backup = req.body.cong_backup as BackupData;

		if (congBackupAllowed) {
			cong.saveBackup(cong_backup);
		}

		const userPerson = cong_backup.persons?.at(0);

		if (!adminRole && !scheduleEditor && userPerson) {
			const personData = userPerson.person_data as StandardRecord;
			user.updatePersonData(personData.timeAway as string, personData.emergency_contacts as string);
		}

		const userSettings = cong_backup.app_settings.user_settings;

		if (userSettings) {
			user.saveBackup(userSettings);
		}

		res.locals.type = 'info';
		res.locals.message = 'user send backup for congregation successfully';
		res.status(200).json({ message: 'BACKUP_SENT' });
	} catch (err) {
		next(err);
	}
};