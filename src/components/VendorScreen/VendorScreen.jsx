import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import { buyFromVendor } from '../../services/gameActions';

// Şehirdeki 4 seyyar satıcı (Kokoreçci, Simitçi, Dönerci, Köfteci) birbirinden
// BAĞIMSIZ günlük haklara sahip — birinden alışveriş yapmak diğerlerini
// etkilemez. Bu yüzden günlük durum vendorId'ye göre (nested) tutuluyor.
export default function VendorScreen({ vendorId, vendorName }) {
  return (
    <SimpleActionScreen
      signInMessage="Alışveriş yapmak için giriş yapmalısın."
      description={`${vendorName}'dan günde bir kez, 1000 altına alışveriş yaparak hem şüpheni azalt hem saygınlık kazan.`}
      buttonLabel="Alışveriş Yap (1000 altın)"
      doneLabel="Bugün zaten alışveriş yaptın"
      isDone={(actions) => Boolean(actions.vendorPurchases?.[vendorId])}
      goldCost={1000}
      actionFn={() => buyFromVendor(vendorId)}
    />
  );
}
