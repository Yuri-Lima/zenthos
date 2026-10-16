import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encrypts the secret half of a provider connection at rest. One key for the deployment, 32 bytes as hex
 * in ZENTHOS_SECRETS_KEY: from a password manager on a laptop, from Secret Manager on Cloud Run. The box
 * is iv | tag | ciphertext, so a row carries everything needed to open it with the key.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    this.key = Buffer.from(hexKey, 'hex');
    if (this.key.length !== 32) throw new Error('ZENTHOS_SECRETS_KEY must be 32 bytes as 64 hex characters (openssl rand -hex 32)');
  }

  seal(value: unknown): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  open<T = unknown>(box: Buffer): T {
    const iv = box.subarray(0, IV_BYTES);
    const tag = box.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(box.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')) as T;
  }
}
