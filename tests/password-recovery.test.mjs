import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authRoute = new URL("../app/api/auth/[action]/route.ts", import.meta.url);
const recoveryRoute = new URL("../app/auth/recovery/route.ts", import.meta.url);
const callbackRoute = new URL("../app/auth/callback/route.ts", import.meta.url);

test("password recovery email uses a dedicated callback route", async () => {
  const source = await readFile(authRoute, "utf8");
  assert.match(source, /new URL\("\/auth\/recovery",request\.url\)/);
  assert.match(source, /resetPasswordForEmail/);
});

test("recovery callback always finishes on the new-password screen", async () => {
  const source = await readFile(recoveryRoute, "utf8");
  assert.match(source, /exchangeCodeForSession/);
  assert.match(source, /verifyOtp/);
  assert.match(source, /getUser/);
  assert.match(source, /new URL\("\/reset-password", url\.origin\)/);
});

test("legacy recovery links do not fall through to the normal account destination", async () => {
  const source = await readFile(callbackRoute, "utf8");
  assert.match(source, /type === "recovery" \? "\/reset-password" : "\/app"/);
  assert.match(source, /next === "\/reset-password"/);
});

