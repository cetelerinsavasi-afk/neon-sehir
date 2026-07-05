import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import { buyFromVendor } from '../../services/gameActions';

// Dönerci ve Köfteci'de alışveriş eşiği daha düşük (500 altın) — diğerleri
// (Kokoreçci, Simitçi) 1000 altın.
const VENDOR_COSTS = {
  seyyar_satici_3: 500, // Dönerci
  seyyar_satici_4: 500, // Köfteci
};

// Şehirdeki 4 seyyar satıcı (Kokoreçci, Simitçi, Dönerci, Köfteci) birbirinden
// BAĞIMSIZ günlük haklara sahip — birinden alışveriş yapmak diğerlerini
// etkilemez. Bu yüzden günlük durum vendorId'ye göre (nested) tutuluyor.
// Bölüm 2: her satıcı "haraç kesme (soygun) VEYA alışveriş" sunuyor.
export default function VendorScreen({ vendorId, vendorName }) {
  const cost = VENDOR_COSTS[vendorId] ?? 1000;
  return (
    <div>
      <SimpleActionScreen
        signInMessage="Alışveriş yapmak için giriş yapmalısın."
        description={`${vendorName}'dan günde bir kez, ${cost.toLocaleString('tr-TR')} altına alışveriş yaparak hem şüpheni azalt hem saygınlık kazan.`}
        buttonLabel={`Alışveriş Yap (${cost.toLocaleString('tr-TR')} altın)`}
        doneLabel="Bugün zaten alışveriş yaptın"
        isDone={(actions) => Boolean(actions.vendorPurchases?.[vendorId])}
        goldCost={cost}
        actionFn={() => buyFromVendor(vendorId)}
      />
    </div>
  );
}
