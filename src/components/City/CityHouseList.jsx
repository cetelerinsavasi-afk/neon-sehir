import { useHouseList } from '../../hooks/useHouseList';
import { useOfficeList } from '../../hooks/useOfficeList';
import { HouseRow } from '../HouseScreen/HouseHub';
import { houseKind } from '../../../functions/officeData.js';

// v157.8 — Ev / Ofis binasının içinde açılıp kapanan liste (galerilerdeki gibi).
// Liste sadece panel açıkken okunur (önbellekli sorgu + 30 sn'lik varlık yoklaması).
function HouseListInner({ onPick }) {
  const list = useHouseList({ enabled: true });
  const mineOf = (k) => list.mine.filter((h) => (!h.bizType || houseKind(h) === 'ofis') && houseKind(h) === k);
  const enterableOf = (k) => list.enterable.filter((h) => houseKind(h) === k);
  const sec = (k, icon, empty) => {
    const rows = [...mineOf(k).map((h) => ({ h, mine: true })), ...enterableOf(k).map((h) => ({ h, mine: false }))];
    return (
      <>
        <div className="hs-list-title hh-sec">{icon}</div>
        {rows.map(({ h, mine }) => (
          <HouseRow key={h.id} h={h} onEnter={onPick} mineRow={mine} />
        ))}
        {!list.loading && rows.length === 0 && <p className="cs-biz-empty">{empty}</p>}
      </>
    );
  };
  return (
    <div className="cs-biz-list">
      {list.loading && <p className="cs-biz-empty">Yükleniyor…</p>}
      {sec('ev', '🏠 Evler', 'Şu an girebileceğin bir ev yok.')}
      {sec('depo', '📦 Depolar', 'Depo yok.')}
    </div>
  );
}

function OfficeListInner({ onPick }) {
  const offices = useOfficeList({ enabled: true });
  return (
    <div className="cs-biz-list">
      {offices.loading && <p className="cs-biz-empty">Yükleniyor…</p>}
      {!offices.loading && offices.list.length === 0 && <p className="cs-biz-empty">Henüz ofis yok.</p>}
      {offices.list.map((h) => (
        <HouseRow key={h.id} h={h} onEnter={onPick} mineRow={h.mine} />
      ))}
    </div>
  );
}

export default function CityHouseList({ mode, onPick }) {
  return mode === 'ofis' ? <OfficeListInner onPick={onPick} /> : <HouseListInner onPick={onPick} />;
}
