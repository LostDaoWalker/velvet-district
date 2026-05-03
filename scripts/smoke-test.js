const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3020";
const email = `smoke-${Date.now()}@example.com`;
const password = "velvet-test-pass";
let cookie = "";

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(options.headers || {})
    },
    ...options
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${body.error || response.statusText}`);
  return body;
}

await request("/healthz");
await request("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ email, password, crewName: "Smoke Velvet" })
});
await request("/api/player/daily", { method: "POST" });
await request("/api/player/pull", { method: "POST", body: JSON.stringify({ count: 10 }) });
const worked = await request("/api/player/work", { method: "POST", body: JSON.stringify({ districtId: "boutique" }) });

if (!worked.user?.profile?.crewName || worked.derived.collectionCount < 1) {
  throw new Error("Smoke test did not return expected game state.");
}

console.log(`Smoke test passed for ${worked.user.profile.crewName}.`);
