import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import { buyFromVendor } from '../../services/gameActions';

// Not: Şehirdeki 4 seyyar satıcı (Kokoreçci, Simitçi, Dönerci, Köfteci)
// hepsi aynı ekranı ve aynı günlük hakkı paylaşır — birinden alışveriş
// yapınca diğerleri de "bugün yapıldı" görünür.
export default function VendorScreen() {
  return (
    <SimpleActionScreen
      signInMessage="Alışveriş yapmak için giriş yapmalısın."
      description="Günde bir kez, 1000 altına küçük bir şeyler alarak hem şüpheni azalt hem saygınlık kazan."
      buttonLabel="Alışveriş Yap (1000 altın)"
      doneLabel="Bugün zaten alışveriş yaptın"
      dailyFlagKey="vendorPurchase"
      goldCost={1000}
      actionFn={buyFromVendor}
    />
  );
}
