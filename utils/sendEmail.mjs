// dependencies
import nodemailer from 'nodemailer';
import hbs from 'nodemailer-express-handlebars';
import path from 'path';

// gmail config import
import { gmailConfig } from '../config/gmail-config.mjs';
import { logger } from './logger.mjs';

const handlebarsOptions = {
	viewEngine: {
		partialsDir: path.resolve('./views/'),
		defaultLayout: false,
	},
	viewPath: path.resolve('./views/'),
};

const transporter = nodemailer.createTransport(gmailConfig.transport);
transporter.use('compile', hbs(handlebarsOptions));

export const sendVerificationEmail = async (recipient, activation) => {
	const options = {
		from: gmailConfig.sender,
		to: recipient,
		subject: 'Please verify your account (sws2apps)',
		template: 'verifyAccount',
		context: {
			name: recipient,
			activation: activation,
		},
	};

	const intTry = 10;
	let i = 0;
	let retry = false;

	do {
		const send = async () => {
			return new Promise((resolve) => {
				return transporter.sendMail(options, (error, info) => {
					if (error) {
						logger(
							'warn',
							`failed to send message: ${error.message}. trying again ...`
						);
						return resolve(false);
					}
					logger('info', `verification message sent to ${options.to}`);
					return resolve(true);
				});
			});
		};

		const runSend = await send();
		retry = !runSend;
		i++;
	} while (i < intTry && retry);

	return !retry;
};
