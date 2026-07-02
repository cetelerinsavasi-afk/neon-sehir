import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const STATUS_LABELS = {
  docking: 'Gemi bugün şehirde, mal indiriyor.',
  departing: 'Gemi şehirden ayrılıyor. Şimdi verdiğin sipariş yükleme sırasında gemiye eklenir.',
  loading: 'Gemi diğer şehirde mal yüklüyor — sipariş vermek için son gün!',
  in_transit: 'Gemi yolda, şehre dönmesine 1 gün kaldı.',
};

/**
 * useShipSchedule — shipSchedule/{bugünün-tarihi} dokümanını canlı dinler.
 * dailyReset tarafından her gün 00:00'da güncellenir (Bölüm 12).
 */
export function useShipSchedule() {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'shipSchedule', istanbulDateKey());
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setSchedule(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('useShipSchedule dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const statusLabel = schedule ? STATUS_LABELS[schedule.status] || schedule.status : null;

  return { schedule, statusLabel, loading };
}
