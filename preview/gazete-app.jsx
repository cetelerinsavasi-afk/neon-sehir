// SADECE önizleme (v127): telefondaki Gazete — örnek sayı
import { createRoot } from 'react-dom/client';
import GazeteScreen from '../src/components/Gazete/GazeteScreen';
import { fakeDb } from './mocks/backend.js';
import { gazeteRows, gazeteHeadline, gazeteKasaLine } from '../functions/belediyeGazete.js';
import { DEFAULT_RATES, rateDayKey, addDayKey } from '../functions/belediyeRates.js';
import '../src/index.css';

const today = rateDayKey();
const start = { ...DEFAULT_RATES };
const prev = { ...DEFAULT_RATES, isKafe: 11, polMemur: 6000 };
const cur = { ...prev, isKafe: 12, mkKripto: 4, imam: 11000 };
const rows = gazeteRows({ start, prev, cur });
(async () => {
  for (const [k, extra] of [[addDayKey(today, -1), {}], [today, {}]]) {
    await fakeDb.doc(`belediyeGazete/${k}`).set({
      dayKey: k,
      headline: gazeteHeadline({ rows }),
      rows,
      govSince: addDayKey(today, -5),
      mayor: { name: 'Haluk Levent' },
      article: { text: 'Sevgili hemşehrilerim, kasayı doldurmadan rahat uyumayacağız. Kafe vergisindeki küçük artış, yarın sokak lambası olarak size dönecek.', byName: 'Aylin_Z', byTitle: 'Belediye Başkan Yardımcısı' },
      complaint: { text: 'Sokak lambaları üç gündür yanmıyor, belediye uyuyor mu?', name: 'Kaan_34', likes: 42 },
      kasa: { dayKey: addDayKey(k, -1), in: 6_656_000, out: 2_360_000, net: 4_296_000, line: gazeteKasaLine(4_296_000) },
      payrollUnpaid: false,
      ...extra,
    });
  }
  createRoot(document.getElementById('root')).render(<GazeteScreen />);
})();
