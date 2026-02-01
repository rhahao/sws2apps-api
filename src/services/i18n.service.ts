import fs from 'node:fs';
import path from 'node:path';
import i18next, { Resource } from 'i18next';
import { handle } from 'i18next-http-middleware';
import { fileURLToPath } from 'url';
import Utility from '../utils/index.js';
import Config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize i18next by pre-loading resources.
 * This allows us to map 3-letter codes (client-side) to
 * standard locale folders (filesystem) without folder renaming.
 */
export const init = async () => {
	try {
		const resources: Resource = {};

		const baseLocalesPath = path.join(__dirname, '..', 'locales');

		for (const language of Config.Languages) {
			const folderName = language.locale;
			const threeLetterCode = language.threeLettersCode;
			const filePath = path.join(baseLocalesPath, folderName, 'main.json');

			if (fs.existsSync(filePath)) {
				const content = fs.readFileSync(filePath, 'utf-8');
				resources[threeLetterCode] = {
					main: JSON.parse(content),
				};
			} else {
				Utility.Logger.warn(`Translation file missing for ${threeLetterCode}: ${filePath}`);
			}
		}

		await i18next.init({
			fallbackLng: 'eng',
			supportedLngs: Config.Languages.map((l) => l.threeLettersCode),
			resources,
			ns: ['main'],
			defaultNS: 'main',
			interpolation: {
				escapeValue: false,
			},
		});

		Utility.Logger.info(`i18next initialized with ${Object.keys(resources).length} languages`);
	} catch (error) {
		Utility.Logger.error('Failed to initialize i18next:', error);
		throw error;
	}
};

export const middleware = handle(i18next);
