// =============================================================================
// v165 — GEÇİCİ ÖLÇÜM: Firestore okumaları HANGİ dinleyiciden / sorgudan geliyor?
//
// Oyuna etkisi yok:
//  • Oturumların yalnızca küçük bir kısmında (READ_STATS_RATE) açılır; diğerlerinde
//    sayaç hiç çalışmaz (her çağrıda tek bir "açık mı" kontrolü).
//  • Uygulamanın gördüğü veriye, dinleyicilerin ayarlarına, sırasına dokunmaz;
//    sadece gelen anlık görüntüleri SAYAR (hatalar yutulur, oyuna asla yansımaz).
//  • Ek Firestore / RTDB okuması-yazması YOK. Özet ~10 dk'da bir `clientReadStats`
//    fonksiyonuna gider; o da sadece Cloud Logging'e yazar.
//  • Açılması için public/neon-flags.json içinde "readStats": true olmalı (dosya yoksa,
//    okunamazsa ya da false ise KAPALI). Kapatmak: olcum-kapat.bat. Ayrıca READ_STATS_END
//    tarihinden sonra kendiliğinden kapanır. Tek cihazda kapatmak: localStorage
//    'neon.noReadStats' = '1'.
//
// Sayım kuralları (Firestore faturalamasına yakın tahmin):
//  • kesin  : sunucudan gelen anlık görüntüde değişen belge sayısı (ilk yükleme = tüm
//             belgeler); boş sonuçlu sorgu 1; getDocs/getDoc sunucudan geldiyse belge sayısı (en az 1)
//  • olası  : önbellekten başlayan dinleyicinin önbellekteki belge sayısı (son bağlantıdan
//             30 dk'dan fazla geçtiyse Firestore bunları yeniden faturalar; geçmediyse etmez)
//             + ağ 30 dk'dan uzun kapalı kalıp açıldığında açık dinleyicilerin belge sayısı
// =============================================================================
export const READ_STATS_RATE = 0.1;
// v187: 3 günlük ikinci ölçüm (v165'teki 21 Kasım'da bitmişti)
export const READ_STATS_END = Date.parse('2026-11-27T00:00:00+03:00');
export const REPORT_MS = 10 * 60 * 1000;
export const RESUME_REBILL_MS = 30 * 60 * 1000;
const MAX_BUCKETS = 80;

// belge kimliklerini '*' yapar; sabit adlı belgeler (current, config, presence…) kalır
export function pathPattern(path) {
  return String(path || '')
    .split('/')
    .map((seg, i) => (i % 2 === 0 ? seg : /^[a-z][a-zA-Z]{1,24}$/.test(seg) ? seg : '*'))
    .join('/');
}

const OPS = { '==': '==', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=', 'array-contains': '~', in: 'in', 'not-in': '!in', 'array-contains-any': '~any' };

function filterText(f) {
  if (!f) return '';
  if (Array.isArray(f.filters)) return f.filters.map(filterText).filter(Boolean).join(f.op === 'or' ? '|' : ',');
  const field = f.field?.canonicalString?.() || '';
  if (!field) return '';
  return `${field.replace(/\.[A-Za-z0-9_-]{16,}$/, '.*')}${OPS[f.op] || f.op || ''}`;
}

// ref/query → okunabilir etiket. Yalnızca desen; değerler (uid vb.) ASLA etikete girmez.
export function labelOf(target) {
  try {
    if (!target) return '?';
    if (target.type === 'document') return `doc:${pathPattern(target.path)}`;
    if (target.type === 'collection' && !target._query?.filters?.length) return `col:${pathPattern(target.path)}`;
    const q = target._query;
    if (q) {
      const base = q.collectionGroup ? `cg:${q.collectionGroup}` : `q:${pathPattern(q.path?.canonicalString?.() || '')}`;
      const fs = (q.filters || []).map(filterText).filter(Boolean).join(',');
      const lim = q.limit != null ? ` L${q.limit}` : '';
      return `${base}${fs ? `[${fs}]` : ''}${lim}`;
    }
    if (target.path) return `col:${pathPattern(target.path)}`;
  } catch {
    /* yoksay */
  }
  return '?';
}

export function createMeter({ now = () => Date.now(), isVisible = () => true } = {}) {
  let buckets = new Map(); // label → [kesin, olası, olay, abone]
  const active = new Set(); // açık dinleyiciler { label, size }
  let pausedAt = 0;
  let windowStart = now();
  let visMs = 0;
  let visSince = isVisible() ? now() : null; // null: arka planda
  let total = 0;

  const bucket = (label) => {
    let b = buckets.get(label);
    if (!b) {
      if (buckets.size >= MAX_BUCKETS) label = '(diğer)';
      b = buckets.get(label);
      if (!b) {
        b = [0, 0, 0, 0];
        buckets.set(label, b);
      }
    }
    return b;
  };

  return {
    // dinleyici açıldı → anlık görüntü sayacı döner
    listen(target) {
      const label = labelOf(target);
      bucket(label)[3] += 1;
      const rec = { label, size: 0, first: true };
      active.add(rec);
      return {
        snap(snap) {
          try {
            const b = bucket(label);
            const fromCache = Boolean(snap?.metadata?.fromCache);
            const isQuery = typeof snap?.docChanges === 'function';
            const size = isQuery ? Number(snap.size) || 0 : snap?.exists?.() ? 1 : 0;
            rec.size = size;
            b[2] += 1;
            if (fromCache) {
              if (rec.first && size > 0) b[1] += size; // önbellekten açılış: olası yeniden okuma
            } else if (isQuery) {
              const n = snap.docChanges().length;
              const add = n > 0 ? n : rec.first ? 1 : 0;
              b[0] += add;
              total += add;
            } else {
              b[0] += 1;
              total += 1;
            }
            rec.first = false;
          } catch {
            /* sayım hatası oyuna yansımaz */
          }
        },
        close() {
          active.delete(rec);
        },
      };
    },
    // getDocs / getDoc sonucu
    got(target, snap) {
      try {
        if (snap?.metadata?.fromCache) return;
        const b = bucket(`${labelOf(target)} (get)`);
        const n = typeof snap?.docChanges === 'function' ? Math.max(1, Number(snap.size) || 0) : 1;
        b[0] += n;
        b[2] += 1;
        total += n;
      } catch {
        /* yoksay */
      }
    },
    networkOff() {
      pausedAt = now();
    },
    networkOn() {
      if (!pausedAt) return;
      const off = now() - pausedAt;
      pausedAt = 0;
      if (off <= RESUME_REBILL_MS) return;
      // 30 dk'dan uzun kopukluk: açık dinleyiciler baştan faturalanır (olası)
      for (const r of active) bucket(r.label)[1] += Math.max(1, r.size);
    },
    visibility(visible) {
      const t = now();
      if (visSince !== null) visMs += t - visSince;
      visSince = visible ? t : null;
    },
    // özeti alır ve sıfırlar
    take() {
      const t = now();
      if (visSince !== null) {
        visMs += t - visSince;
        visSince = t;
      }
      const out = { ms: t - windowStart, vis: visMs, b: Object.fromEntries(buckets), total };
      buckets = new Map();
      windowStart = t;
      visMs = 0;
      total = 0;
      return out;
    },
    _active: () => active.size,
  };
}

// onSnapshot argümanlarında (options?, onNext | observer, onError?, onCompletion?) ilk
// "sonraki" geri çağrısını sayaçla sarar; geri kalan her şey aynen kalır.
export function wrapListenerArgs(args, onSnap) {
  const out = args.slice();
  for (let i = 0; i < out.length; i += 1) {
    const a = out[i];
    if (typeof a === 'function') {
      out[i] = (snap) => {
        onSnap(snap);
        return a(snap);
      };
      return out;
    }
    if (a && typeof a === 'object' && typeof a.next === 'function') {
      out[i] = {
        next: (snap) => {
          onSnap(snap);
          return a.next(snap);
        },
        error: a.error ? (e) => a.error(e) : undefined,
        complete: a.complete ? () => a.complete() : undefined,
      };
      return out;
    }
  }
  return out;
}
