/**
 * SessionClone - High-Security Web Crypto Engine
 * AES-GCM 256-bit Authenticated Encryption with PBKDF2 Key Derivation
 */

(function (global) {
  'use strict';

  const PREFIX = 'SESSIONCLONE_ENC:v1:';
  const PBKDF2_ITERATIONS = 100000;
  const SALT_BYTE_LENGTH = 16;
  const IV_BYTE_LENGTH = 12; // 96-bit standard for AES-GCM

  // Convert ArrayBuffer / Uint8Array to base64
  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Convert base64 to Uint8Array
  function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Derive AES-GCM CryptoKey from password and salt using PBKDF2
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt a plaintext string using AES-GCM 256-bit and a user password
   * @param {string} plainText
   * @param {string} password
   * @returns {Promise<string>} Armored encrypted string
   */
  async function encrypt(plainText, password) {
    if (!password || typeof password !== 'string' || password.length === 0) {
      throw new Error('Encryption password is required.');
    }

    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

    const key = await deriveKey(password, salt);
    const encodedText = enc.encode(plainText);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encodedText
    );

    const saltB64 = bufferToBase64(salt);
    const ivB64 = bufferToBase64(iv);
    const cipherB64 = bufferToBase64(ciphertextBuffer);

    return `${PREFIX}${saltB64}:${ivB64}:${cipherB64}`;
  }

  /**
   * Decrypt an armored string using a user password
   * @param {string} armoredString
   * @param {string} password
   * @returns {Promise<string>} Plaintext string
   */
  async function decrypt(armoredString, password) {
    if (!armoredString || typeof armoredString !== 'string') {
      throw new Error('Invalid encrypted input.');
    }

    const trimmed = armoredString.trim();
    if (!trimmed.startsWith('SESSIONCLONE_ENC:')) {
      throw new Error('Not a valid SessionClone encrypted payload.');
    }

    const parts = trimmed.split(':');
    // Format: ["SESSIONCLONE_ENC", "v1", "<salt>", "<iv>", "<ciphertext>"]
    if (parts.length !== 5 || parts[1] !== 'v1') {
      throw new Error('Unsupported encryption version or corrupted payload format.');
    }

    const salt = base64ToBuffer(parts[2]);
    const iv = base64ToBuffer(parts[3]);
    const ciphertext = base64ToBuffer(parts[4]);

    const key = await deriveKey(password, salt);

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        ciphertext
      );

      const dec = new TextDecoder();
      return dec.decode(decryptedBuffer);
    } catch (err) {
      throw new Error('Decryption failed: Incorrect password or corrupted payload.');
    }
  }

  /**
   * Check if a string is in SessionClone encrypted format
   * @param {string} str
   * @returns {boolean}
   */
  function isEncrypted(str) {
    return typeof str === 'string' && str.trim().startsWith('SESSIONCLONE_ENC:');
  }

  const SessionCrypto = {
    encrypt,
    decrypt,
    isEncrypted,
    PREFIX
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionCrypto;
  } else {
    global.SessionCrypto = SessionCrypto;
  }
})(typeof self !== 'undefined' ? self : this);
