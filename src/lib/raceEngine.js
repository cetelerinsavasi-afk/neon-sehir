// raceEngine.js — functions/index.js içindeki rollDie/performRoll'un
// BİREBİR istemci taraflı kopyası. Kullanıcı önerisiyle (bkz. RaceRoom
// içindeki "yerel yarış" notu) antrenman ve şampiyona modlarında yarış
// mekaniği artık sunucuya hiç gitmeden burada, tarayıcıda çalışıyor —
// sunucu sadece yarış başında (hak kontrolü) ve sonunda (sonucu kaydetme)
// devreye giriyor. Bahisli (gerçek rakipli) yarışlarda bu dosya
// KULLANILMIYOR, o mod hâlâ tamamen sunucu taraflı ve değişmedi.

export const RACE_TRACK_LENGTH = 300;
export const RACE_STATION_PRICES = { refuel: 10 };
export const RACE_OFFSITE_FUEL_PRICE = 100;
export const RACE_NITRO_PRICE = 50;

export function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

// performRoll — sunucudaki (functions/index.js) aynı isimli fonksiyonun
// birebir kopyası. Buradaki mantık DEĞİŞTİĞİNDE sunucudaki de güncellenmeli
// (ya da tersi) — iki taraf senkron kalmalı.
export function performRoll(me, { useNitro = false, useTurbo = false } = {}) {
  const diceCount = me.hasRolledOnce ? me.gear : 1;
  const diceValues = [];
  let stepSum = 0;
  for (let i = 0; i < diceCount; i++) {
    const v = rollDie();
    diceValues.push(v);
    stepSum += v;
  }

  const nitroUsed = Boolean(useNitro && me.nitroActive);
  const turboUsed = Boolean(useTurbo && me.turboCount > 0);
  let multiplier = 1;
  if (nitroUsed && turboUsed) multiplier = 3;
  else if (nitroUsed || turboUsed) multiplier = 2;
  const boost = nitroUsed && turboUsed ? 'combo' : nitroUsed ? 'nitro' : turboUsed ? 'turbo' : null;

  const rolledSteps = stepSum * multiplier + me.wheelBonus;
  const actualSteps = Math.min(rolledSteps, Math.max(me.fuel, 0));
  const beforePos = me.position;
  const afterPos = Math.min(beforePos + actualSteps, RACE_TRACK_LENGTH);
  const movedSteps = afterPos - beforePos;

  let goldEarned = movedSteps;
  const beforeMilestone = Math.floor(beforePos / 100);
  const afterMilestone = Math.floor(afterPos / 100);
  if (afterMilestone > beforeMilestone) {
    goldEarned += (afterMilestone - beforeMilestone) * 50;
  }

  const newFuel = Math.min(Math.max(0, me.fuel - movedSteps) + me.fuelSavingBonus, me.maxFuel);

  return {
    updated: {
      ...me,
      position: afterPos,
      fuel: newFuel,
      raceGold: me.raceGold + goldEarned,
      lastRollSteps: movedSteps,
      lastRollSum: stepSum,
      lastRollDice: diceValues,
      lastRollMultiplier: multiplier,
      lastRollBoost: boost,
      finished: afterPos >= RACE_TRACK_LENGTH,
      nitroActive: nitroUsed ? false : me.nitroActive,
      turboCount: turboUsed ? me.turboCount - 1 : me.turboCount,
      hasRolledOnce: true,
      gearAtTurnStart: me.gear,
    },
    stepSum,
    multiplier,
    movedSteps,
    goldEarned,
  };
}

export function refuelPriceFor(position) {
  return position % 10 === 0 ? RACE_STATION_PRICES.refuel : RACE_OFFSITE_FUEL_PRICE;
}
