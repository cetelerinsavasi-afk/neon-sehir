export const ADMIN_UIDS = ['previewAdmin'];
export function isAdminUid(uid) {
  return ADMIN_UIDS.includes(uid);
}
