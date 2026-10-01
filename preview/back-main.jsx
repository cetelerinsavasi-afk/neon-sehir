// SADECE önizleme: Android geri tuşu yığını testi (?src=twa ile açılır)
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { exitApp, installBackHandler, rearmBack, useBackClose } from '../src/lib/backStack';

function Venue({ onExit }) {
  const [phone, setPhone] = useState(false);
  useBackClose(phone, () => setPhone(false));
  return (
    <div>
      <p id="venue">MEKAN {phone && <b id="phone">TELEFON</b>}</p>
      <button id="openPhone" onClick={() => setPhone(true)}>tel</button>
      <button onClick={onExit}>çık</button>
    </div>
  );
}
function App() {
  const [venue, setVenue] = useState(false);
  const [ask, setAsk] = useState(false);
  useEffect(() => installBackHandler(() => setAsk(true)), []);
  useBackClose(venue, () => setVenue(false));
  return (
    <div>
      <p id="home">ANA SAYFA</p>
      <button id="openVenue" onClick={() => setVenue(true)}>mekan</button>
      {venue && <Venue onExit={() => setVenue(false)} />}
      {ask && <p id="ask">ÇIKMAK İSTİYOR MUSUN? <button id="exit" onClick={exitApp}>Çık</button><button id="stay" onClick={() => { setAsk(false); rearmBack(); }}>Kal</button></p>}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
