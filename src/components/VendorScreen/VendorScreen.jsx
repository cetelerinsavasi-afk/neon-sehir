import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import { buyFromVendor } from '../../services/gameActions';

const VENDOR_COST = 500;

// Şehirdeki 4 seyyar satıcı (Kokoreçci, Simitçi, Dönerci, Köfteci) birbirinden
// BAĞIMSIZ günlük haklara sahip — birinden alışveriş yapmak diğerlerini
// etkilemez. Bu yüzden günlük durum vendorId'ye göre (nested) tutuluyor.
// Bölüm 2: her satıcı "haraç kesme (soygun) VEYA alışveriş" sunuyor.
export default function VendorScreen({ vendorId, vendorName }) {
  return (
    <div>
      <SimpleActionScreen
        signInMessage="Alışveriş yapmak için giriş yapmalısın."
        description={`${vendorName}'dan günde bir kez, ${VENDOR_COST.toLocaleString('tr-TR')} altına alışveriş yaparak hem şüpheni azalt hem saygınlık kazan.`}
        buttonLabel={`Alışveriş Yap (${VENDOR_COST.toLocaleString('tr-TR')} altın)`}
        doneLabel="Bugün zaten alışveriş yaptın"
        isDone={(actions) => Boolean(actions.vendorPurchases?.[vendorId])}
        goldCost={VENDOR_COST}
        actionFn={() => buyFromVendor(vendorId)}
      />
    </div>
  );
}
