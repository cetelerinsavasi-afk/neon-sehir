// =============================================================================
// v78 — EVCİL HAYVAN & AKSESUAR (cosmeticsAction)
//   op 'buy'    { kind:'pet'|'acc', id }      → altın/zümrüt düşer, sahip olunur,
//                                               hemen kuşanılır
//   op 'equip'  { kind, id }                  → sahip olunan ürünü kuşan
//   op 'unequip'{ kind, slot? }               → hayvanı / bir aksesuar yuvasını çıkar
//   op 'leash'  { on?, color? }               → tasma aç/kapat, rengini değiştir
// Kuşanılanlar users/{uid}.avatar içine yazılır (avatar.acc / avatar.pet):
// mekânlara giriş fonksiyonları avatarı zaten buradan kopyaladığı için
// hayvan ve aksesuarlar herkesin ekranında görünür. Satın alınmayan ürün
// avatara asla yazılamaz (önizleme sadece istemcide).
// =============================================================================
import { PET_MAP, ACC_MAP, ACC_SLOTS, LEASH_COLORS, priceOf, cleanEquipped } from './cosmeticsData.js';

export function createCosmetics({ db, FieldValue, HttpsError, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const itemOf = (kind, id) => (kind === 'pet' ? PET_MAP[id] : kind === 'acc' ? ACC_MAP[id] : null);

  async function action(uid, p = {}) {
    if (!uid) fail('unauthenticated', 'Giriş yapmalısın.');
    const op = String(p.op || '');
    const userRef = db.collection('users').doc(uid);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) fail('failed-precondition', 'Oyuncu bulunamadı.');
      const user = snap.data();
      const cos = { pets: { ...(user.cosmetics?.pets || {}) }, accs: { ...(user.cosmetics?.accs || {}) } };
      const avatar = { ...(user.avatar || {}) };
      let equipped = cleanEquipped(avatar, cos);
      const patch = {};
      let result = { ok: true };

      if (op === 'buy' || op === 'equip') {
        const kind = p.kind;
        const item = itemOf(kind, String(p.id || ''));
        if (!item) fail('invalid-argument', 'Geçersiz ürün.');
        const bag = kind === 'pet' ? cos.pets : cos.accs;
        if (op === 'buy') {
          if (bag[item.id]) fail('already-exists', 'Bu ürün zaten sende.');
          const pr = priceOf(item);
          if (pr.currency === 'gold') {
            if (Number(user.gold || 0) < pr.amount) fail('failed-precondition', `Yetersiz altın (${pr.amount.toLocaleString('tr-TR')} gerekli).`);
            patch.gold = FieldValue.increment(-pr.amount);
          } else {
            if (Number(user.emerald || 0) < pr.amount) fail('failed-precondition', `Yetersiz zümrüt (${Number(user.emerald || 0)} / ${pr.amount}).`);
            patch.emerald = FieldValue.increment(-pr.amount);
          }
          bag[item.id] = now();
          patch[`cosmetics.${kind === 'pet' ? 'pets' : 'accs'}.${item.id}`] = bag[item.id];
          result = { ok: true, bought: item.id, price: pr };
        } else if (!bag[item.id]) fail('failed-precondition', 'Önce satın almalısın.');
        // kuşan
        if (kind === 'pet') equipped.pet = { id: item.id, leash: equipped.pet?.leash !== false, leashColor: equipped.pet?.leashColor || LEASH_COLORS[0] };
        else equipped.acc = { ...(equipped.acc || {}), [item.slot]: item.id };
      } else if (op === 'unequip') {
        if (p.kind === 'pet') delete equipped.pet;
        else if (p.kind === 'acc') {
          const slot = String(p.slot || '');
          if (!ACC_SLOTS[slot]) fail('invalid-argument', 'Geçersiz yuva.');
          if (equipped.acc) {
            delete equipped.acc[slot];
            if (!Object.keys(equipped.acc).length) delete equipped.acc;
          }
        } else if (p.kind === 'all') equipped = {};
        else fail('invalid-argument', 'Geçersiz tür.');
      } else if (op === 'leash') {
        if (!equipped.pet) fail('failed-precondition', 'Önce bir evcil hayvan kuşan.');
        if (p.on !== undefined) equipped.pet.leash = Boolean(p.on);
        if (p.color !== undefined) {
          if (!LEASH_COLORS.includes(p.color)) fail('invalid-argument', 'Geçersiz tasma rengi.');
          equipped.pet.leashColor = p.color;
          equipped.pet.leash = true;
        }
      } else fail('invalid-argument', 'Geçersiz işlem.');

      // avatar.acc / avatar.pet güncelle (avatarın geri kalanına dokunma)
      const nextAvatar = { ...avatar };
      delete nextAvatar.acc;
      delete nextAvatar.pet;
      Object.assign(nextAvatar, cleanEquipped(equipped, cos));
      patch.avatar = nextAvatar;
      tx.update(userRef, patch);
      return { ...result, equipped: cleanEquipped(equipped, cos) };
    });
  }

  return { action };
}
