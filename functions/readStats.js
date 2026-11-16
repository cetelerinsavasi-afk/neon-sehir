// =============================================================================
// v165 — GEÇİCİ ÖLÇÜM: istemci Firestore okumalarının KAYNAĞI
//
// Örneklenen (düşük oranlı) oturumlar, hangi dinleyicinin / sorgunun kaç belge okuduğunu
// birkaç dakikada bir özet olarak bu fonksiyona gönderir. Fonksiyon VERİTABANINA HİÇBİR
// ŞEY YAZMAZ ve OKUMAZ; özeti Cloud Logging'e tek satır yazar (jsonPayload.ns_read_stats).
// Kişisel veri tutulmaz: uid loglanmaz, yalnızca rastgele oturum kimliği + koleksiyon
// desenleri (belge kimlikleri istemcide '*' yapılır).
// Kapatma: istemci tarafında public/neon-flags.json { "readStats": false } (olcum-kapat.bat)
// ya da bitiş tarihi (READ_STATS_END). Fonksiyon kalsa da kimse çağırmaz.
// =============================================================================
const MAX_BUCKETS = 80;
const MAX_LABEL = 160;
const num = (v, max = 1e7) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};

// Gelen özeti güvenli, küçük bir nesneye çevirir (log şişmesin / kötüye kullanılmasın).
export function sanitizeReadStats(data) {
  const d = data && typeof data === 'object' ? data : {};
  const out = {
    v: num(d.v, 1e4),
    sid: String(d.sid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16),
    seq: num(d.seq, 1e4),
    ms: num(d.ms, 7 * 86400_000), // bu özetin kapsadığı süre
    vis: num(d.vis, 7 * 86400_000), // bunun görünür (önde) geçen kısmı
    rate: Math.min(1, Math.max(0, Number(d.rate) || 0)),
    app: String(d.app || '').slice(0, 12),
    b: {},
  };
  const b = d.b && typeof d.b === 'object' ? d.b : {};
  let n = 0;
  for (const [k, v] of Object.entries(b)) {
    if (n >= MAX_BUCKETS) break;
    if (!Array.isArray(v)) continue;
    const label = String(k).replace(/[^\w/*:.,=<>!~|\-[\] ]/g, '').slice(0, MAX_LABEL);
    if (!label) continue;
    // [kesin okuma, olası yeniden okuma, olay sayısı, abone sayısı]
    out.b[label] = [num(v[0]), num(v[1]), num(v[2]), num(v[3], 1e5)];
    n += 1;
  }
  return out;
}

export function createReadStats({ onCall, log = (o) => console.log(JSON.stringify(o)) }) {
  const clientReadStats = onCall({ memory: '128MiB', timeoutSeconds: 10, maxInstances: 3 }, (request) => {
    if (!request.auth) return { ok: false };
    const s = sanitizeReadStats(request.data);
    if (!s.sid) return { ok: false };
    log({ ns_read_stats: 1, ...s });
    return { ok: true };
  });
  return { clientReadStats };
}
