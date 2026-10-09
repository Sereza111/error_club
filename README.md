# errorclub

Статический сайт независимых артистов: [errorclub.club](https://errorclub.club).

## Локальный запуск

```sh
python -m http.server 8765
```

Открыть `http://127.0.0.1:8765/`. Сборка и npm-зависимости не нужны.

## Структура

- `index.html`, `styles.css`, `app.js` — главная и фон из Blender.
- `artists/<slug>/index.html` — отдельные страницы четырёх артистов.
- `artist.css`, `emohead.css` — общие и индивидуальные стили.
- `artist.js`, `signal.js` — фотографии и терминальное наведение.
- `artist-player.js` — SoundCloud Widget API, попытка автозапуска и ручной плеер.
- `assets/audio-analysis/emohead-plevat.json` — публичная амплитудная волна трека.
- `site-manifest.json` — точный список публикуемых файлов.

Полосы emohead используют амплитуду настоящего трека и позицию SoundCloud,
включая паузу и перемотку. Это визуализация громкости, не частотный FFT-анализ:
встроенный плеер не предоставляет аудиосэмплы. При недоступной волне полосы
остаются неподвижными. Настройка reduced motion отключает движение.

Автозапуск со звуком зависит от браузера. Если он заблокирован, доступна кнопка
включения; сайт не обходит настройки пользователя.

## Проверки

```sh
python tools/check_site.py
node tools/test_player.cjs
node --check artist-player.js
```

Для повторной подготовки растровых фото нужен Pillow:
`python tools/prepare_emohead_art.py`.
Публичную волну можно обновить командой:

```sh
python tools/prepare_waveform.py https://soundcloud.com/emohead01/plevat-mp3 assets/audio-analysis/emohead-plevat.json
```

Скрипт получает только опубликованные значения амплитуды, без загрузки аудио.
Исходники Blender, промежуточные рендеры, резервные копии и локальные настройки
доступа не входят в публичный репозиторий. Права на музыку и фотографии
принадлежат их авторам. Публикация описана в [DEPLOY.md](DEPLOY.md).
