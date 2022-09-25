import Cryptr from 'cryptr';
import twofactor from 'node-2fa';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// utils
import { sendUserResetPassword } from '../utils/sendEmail.js';
import {
	getUserInfo,
	getUsers,
	userAccountChecker,
} from '../utils/user-utils.js';

// get firestore
const db = getFirestore(); //get default database

export const getAllUsers = async (req, res, next) => {
	try {
		const users = await getUsers();

		res.locals.type = 'info';
		res.locals.message = 'admin fetched all users';
		res.status(200).json(users);
	} catch (err) {
		next(err);
	}
};

export const deleteUser = async (req, res, next) => {
	try {
		const { id } = req.params;
		const { isParamsValid, userFound, user } = await userAccountChecker(id);

		if (isParamsValid) {
			if (userFound) {
				// remove from firestore
				await db.collection('users').doc(id).delete();

				// remove from auth if qualified
				if (user.auth_uid) await getAuth().deleteUser(user.auth_uid);

				res.locals.type = 'info';
				res.locals.message = 'the user has been deleted';
				res.status(200).json({ message: 'ACCOUNT_DELETED' });
			} else {
				res.locals.type = 'warn';
				res.locals.message =
					'the user record could not be found in the database';
				res.status(404).json({ message: 'ACCOUNT_NOT_FOUND' });
			}
		} else {
			res.locals.type = 'warn';
			res.locals.message = 'the user id params is not defined';
			res.status(400).json({ message: 'USER_ID_INVALID' });
		}
	} catch (err) {
		next(err);
	}
};

export const enableUser = async (req, res, next) => {
	try {
		const { id } = req.params;
		const { isParamsValid, userFound, user } = await userAccountChecker(id);

		if (isParamsValid) {
			if (userFound) {
				if (user.disabled === true) {
					if (user.global_role === 'pocket') {
						const userRef = db.collection('users').doc(id);
						const userSnap = await userRef.get();

						const data = {
							about: { ...userSnap.data().about, pocket_disabled: false },
						};

						await db.collection('users').doc(id).set(data, { merge: true });
					} else {
						await getAuth().updateUser(user.auth_uid, { disabled: false });
					}

					res.locals.type = 'info';
					res.locals.message = 'the user has been successfully enabled';
					res.status(200).json({ message: 'USER_ENABLED' });
				} else {
					res.locals.type = 'info';
					res.locals.message =
						'the action has been terminated since the user has been already enabled';
					res.status(405).json({ message: 'ACTION_NOT_ALLOWED' });
				}
			} else {
				res.locals.type = 'warn';
				res.locals.message =
					'the user record could not be found in the database';
				res.status(404).json({ message: 'ACCOUNT_NOT_FOUND' });
			}
		} else {
			res.locals.type = 'warn';
			res.locals.message = 'the user id params is not defined';
			res.status(400).json({ message: 'USER_ID_INVALID' });
		}
	} catch (err) {
		next(err);
	}
};

export const disableUser = async (req, res, next) => {
	try {
		const { id } = req.params;
		const { isParamsValid, userFound, user } = await userAccountChecker(id);

		if (isParamsValid) {
			if (userFound) {
				if (user.disabled === false) {
					if (user.global_role === 'pocket') {
						const userRef = db.collection('users').doc(id);
						const userSnap = await userRef.get();

						const data = {
							about: { ...userSnap.data().about, pocket_disabled: true },
						};

						await db.collection('users').doc(id).set(data, { merge: true });
					} else {
						await getAuth().updateUser(user.auth_uid, { disabled: true });
					}

					res.locals.type = 'info';
					res.locals.message = 'the user has been successfully disabled';
					res.status(200).json({ message: 'USER_DISABLED' });
				} else {
					res.locals.type = 'info';
					res.locals.message =
						'the action has been terminated since the user has been already disabled';
					res.status(405).json({ message: 'ACTION_NOT_ALLOWED' });
				}
			} else {
				res.locals.type = 'warn';
				res.locals.message =
					'the user record could not be found in the database';
				res.status(404).json({ message: 'ACCOUNT_NOT_FOUND' });
			}
		} else {
			res.locals.type = 'warn';
			res.locals.message = 'the user id params is not defined';
			res.status(400).json({ message: 'USER_ID_INVALID' });
		}
	} catch (err) {
		next(err);
	}
};

export const resetUserPassword = async (req, res, next) => {
	try {
		const { id } = req.params;
		const { isParamsValid, userFound, user } = await userAccountChecker(id);

		if (isParamsValid) {
			if (userFound) {
				if (user.global_role === 'pocket') {
					res.locals.type = 'warn';
					res.locals.message =
						'the reset password action could not be run for this user';
					res.status(405).json({ message: 'ACTION_NOT_ALLOWED' });
				} else {
					const resetLink = await getAuth().generatePasswordResetLink(
						user.user_uid
					);

					sendUserResetPassword(user.user_uid, user.username, resetLink);

					res.locals.type = 'info';
					res.locals.message = 'user password reset email queued for sending';
					res.status(200).json({ message: 'RESET_QUEUED' });
				}
			} else {
				res.locals.type = 'warn';
				res.locals.message =
					'the user record could not be found in the database';
				res.status(404).json({ message: 'ACCOUNT_NOT_FOUND' });
			}
		} else {
			res.locals.type = 'warn';
			res.locals.message = 'the user id params is not defined';
			res.status(400).json({ message: 'USER_ID_INVALID' });
		}
	} catch (err) {
		next(err);
	}
};

export const revokeUserToken = async (req, res, next) => {
	try {
		const { id } = req.params;
		const { isParamsValid, userFound, user } = await userAccountChecker(id);

		if (isParamsValid) {
			if (userFound) {
				// generate new secret and encrypt
				const secret = twofactor.generateSecret({
					name: 'sws2apps',
					account: user.user_uid,
				});

				const myKey = '&sws2apps_' + process.env.SEC_ENCRYPT_KEY;
				const cryptr = new Cryptr(myKey);
				const encryptedData = cryptr.encrypt(JSON.stringify(secret));

				// Retrieve user from database
				const userRef = db.collection('users').doc(id);
				const userSnap = await userRef.get();

				// remove all sessions and save new secret
				const data = {
					about: {
						...userSnap.data().about,
						mfaEnabled: false,
						secret: encryptedData,
						sessions: [],
					},
				};
				await db.collection('users').doc(id).set(data, { merge: true });

				res.locals.type = 'info';
				res.locals.message = 'admin revoked user token access';
				res.status(200).json({ message: 'OK' });
			} else {
				res.locals.type = 'warn';
				res.locals.message =
					'the user record could not be found in the database';
				res.status(404).json({ message: 'ACCOUNT_NOT_FOUND' });
			}
		} else {
			res.locals.type = 'warn';
			res.locals.message = 'the user id params is not defined';
			res.status(400).json({ message: 'USER_ID_INVALID' });
		}
	} catch (err) {
		next(err);
	}
};

export const makeUserAdmin = async (req, res, next) => {
	try {
		const { id } = req.params;
		const { isParamsValid, userFound, user } = await userAccountChecker(id);

		if (isParamsValid) {
			if (userFound) {
				if (user.global_role === 'admin') {
					res.locals.type = 'warn';
					res.locals.message = 'the current is already an admin';
					res.status(405).json({ message: 'ACTION_NOT_ALLOWED' });
				} else if (user.global_role === 'pocket') {
					res.locals.type = 'warn';
					res.locals.message =
						'setting a pocket user to be an admin is not allowed';
					res.status(405).json({ message: 'ACTION_NOT_ALLOWED' });
				} else {
					const userRef = db.collection('users').doc(id);
					const userSnap = await userRef.get();

					const data = {
						about: { ...userSnap.data().about, role: 'admin' },
					};

					await db.collection('users').doc(id).set(data, { merge: true });

					res.locals.type = 'info';
					res.locals.message = 'admin set an user to be an admin';
					res.status(200).json({ message: 'OK' });
				}
			} else {
				res.locals.type = 'warn';
				res.locals.message =
					'the user record could not be found in the database';
				res.status(404).json({ message: 'ACCOUNT_NOT_FOUND' });
			}
		} else {
			res.locals.type = 'warn';
			res.locals.message = 'the user id params is not defined';
			res.status(400).json({ message: 'USER_ID_INVALID' });
		}
	} catch (err) {
		next(err);
	}
};

export const findUser = async (req, res, next) => {
	try {
		const search = req.query.search;

		if (search && search.length > 0) {
			const userData = await getUserInfo(search);

			if (userData) {
				res.locals.type = 'info';
				res.locals.message = 'user details fetched successfully';
				res.status(200).json(userData);
			} else {
				res.locals.type = 'warn';
				res.locals.message = 'user could not be found';
				res.status(404).json({ message: 'ACCOUNT_NOT_FOUND' });
			}
		} else {
			res.locals.type = 'warn';
			res.locals.message = 'the search parameter is not correct';
			res.status(400).json({ message: 'SEARCH_INVALID' });
		}
	} catch (err) {
		next(err);
	}
};
