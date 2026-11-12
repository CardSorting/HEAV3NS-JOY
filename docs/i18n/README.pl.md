<!-- [LAYER: UI] -->
# HEAV3NS-JOY: Ramy Suwerenności Architektonicznej i Kontroli Entropii Strukturalnej

[English](../../README.md) · [Inne Języki](README.md) · [Wprowadzenie](../GETTING_STARTED.md) · [Protokół Agentów](../../AGENTS.md)

> *„Nie buduj kolejnego miejsca, w którym działają agenci. Zbuduj coś, z czego agenci mogą się uczyć, zabrać ze sobą i niezależnie odtworzyć w dowolnym miejscu.”*

**W jednym zdaniu:** HEAV3NS-JOY utrzymuje bazy kodu w czystości architektonicznej (zarówno pisane przez ludzi, jak i generowane przez agentów AI) dzięki minimalnej konwencji i weryfikatorowi bez zewnętrznych zależności.

---

## Koncepcja w 60 sekund

| Wymiar | Szczegóły |
| :--- | :--- |
| **Czym jest** | Konwencja i narzędzie audytu bez zależności. Każdy plik deklaruje jedną z pięciu stref kanonicznych (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) w nagłówku pierwszej linii. |
| **Dlaczego** | Architektura ulega cichej degradacji, a agenci AI przyspieszają ten proces. Umożliwienie maszynowej weryfikacji struktury zatrzymuje erozję w momencie commita, a nie kosztownego przepisywania. |
| **Jak** | Umieść plik w katalogu odpowiedniej strefy, importuj tylko w dozwolonych kierunkach i uruchom `node bin/joy-check.mjs .`. Kod wyjścia `0` oznacza pełną zgodność. |
| **Koszt** | **Zero zewnętrznych zależności**, bez kont, bez sieci, domyślnie tylko do odczytu. |

### Analogia restauracji

Pomyśl o bazie kodu jak o restauracji:
- **Kuchnia (`DOMAIN`)**: Tworzy czyste przepisy i reguły biznesowe; surowo zabrania się dzwonienia do dostawców w trakcie gotowania.
- **Koordynacja (`CORE`)**: Zarządza zamówieniami i orkiestracją przypadków użycia.
- **Dostawcy (`INFRASTRUCTURE`)**: Adaptery systemu plików, HTTP i baz danych.
- **Sala (`UI`)**: Obsługuje gości i renderuje ekrany; nigdy nie wchodzi do spiżarni.
- **Instalacje (`PLUMBING`)**: Bezstanowe, czyste funkcje narzędziowe, całkowicie odizolowane.

---

## Pięć Stref Kanonicznych

| Strefa | Katalog | Odpowiedzialność | Bezwzględna Reguła |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | Reguły biznesowe, encje, kontrakty `I*` | **0% entropii we/wy**; zakaz importu infrastruktury lub UI |
| `CORE` | `src/core/` | Orkiestracja przypadków użycia, maszyny stanów | Zakaz importu UI; łączy się z infrastrukturą wyłącznie przez interfejsy |
| `INFRASTRUCTURE` | `src/infrastructure/` | Adaptery fs, HTTP, baz danych | Zakaz importu UI; implementuje kontrakty Domain |
| `PLUMBING` | `src/plumbing/` | Kryptografia, bezstanowe narzędzia | Warstwa liścia; zakaz importu jakichkolwiek innych stref |
| `UI` | `src/ui/` | Prezenterzy CLI, trasy HTTP, widoki | Zakaz bezpośredniego importu infrastruktury |

---

## Szybki Start (2 Minuty)

Nie jest wymagane `npm install` (wystarczy Node.js 18+ oraz git):

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Uruchom testy (196 testów zaliczonych)
npm test

# 2. Przeprowadź audyt architektoniczny
npm run joy-check

# 3. Zainstaluj konfigurację agentów AI (Claude, Cursor, Antigravity itp.)
npx heav3ns-joy init
```

Więcej informacji w [Portalu Dokumentacji](../README.md) oraz [Modelu Kanonicznym](../../spec/00-CANONICAL-MODEL.md).

