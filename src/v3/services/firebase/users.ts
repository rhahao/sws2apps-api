import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { StandardRecord } from '../../definition/app.js';
import {
	PocketNewParams,
	RequestPasswordLessLinkParams,
	UserNewParams,
	UserProfile,
	UserSession,
	UserSettings,
} from '../../definition/user.js';
import { getFileFromStorage, uploadFileToStorage } from './storage_utils.js';
import { User } from '../../classes/User.js';
import { UsersList } from '../../classes/Users.js';
import { encryptData } from '../encryption/encryption.js';
import { i18n } from '../../config/i18n_config.js';
import { MailClient } from '../../config/mail_config.js';

export const getUserAuthDetails = async (auth_uid: string) => {
	const userRecord = await getAuth().getUser(auth_uid);

	const auth_provider = userRecord.providerData[0]?.providerId || 'email';

	return { email: userRecord.email, auth_provider };
};

export const getUsersID = async () => {
	const pattern = '^v3\\/users\\/(.+?)\\/';

	const [files] = await getStorage().bucket().getFiles({ prefix: 'v3/users' });

	const draftUsers = files.filter((file) => {
		const rgExp = new RegExp(pattern, 'g');
		return rgExp.test(file.name);
	});

	const formatted = draftUsers.map((file) => {
		const rgExp = new RegExp(pattern, 'g');

		return rgExp.exec(file.name)![1];
	});

	const users = Array.from(new Set(formatted));

	return users;
};

export const getUserSettings = async (id: string) => {
	const path = `${id}/settings.txt`;
	const data = await getFileFromStorage({ type: 'user', path });

	if (data) {
		const settings = JSON.parse(data) as UserSettings;
		return settings;
	}
};

export const getUserProfile = async (id: string) => {
	const path = `${id}/profile.txt`;
	const data = await getFileFromStorage({ type: 'user', path });

	const profile = JSON.parse(data!) as UserProfile;
	return profile;
};

export const getUserSessions = async (id: string) => {
	const path = `${id}/sessions.txt`;
	const data = await getFileFromStorage({ type: 'user', path });

	if (data) {
		const sessions = JSON.parse(data) as UserSession[];
		return sessions;
	}

	return [];
};

export const getUserBibleStudies = async (id: string) => {
	const path = `${id}/bible_studies.txt`;
	const data = await getFileFromStorage({ type: 'user', path });

	if (data) {
		const studies = JSON.parse(data) as StandardRecord[];
		return studies;
	}

	return [];
};

export const getUserFieldServiceReports = async (id: string) => {
	const path = `${id}/field_service_reports.txt`;
	const data = await getFileFromStorage({ type: 'user', path });

	if (data) {
		const reports = JSON.parse(data) as StandardRecord[];
		return reports;
	}

	return [];
};

export const getUserDetails = async (id: string) => {
	return {
		settings: await getUserSettings(id),
		profile: await getUserProfile(id),
		sessions: await getUserSessions(id),
		bible_studies: await getUserBibleStudies(id),
		field_service_reports: await getUserFieldServiceReports(id),
	};
};

export const loadAllUsers = async () => {
	const users = await getUsersID();

	const result: User[] = [];

	for await (const record of users) {
		const user = new User(record);
		await user.loadDetails();

		result.push(user);
	}

	return result;
};

export const setUserEmail = async (auth_uid: string, email: string) => {
	await getAuth().updateUser(auth_uid, { email });
};

export const setUserProfile = async (id: string, profile: UserProfile) => {
	profile.auth_provider = undefined;
	profile.email = undefined;

	const data = JSON.stringify(profile);
	const path = `${id}/profile.txt`;

	await uploadFileToStorage(data, { type: 'user', path });
};

export const setUserSettings = async (id: string, settings: UserSettings) => {
	const data = JSON.stringify(settings);
	const path = `${id}/settings.txt`;

	await uploadFileToStorage(data, { type: 'user', path });
};

export const setUserSessions = async (id: string, sessions: UserSession[]) => {
	const data = JSON.stringify(sessions);
	const path = `${id}/sessions.txt`;

	await uploadFileToStorage(data, { type: 'user', path });
};

export const createUser = async (params: UserNewParams) => {
	if (params.email) {
		await getAuth().updateUser(params.auth_uid, { email: params.email });
	}

	const id = crypto.randomUUID().toUpperCase();

	const profile: UserProfile = {
		firstname: { value: params.firstname, updatedAt: new Date().toISOString() },
		lastname: { value: params.lastname, updatedAt: new Date().toISOString() },
		role: 'vip',
		auth_uid: params.auth_uid,
	};

	await setUserProfile(id, profile);

	return id;
};

export const createPasswordLessLink = async (params: RequestPasswordLessLinkParams) => {
	const { email, language, origin } = params;

	const MAIL_ENABLED = process.env.MAIL_ENABLED === 'true';

	const localUser = UsersList.findByEmail(email);

	if (!localUser) {
		const users = await getAuth().getUsers([{ email }]);

		if (users.users.length === 0) {
			await getAuth().createUser({ email });
		}
	}

	const user = await getAuth().getUserByEmail(email);
	const token = await getAuth().createCustomToken(user.uid);

	const link = `${origin}/#/?code=${token}`;

	if (!MAIL_ENABLED) return link;

	const t = i18n(language);

	const options = {
		to: email,
		subject: t('tr_login'),
		template: 'login',
		context: {
			loginTitle: t('tr_welcomeTitle'),
			loginDesc: t('tr_welcomeDesc'),
			link,
			loginButton: t('tr_loginBtn'),
			loginAltText: t('tr_loginAltText'),
			loginIgnoreText: t('tr_loginIgnoreText'),
			copyright: new Date().getFullYear(),
		},
	};

	MailClient.sendEmail(options, 'Passwordless link sent to user');
};

export const createPocketUser = async ({
	cong_id,
	cong_person_uid,
	cong_role,
	user_firstname,
	user_lastname,
	user_secret_code,
}: PocketNewParams) => {
	const profile: UserProfile = {
		firstname: { value: user_firstname, updatedAt: new Date().toISOString() },
		lastname: { value: user_lastname, updatedAt: new Date().toISOString() },
		role: 'pocket',
		congregation: {
			account_type: 'pocket',
			cong_role: cong_role,
			id: cong_id,
			pocket_invitation_code: encryptData(user_secret_code),
			user_local_uid: cong_person_uid,
			user_members_delegate: [],
		},
	};

	const id = crypto.randomUUID().toUpperCase();
	await setUserProfile(id, profile);

	return id;
};

export const decodeUserIdToken = async (token: string) => {
	try {
		const decodedToken = await getAuth().verifyIdToken(token);
		return decodedToken.uid;
	} catch (err) {
		console.error('Failed to decode idToken', err);
	}
};