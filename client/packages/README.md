# Harrier Core — контрактный слой

Этот каталог содержит три приватных npm-пакета, которые отделяют UI от `matrix-js-sdk`.

| Пакет | Назначение |
|-------|------------|
| `@harrier/core` | Чистый контракт: типы, интерфейсы, view-модели, `SnapshotStore`, `CoreError`. Не зависит от SDK, React или Tauri. |
| `@harrier/core-matrix-js` | Единственная реализация контракта поверх `matrix-js-sdk`. Все прямые импорты SDK и крипто-бэкенда находятся здесь. |
| `@harrier/core-contract-tests` | Общий контрактный сьют, harness и фикстуры. Не импортирует SDK. |

## Шов между ядром и UI

UI не получает `MatrixClient`, `Room` или `MatrixEvent`. Вместо этого:

- состояние читается через `SnapshotStore<T>` (`revision`, `getSnapshot`, `subscribe`);
- команды возвращают `CoreResult<T>` — либо значение, либо нормализованный `CoreError`;
- все события и данные приходят как plain data (`RoomView`, `TimelineItem`, `DeviceView`, `VerificationRequestView` и т. д.).

React-слой получает ядро через `CoreProvider` / `useCore()`. Для типовых задач есть хуки `useCoreRoom`, `useCoreRoomMeta`, `useCoreTimeline`, `useUserPresence`, `useDeviceList` и другие.

## Модули контракта

- `auth` — сессия, sync lifecycle, logout.
- `rooms` — комнаты, membership, state, участники, команды create/join/leave/invite.
- `timeline` —лента событий, пагинация, reply/edit/reaction/redaction, receipts.
- `presence` — присутствие, typing, собственный статус.
- `send` — отправка сообщений и событий, локальные ID и статусы.
- `uploads` — загрузка файлов и прогресс.
- `crypto` — устройства, доверие, верификация SAS, бэкап и secret storage.
- `notifications` — настройки уведомлений и push rules.
- `media` — MXC-URL, загрузка/расшифровка вложений, previews и media config.

## Как запустить контрактные тесты

Контрактный сьют живёт в `@harrier/core-contract-tests` и запускается против адаптера в `packages/core-matrix-js/src/testing/contract.test.ts`:

```sh
cd desktop/client
npx vitest run packages
```

Чтобы добавить сценарий:

1. Опишите его в `packages/core-contract-tests/src/cases/<domain>.ts` через `contractTest`.
2. Экспортируйте массив из `packages/core-contract-tests/src/index.ts`.
3. Подключите его в `packages/core-matrix-js/src/testing/contract.test.ts`.
4. При необходимости расширьте фикстуры в `packages/core-contract-tests/src/harness.ts` и драйвер в `packages/core-matrix-js/src/testing/driver.ts`.

Тесты обязаны работать только на публичном API ядра: никаких `MatrixClient`, `Room`, `MatrixEvent` и приватных `processSyncResponse`.

## Как добавить новый адаптер

1. Реализуйте интерфейс `HarrierCore` из `@harrier/core`.
2. Верните `CoreResult<T>` и `CoreError` вместо SDK-ошибок.
3. Публикуйте состояние через `SnapshotStore`, а не через SDK-события.
4. Добавьте harness и прогоните общий контрактный сьют без изменений assertions.

## Правило импортов

`matrix-js-sdk` и `matrix-js-sdk/*` разрешены **только** в `packages/core-matrix-js/**`. В остальном коде客户端 импортировать SDK нельзя: используйте `useCore()` и соответствующий модуль ядра. Это правило постепенно включается в ESLint (`no-restricted-imports`) по мере завершения миграции.
