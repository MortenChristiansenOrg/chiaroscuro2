/** Encrypts secrets kept on disk, such as with the system keyring. */
export interface CredentialProtection {
  encrypt(value: string): Uint8Array;
  decrypt(value: Uint8Array): string;
}
