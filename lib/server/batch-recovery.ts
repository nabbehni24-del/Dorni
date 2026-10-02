import "server-only";
import { createHmac } from "node:crypto";
import { claimDigest } from "./security";
import type { GeneratedCode } from "./code-engine";

// Separate keys/labels keep public QR material unrelated to private claim proofs.
// Keep this key stable for retries. Rotation requires an explicit versioned rollout.
export async function recoverableCodes(quantity: number, userId: string, organizationId: string | null, productType: string, requestKey: string): Promise<GeneratedCode[]> {
  const secret = process.env.BATCH_GENERATION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("BATCH_GENERATION_SECRET must contain at least 32 bytes");
  const scope = JSON.stringify(["batch-v1", userId, organizationId, productType, quantity, requestKey]);
  const derive = (label: string, i: number) => createHmac("sha256", secret).update(JSON.stringify([scope, label, i])).digest("hex");
  return Promise.all(Array.from({ length: quantity }, async (_, i) => {
    const serialNumber = `DRN-V1-${derive("serial", i).slice(0, 24).toUpperCase()}`;
    const claimCode = derive("private-claim", i).slice(0, 32).toUpperCase();
    return { serialNumber, claimCode, publicToken: derive("public-qr", i), credentialHash: await claimDigest(serialNumber, claimCode) };
  }));
}
