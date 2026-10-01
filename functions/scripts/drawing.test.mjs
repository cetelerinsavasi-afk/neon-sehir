// v72 — Sixtagram "Resim Çiz" doğrulaması (functions/drawingData.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDrawing, DRAW_MAX_POINTS, DRAW_MAX_STROKES } from '../drawingData.js';
import { nextReaction, replyQuoteOf } from '../chatExtras.js';

test('çizim: geçerli çizim aynen (yuvarlanmış) saklanır', () => {
  const r = sanitizeDrawing({ type: 'drawing', bg: 2, strokes: [{ c: 4, s: 1, p: [10.4, 20.6, 30, 40] }, { c: 0, s: 2, p: [500, 500] }], extra: 'x' });
  assert.deepEqual(r.drawing, { type: 'drawing', bg: 2, strokes: [{ c: 4, s: 1, p: [10, 21, 30, 40] }, { c: 0, s: 2, p: [500, 500] }] });
});

test('çizim: boş/hatalı/sınır dışı reddedilir', () => {
  assert.match(sanitizeDrawing({ bg: 0, strokes: [] }).error, /Boş tuval/);
  assert.ok(sanitizeDrawing({ bg: 99, strokes: [{ c: 0, s: 0, p: [1, 1] }] }).error);
  assert.ok(sanitizeDrawing({ bg: 0, strokes: [{ c: 99, s: 0, p: [1, 1] }] }).error);
  assert.ok(sanitizeDrawing({ bg: 0, strokes: [{ c: 0, s: 0, p: [1, 1, 2] }] }).error);
  assert.ok(sanitizeDrawing({ bg: 0, strokes: [{ c: 0, s: 0, p: [1, 1001] }] }).error);
  assert.ok(sanitizeDrawing({ bg: 0, strokes: [{ c: 0, s: 0, p: [1, '5'] }] }).error);
  assert.ok(sanitizeDrawing({ bg: 0, strokes: [{ c: 0, s: 0, p: [[1, 2]] }] }).error);
  const many = Array.from({ length: DRAW_MAX_STROKES + 1 }, () => ({ c: 0, s: 0, p: [1, 1] }));
  assert.ok(sanitizeDrawing({ bg: 0, strokes: many }).error);
  const big = { c: 0, s: 0, p: Array.from({ length: (DRAW_MAX_POINTS + 1) * 2 }, () => 5) };
  assert.match(sanitizeDrawing({ bg: 0, strokes: [big] }).error, /büyük/);
});

test('sohbet: alıntı ve tepki yardımcıları', () => {
  assert.deepEqual(replyQuoteOf('m1', { uid: 'a', displayName: 'Ali', text: '  merhaba   dünya ' }), { id: 'm1', uid: 'a', name: 'Ali', text: 'merhaba dünya' });
  assert.equal(replyQuoteOf('m1', { uid: 'a', text: 'x', hidden: true }), null);
  assert.equal(replyQuoteOf('m1', { uid: 'a', text: 'x'.repeat(300) }).text.length, 120);
  assert.deepEqual(nextReaction(undefined, '👍'), { value: '👍' });
  assert.deepEqual(nextReaction('👍', '👍'), { remove: true });
  assert.ok(nextReaction(undefined, 'x').error);
});
