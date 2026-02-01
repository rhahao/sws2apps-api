import crypto from 'node:crypto';
import pbkdf2 from 'pbkdf2';
import Config from '../config/index.js';

const deriveKey = async (passphrase: string, salt: Buffer): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    pbkdf2.pbkdf2(passphrase, salt, 100000, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
};

export const encrypt = async <T extends Buffer | Blob | object | string>(
  content: T,
  passphrase?: string
): Promise<T extends string ? string : Buffer> => {
  const SERVER_KEY = `&sws2apps_${Config.ENV.secEncryptKey ?? 'server_key_dev'}`;
  
  const finalPassphrase = passphrase || SERVER_KEY;

  let data: Buffer;
  if (Buffer.isBuffer(content)) {
    // Node.js Buffer
    data = content;
  } else if (typeof content === 'string') {
    // Plain string
    data = Buffer.from(content, 'utf8');
  } else if (typeof Blob !== 'undefined' && content instanceof Blob) {
    // Browser Blob → ArrayBuffer → Buffer
    const arrayBuffer = await content.arrayBuffer();
    data = Buffer.from(arrayBuffer);
  } else {
    // JSON object
    data = Buffer.from(JSON.stringify(content), 'utf8');
  }

  const salt = crypto.randomBytes(16);
  const key = await deriveKey(finalPassphrase, salt);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: [salt][iv][tag][ciphertext]
  const final = Buffer.concat([salt, iv, tag, encrypted]);

  if (typeof content === 'string') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return final.toString('hex') as any;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return final as any;
};

export const decrypt = async (
  encryptedData: Buffer | string,
  passphrase?: string
) => {
  const SERVER_KEY = `&sws2apps_${Config.ENV.secEncryptKey ?? 'server_key_dev'}`;

  try {
    const finalPassphrase = passphrase || SERVER_KEY;

    let data: Buffer;

    if (typeof encryptedData === 'string') {
      data = Buffer.from(encryptedData, 'hex');
    } else {
      data = encryptedData;
    }

    const salt = data.subarray(0, 16);
    const iv = data.subarray(16, 28);
    const tag = data.subarray(28, 44);
    const ciphertext = data.subarray(44);

    const key = await deriveKey(finalPassphrase, salt);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    // Try to parse JSON, fallback to raw string or Buffer
    const str = decrypted.toString('utf8');
    try {
      return JSON.parse(str); // if it was JSON originally
    } catch {
      return str; // if it was plain string
    }
  } catch (error) {
    console.log(error);
    return;
  }
};
