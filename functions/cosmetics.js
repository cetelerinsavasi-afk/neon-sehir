// =============================================================================
// v78 — EVCİL HAYVAN & AKSESUAR (cosmeticsAction)
//   op 'buy'    { kind:'pet'|'acc', id }      → altın/zümrüt düşer, sahip olunur,
//                                               hemen kuşanılır
//   op 'equip'  { kind, id }                  → sahip olunan ürünü kuşan
//   op 'unequip'{ kind, slot? }               → hayvanı / bir aksesuar yuvasını çıkar
//   op 'leash'  { on?, color? }               → tasma aç/kapat, rengini değiştir
//   op 'save'   { pet: {id,leash,leashColor}|null, acc: {slot:id} }
//                                             → v79 Kaydet: önizlemedeki tüm
//                                               görünümü tek seferde kuşan; sahip
//                                               olunmayanlar atlanır (skipped)
//   v160 KOSTÜMLER (hazır tipler, sadece zümrüt):
//   op 'buy'    { kind:'look', id, tint? }    → satın al + seçilen renklerle kuşan
//   op 'equip'  { kind:'look', id, tint? }    → sahip olunan kostümü kuşan
//   op 'unequip'{ kind:'look' }               → kostümü çıkar (kendi avatarına dön)
//   op 'lookTint'{ tint }                     → kuşanılı kostümün renkleri (ücretsiz)
// Kuşanılanlar users/{uid}.avatar içine yazılır (avatar.acc / avatar.pet):
// mekânlara giriş fonksiyonları avatarı zaten buradan kopyaladığı için
// hayvan ve aksesuarlar herkesin ekranında görünür. Satın alınmayan ürün
// avatara asla yazılamaz (önizleme sadece istemcide).
// =============================================================================
import { PET_MAP, ACC_MAP, ACC_SLOTS, LEASH_COLORS, LOOK_MAP, priceOf, cleanEquipped, cleanLookTint } from './cosmeticsData.js';
import { goldTag } from './moneyLog.js';

export function createCosmetics({ db, FieldValue, HttpsError, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const itemOf = (kind, id) => (kind === 'pet' ? PET_MAP[id] : kind === 'acc' ? ACC_MAP[id] : kind === 'look' ? LOOK_MAP[id] : null);

  async function action(uid, p = {}) {
    if (!uid) fail('unauthenticated', 'Giriş yapmalısın.');
    const op = String(p.op || '');
    const userRef = db.collection('users').doc(uid);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) fail('failed-precondition', 'Oyuncu bulunamadı.');
      const user = snap.data();
      const cos = { pets: { ...(user.cosmetics?.pets || {}) }, accs: { ...(user.cosmetics?.accs || {}) }, looks: { ...(user.cosmetics?.looks || {}) } };
      const avatar = { ...(user.avatar || {}) };
      let equipped = cleanEquipped(avatar, cos);
      const patch = {};
      let result = { ok: true };

      if (op === 'buy' || op === 'equip') {
        const kind = p.kind;
        const item = itemOf(kind, String(p.id || ''));
        if (!item) fail('invalid-argument', 'Geçersiz ürün.');
        const bag = kind === 'pet' ? cos.pets : kind === 'look' ? cos.looks : cos.accs;
        if (op === 'buy') {
          if (bag[item.id]) fail('already-exists', 'Bu ürün zaten sende.');
          const pr = kind === 'look' ? { currency: 'gem', amount: item.gem } : priceOf(item);
          if (pr.currency === 'gold') {
            if (Number(user.gold || 0) < pr.amount) fail('failed-precondition', `Yetersiz altın (${pr.amount.toLocaleString('tr-TR')} gerekli).`);
            patch.gold = FieldValue.increment(-pr.amount);
            patch.goldTag = goldTag('aksesuar');
          } else {
            if (Number(user.emerald || 0) < pr.amount) fail('failed-precondition', `Yetersiz zümrüt (${Number(user.emerald || 0)} / ${pr.amount}).`);
            patch.emerald = FieldValue.increment(-pr.amount);
          }
          bag[item.id] = now();
          patch[`cosmetics.${kind === 'pet' ? 'pets' : kind === 'look' ? 'looks' : 'accs'}.${item.id}`] = bag[item.id];
          result = { ok: true, bought: item.id, price: pr };
        } else if (!bag[item.id]) fail('failed-precondition', 'Önce satın almalısın.');
        // kuşan
        if (kind === 'pet') equipped.pet = { id: item.id, leash: equipped.pet?.leash !== false, leashColor: equipped.pet?.leashColor || LEASH_COLORS[0] };
        else if (kind === 'look') {
          equipped.look = item.id;
          const t = cleanLookTint(p.tint);
          if (t) equipped.lookTint = t;
          else delete equipped.lookTint;
        } else equipped.acc = { ...(equipped.acc || {}), [item.slot]: item.id };
      } else if (op === 'unequip') {
        if (p.kind === 'pet') delete equipped.pet;
        else if (p.kind === 'look') {
          delete equipped.look;
          delete equipped.lookTint;
        } else if (p.kind === 'acc') {
          const slot = String(p.slot || '');
          if (!ACC_SLOTS[slot]) fail('invalid-argument', 'Geçersiz yuva.');
          if (equipped.acc) {
            delete equipped.acc[slot];
            if (!Object.keys(equipped.acc).length) delete equipped.acc;
          }
        } else if (p.kind === 'all') equipped = {};
        else fail('invalid-argument', 'Geçersiz tür.');
      } else if (op === 'lookTint') {
        if (!equipped.look) fail('failed-precondition', 'Önce bir kostüm kuşan.');
        const t = cleanLookTint(p.tint);
        if (t) equipped.lookTint = t;
        else delete equipped.lookTint;
      } else if (op === 'leash') {
        if (!equipped.pet) fail('failed-precondition', 'Önce bir evcil hayvan kuşan.');
        if (p.on !== undefined) equipped.pet.leash = Boolean(p.on);
        if (p.color !== undefined) {
          if (!LEASH_COLORS.includes(p.color)) fail('invalid-argument', 'Geçersiz tasma rengi.');
          equipped.pet.leashColor = p.color;
          equipped.pet.leash = true;
        }
      } else if (op === 'save') {
        // Sahip olunmayan ürün kaydedilmez: o yuvada önceden kuşanılmış olan kalır.
        const want = {};
        const skipped = [];
        if (p.pet && typeof p.pet === 'object') {
          const id = String(p.pet.id || '');
          if (!PET_MAP[id]) fail('invalid-argument', 'Geçersiz evcil hayvan.');
          if (!cos.pets[id]) {
            skipped.push(id);
            if (equipped.pet) want.pet = equipped.pet;
          } else want.pet = { id, leash: p.pet.leash !== false, leashColor: LEASH_COLORS.includes(p.pet.leashColor) ? p.pet.leashColor : LEASH_COLORS[0] };
        }
        const srcAcc = p.acc && typeof p.acc === 'object' ? p.acc : {};
        const acc = {};
        for (const slot of Object.keys(srcAcc)) {
          const id = String(srcAcc[slot] || '');
          if (!ACC_SLOTS[slot] || ACC_MAP[id]?.slot !== slot) fail('invalid-argument', 'Geçersiz aksesuar.');
          if (!cos.accs[id]) {
            skipped.push(id);
            if (equipped.acc?.[slot]) acc[slot] = equipped.acc[slot];
          } else acc[slot] = id;
        }
        if (Object.keys(acc).length) want.acc = acc;
        // v160: Aksesuarlar'daki Kaydet kuşanılı kostüme dokunmaz
        if (equipped.look) {
          want.look = equipped.look;
          if (equipped.lookTint) want.lookTint = equipped.lookTint;
        }
        equipped = cleanEquipped(want, cos);
        result = { ok: true, skipped };
      } else fail('invalid-argument', 'Geçersiz işlem.');

      // avatar.acc / avatar.pet güncelle (avatarın geri kalanına dokunma)
      const nextAvatar = { ...avatar };
      delete nextAvatar.acc;
      delete nextAvatar.pet;
      delete nextAvatar.look;
      delete nextAvatar.lookTint;
      Object.assign(nextAvatar, cleanEquipped(equipped, cos));
      patch.avatar = nextAvatar;
      tx.update(userRef, patch);
      return { ...result, equipped: cleanEquipped(equipped, cos) };
    });
  }

  return { action };
}
