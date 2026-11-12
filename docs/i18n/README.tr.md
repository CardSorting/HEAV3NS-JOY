<!-- [LAYER: UI] -->
# HEAV3NS-JOY: Mimari Egemenlik ve Yapısal Entropi Kontrol Çerçevesi

[English](../../README.md) · [Diğer Diller](README.md) · [Başlangıç Kılavuzu](../GETTING_STARTED.md) · [Ajan Protokolü](../../AGENTS.md)

> *“Ajanların çalıştığı bir yer daha inşa etmeyin. Ajanların öğrenebileceği, yanlarında taşıyabileceği ve her yerde bağımsız olarak yeniden üretebileceği bir şey inşa edin.”*

**Tek cümlede:** HEAV3NS-JOY, minimal bir kural dizisi ve sıfır bağımlılıklı denetleyicisi ile kod tabanlarınızı (hem insanlar hem de yapay zeka ajanları tarafından yazılan) mimari açıdan dürüst tutar.

---

## 60 Saniyede Temel Fikir

| Boyut | Ayrıntı |
| :--- | :--- |
| **Nedir** | Bir kural ve sıfır bağımlılıklı denetim aracı. Her dosya ilk satırında beş standart bölgeden birini (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) bildirir. |
| **Neden** | Mimari sessizce aşınır ve yapay zeka ajanları bu aşınmayı hızlandırır. Yapıyı makine tarafından doğrulanabilir hale getirmek, çürümeyi büyük bir yeniden yazımda değil, commit anında durdurur. |
| **Nasıl** | Dosyayı bölgesine ait dizine yerleştirin, yalnızca izin verilen yönlerde içe aktarın ve `node bin/joy-check.mjs .` çalıştırın. Çıkış kodu `0` tam uyumluluk anlamına gelir. |
| **Maliyet** | **Sıfır harici bağımlılık**, hesap gerektirmez, ağ gerektirmez, varsayılan olarak salt okunurdur. |

### Restoran Analojisi

Kod tabanınızı bir restoran gibi düşünün:
- **Mutfak (`DOMAIN`)**: Saf tarifler ve iş kuralları; yemek pişirirken tedarikçileri doğrudan aramak kesinlikle yasaktır.
- **Koordinasyon (`CORE`)**: Siparişlerin akışını ve kullanım senaryolarını yönetir.
- **Tedarikçiler (`INFRASTRUCTURE`)**: Dosya sistemi, HTTP ve veritabanı bağdaştırıcıları.
- **Yemek Salonu (`UI`)**: Müşterileri ağırlar ve ekranları çizer; kiler odasına asla girmez.
- **Tesisat (`PLUMBING`)**: Tamamen durumsuz ve izole yardımcı fonksiyonlar.

---

## Beş Standart Bölge

| Bölge | Dizin | Sorumluluk | Kesin Kural |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | İş kuralları, varlıklar, sözleşmeler `I*` | **%0 G/Ç entropisi**; altyapı veya UI içe aktaramaz |
| `CORE` | `src/core/` | Senaryo orkestrasyonu, durum makineleri | UI içe aktaramaz; altyapıyla yalnızca arayüzlerle konuşur |
| `INFRASTRUCTURE` | `src/infrastructure/` | fs, HTTP, veritabanı bağdaştırıcıları | UI içe aktaramaz; Domain sözleşmelerini uygular |
| `PLUMBING` | `src/plumbing/` | Kriptografi, durumsuz yardımcılar | Yaprak katman; başka hiçbir bölgeyi içe aktaramaz |
| `UI` | `src/ui/` | CLI sunucuları, HTTP rotaları, görünümler | Altyapıyı doğrudan içe aktaramaz |

---

## Hızlı Başlangıç (2 Dakika)

`npm install` gerekmez (yalnızca Node.js 18+ ve git):

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Testleri çalıştırın (196 test başarılı)
npm test

# 2. Mimari uyumluluğu denetleyin
npm run joy-check

# 3. Ajan yapılandırmalarını otomatik kurun (Claude, Cursor, Antigravity vb.)
npx heav3ns-joy init
```

Daha fazla bilgi için [Belgelendirme Portalı](../README.md) ve [Standart Model](../../spec/00-CANONICAL-MODEL.md) sayfalarını ziyaret edin.

