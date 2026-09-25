# Atlas Bieli

Interaktywna mapa do powieści *Biel* Szymona Urbanowskiego: Wrocław i Śląsk od jesieni 1293 do wiosny 1294, scena po scenie, na mapach autora.

## Co robi

- **Strona powitalna.** Przy pierwszym wejściu mówi, czym jest mapa i jak z niej korzystać, i pyta, na którym rozdziale jest czytelnik. Otwiera ją ponownie tytuł „Biel” w nagłówku albo adres z dopiskiem `#wstep`.
- **Arkusze autora w jednym układzie.** Śląsk, Wrocław z okolicą, miasto w murach i Ostrów Tumski leżą jeden na drugim w prawdziwych współrzędnych. Przy przybliżaniu Śląsk przechodzi we Wrocław, Wrocław w miasto w murach, a miasto w Ostrów. Osobne widoki mają plan opactwa na Piasku oraz, z „Żółci”, schemat Kotliny Cichej z Głuszycą i plan opactwa św. Wawrzyńca (pokazują się od rozdziału VII).
- **Każda scena ma miejsce i dzień.** 75 scen (prolog, rozdziały I–XI) z datą w kalendarzu juliańskim, nazwą dnia w rachubie kościelnej (feria), świętem i datą według dzisiejszej rachuby.
- **Bez spoilerów, co do sceny.** „Przeczytane do” ustawia rozdział, a przyciski − + scenę w rozdziale. Podpowiedź przy liczniku i karta startowa podają pierwsze słowa sceny, żeby łatwo porównać je z książką. Mapa chowa dalsze sceny, postacie, opisy miejsc, a nawet imiona i nazwy miejsc, które książka odsłania później (furtian staje się bratem Sulkiem dopiero od rozdziału VIII). Dalsze rozdziały na osi czasu są zabielone.
- **Oś czasu** z pasmami rozdziałów i ważnymi świętami (Marcin, Łucja, Boże Narodzenie, Gromniczna, Popielec). Strzałki ← → przechodzą scena po scenie.
- **Karty** sceny (streszczenie, cytat, kto jest na scenie, rzeczy), miejsca (numer z legendy autora, opis z książki, przypisy) i postaci (opis narastający z lekturą, lista scen, filtr „tylko jej/jego sceny”).
- **Podróże** poselstwa do Głogowa (V) i drogi w góry (IX) jako przerywane trakty na mapie Śląska. Przystanki odsłaniają się razem ze scenami.
- **Słowniczek** z książki w osobnej zakładce, w grupach: godziny, miary i pieniądze, ludzie i urzędy, klasztor, kancelaria, prawo. W tekstach kart hasła mają kropkowane podkreślenie i objaśnienie po najechaniu albo stuknięciu.
- **Linki do rozdziałów.** `…/index.html#do-IX` odsłania mapę do końca rozdziału IX i nigdy nie cofa lektury, więc nadaje się na kod QR na końcu rozdziału. `#IX.3` otwiera scenę, `#ratusz` miejsce.
- Jasna oprawa w stylu map: biały papier, czarny tusz, podwójne ramki.

## Uruchomienie

To zwykła strona statyczna bez budowania.

- Lokalnie: otwórz `index.html` w przeglądarce albo uruchom `python3 -m http.server` w katalogu repozytorium i wejdź na `http://localhost:8000`.
- W sieci: GitHub Pages (Settings → Pages → gałąź i katalog główny). Link do sceny: `…/index.html#IX.3`, do końca rozdziału: `…/index.html#do-IX`.

Czcionki (Uncial Antiqua, Cardo) ładują się z Google Fonts. Bez sieci strona działa z czcionkami systemowymi.

## Pliki

```
index.html                 strona
assets/app.js              logika mapy, osi czasu i kart
assets/app.css             wygląd
assets/maps/*.webp         pola map autora wycięte z ramek (Śląsk, Wrocław, miasto w murach, Ostrów, Piasek; z „Żółci”: Kotlina Cicha, św. Wawrzyniec)
assets/img/okladka.webp    okładka
assets/vendor/leaflet/     Leaflet 1.9.4 (licencja BSD-2-Clause)
data/biel-data.js          wszystkie dane: rozdziały, sceny, miejsca, postacie, podróże, święta, słowniczek
```

## Dane (`data/biel-data.js`)

To zwykły JSON przypisany do `window.BIEL_DATA`, więc można go edytować w dowolnym edytorze.

- `chapters`: `id` (`P`, `I` … `XI`), `num`, `title`, `motto`.
- `scenes`: `id` (`IX.3`), `ch`, `title`, `incipit` (pierwsze słowa sceny), `date` (`j` data juliańska, `end`, `prec`: `day` / `approx` / `range` / `season`), `time`, `place`, `path` (droga w obrębie sceny), `pov`, `povLabel`, `chars`, `summary`, `quote`, `objects`, `mentioned`.
- `places`: `name`, `short`, `parent`, `first` (scena, w której miejsce pojawia się pierwszy raz; wcześniej jego nazwa jest zabielona), `sheets` z położeniem w pikselach wyciętej mapy (`x`, `y`; na mapach Wrocławia, miasta w murach i planach opactw także `n` — numer legendy — oraz `cx`, `cy`, `r` kółka z numerem i `label`, opis z legendy bez imion z dalszych rozdziałów), `desc` i `notes` (opisy przypisane do rozdziału, w którym padły), `approx` (położenie umowne: miejsca, których nie ma na mapach autora), `far` (miejsca poza mapą).
- `characters`: `names` (lista `{ch, name}`: od którego rozdziału obowiązuje dana nazwa), `group`, `hist` (postać historyczna), `role`, `intro` (opisy przypisane do rozdziałów), `minor` (postać epizodyczna).
- `journeys`: `stops` (miejsca po kolei), `stopScenes` (scena, od której przystanek jest widoczny), `labels`.
- `glossary`: `term`, `forms` (odmiany do podkreślania w tekście), `def`, `group`.
- `sheets.*.bounds`: narożniki arkuszy w stopniach. Mapy Śląska i Wrocławia są narysowane na podkładzie OpenStreetMap w odwzorowaniu Mercatora; dopasowanie do miast daje błąd kilku pikseli. Miasto w murach jest dopasowane do mapy Wrocławia po wspólnych punktach (błąd około 2 px), a Ostrów po katedrze i kościele na Piasku.

Miejsce bez własnego położenia na danym arkuszu pokazuje się w miejscu najbliższego „rodzica” (`a_komora_dietricha` → dormitorium → kapitularz nr 7; wszystko we Wrocławiu → kropka Wrocławia na mapie Śląska).

### Jak dopisać rozdziały XII–XVI

1. Dodaj rozdział do `chapters` (`{"id": "XII", "num": 12, "title": "Wieża", "motto": …}`).
2. Dodaj sceny do `scenes` w kolejności książki. Wystarczy `id`, `ch`, `title`, `incipit`, `date`, `place`, `chars` i `summary`.
3. Nowe miejsca dopisz do `places` z `first` ustawionym na scenę, w której się pojawiają. Położenie to piksele obrazu z `assets/maps/` (współrzędne odczytasz w dowolnym edytorze grafiki).
4. Jeśli postać dostaje imię później, dopisz je do jej `names` z rozdziałem odsłonięcia.

## Źródła

Mapy i plany: Szymon Urbanowski (podkład © autorzy OpenStreetMap, licencja ODbL). Mapa miasta w murach pochodzi z wersji SVG autora; napisy wyrenderowano krojem URW P052 w miejsce TeX Gyre Pagella. Sceny, daty, opisy miejsc i postaci opracowano na podstawie rozdziałów prolog–XI, przypisów, Kalendarza i Słowniczka powieści; streszczenia wymagają lektury autora. Znaczniki opisane jako „położenie umowne” wskazują miejsca, których nie ma na mapach autora.
