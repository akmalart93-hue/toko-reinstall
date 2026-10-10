// Cloudflare Pages Function -> alamat: /api/prices
// Butuh: KV binding bernama PRICES_KV dan variabel ADMIN_PASSWORD

const KEY = "data";
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: HEADERS });

async function sha(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function passOk(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const [a, b] = await Promise.all([sha(request.headers.get("x-admin-password") || ""), sha(env.ADMIN_PASSWORD)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const date = v => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

function sanitize(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.categories)) return null;
  const wa = String(d.waNumber || "").replace(/\D/g, "");
  if (wa.length < 9 || wa.length > 16) return null;
  const categories = d.categories.slice(0, 20).map(c => ({
    name: str(c && c.name, 60) || "Tanpa Nama",
    items: (Array.isArray(c && c.items) ? c.items : []).slice(0, 50).map(p => ({
      name: str(p && p.name, 100) || "Paket",
      price: Math.max(0, Math.min(1e9, Math.round(Number(p && p.price) || 0))),
      badge: str(p && p.badge, 20),
      promoPrice: Math.max(0, Math.min(1e9, Math.round(Number(p && p.promoPrice) || 0))),
      promoStart: date(p && p.promoStart),
      promoEnd: date(p && p.promoEnd),
      promoNote: str(p && p.promoNote, 120),
      features: (Array.isArray(p && p.features) ? p.features : []).slice(0, 20).map(f => str(f, 120)).filter(Boolean),
    })),
  }));
  const pr = d.promo || {};
  const promo = { enabled: !!pr.enabled, text: str(pr.text, 160), start: date(pr.start), end: date(pr.end) };
  return { waNumber: wa, promo, categories };
}

// Publik: dibaca oleh website
export async function onRequestGet({ env }) {
  if (!env.PRICES_KV) return json({ error: "KV PRICES_KV belum dipasang" }, 500);
  const raw = await env.PRICES_KV.get(KEY);
  if (!raw) return json({ error: "belum ada data" }, 404);
  return new Response(raw, { headers: HEADERS });
}

// Cek password (dipakai halaman login admin)
export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD belum diisi di Cloudflare" }, 500);
  if (!(await passOk(request, env))) return json({ error: "Password salah" }, 401);
  return json({ ok: true });
}

// Simpan perubahan (butuh password)
export async function onRequestPut({ request, env }) {
  if (!env.PRICES_KV) return json({ error: "KV PRICES_KV belum dipasang" }, 500);
  if (!env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD belum diisi di Cloudflare" }, 500);
  if (!(await passOk(request, env))) return json({ error: "Password salah" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Data tidak valid" }, 400); }
  const clean = sanitize(body);
  if (!clean) return json({ error: "Data tidak valid (cek nomor WhatsApp)" }, 400);
  await env.PRICES_KV.put(KEY, JSON.stringify(clean));
  return json({ ok: true });
}
