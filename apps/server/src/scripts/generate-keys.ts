/**
 * Generate RS256 key pair for JWT signing.
 * Run once: npx tsx src/scripts/generate-keys.ts
 */
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });

  const privPem = await exportPKCS8(privateKey);
  const pubPem = await exportSPKI(publicKey);

  const keysDir = resolve(import.meta.dirname ?? ".", "..", "..", "keys");
  mkdirSync(keysDir, { recursive: true });

  writeFileSync(resolve(keysDir, "private.pem"), privPem);
  writeFileSync(resolve(keysDir, "public.pem"), pubPem);

  console.log(`✓ Keys written to ${keysDir}`);
}

main().catch(console.error);
