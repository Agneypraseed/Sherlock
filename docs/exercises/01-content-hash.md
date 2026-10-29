# Exercise 1: hash one image file

Write `server/audits/hash-file.ts` yourself with this exported function:

```ts
export async function hashImageFile(filePath: string): Promise<string>
```

It should read the bytes from disk and return a lowercase SHA-256 hexadecimal
digest (64 characters). Use Node's built-in modules; no new dependency is needed.
Stream the file rather than loading the complete file into memory. Propagate
read failures so a missing file cannot look like a successful hash.

Useful APIs: [createReadStream](https://nodejs.org/api/fs.html#fscreatereadstreampath-options),
[createHash and Hash](https://nodejs.org/api/crypto.html#class-hash).

Why: a content digest lets us group files by their bytes. A renamed copy should
match its source. A visually identical image saved with different encoding can
have different bytes; that belongs to the later visual-neighbor work.

Before submitting, check these cases:

1. Same file twice gives the same digest.
2. A byte-for-byte copy with a different filename gives the same digest.
3. Changing file bytes changes the digest.
4. A missing file rejects the promise.

Stop at hashing one file. Send your implementation for review before we connect
it to duplicate grouping, persisted findings, or API routes. There is deliberately
no implementation of your exercise in this repository.
