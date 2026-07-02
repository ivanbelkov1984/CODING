# Активация Web Push (10 минут)

Всё готово. `push.js` **не импортируется** сервером, пока не сделаешь шаги ниже —
поэтому синхронизация не затрагивается. Активация:

## 1. Установить зависимость (в architect/backend)
```
npm install web-push
```
Это обновит `package.json` и `package-lock.json` (нужно для `npm ci` на Railway).

## 2. Сгенерировать VAPID-ключи
```
npx web-push generate-vapid-keys
```
Получишь `Public Key` и `Private Key`.

## 3. Задать переменные окружения на Railway (сервис architect backend)
```
VAPID_PUBLIC   = <public key>
VAPID_PRIVATE  = <private key>
VAPID_SUBJECT  = mailto:твой@email
```

## 4. Подключить модуль в server.js
Добавить рядом с другими импортами и после создания `app`/`pool`:
```js
import mountPush from './push.js';
// ... после const app = express(); и const pool = new Pool(...):
mountPush(app, pool);
```

## 5. Задеплоить (Railway подхватит push из репозитория)

## Проверка
- `GET /api/push/vapid` → `{ publicKey }` (не 501).
- В приложении: **Итоги → Настройки → Уведомления** → разрешить.
- `POST /api/push/test` → должно прийти уведомление на устройство.

## Что уже есть
- Клиент: подписка, SW-обработчики `push`/`notificationclick`, статус в Настройках.
- Сервер (`push.js`): `/api/push/vapid`, `/subscribe`, `/unsubscribe`, `/test`,
  ежедневный отправитель (по полю `hour`, ежечасная проверка), авто-очистка
  мёртвых подписок (404/410). Всё под guard: без ключей роуты отвечают 501.
