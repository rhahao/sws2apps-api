import Cryptr from 'cryptr';

const isProd = process.env.NODE_ENV === 'production';

const myKey = `&sws2apps_${isProd ? process.env.SEC_ENCRYPT_KEY : 'your-secret-encryption-string'}`;
const cryptr = new Cryptr(myKey);

export const encryptData = (data) => {
	if (typeof data !== 'string') data = JSON.stringify(data);
	return cryptr.encrypt(data);
};

export const decryptData = (data) => {
	return cryptr.decrypt(data);
};
