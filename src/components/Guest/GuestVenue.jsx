import { lazy, Suspense } from 'react';
import { retryImport } from '../../lib/lazyRetry';
import '../HouseScreen/HouseScreen.css';

// 3D motor (three.js) ana pakete girmesin diye misafir ekranı ayrı parça olarak yüklenir
const GuestVenueScreen = lazy(retryImport(() => import('./GuestVenueScreen')));

function Loading() {
  return (
    <div className="hs-root">
      <div className="hs-loading">
        <div className="hs-spinner" />
        <p>Giriliyor…</p>
      </div>
    </div>
  );
}

// venueKey: oyunun mekânı (functions/venueLayouts.js VENUES anahtarı) · houseId: oyuncu işletmesi / ofisi
export default function GuestVenue(props) {
  return (
    <Suspense fallback={<Loading />}>
      <GuestVenueScreen {...props} />
    </Suspense>
  );
}
