// UGC D2 — Oyuncunun görmemesi gereken içerik: şikâyetlerle otomatik
// (ya da yönetici tarafından) gizlenmiş içerik veya engellediği yazarın içeriği.
export function isHiddenForMe(item, authorUid, isBlocked) {
  return Boolean(item?.hidden) || isBlocked(authorUid);
}
