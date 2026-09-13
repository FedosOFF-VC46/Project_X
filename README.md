# Resin Cost OS

Внутреннее веб-приложение для расчета себестоимости изделий из эпоксидной смолы.

## Стек

- Frontend: статический SPA для GitHub Pages.
- Backend: Supabase Auth, Database, Storage.
- 3D: Three.js.

## Supabase

- Project ref: `hapgpphyucjciiinwlbx`
- URL: `https://hapgpphyucjciiinwlbx.supabase.co`
- Publishable key: лежит в `src/config.js`
- Storage bucket: `epoxy-photos`

Секретные ключи в проект не добавляются. Доступ к данным закрыт через Supabase Auth и RLS.

## Локальный запуск

```bash
python3 -m http.server 4173
```

После запуска открыть:

```text
http://localhost:4173
```

## Разделы MVP

- Авторизация.
- Материалы и склад.
- Приходы и ручные корректировки.
- Готовые изделия и состав из сохраненных расчетов смолы.
- Продажи, логистика и учет готовой продукции.
- Автоматическое списание материалов после фиксации партии.
- История расчетов и движений склада.
- Расчет смолы на молд.
