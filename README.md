# Slottsbanan – PWA Golf App

En golf-assistent för Slottsbanan som hjälper dig välja rätt klubba baserat på:
- GPS-avstånd till green
- Väderförhållanden (vind, temperatur, luftfuktighet, lufttryck)
- Höjdskillnad
- Flaggposition på green

## Funktioner

### 🏌️ Hålval
- Välj mellan hål 1-18
- Visar avstånd till framkant, mitt och bakkant på green

### 📍 GPS-positionering
- Realtidspositionering med hög precision
- Automatisk avståndsberäkning

### 🎯 Flaggpositionsjustering
- Justera flaggans position ±10 meter i alla riktningar
- Uppdaterar automatiskt avstånd och rekommendation

### 🌤️ Väderintegration
- Hämtar realtidsväder från OpenWeatherMap
- Visar temperatur, vindhastighet, vindriktning och luftfuktighet
- Beräknar påverkan på klubbval

### 🏌️‍♂️ Klubbrekommendation
- Rekommenderar optimal klubba baserat på alla faktorer
- Visar hur mycket du ska sikta åt höger/vänster vid sidvind
- Detaljerad påverkansinformation för varje väderparameter

### ⚙️ Klubbinställningar
- Konfigurera 13 klubbor (Driver till LW)
- Ange totallängd och carry-längd för varje klubba
- Data sparas lokalt i din enhet

## Installation

### Som PWA (Rekommenderat)
1. Öppna appen i en webbläsare på din mobil
2. Lägg till på hemskärmen:
   - **iOS**: Tryck på dela-knappen → "Lägg till på hemskärmen"
   - **Android**: Tryck på menyn → "Lägg till på startskärmen"

### GitHub Pages
1. Forka detta repo
2. Gå till Settings → Pages
3. Välj main branch som källa
4. Din app kommer vara tillgänglig på `https://[ditt-användarnamn].github.io/[repo-namn]`

## Teknisk Information

### Filer
- `index.html` - Huvudsaklig HTML-struktur
- `styles.css` - Modern styling med gradients och animationer
- `app.js` - All applikationslogik
- `manifest.json` - PWA-manifest
- `sw.js` - Service Worker för offline-funktionalitet
- `map.geojson` - Golfbanans hål och green-koordinater
- `icon-192.png` & `icon-512.png` - App-ikoner

### Beräkningar

#### Temperaturpåverkan
~1 meter per 5°C över/under 20°C

#### Vindpåverkan
- Motvind: -2 meter per m/s
- Medvind: +2 meter per m/s
- Sidvind: 0.5 meter sikte-justering per km/h

#### Luftfuktighet
Högre luftfuktighet ökar avståndet något

#### Lufttryck
~1 meter per 10 hPa från standardtryck (1013 hPa)

#### Höjdskillnad
1 meter avståndsjustering per meter höjdskillnad

### API-nycklar

Väder-API: OpenWeatherMap
- Aktuell nyckel: `99d688898682ba4fc727529cd0fbd7ac`
- För produktion: Skaffa egen nyckel på https://openweathermap.org/api

## Användning

1. **Första gången**: Gå till inställningar (kugghjul) och ange dina klubbavstånd
2. **På banan**: 
   - Välj aktuellt hål
   - Appen hämtar automatiskt din position och väder
   - Justera flaggposition om den inte står mitt på green
   - Följ klubbrekommendationen och siktejusteringen

## Systemkrav

- Modern webbläsare med GPS-stöd
- Internetanslutning för väderdata (första gången per session)
- HTTPS (krävs för GPS-åtkomst)

## Utveckling

Lokal utveckling:
```bash
# Starta en lokal webbserver
python3 -m http.server 8000

# Öppna i webbläsare
http://localhost:8000
```

## Säkerhet

- GPS-position lämnar aldrig enheten (endast använd för lokal beräkning)
- Klubbdata lagras lokalt i webbläsarens localStorage
- Ingen data skickas till externa servrar (förutom väder-API)

## Licens

MIT License - Fri att använda och modifiera

## Support

Vid problem eller förslag, öppna ett issue på GitHub.

---

**Trevlig golf! ⛳**
