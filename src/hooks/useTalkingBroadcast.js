import { useEffect, useMemo, useRef, useState } from 'react';
import { splitSentences, estimateReadMs } from '../lib/broadcastText';

// useTalkingBroadcast — ORTAK "cümle cümle altyazı + konuşma animasyonu"
// motoru. Hem Sixtagram röportaj videosunda (madde 1) HEM DE TV
// uygulamasının 3 kanalında (madde 3 — Haber/Spor/Yatırım spikeri) bu AYNI
// hook kullanılıyor, aynı motor iki yerde ayrı ayrı YAZILMADI.
//
// Davranış: verilen metin noktalama işaretine göre cümlelere bölünür
// (bkz. lib/broadcastText.js), sırayla gösterilir. Bir cümle "okunurken"
// `mouthOpen` her 80-140ms'de bir true/false arasında geçiş yapar (avatarın
// ağzının açılıp kapanması + "insan mırıltısı" ses efektinin tetiklenmesi
// BUNA senkron olur, bkz. onMouthToggle). Cümleler arası kısa boşlukta
// (gapMs) mouthOpen hep false'tur (blip'ler durur — madde 2a isteği).
// `progress` (0..1) TÜM metnin toplam tahmini süresine göre ilerler —
// "video ilerledikçe ilerleyen çubuk" isteği için (madde 1 sonu).
export function useTalkingBroadcast(
  text,
  { loop = true, onMouthToggle, msPerChar, gapMs = 420, active = true } = {}
) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [mouthOpen, setMouthOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [done, setDone] = useState(false);
  const onMouthToggleRef = useRef(onMouthToggle);
  onMouthToggleRef.current = onMouthToggle;

  const durations = useMemo(() => sentences.map((s) => estimateReadMs(s, { msPerChar })), [sentences, msPerChar]);
  const totalMs = useMemo(
    () => durations.reduce((sum, d) => sum + d + gapMs, 0) || 1,
    [durations, gapMs]
  );

  // Ana zamanlama döngüsü — hangi cümle gösteriliyor + ağız açık/kapalı.
  useEffect(() => {
    if (!active || !sentences.length) return undefined;
    let cancelled = false;
    let blipTimer = null;
    let advanceTimer = null;
    let idx = 0;
    setSentenceIndex(0);
    setDone(false);
    setMouthOpen(false);

    const scheduleBlip = () => {
      if (cancelled) return;
      const delay = 80 + Math.random() * 60; // 80-140ms — madde 2a
      blipTimer = setTimeout(() => {
        if (cancelled) return;
        setMouthOpen((open) => {
          const next = !open;
          if (next) onMouthToggleRef.current?.();
          return next;
        });
        scheduleBlip();
      }, delay);
    };

    const runSentence = () => {
      if (cancelled) return;
      setSentenceIndex(idx);
      scheduleBlip();
      advanceTimer = setTimeout(() => {
        if (cancelled) return;
        clearTimeout(blipTimer);
        setMouthOpen(false);
        idx += 1;
        if (idx >= sentences.length) {
          if (loop) {
            advanceTimer = setTimeout(() => {
              if (cancelled) return;
              idx = 0;
              runSentence();
            }, gapMs);
          } else {
            setDone(true);
          }
        } else {
          advanceTimer = setTimeout(runSentence, gapMs);
        }
      }, durations[idx]);
    };
    runSentence();

    return () => {
      cancelled = true;
      clearTimeout(blipTimer);
      clearTimeout(advanceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentences, loop, gapMs, active]);

  // İlerleme çubuğu / REC sayacı — ayrı bir requestAnimationFrame döngüsü,
  // ~6fps'e throttle edilmiş state güncellemesiyle (gereksiz re-render yok).
  useEffect(() => {
    if (!active || !sentences.length) return undefined;
    let raf;
    let cancelled = false;
    const startedAt = performance.now();
    let lastUpdate = 0;
    const tick = (now) => {
      if (cancelled) return;
      if (now - lastUpdate > 160) {
        lastUpdate = now;
        const elapsed = (now - startedAt) % totalMs;
        setProgress(Math.min(1, elapsed / totalMs));
        setElapsedSec(Math.floor(((now - startedAt) / 1000)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [active, sentences.length, totalMs]);

  return {
    sentences,
    sentenceIndex,
    currentSentence: sentences[sentenceIndex] || '',
    mouthOpen,
    progress,
    elapsedSec,
    totalSec: Math.round(totalMs / 1000),
    done,
  };
}
