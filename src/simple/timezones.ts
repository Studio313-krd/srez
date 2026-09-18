// IANA regional identifiers, covering all 11 current Russian time offsets.
// Verified 2026-09-18: https://data.iana.org/time-zones/tzdb/zone.tab
export const russianTimezones = [
  ["Europe/Kaliningrad", "Калининград", 2],
  ["Europe/Moscow", "Москва / Санкт-Петербург", 3],
  ["Europe/Kirov", "Киров", 3],
  ["Europe/Volgograd", "Волгоград", 3],
  ["Europe/Astrakhan", "Астрахань", 4],
  ["Europe/Saratov", "Саратов", 4],
  ["Europe/Ulyanovsk", "Ульяновск", 4],
  ["Europe/Samara", "Самара / Ижевск", 4],
  ["Asia/Yekaterinburg", "Екатеринбург / Тюмень", 5],
  ["Asia/Omsk", "Омск", 6],
  ["Asia/Novosibirsk", "Новосибирск", 7],
  ["Asia/Barnaul", "Барнаул / Алтай", 7],
  ["Asia/Tomsk", "Томск", 7],
  ["Asia/Novokuznetsk", "Кемерово / Новокузнецк", 7],
  ["Asia/Krasnoyarsk", "Красноярск", 7],
  ["Asia/Irkutsk", "Иркутск / Улан-Удэ", 8],
  ["Asia/Chita", "Чита", 9],
  ["Asia/Yakutsk", "Якутск", 9],
  ["Asia/Khandyga", "Хандыга", 9],
  ["Asia/Vladivostok", "Владивосток / Хабаровск", 10],
  ["Asia/Ust-Nera", "Усть-Нера", 10],
  ["Asia/Magadan", "Магадан", 11],
  ["Asia/Sakhalin", "Сахалин", 11],
  ["Asia/Srednekolymsk", "Среднеколымск", 11],
  ["Asia/Kamchatka", "Камчатка", 12],
  ["Asia/Anadyr", "Анадырь / Чукотка", 12],
] as const;
export const offsetLabel = (gmt: number) =>
  `МСК${gmt < 3 ? "−" : "+"}${Math.abs(gmt - 3)}, GMT+${gmt}`;
export const timezoneLabel = (zone: string) => {
  const item = russianTimezones.find(([id]) => id === zone);
  return item ? `${item[1]} (${offsetLabel(item[2])})` : zone;
};
