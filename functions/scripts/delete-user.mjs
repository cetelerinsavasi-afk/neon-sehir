#!/usr/bin/env node
// =============================================================================
// delete-user.mjs — Neon Şehir hesap silme aracı (YEREL, Faz 5b-2)
// =============================================================================
//
// İKİ MOD:
//   1) DENEME (varsayılan): Hiçbir veriyi değiştirmez. Firestore ve Auth'un
//      tüm yazma metotları kilitlenir (enforceReadOnly) ve kilit doğrulanır.
//   2) SİLME (--apply): Aynı planı yeniden hesaplar; ENGEL varsa hiçbir şey
//      yapmadan çıkar. Yoksa planı gösterir, [y/N] onayı ister, onaydan
//      HEMEN SONRA planı bir kez daha hesaplar (arada değişen bir şey var
//      mı?) ve adımları sırayla uygular. Her adım tekrar çalıştırılabilir
//      (idempotent): bir hata olursa durur; betik aynı komutla yeniden
//      çalıştırıldığında kaldığı yerden devam eder.
//
// Çalıştırma (proje kökünden; ayrıntı: docs/HESAP_SILME_REHBERI.md):
//   node functions/scripts/delete-user.mjs --email oyuncu@gmail.com --key C:\guvenli\neon-sehir-admin.json
//   node functions/scripts/delete-user.mjs --uid <UID> --email <e-posta> --key <anahtar> --apply
//
// Seçenekler:
//   --uid <uid>          Silinecek hesabın Firebase uid'si
//   --email <e-posta>    Talebi gönderen e-posta; hesabın Auth e-postasıyla
//                        EŞLEŞMESİ kontrol edilir. --apply için ZORUNLU.
//   --key <dosya>        Firebase servis hesabı anahtarı (JSON). Verilmezse
//                        GOOGLE_APPLICATION_CREDENTIALS ortam değişkeni kullanılır.
//   --project <id>       Firebase proje kimliği (varsayılan: neon-sehir)
//   --json <dosya>       Tam planı JSON olarak da kaydet
//   --verbose            Her kategorideki TÜM doküman yollarını yaz (varsayılan: ilk 5)
//   --apply              GERÇEK SİLME. Etkileşimli [y/N] onayı ister; terminal
//                        değilse (ör. başka bir programdan çağrılırsa) çalışmaz.
//
// --apply modunda oyunun kendi Cloud Functions kodu (functions/index.js)
// yüklenir ve bazı işlemler (takımı sisteme devretme, menajerlikten ayrılma,
// çeteden ayrılma, soygun planından çıkma) oyuncunun kimliğiyle, CANLIDAKİ
// fonksiyonun .run() metodu üzerinden BİREBİR AYNI kodla yapılır.
//
// Bu dosya functions/scripts/ altındadır: functions/node_modules içindeki
// firebase-admin'i kullanır (yeni paket yok) ve firebase.json'daki
// "scripts/**" kuralı sayesinde Cloud Functions'a DEPLOY EDİLMEZ.
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
// v62: çekirdek functions/accountDeletion.js'e taşındı (Yönetim Paneli de kullanır)
export * from '../accountDeletion.js';
import { enforceReadOnly, buildDeletionPlan, applyPlan, formatPlan, planFingerprint } from '../accountDeletion.js';

// -----------------------------------------------------------------------------
// Komut satırı
// -----------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--uid') a.uid = next();
    else if (k === '--email') a.email = next();
    else if (k === '--key') a.key = next();
    else if (k === '--project') a.project = next();
    else if (k === '--json') a.json = next();
    else if (k === '--verbose') a.verbose = true;
    else if (k === '--apply') a.apply = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else throw new Error(`Bilinmeyen seçenek: ${k}`);
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.uid && !args.email)) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 40).join('\n'));
    process.exit(args.help ? 0 : 2);
  }
  const projectId = args.project || 'neon-sehir';
  if (args.key) process.env.GOOGLE_APPLICATION_CREDENTIALS = args.key;
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || projectId;
  const log = (m) => console.error(`… ${m}`);

  if (args.apply) {
    if (!args.email) {
      console.error('✗ --apply için --email ZORUNLU (talebi gönderen adres; hesapla eşleşmesi kontrol edilir).');
      process.exit(2);
    }
    if (!process.stdin.isTTY) {
      console.error('✗ --apply yalnızca etkileşimli bir terminalde çalışır ([y/N] onayı gerekir).');
      process.exit(2);
    }
  }

  let db, auth, FieldPath, FieldValue, callables = null;
  if (args.apply) {
    // Oyunun kendi Cloud Functions kodu: varsayılan admin uygulamasını o başlatır.
    console.error('… Oyun fonksiyonları yükleniyor (functions/index.js)…');
    const fns = await import('../index.js');
    const pick = (name) => {
      const f = fns[name];
      if (!f || typeof f.run !== 'function') throw new Error(`functions/index.js içinde ${name}.run bulunamadı`);
      return (req) => f.run(req);
    };
    callables = Object.fromEntries(['sellFutbolTeam', 'resignFutbolManager', 'leaveHeistPlan', 'cancelHeistPlan', 'gangAction'].map((n) => [n, pick(n)]));
    const fs = await import('firebase-admin/firestore');
    db = fs.getFirestore();
    FieldPath = fs.FieldPath;
    FieldValue = fs.FieldValue;
    const { getAuth } = await import('firebase-admin/auth');
    auth = getAuth();
  } else {
    const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
    const fs = await import('firebase-admin/firestore');
    const { getAuth } = await import('firebase-admin/auth');
    const credential = args.key ? cert(JSON.parse(readFileSync(args.key, 'utf8'))) : applicationDefault();
    const app = initializeApp({ credential, projectId });
    db = fs.getFirestore(app);
    FieldPath = fs.FieldPath;
    auth = getAuth(app);
  }

  // Plan her zaman salt-okunur kilit altında hesaplanır.
  const makePlan = async () => {
    const unlock = enforceReadOnly(db, auth);
    try {
      return await buildDeletionPlan({ db, auth, uid: args.uid, email: args.email, FieldPath, log });
    } finally {
      unlock();
    }
  };

  const plan = await makePlan();
  plan.mode = args.apply ? 'APPLY' : 'DRY-RUN';
  console.log(formatPlan(plan, { verbose: args.verbose }));
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(plan, null, 2));
    console.error(`Plan JSON olarak kaydedildi: ${args.json}`);
  }
  if (!args.apply) process.exit(plan.blocker.length ? 1 : 0);

  // ---- --apply ----
  if (plan.blocker.length) {
    console.error('\n✗ ENGEL VAR — hiçbir şey yapılmadı.');
    process.exit(1);
  }
  if (plan.identity.emailMatches !== true) {
    console.error('\n✗ Talep e-postası hesapla eşleşmedi/kontrol edilemedi — hiçbir şey yapılmadı.');
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question(
    `\n⚠️  BU İŞLEM GERİ ALINAMAZ.\n   ${plan.identity.authEmail} (${plan.uid}) hesabı yukarıdaki plana göre silinecek.\n   Devam edilsin mi? [y/N] `
  );
  rl.close();
  if (!/^(y|yes|e|evet)$/i.test(answer.trim())) {
    console.error('Vazgeçildi — hiçbir şey yapılmadı.');
    process.exit(0);
  }

  // Onaydan HEMEN SONRA planı yeniden hesapla (bekleme sırasında bir şey değiştiyse dur)
  console.error('… Plan yeniden kontrol ediliyor…');
  const fresh = await makePlan();
  if (fresh.blocker.length) {
    console.error('✗ Onaydan sonra yeni bir ENGEL oluştu — hiçbir şey yapılmadı:\n' + fresh.blocker.map((b) => `   - ${b.what}`).join('\n'));
    process.exit(1);
  }
  if (planFingerprint(fresh) !== planFingerprint(plan)) {
    console.error('✗ Onay beklenirken hesabın verisi değişti (oyuncu bu arada oynamış olabilir). Hiçbir şey yapılmadı — betiği yeniden çalıştır.');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const res = await applyPlan({ db, auth, FieldValue, callables, plan: fresh, log: (m) => console.error(m) });
  const auditFile = `silme-kaydi-${plan.uid}-${startedAt.replace(/[:.]/g, '-')}.json`;
  writeFileSync(auditFile, JSON.stringify({ uid: plan.uid, startedAt, finishedAt: new Date().toISOString(), ok: res.ok, failedAt: res.failedAt || null, results: res.results }, null, 2));
  if (!res.ok) {
    console.error(`\n✗ İşlem "${res.failedAt}" adımında durdu. Hesap girişe KAPALI kaldı. Hatayı giderip AYNI komutu tekrar çalıştır; kalan adımlardan devam eder.\n   Kayıt: ${auditFile}`);
    process.exit(1);
  }

  // Son doğrulama
  const after = await makePlan();
  const gone = after.blocker.some((b) => b.what === 'HESAP YOK');
  console.error(`\n${gone ? '✓ SİLME TAMAMLANDI — hesap artık yok.' : '⚠️  Silme adımları bitti ama hesap hâlâ görünüyor; betiği --uid ile tekrar çalıştırıp raporu incele.'}`);
  console.error(`   Kayıt: ${auditFile}  ·  24 saat sonra aynı komutu (deneme modunda) tekrar çalıştırıp "HESAP YOK" gör.`);
  process.exit(gone ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
