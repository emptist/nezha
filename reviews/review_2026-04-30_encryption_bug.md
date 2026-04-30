# Encryption Bug Analysis

**Issue ID**: 6a6f2d89-7e70-4185-b471-58c7e8470c62
**Created**: 2026-04-30
**Severity**: Critical
**Status**: Investigating

## Summary
`EncryptionService.decrypt()` fails with "Unsupported state or unable to authenticate data" when trying to decrypt API keys stored in the database.

## Root Cause Analysis

### Initial Hypothesis (Incorrect)
My initial fix was correct - the `decrypt()` method was not using the salt stored in `EncryptedData` to re-derive the key, instead using `this.key` from `initialize()`.

However, after fixing this (making `decrypt` async and using the stored salt), the error persists.

### Deeper Analysis

After debugging, found that **even re-encryption fails**:

```
encrypt → decrypt cycle fails even with same NEZHA_SECRET
```

This suggests the problem is in the `encrypt()` method itself, not just `decrypt()`.

### Key Findings

1. **NEZHA_SECRET is correctly loaded** (44 characters)
2. **encrypt() and decrypt() are mismatched**:
   - `encrypt()` uses `this.key` which was derived with a RANDOM salt during `initialize()`
   - `encrypt()` generates a NEW random salt for each encryption but doesn't use it for the key
   - The stored salt in `EncryptedData` is never used to derive the key during encryption

3. **The `encrypt()` method has a design flaw**:
   ```typescript
   async initialize(secret?: string): Promise<void> {
     const salt = crypto.randomBytes(SALT_LENGTH);  // ← Random salt generated
     this.key = await this.deriveKey(encryptionSecret, salt);
     // ← salt is LOST here, not stored
   }

   encrypt(plaintext: string): EncryptedData {
     const iv = crypto.randomBytes(IV_LENGTH);
     const salt = crypto.randomBytes(SALT_LENGTH);  // ← Another random salt
     // ...
     // ← PROBLEM: 'salt' is generated but 'this.key' was derived with DIFFERENT salt
     const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv, {...});
     // ...
     return { ..., salt: salt.toString('base64') };  // ← This salt won't match at decrypt
   }
   ```

## The Real Fix

Both `encrypt()` and `decrypt()` must use the SAME salt-based key derivation. The options are:

### Option A: Use a fixed/default salt for all encryption (not ideal for security)
### Option B: Store the salt used during encryption in `EncryptedData` AND use it to derive the key (correct approach)

For Option B, `encrypt()` should:
1. Generate a random salt
2. Derive a key using that salt
3. Use that derived key for encryption
4. Store the salt in the output

Currently `encrypt()` generates a salt but uses `this.key` (derived from a different salt during init).

## Files Affected
- `/Users/jk/gits/hub/tools_ai/nezha/src/services/EncryptionService.ts`

## Next Steps
1. Fix `encrypt()` to use the same salt for key derivation
2. Test encrypt/decrypt cycle
3. Test with existing encrypted data in database (may need re-encryption)