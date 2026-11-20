// =============================================================================
// v168.1 — Senaryo karakterleri: fotoğrafa girebilenler (sunucu + istemci ortak).
// Rıza Amca sadece oyuncunun cihazında yaşar (ağda / Firestore'da kaydı yok). Şehir fotoğrafında da
// görünsün diye sunucu onu adı ve görünüşü BURADAN (istemciden değil) yazarak kabul eder;
// sadece fotoğrafı çekenin yakınındaysa (sahte uzak kare olmasın).
// =============================================================================
export const AMCA_ID = 'npc_riza_amca';
export const AMCA_CAR_ID = 1; // oyunun en ucuz arabası
export const AMCA_AVATAR = { eyeColor: '#2a2a2a', lipColor: '#9a5a50', earring: 'yok', tattoo: 'yok', neckAcc: 'none', hat: 'none', hatColor: '#0d0d0d', heldItem: 'yok', faceAcc: 'none',  gender: 'erkek', build: 'iri', skin: '#b97f58', eyeColor: '#3b2a1a', faceShape: 'square', hairStyle: 'slick', hairColor: '#9b968e', eyebrowShape: 'thick', eyeShape: 'hooded', noseShape: 'aquiline', mouthShape: 'smile', facialHair: 'mustache', clothing: 'leather', clothColor: '#4a3326', pantsColor: '#2b2a28', shoeColor: '#1a1410', shoeStyle: 'klasik', background: '#2a1c14' };
export const PHOTO_NPCS = { [AMCA_ID]: { name: 'Rıza Amca', avatar: AMCA_AVATAR, carId: AMCA_CAR_ID } };
export const PHOTO_NPC_NEAR = 45; // fotoğrafı çekene en fazla bu kadar yakın (m)
export const isPhotoNpc = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PHOTO_NPCS, id);
