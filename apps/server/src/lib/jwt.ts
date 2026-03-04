import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { importPKCS8, importSPKI, SignJWT, jwtVerify } from "jose";
import type { Env } from "../config/env.js";

let privateKey: CryptoKey;
let publicKey: CryptoKey;

/**
 * Load JWT keys from either:
 * 1. Inline env vars (JWT_PRIVATE_KEY / JWT_PUBLIC_KEY) – for containerized deployments
 * 2. File paths (JWT_PRIVATE_KEY_PATH / JWT_PUBLIC_KEY_PATH) – for local development
 */
export async function initJwt(env: Env) {
  const privPem =
    process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, "\n") ??
    readFileSync(resolve(env.JWT_PRIVATE_KEY_PATH), "utf-8");
  const pubPem =
    process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, "\n") ??
    readFileSync(resolve(env.JWT_PUBLIC_KEY_PATH), "utf-8");

  privateKey = await importPKCS8(privPem, "RS256");
  publicKey = await importSPKI(pubPem, "RS256");
}

export interface JwtPayload {
  hostId: string;
  role: "host";
}

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .setIssuer("melo")
    .sign(privateKey);
}

export async function signRefreshToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("melo")
    .sign(privateKey);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: "melo",
  });

  return {
    hostId: payload.hostId as string,
    role: payload.role as "host",
  };
}
