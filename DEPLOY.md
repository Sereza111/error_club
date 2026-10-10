# Публикация errorclub

Источник сайта — `https://github.com/Sereza111/error_club`, ветка `main`.

После локальных проверок:

```sh
python tools/check_site.py
node tools/test_player.cjs
git add <изменённые файлы>
git commit -m "Describe the change"
git push origin main
```

На сервере `errorclub-publish.timer` проверяет ветку каждые две минуты.
Публикация не требует GitHub-токена или SSH-ключа в репозитории: сервер читает
публичный Git. GitHub Actions отдельно выполняет проверки; сервер проверяет
манифест и типы файлов, но не ожидает результат Actions.

Проверка на сервере:

```sh
systemctl status errorclub-publish.timer
journalctl -u errorclub-publish.service -n 20 --no-pager
cat /var/lib/errorclub-publisher/deployed-revision
```

Принудительная проверка обновления: `systemctl start errorclub-publish.service`.
Остановить автоматическую публикацию: `systemctl stop errorclub-publish.timer`.

## Устройство

Установленная копия `ops/publish.py` находится в
`/usr/local/libexec/errorclub-publish.py`. Она выполняется от отдельного
пользователя `errorclub-publisher`. Для службы доступны на запись только
`/var/lib/errorclub-publisher` и `/var/www/errorclub.club`.
Скрипты из скачанного репозитория не выполняются. Изменения `ops/` требуют
отдельной ручной установки администратором.

В сайт попадают только обычные файлы из `site-manifest.json`, без символических
ссылок и выхода за корневую папку сайта. При добавлении новых ассетов нужно
обновить манифест. Сначала публикуются медиа и стили, затем HTML. Права файлов
644, новых каталогов 755. DNS, Nginx и сертификаты этой службой не изменяются.

Перед заменой сохраняются предыдущие версии изменённых файлов в
`/var/lib/errorclub-publisher/backups/<date>-<commit>/`. При ошибке записи текущая
операция откатывается. Существующие файлы, отсутствующие в новом манифесте,
не удаляются автоматически. Для обычного отката используй `git revert` и push.

После публикации проверить публичные страницы артистов, фотографии,
`assets/audio-analysis/emohead-plevat.json`, спектрограмму woomzzzoid и HTTP Range для фоновых MP4. Успешный push
сам по себе не подтверждает публикацию: сверяй `deployed-revision` и живой сайт.

## Исходники рендера

Фон v28 — 30 секунд Blender, 24 fps. На сайте используются desktop/mobile MP4
и WebP-постер. Сцены Blender и промежуточные PNG остаются в локальном архиве и
не публикуются. WAV `(не)друг` также остаётся локальным: на сайт попадает только
сжатый MP3, нужный для встроенного плеера, и производные спектральные данные.
При reduced motion фон остаётся статичным.
