import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authRoute = new URL("../app/api/auth/[action]/route.ts", import.meta.url);
const recoveryRoute = new URL("../app/auth/recovery/route.ts", import.meta.url);
const callbackRoute = new URL("../app/auth/callback/route.ts", import.meta.url);
const publicOrigin = new URL("../lib/server/public-origin.ts", import.meta.url);

test("password recovery email uses the allow-listed callback on the public app origin", async () => {
  const source = await readFile(authRoute, "utf8");
  assert.match(source, /new URL\("\/auth\/callback",publicOrigin\(request\)\)/);
  assert.match(source, /redirect\.searchParams\.set\("next","\/reset-password"\)/);
  assert.match(source, /resetPasswordForEmail/);
});

test("recovery callback always finishes on the new-password screen", async () => {
  const source = await readFile(recoveryRoute, "utf8");
  assert.match(source, /exchangeCodeForSession/);
  assert.match(source, /verifyOtp/);
  assert.match(source, /getUser/);
  assert.match(source, /new URL\("\/reset-password", origin\)/);
});

test("auth redirects never expose Render's internal service origin", async () => {
  const [originSource, callbackSource, recoverySource] = await Promise.all([
    readFile(publicOrigin, "utf8"),
    readFile(callbackRoute, "utf8"),
    readFile(recoveryRoute, "utf8"),
  ]);
  assert.match(originSource, /NEXT_PUBLIC_APP_URL/);
  assert.match(callbackSource, /publicOrigin\(request\)/);
  assert.match(recoverySource, /publicOrigin\(request\)/);
  assert.doesNotMatch(callbackSource, /new URL\([^\n]+url\.origin/);
  assert.doesNotMatch(recoverySource, /new URL\([^\n]+url\.origin/);
});

test("legacy recovery links do not fall through to the normal account destination", async () => {
  const source = await readFile(callbackRoute, "utf8");
  assert.match(source, /type === "recovery" \? "\/reset-password" : "\/app"/);
  assert.match(source, /next === "\/reset-password"/);
});

