/**
 * Client-Side End-to-End Encryption (E2EE) using the Web Crypto API.
 * Uses ECDH (P-256) for key agreement and AES-256-GCM for message encryption.
 */

export interface KeyPairData {
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}

export interface EncryptedPayload {
  ciphertext: string; // Base64
  iv: string; // Base64
  isEncrypted: boolean;
}

/**
 * Generates an ephemeral ECDH (P-256) keypair for a chat session.
 */
export async function generateSessionKeyPair(): Promise<KeyPairData | null> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    return null;
  }

  try {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

    return {
      publicKeyJwk,
      privateKey: keyPair.privateKey,
    };
  } catch (err) {
    console.warn('E2EE key generation fallback:', err);
    return null;
  }
}

/**
 * Derives an AES-256-GCM shared key from the local private key and the remote public key.
 */
export async function deriveSharedSecretKey(
  localPrivateKey: CryptoKey,
  remotePublicKeyJwk: JsonWebKey
): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    return null;
  }

  try {
    const remotePublicKey = await window.crypto.subtle.importKey(
      'jwk',
      remotePublicKeyJwk,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      []
    );

    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: remotePublicKey,
      },
      localPrivateKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );

    return derivedKey;
  } catch (err) {
    console.warn('E2EE shared key derivation error:', err);
    return null;
  }
}

/**
 * Encrypts a plaintext message with AES-256-GCM.
 */
export async function encryptText(
  plaintext: string,
  sharedKey: CryptoKey | null
): Promise<EncryptedPayload> {
  if (!sharedKey || typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    return {
      ciphertext: plaintext,
      iv: '',
      isEncrypted: false,
    };
  }

  try {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plaintext);

    // 12-byte random IV for AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      sharedKey,
      encodedData
    );

    const ciphertextBase64 = bufferToBase64(new Uint8Array(encryptedBuffer));
    const ivBase64 = bufferToBase64(iv);

    return {
      ciphertext: ciphertextBase64,
      iv: ivBase64,
      isEncrypted: true,
    };
  } catch (err) {
    console.warn('E2EE encryption error, falling back:', err);
    return {
      ciphertext: plaintext,
      iv: '',
      isEncrypted: false,
    };
  }
}

/**
 * Decrypts an AES-256-GCM ciphertext payload.
 */
export async function decryptText(
  payload: { ciphertext: string; iv?: string; isEncrypted?: boolean },
  sharedKey: CryptoKey | null
): Promise<string> {
  if (!payload.isEncrypted || !payload.iv || !sharedKey) {
    return payload.ciphertext;
  }

  try {
    const iv = base64ToBuffer(payload.iv);
    const ciphertext = base64ToBuffer(payload.ciphertext);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
      },
      sharedKey,
      ciphertext as BufferSource
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.warn('E2EE decryption error:', err);
    return '[Decryption Error: Key mismatch]';
  }
}

function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return window.btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
