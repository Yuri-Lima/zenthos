import { signPayload, verifySignature } from './webhook-signature.js';

describe('webhook signature', () => {
  it('matches GitHub\'s documented example and rejects anything else', () => {
    // From GitHub's "Validating webhook deliveries" docs: secret "It's a Secret to Everybody", body "Hello, World!".
    const signature = signPayload("It's a Secret to Everybody", 'Hello, World!');
    expect(signature).toBe('sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17');
    expect(verifySignature("It's a Secret to Everybody", 'Hello, World!', signature)).toBe(true);
    expect(verifySignature('other', 'Hello, World!', signature)).toBe(false);
    expect(verifySignature("It's a Secret to Everybody", 'Hello, World?', signature)).toBe(false);
    expect(verifySignature("It's a Secret to Everybody", 'Hello, World!', undefined)).toBe(false);
    expect(verifySignature("It's a Secret to Everybody", 'Hello, World!', 'sha256=short')).toBe(false);
  });
});
