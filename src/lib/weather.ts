export type WeatherLocation = {
  id?: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

type GeocodingResponse = {
  results?: WeatherLocation[];
};

export type WeatherForecast = {
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
  };
};

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`تعذّر جلب بيانات الطقس (${response.status})`);
  return (await response.json()) as T;
}

export async function searchWeatherLocation(query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ name: query, count: "8", language: "ar", format: "json" });
  const result = await fetchJson<GeocodingResponse>(
    `https://geocoding-api.open-meteo.com/v1/search?${params}`,
    signal,
  );
  return result.results ?? [];
}

export function fetchWeatherForecast(location: WeatherLocation, signal?: AbortSignal) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
    timezone: "auto",
    forecast_days: "5",
  });
  return fetchJson<WeatherForecast>(`https://api.open-meteo.com/v1/forecast?${params}`, signal);
}

export function describeWeather(code: number) {
  if (code === 0) return { label: "سماء صافية", icon: "sun" as const };
  if (code === 1) return { label: "صحو غالبًا", icon: "sun-cloud" as const };
  if (code === 2) return { label: "غائم جزئيًا", icon: "sun-cloud" as const };
  if (code === 3) return { label: "غائم", icon: "cloud" as const };
  if ([45, 48].includes(code)) return { label: "شبورة", icon: "fog" as const };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "رذاذ خفيف", icon: "rain" as const };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "أمطار", icon: "rain" as const };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "ثلوج", icon: "snow" as const };
  if ([95, 96, 99].includes(code)) return { label: "عواصف رعدية", icon: "storm" as const };
  return { label: "حالة جوية متغيرة", icon: "cloud" as const };
}

export function formatHour(time: string) {
  return new Intl.DateTimeFormat("ar-EG", { hour: "numeric", hour12: true }).format(new Date(time));
}

export function formatDay(time: string) {
  return new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(new Date(`${time}T12:00:00`));
}

export function formatClock(time: string) {
  return new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(time));
}
