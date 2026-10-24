export type PlayerButtonId =
  | "shuffle"
  | "prev"
  | "play"
  | "next"
  | "repeat"
  | "like"
  | "dislike"
  | "sleep"
  | "queue"
  | "lyrics"
  | "speed"
  | "quality"
  | "volume";

export type PlayerZone = "left" | "center" | "right" | "off";

export type PlayerButtonSlots = Record<PlayerButtonId, PlayerZone>;

export interface PlayerButtonMeta {
  id: PlayerButtonId;
  label: string;
  icon: string;
  hint?: string;
  locked?: boolean;
}

export const playerButtonCatalog: PlayerButtonMeta[] = [
  { id: "like", label: "Лайк", icon: "mingcute:heart-line", hint: "Добавить в Мою музыку" },
  { id: "dislike", label: "Дизлайк", icon: "mingcute:thumb-down-line", hint: "Больше не рекомендовать" },
  { id: "shuffle", label: "Перемешать", icon: "mingcute:shuffle-line", hint: "Случайный порядок" },
  { id: "prev", label: "Предыдущий", icon: "mingcute:skip-previous-fill", hint: "Назад по очереди" },
  { id: "play", label: "Воспроизведение", icon: "mingcute:play-fill", locked: true, hint: "Старт / пауза" },
  { id: "next", label: "Следующий", icon: "mingcute:skip-forward-fill", hint: "Вперёд по очереди" },
  { id: "repeat", label: "Повтор", icon: "mingcute:repeat-line", hint: "По кругу / один трек" },
  { id: "lyrics", label: "Текст", icon: "mingcute:align-left-2-line", hint: "Панель с текстом" },
  { id: "queue", label: "Очередь", icon: "mingcute:playlist-2-line", hint: "Список воспроизведения" },
  { id: "sleep", label: "Таймер сна", icon: "mingcute:time-line", hint: "Остановить через N минут" },
  { id: "speed", label: "Скорость", icon: "mingcute:dashboard-line", hint: "Темп воспроизведения" },
  { id: "quality", label: "Качество", icon: "mingcute:barcode-line", hint: "Битрейт потока" },
  { id: "volume", label: "Громкость", icon: "mingcute:volume-line", hint: "Кнопка и ползунок" },
];

export const playerButtonOrder: PlayerButtonId[] = [
  "like",
  "dislike",
  "shuffle",
  "prev",
  "play",
  "next",
  "repeat",
  "lyrics",
  "queue",
  "sleep",
  "speed",
  "quality",
  "volume",
];

export const defaultPlayerButtonSlots: PlayerButtonSlots = {
  like: "left",
  dislike: "left",
  shuffle: "center",
  prev: "center",
  play: "center",
  next: "center",
  repeat: "center",
  lyrics: "right",
  queue: "right",
  sleep: "off",
  speed: "off",
  quality: "right",
  volume: "right",
};

export const playerZoneLabels: Array<{ value: PlayerZone; label: string }> = [
  { value: "left", label: "Слева" },
  { value: "center", label: "Центр" },
  { value: "right", label: "Справа" },
  { value: "off", label: "Скрыть" },
];
