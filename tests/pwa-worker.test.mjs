import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function worker(fetchImpl = async () => ({ online: true })) {
  const events = {}, stored = [], notifications = [], opened = [];
  const context = {
    URL, fetch: fetchImpl,
    caches: { open: async () => ({ add: async path => stored.push(path) }), match: async () => ({ offline: true }), keys: async () => [], delete: async () => true },
    self: { location: { origin: "https://dorni.example" }, addEventListener: (type, handler) => events[type] = handler,
      skipWaiting: () => {}, registration: { showNotification: async (title, options) => notifications.push({ title, ...options }) },
      clients: { claim: async () => {}, matchAll: async () => [], openWindow: async url => opened.push(url) } },
  };
  vm.runInNewContext(source, context);
  return { events, stored, notifications, opened };
}
test("installation caches only a public offline document", async () => {
  const w = worker(); let promise;
  w.events.install({ waitUntil: value => promise = value }); await promise;
  assert.deepEqual(w.stored, ["/offline.html"]);
});
test("worker leaves API responses, mutations and external requests untouched", () => {
  const w = worker();
  for (const request of [
    { method: "POST", mode: "navigate", url: "https://dorni.example/api/public/reports" },
    { method: "GET", mode: "navigate", url: "https://dorni.example/api/me" },
    { method: "GET", mode: "cors", url: "https://dorni.example/api/me/reports" },
    { method: "GET", mode: "navigate", url: "https://other.example/" },
  ]) w.events.fetch({ request, respondWith: () => assert.fail("Request must not be intercepted") });
});
test("offline navigation uses fallback; online private pages are never cached", async () => {
  for (const offline of [false,true]) {
    const w = worker(async () => { if (offline) throw Error("offline"); return { online: true }; });
    let response;
    w.events.fetch({ request: { method:"GET", mode:"navigate", url:"https://dorni.example/app" }, respondWith: value => response = value });
    assert.deepEqual(await response, offline ? { offline:true } : { online:true });
    assert.equal(w.stored.length,0);
  }
});
test("malformed push still displays an alert and cannot redirect outside Dorni", async () => {
  const w = worker(); let promise;
  w.events.push({ data:{json:()=>{throw Error("invalid")}},waitUntil:value=>promise=value }); await promise;
  assert.equal(w.notifications[0].title,"دورني");
  w.events.notificationclick({ notification:{close:()=>{},data:{url:"https://evil.example"}},waitUntil:value=>promise=value }); await promise;
  assert.deepEqual(w.opened,["https://dorni.example/app?tab=alerts"]);
});
