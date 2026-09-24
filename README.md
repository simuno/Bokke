# Atlas Bieli

Interaktywna mapa do powieści *Biel* Szymona Urbanowskiego: Wrocław i Śląsk od jesieni 1293 do wiosny 1294, scena po scenie, na mapach autora.

## Co robi

- **Cztery arkusze autora w jednym układzie.** Śląsk, Wrocław i Ostrów Tumski leżą jeden na drugim w prawdziwych współrzędnych. Przy przybliżaniu Śląsk przechodzi we Wrocław, a Wrocław w Ostrów. Plan opactwa na Piasku ma osobny widok.
- **Każda scena ma miejsce i dzień.** 75 scen (prolog, rozdziały I–XI) z datą w kalendarzu juliańskim, nazwą dnia w rachubie kościelnej (feria), świętem i datą według dzisiejszej rachuby.
- **Bez spoilerów.** Ustawienie „Przeczytane do” chowa sceny, postacie, opisy miejsc i nawet imiona, które książka odsłania później (furtian staje się bratem Sulkiem dopiero od rozdziału VIII). Dalsze rozdziały na osi czasu są zabielone.
- **Oś czasu** z pasmami rozdziałów i ważnymi świętami (Marcin, Łucja, Boże Narodzenie, Gromniczna, Popielec). Strzałki ← → przechodzą scena po scenie.
- **Karty** sceny (streszczenie, cytat, kto jest na scenie, rzeczy), miejsca (numer z legendy autora, opis z książki, przypisy) i postaci (opis narastający z lekturą, lista scen, filtr „tylko jej/jego sceny”).
- **Podróże** poselstwa do Głogowa (V) i drogi w góry (IX) jako przerywane trakty na mapie Śląska.
- **Słowniczek** z książki: hasła w tekstach kart mają podkreślenie i objaśnienie po najechaniu.
- Tryb ciemny odwraca mapy, jakby oglądać je pod światło.

## Uruchomienie

To zwykła strona statyczna bez budowania.

- Lokalnie: otwórz `index.html` w przeglądarce albo uruchom `python3 -m http.server` w katalogu repozytorium i wejdź na `http://localhost:8000`.
- W sieci: GitHub Pages (Settings → Pages → gałąź i katalog główny). Link do sceny: `…/index.html#IX.3`.

Czcionki (Uncial Antiqua, Cardo) ładują się z Google Fonts. Bez sieci strona działa z czcionkami systemowymi.

## Pliki

```
index.html                 strona
assets/app.js              logika mapy, osi czasu i kart
assets/app.css             wygląd
assets/maps/*.webp         pola map autora wycięte z ramek (Śląsk, Wrocław, Ostrów, opactwo)
assets/img/okladka.webp    okładka
assets/vendor/leaflet/     Leaflet 1.9.4 (licencja BSD-2-Clause)
data/biel-data.js          wszystkie dane: rozdziały, sceny, miejsca, postacie, podróże, święta, słowniczek
```

## Dane (`data/biel-data.js`)

To zwykły JSON przypisany do `window.BIEL_DATA`, więc można go edytować w dowolnym edytorze.

- `chapters`: `id` (`P`, `I` … `XI`), `num`, `title`, `motto`.
- `scenes`: `id` (`IX.3`), `ch`, `title`, `date` (`j` data juliańska, `end`, `prec`: `day` / `approx` / `range` / `season`), `time`, `place`, `path` (droga w obrębie sceny), `pov`, `povLabel`, `chars`, `summary`, `quote`, `objects`, `mentioned`.
- `places`: `name`, `short`, `parent`, `sheets` z położeniem w pikselach wyciętej mapy (`x`, `y`; na mapie Wrocławia i planie opactwa także `n` — numer legendy — oraz `cx`, `cy`, `r` kółka z numerem), `desc` i `notes` (opisy przypisane do rozdziału, w którym padły), `approx` (położenie umowne: miejsca, których nie ma na mapach autora), `far` (miejsca poza mapą).
- `characters`: `names` (lista `{ch, name}`: od którego rozdziału obowiązuje dana nazwa), `group`, `hist` (postać historyczna), `role`, `intro` (opisy przypisane do rozdziałów), `minor` (postać epizodyczna).
- `sheets.*.bounds`: narożniki arkuszy w stopniach. Mapy Śląska i Wrocławia są narysowane na podkładzie OpenStreetMap w odwzorowaniu Mercatora; dopasowanie do miast daje błąd kilku pikseli. Ostrów jest dopasowany do mapy Wrocławia po katedrze i kościele na Piasku.

Miejsce bez własnego położenia na danym arkuszu pokazuje się w miejscu najbliższego „rodzica” (`a_komora_dietricha` → dormitorium → kapitularz nr 7; wszystko we Wrocławiu → kropka Wrocławia na mapie Śląska).

### Jak dopisać rozdziały XII–XVI

1. Dodaj rozdział do `chapters` (`{"id": "XII", "num": 12, "title": "Wieża", "motto": …}`).
2. Dodaj sceny do `scenes` w kolejności książki. Wystarczy `id`, `ch`, `title`, `date`, `place`, `chars` i `summary`.
3. Nowe miejsca dopisz do `places`. Położenie to piksele obrazu z `assets/maps/` (współrzędne odczytasz w dowolnym edytorze grafiki).
4. Jeśli postać dostaje imię później, dopisz je do jej `names` z rozdziałem odsłonięcia.

## Źródła

Mapy i plan opactwa: Szymon Urbanowski (podkład © autorzy OpenStreetMap, licencja ODbL). Sceny, daty, opisy miejsc i postaci opracowano na podstawie rozdziałów prolog–XI, przypisów, Kalendarza i Słowniczka powieści; streszczenia wymagają lektury autora. Znaczniki opisane jako „położenie umowne” wskazują miejsca, których nie ma na mapach autora.
