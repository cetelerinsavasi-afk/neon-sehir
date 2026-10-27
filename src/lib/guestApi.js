// v134 — MİSAFİR (giriş yapmamış) görünümü için salt-okuma çağrıları.
// Firestore kuralları girişsiz okumaya izin vermediği için veriler sunucudan gelir
// (functions/houses.js guestPlaces / guestHouse / guestLeagues · gangAction guestView).
// Sunucu zaten önbellekler; burada da kısa bir istemci önbelleği var.
import { houseAction } from '../services/gameActions';
import { callGang } from '../components/Gangs/gangApi';

const memo = new Map();
async function cached(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const data = await fn();
  memo.set(key, { at: Date.now(), data });
  return data;
}

export const guestPlaces = (type) => cached(`places:${type}`, 60_000, async () => (await houseAction({ op: 'guestPlaces', type })).data?.list || []);
export const guestHouse = (houseId) => cached(`house:${houseId}`, 60_000, async () => {
  const d = (await houseAction({ op: 'guestHouse', houseId })).data;
  return d?.ok ? d.house : null;
});
export const guestLeagues = () => cached('leagues', 60_000, async () => (await houseAction({ op: 'guestLeagues' })).data);
export const guestGangs = () => cached('gangs', 30_000, () => callGang({ world: 'live' }, 'guestView'));
