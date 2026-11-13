// v159 — yarış sürerken (zamana karşı yarış ekranı açık ve araba pistte) true.
// Android'de ekran kenarından kaydırma "geri" sayılıyor ve yarış ekranını küçültüyordu →
// yarış oyunu kapanıp deneme "yarıda kaldı" sayılıyordu (oyuncular "yarışırken oyun attı" diyordu).
// App'teki geri tuşu işleyicisi bu bayrak açıkken yarış ekranını kapatmaz.
let racing = false;
export function setTaRacing(on) {
  racing = Boolean(on);
}
export function isTaRacing() {
  return racing;
}
