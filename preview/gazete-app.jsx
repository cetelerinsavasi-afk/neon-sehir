// SADECE önizleme (v127): telefondaki Gazete — örnek sayı
import { createRoot } from 'react-dom/client';
import GazeteScreen from '../src/components/Gazete/GazeteScreen';
import { fakeDb } from './mocks/backend.js';
import { gazeteNews } from '../functions/belediyeGazete.js';
import { DEFAULT_RATES, rateDayKey, addDayKey } from '../functions/belediyeRates.js';
import '../src/index.css';

const today = rateDayKey();
const prev = { ...DEFAULT_RATES };
const cur = { ...prev, polGenel: 26000, polAmir: 21000, polBaskom: 16000, polKomiser: 11000, polMemur: 6000, f4: 41, f3: 21, isKafe: 11, isBar: 11, bsk: 55000, mkKripto: 4, imam: 11000 };
const news = gazeteNews({ prev, cur });
(async () => {
  for (const [k, extra] of [[addDayKey(today, -1), {}], [today, {}]]) {
    await fakeDb.doc(`belediyeGazete/${k}`).set({
      dayKey: k,
      v: 2,
      ...news,
      govSince: addDayKey(today, -5),
      mayor: { name: 'Haluk Levent' },
      article: { text: 'Sevgili hemşehrilerim, kasayı doldurmadan rahat uyumayacağız. Kafe vergisindeki küçük artış, yarın sokak lambası olarak size dönecek.', byName: 'Aylin_Z', byTitle: 'Belediye Başkan Yardımcısı' },
      complaint: { text: 'Sokak lambaları üç gündür yanmıyor, belediye uyuyor mu?', name: 'Kaan_34', likes: 42 },
      payrollUnpaid: false,
      ...extra,
    });
  }
  createRoot(document.getElementById('root')).render(<GazeteScreen />);
})();
