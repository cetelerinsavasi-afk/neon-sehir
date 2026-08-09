import { useCallback, useEffect, useRef, useState } from 'react';
import { performRoll, RACE_STATION_PRICES, RACE_OFFSITE_FUEL_PRICE, RACE_NITRO_PRICE } from '../lib/raceEngine';
import { finishSoloRace, pingRaceRoom } from '../services/gameActions';

// Sunucuya sadece bağlantıyı doğrulamak için, sık olmayan aralıklarla
// "yoklama" gönderiyoruz — bkz. kullanıcının 4. maddedeki önerisi:
// "sunucunun tek görevi internete bağlı olduğunu test etmek olsun".
const CONNECTIVITY_CHECK_MS = 15000;
// Kullanıcı revizesi: bot, insan zar attığı ANDA değil, 1 saniye sonra
// hareket etsin (hem daha okunabilir hem de eskiden "iki tur aynı anda
// çözülüyor" hissi donma gibi algılanıyordu).
const BOT_MOVE_DELAY_MS = 1000;

/**
 * useLocalRace — antrenman (bota karşı) ve şampiyona (tek kişilik) yarış
 * mekaniğinin TAMAMINI istemcide çalıştırır. `room.localMode` true ve
 * durum 'racing' olduğu sürece aktif olur; bahisli (gerçek rakipli)
 * yarışlara hiç dokunmaz (`active: false` döner, RaceRoom eski sunucu
 * taraflı akışı kullanmaya devam eder).
 */
export function useLocalRace(room, myUid) {
  const active = Boolean(
    room?.localMode && room?.status === 'racing' && (room.isTraining || room.isChampionship)
  );

  const stateRef = useRef(null);
  const finishSentRef = useRef(false);
  const botTimerRef = useRef(null);
  const [, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

  if (active && (!stateRef.current || stateRef.current.roomId !== room.id)) {
    stateRef.current = {
      roomId: room.id,
      me: room.players[myUid],
      bot: room.isTraining ? room.players.bot : null,
      turnOwner: 'me',
      turnsUsed: 0,
      finalTurnPending: null, // null | 'me' | 'bot'
      status: 'racing',
      winnerUid: null,
      championshipTurns: null,
      championshipResult: null,
    };
    finishSentRef.current = false;
  }

  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const check = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancelled) setOffline(true);
        return;
      }
      try {
        await pingRaceRoom(room.id);
        if (!cancelled) setOffline(false);
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    check();
    const id = setInterval(check, CONNECTIVITY_CHECK_MS);
    const onOnline = () => check();
    const onOffline = () => setOffline(true);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    }
    return () => {
      cancelled = true;
      clearInterval(id);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      }
    };
  }, [active, room?.id]);

  useEffect(
    () => () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    },
    []
  );

  const finalize = useCallback(
    async (winnerUid, extra = {}) => {
      const s = stateRef.current;
      if (!s) return;
      s.status = 'finished';
      s.winnerUid = winnerUid;
      Object.assign(s, extra);
      bump();
      if (finishSentRef.current) return;
      finishSentRef.current = true;
      try {
        await finishSoloRace({
          roomId: s.roomId,
          winnerUid,
          turnsUsed: s.turnsUsed,
          outOfFuel: Boolean(extra.outOfFuel),
          players: room.isTraining ? { [myUid]: s.me, bot: s.bot } : { [myUid]: s.me },
        });
      } catch (err) {
        // Yarış zaten yerelde bitmiş gösteriliyor; sunucuya kaydetme o an
        // başarısız olsa bile (ör. bağlantı koptu) kullanıcı sonucu görür.
        console.error('finishSoloRace hatası:', err);
      }
    },
    [myUid, room?.isTraining]
  );

  const stepBotRoll = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.status !== 'racing') return;
    const { updated } = performRoll(s.bot, {});
    s.bot = updated;

    if (s.finalTurnPending === 'bot') {
      finalize(updated.finished ? 'draw' : myUid);
      return;
    }
    if (updated.finished) {
      // Bot bitirdi — adalet kuralı: insana son bir hamle hakkı verilir.
      s.finalTurnPending = 'me';
      s.turnOwner = 'me';
      bump();
      return;
    }
    s.turnOwner = 'me';
    bump();
  }, [finalize, myUid]);

  const rollLocal = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.status !== 'racing') return null;
    if (s.turnOwner !== 'me') throw new Error('Sıra sende değil.');

    if (s.me.fuel <= 0) {
      await finalize(room.isTraining ? 'bot' : null, { outOfFuel: true });
      return null;
    }

    const result = performRoll(s.me, {
      useNitro: s.me.nitroActive,
      useTurbo: false,
    });
    s.me = { ...result.updated, turnsUsed: s.turnsUsed + 1 };
    s.turnsUsed += 1;

    if (room.isChampionship) {
      if (result.updated.finished) {
        await finalize(myUid, { championshipTurns: s.turnsUsed, championshipResult: 'completed' });
        return result;
      }
      if (result.updated.fuel <= 0) {
        await finalize(null, { outOfFuel: true, championshipResult: 'fuel_out' });
        return result;
      }
      bump();
      return result;
    }

    // --- Antrenman (bota karşı) ---
    if (s.finalTurnPending === 'me') {
      await finalize(result.updated.finished ? 'draw' : 'bot');
      return result;
    }
    if (result.updated.finished) {
      s.finalTurnPending = 'bot';
      s.turnOwner = 'bot';
      bump();
      botTimerRef.current = setTimeout(stepBotRoll, BOT_MOVE_DELAY_MS);
      return result;
    }
    if (result.updated.fuel <= 0) {
      await finalize('bot', { outOfFuel: true });
      return result;
    }
    s.turnOwner = 'bot';
    bump();
    botTimerRef.current = setTimeout(stepBotRoll, BOT_MOVE_DELAY_MS);
    return result;
  }, [finalize, myUid, room?.isChampionship, room?.isTraining, stepBotRoll]);

  const rollWithTurbo = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.status !== 'racing') return null;
    if (s.turnOwner !== 'me') throw new Error('Sıra sende değil.');
    const prevNitro = s.me.nitroActive;
    s.me = { ...s.me, nitroActive: false }; // turbo ile atışta nitro otomatik kullanılmaz
    const restore = () => {
      s.me = { ...s.me, nitroActive: prevNitro };
    };
    try {
      const result = performRoll({ ...s.me, nitroActive: prevNitro }, { useNitro: false, useTurbo: true });
      s.me = { ...result.updated, turnsUsed: s.turnsUsed + 1 };
      s.turnsUsed += 1;
      if (room.isChampionship) {
        if (result.updated.finished) {
          await finalize(myUid, { championshipTurns: s.turnsUsed, championshipResult: 'completed' });
          return result;
        }
        if (result.updated.fuel <= 0) {
          await finalize(null, { outOfFuel: true, championshipResult: 'fuel_out' });
          return result;
        }
        bump();
        return result;
      }
      if (s.finalTurnPending === 'me') {
        await finalize(result.updated.finished ? 'draw' : 'bot');
        return result;
      }
      if (result.updated.finished) {
        s.finalTurnPending = 'bot';
        s.turnOwner = 'bot';
        bump();
        botTimerRef.current = setTimeout(stepBotRoll, BOT_MOVE_DELAY_MS);
        return result;
      }
      if (result.updated.fuel <= 0) {
        await finalize('bot', { outOfFuel: true });
        return result;
      }
      s.turnOwner = 'bot';
      bump();
      botTimerRef.current = setTimeout(stepBotRoll, BOT_MOVE_DELAY_MS);
      return result;
    } catch (err) {
      restore();
      throw err;
    }
  }, [finalize, myUid, room?.isChampionship, stepBotRoll]);

  const refuelLocal = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.status !== 'racing') return null;
    if (s.me.fuel >= s.me.maxFuel) throw new Error('Benzinin zaten dolu.');
    const atStation = s.me.position % 10 === 0;
    const price = atStation ? RACE_STATION_PRICES.refuel : RACE_OFFSITE_FUEL_PRICE;
    if (s.me.raceGold < price) throw new Error('Yeterli yarış altının yok.');
    s.me = { ...s.me, raceGold: s.me.raceGold - price, fuel: s.me.maxFuel };
    bump();
    return { price };
  }, []);

  const buyNitroLocal = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.status !== 'racing') return null;
    if (s.me.nitroActive) throw new Error('Bu tur zaten nitro aldın.');
    if (s.me.raceGold < RACE_NITRO_PRICE) throw new Error('Yeterli yarış altının yok.');
    s.me = { ...s.me, raceGold: s.me.raceGold - RACE_NITRO_PRICE, nitroActive: true };
    bump();
    return null;
  }, []);

  const changeGearLocal = useCallback(async (delta) => {
    const s = stateRef.current;
    if (!s || s.status !== 'racing') return null;
    if (!s.me.hasRolledOnce) {
      throw new Error('İlk turda vites değiştirilemez, herkes 1. viteste başlar.');
    }
    const newGear = Math.min(s.me.maxGear, Math.max(1, s.me.gear + delta));
    if (Math.abs(newGear - s.me.gearAtTurnStart) > 1) {
      throw new Error('Bu tur vitesi en fazla 1 değiştirebilirsin.');
    }
    s.me = { ...s.me, gear: newGear };
    bump();
    return null;
  }, []);

  if (!active) {
    return { active: false };
  }

  const s = stateRef.current;
  const players = room.isTraining ? { [myUid]: s.me, bot: s.bot } : { [myUid]: s.me };
  const viewRoom = {
    ...room,
    status: s.status,
    players,
    winnerUid: s.winnerUid,
    currentTurnUid: s.turnOwner === 'me' ? myUid : 'bot',
    finalTurnFor: s.finalTurnPending === 'me' ? myUid : s.finalTurnPending === 'bot' ? 'bot' : null,
    turnDeadline: null,
    championshipTurns: s.championshipTurns ?? room.championshipTurns,
    championshipResult: s.championshipResult ?? room.championshipResult,
  };

  return {
    active: true,
    viewRoom,
    offline,
    rollLocal,
    rollWithTurbo,
    refuelLocal,
    buyNitroLocal,
    changeGearLocal,
  };
}
