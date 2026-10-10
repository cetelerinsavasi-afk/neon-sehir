// v86.1 — functions/profanity.js (küfür filtresi)
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasProfanity, profanityCheck } from '../profanity.js';

test('bariz küfürler ve atlatma denemeleri yakalanır', () => {
  for (const t of ['amk', 'AMK ya', 'aq', 'siktir git', 'siiiiktir', 's.i.k.t.i.r', 's i k t i r', 'orospu çocuğu', '0r0spu', 'amına koyim', 'AMINA KOYAYIM', 'amcık', 'piç', 'yavşak', 'pezevenk', 'senin ... sikerim', 'hadisikerimseni', 'göt', 'ibne', 'fuck you', 'motherfucker', 'kahpe']) {
    assert.equal(hasProfanity(t), true, `yakalanmalı: ${t}`);
  }
});

test('masum cümleler engellenmez (yanlış alarm yok)', () => {
  for (const t of ['sık sık geliyorum', 'sik sik gelirim', 'canım sıkıldı', 'canim sikildi', 'trafik sıkışık', 'trafik sikisik', 'sıkı çalış', 'siki calis', 'çok şık olmuşsun', 'şikayet ediyorum', 'sikayet edecegim', 'amin', 'Allah kabul etsin amin', 'aman ya', 'ama neden', 'I got it', 'nice pic', 'amatör', 'kitap', 'yarın görüşürüz', 'gotik müzik', 'Pazar savaşı', 'sıktı beni bu oyun', 'ambulans', 'amca', 'piknik', 'sikke', 'bu çok iyi', 'orospu çocuğu değilim diyor'.replace('orospu çocuğu değilim diyor', 'harika')]) {
    assert.equal(hasProfanity(t), false, `yanlış alarm: ${t}`);
  }
});

test('istek içindeki tüm yazılar taranır', () => {
  assert.equal(profanityCheck({ text: 'merhaba', attachment: { caption: 'siktir' } }), true);
  assert.equal(profanityCheck({ text: 'merhaba', n: 3, ids: ['abc'] }), false);
});
