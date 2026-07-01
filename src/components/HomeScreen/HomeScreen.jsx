import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import {
  applyForPolice,
  resignFromPolice,
  cancelPendingPoliceChange,
  upgradeVehicle,
  upgradeWeapon,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import InfoIcon from '../InfoIcon/InfoIcon';
import './HomeScreen.css';

const MATERIAL_LABELS = {
  depoUpgrade: 'Depo Geliştirme Malzemesi',
  vitesUpgrade: 'Vites Geliştirme Malzemesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi',
  yasakliMadde: 'Yasaklı Madde',
};

function PoliceSection({ player }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const isPolice = player?.profession === 'polis';
  const pending = player?.pendingPoliceChange;

  return (
    <div className="home-section">
      <p className="home-section-title">
        Polislik
        <InfoIcon text="Başvuru ya da istifa anlık değil — bir sonraki gece yarısı (00:00) işleme alınır. Başvurmak için şüphen %0 olmalı ve bir silahın olmalı." />
      </p>
      <p className="home-hint">
        Şu an: <strong>{isPolice ? 'Polissin' : 'Sivilsin'}</strong>
        {pending === 'apply' && ' · Başvurun bu gece işlenecek'}
        {pending === 'resign' && ' · İstifan bu gece işlenecek'}
      </p>
      <div className="home-controls">
        {!isPolice && !pending && (
          <button className="home-btn" disabled={busy} onClick={() => run(applyForPolice)}>
            Polislik Başvurusu Yap
          </button>
        )}
        {isPolice && !pending && (
          <button className="home-btn" disabled={busy} onClick={() => run(resignFromPolice)}>
            İstifa Et
          </button>
        )}
        {pending && (
          <button className="home-btn" disabled={busy} onClick={() => run(cancelPendingPoliceChange)}>
            İsteği İptal Et
          </button>
        )}
      </div>
      {error && <p className="home-error">{error}</p>}
    </div>
  );
}

function VehicleCard({ vehicle, materialsQty, busy, onUpgrade }) {
  return (
    <div className="home-item-card">
      <span className="home-item-name">{vehicle.model}</span>
      <span className="home-item-stats">
        Vites {vehicle.gearLevel} · Depo {vehicle.baseTank + (vehicle.tankBonus || 0)}L
        {vehicle.mortgaged && !vehicle.seizedByBank && ' · İpotekli'}
        {vehicle.seizedByBank && ' · Bankaya el konuldu'}
      </span>
      <div className="home-controls">
        <button
          className="home-btn small"
          disabled={vehicle.gearUpgraded || materialsQty.vites < 2 || busy === `${vehicle.id}-gear`}
          onClick={() => onUpgrade(vehicle.id, 'gear')}
        >
          {vehicle.gearUpgraded ? 'Vites Geliştirildi' : 'Vites Geliştir (2 malzeme)'}
        </button>
        <button
          className="home-btn small"
          disabled={vehicle.tankUpgraded || materialsQty.depo < 2 || busy === `${vehicle.id}-tank`}
          onClick={() => onUpgrade(vehicle.id, 'tank')}
        >
          {vehicle.tankUpgraded ? 'Depo Geliştirildi' : 'Depo Geliştir (2 malzeme)'}
        </button>
      </div>
    </div>
  );
}

function WeaponCard({ weapon, materialQty, busy, onUpgrade }) {
  const requiredQty = Math.round(weapon.basePrice / 100);
  return (
    <div className="home-item-card">
      <span className="home-item-name">
        {weapon.name} <span className="home-item-level">Sv. {weapon.level}</span>
      </span>
      <span className="home-item-stats">Güç: {weapon.power.toLocaleString('tr-TR')}</span>
      <button
        className="home-btn small"
        disabled={weapon.level >= 3 || materialQty < requiredQty || busy === `${weapon.id}-w`}
        onClick={() => onUpgrade(weapon.id)}
      >
        {weapon.level >= 3 ? 'Maks. Seviye' : `Geliştir (${requiredQty} malzeme)`}
      </button>
    </div>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { vehicles } = useVehicles();
  const { weapons } = useWeapons();
  const { inventory } = useInventory();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Evine girmek için giriş yapmalısın." />;
  }

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  };

  const materialsQty = {
    depo: inventory.depoUpgrade || 0,
    vites: inventory.vitesUpgrade || 0,
  };

  return (
    <div className="home-screen">
      <PoliceSection player={player} />

      <div className="home-section">
        <p className="home-section-title">Araçların</p>
        {vehicles.length === 0 && <p className="home-hint">Henüz bir aracın yok.</p>}
        {vehicles.map((v) => (
          <VehicleCard
            key={v.id}
            vehicle={v}
            materialsQty={materialsQty}
            busy={busy}
            onUpgrade={(id, type) => run(`${id}-${type}`, () => upgradeVehicle(id, type))}
          />
        ))}
      </div>

      <div className="home-section">
        <p className="home-section-title">Silahların</p>
        {weapons.length === 0 && <p className="home-hint">Henüz bir silahın yok.</p>}
        {weapons.map((w) => (
          <WeaponCard
            key={w.id}
            weapon={w}
            materialQty={inventory.silahUpgrade || 0}
            busy={busy}
            onUpgrade={(id) => run(`${id}-w`, () => upgradeWeapon(id))}
          />
        ))}
      </div>

      <div className="home-section">
        <p className="home-section-title">Malzemelerin</p>
        {Object.entries(MATERIAL_LABELS).map(([key, label]) => (
          <p key={key} className="home-hint">
            {label}: {inventory[key] || 0}
          </p>
        ))}
      </div>

      {error && <p className="home-error">{error}</p>}
    </div>
  );
}
