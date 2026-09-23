import { system, PREVIEW_UID } from './backend.js';
export function getFunctions() {
  return {};
}
export function httpsCallable(functions, name) {
  return async (data) => {
    const request = { auth: { uid: PREVIEW_UID }, data };
    try {
      if (name === 'gangAction') return { data: await system.handleAction(request) };
      if (name === 'gangAdmin') return { data: await system.handleAdmin(request) };
      return { data: { ok: true } };
    } catch (err) {
      const e = new Error(err.message);
      e.code = `functions/${err.code || 'internal'}`;
      throw e;
    }
  };
}
