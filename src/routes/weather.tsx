import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSun,
  Compass,
  Droplets,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  Sunrise,
  Sunset,
  Sun,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import {
  describeWeather,
  fetchWeatherForecast,
  formatClock,
  formatDay,
  formatHour,
  searchWeatherLocation,
  type WeatherForecast,
  type WeatherLocation,
} from "@/lib/weather";

export const Route = createFileRoute("/weather")({
  head: () => ({ meta: [{ title: "الطقس الآن | دار السلام" }] }),
  component: WeatherDashboard,
});

const CAIRO: WeatherLocation = {
  name: "القاهرة",
  country: "مصر",
  latitude: 30.0444,
  longitude: 31.2357,
};

function WeatherDashboard() {
  const [location, setLocation] = useState(CAIRO);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadForecast = useCallback(async (nextLocation: WeatherLocation, signal?: AbortSignal) => {
    setBusy(true);
    setError("");
    try {
      const data = await fetchWeatherForecast(nextLocation, signal);
      if (!signal?.aborted) {
        setLocation(nextLocation);
        setForecast(data);
        setUpdatedAt(new Date());
      }
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "حدث خطأ أثناء تحميل الطقس.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadForecast(CAIRO, controller.signal);
    return () => controller.abort();
  }, [loadForecast]);

  const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setSearching(true);
    setError("");
    setResults([]);
    try {
      const found = await searchWeatherLocation(value);
      if (!found.length) {
        setError("لم نعثر على مدينة بهذا الاسم. جرّب كتابة الاسم بالعربية أو الإنجليزية.");
        return;
      }
      if (found.length === 1) {
        setQuery("");
        await loadForecast(found[0]);
      } else {
        setResults(found);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذّر البحث عن المدينة.");
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError("تحديد الموقع غير متاح في هذا المتصفح.");
      return;
    }
    setError("");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const current: WeatherLocation = {
          name: "موقعي الحالي",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        void loadForecast(current);
      },
      () => {
        setBusy(false);
        setError("لم نتمكن من تحديد موقعك. تحقق من إذن الموقع أو ابحث عن مدينتك.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const hourly = useMemo(() => {
    if (!forecast) return [];
    const start = forecast.hourly.time.findIndex((time) => time >= forecast.current.time);
    return Array.from({ length: 8 }, (_, offset) => {
      const index = Math.max(0, start) + offset;
      return {
        time: forecast.hourly.time[index],
        temperature: forecast.hourly.temperature_2m[index],
        probability: forecast.hourly.precipitation_probability[index],
        code: forecast.hourly.weather_code[index],
      };
    }).filter((item) => item.time);
  }, [forecast]);

  const currentDescription = forecast ? describeWeather(forecast.current.weather_code) : null;

  return (
    <main className="min-h-dvh bg-[#f3f6f7] px-4 py-5 font-sans text-[#15262d] sm:px-7 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-[#dce5e7] bg-white px-4 py-2 text-sm font-bold text-[#3b5961] shadow-sm transition hover:border-[#9ec5c8]">
            <ArrowRight className="size-4" />
            العودة للعبة
          </Link>
          <p className="text-xs font-bold tracking-[0.16em] text-[#648087]">WEATHER · OPEN-METEO</p>
        </header>

        <section className="relative mt-5 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0d5963] via-[#147c82] to-[#55a9a0] p-5 text-white shadow-[0_24px_70px_-38px_rgba(13,89,99,.75)] sm:p-8">
          <div className="pointer-events-none absolute -left-12 -top-20 size-64 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -left-2 -top-10 size-44 rounded-full border border-white/10" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/75">
                <MapPin className="size-4" />
                <span>{location.name}{location.admin1 ? `، ${location.admin1}` : ""}{location.country ? `، ${location.country}` : ""}</span>
                {updatedAt ? <span className="text-white/50">· تحديث {formatClock(updatedAt.toISOString())}</span> : null}
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
                {currentDescription ? <WeatherIcon kind={currentDescription.icon} className="size-20 text-[#ffe49b] drop-shadow sm:size-28" /> : <Sun className="size-20 text-[#ffe49b] sm:size-28" />}
                <div>
                  <p className="text-7xl font-extrabold leading-none tracking-tight tabular-nums sm:text-8xl">
                    {forecast ? Math.round(forecast.current.temperature_2m) : "—"}<span className="text-4xl align-top">°</span>
                  </p>
                  <p className="mt-3 text-lg font-bold text-white/90">{currentDescription?.label ?? (busy ? "بنجيب حالة الجو…" : "الطقس الآن")}</p>
                  {forecast ? <p className="mt-1 text-sm text-white/70">المحسوسة {Math.round(forecast.current.apparent_temperature)}°</p> : null}
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-64">
              <form onSubmit={submitSearch} className="flex rounded-2xl bg-white/95 p-1.5 text-[#17343a] shadow-lg">
                <label htmlFor="weather-city" className="sr-only">ابحث عن مدينة</label>
                <input
                  id="weather-city"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث عن مدينة…"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[#8ba0a3]"
                />
                <button type="submit" disabled={searching || !query.trim()} aria-label="بحث" className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f3f1] text-[#126a70] disabled:opacity-50">
                  {searching ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}
                </button>
              </form>
              <button type="button" onClick={useMyLocation} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-60">
                <LocateFixed className="size-4" />
                استخدم موقعي
              </button>
            </div>
          </div>
          {results.length ? (
            <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
              {results.map((item, index) => (
                <button key={`${item.id ?? item.name}-${index}`} type="button" onClick={() => { setResults([]); setQuery(""); void loadForecast(item); }} className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-right transition hover:bg-white/20">
                  <span><span className="block font-bold">{item.name}</span><span className="text-xs text-white/70">{[item.admin1, item.country].filter(Boolean).join("، ")}</span></span>
                  <ArrowLeft className="size-4 shrink-0" />
                </button>
              ))}
            </div>
          ) : null}
          {error ? <div role="alert" className="relative mt-4 flex items-start gap-2 rounded-xl border border-white/20 bg-[#4b2930]/35 p-3 text-sm"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
        </section>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.65fr_1fr]">
          <section className="rounded-3xl border border-[#e1e9ea] bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-bold text-[#739096]">نظرة قريبة</p><h2 className="mt-1 text-xl font-extrabold">الساعات القادمة</h2></div>
              <button type="button" onClick={() => void loadForecast(location)} disabled={busy} aria-label="تحديث الطقس" className="grid size-10 place-items-center rounded-xl bg-[#edf6f5] text-[#147c82] hover:bg-[#dff0ed] disabled:opacity-50"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /></button>
            </div>
            {forecast ? (
              <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {hourly.map((hour, index) => {
                  const weather = describeWeather(hour.code);
                  return <div key={`${hour.time}-${index}`} className={`flex min-w-0 flex-col items-center gap-2 rounded-2xl px-1 py-3 text-center ${index === 0 ? "bg-[#eaf5f3]" : "bg-[#f7f9f9]"}`}>
                    <span className="text-xs font-bold text-[#6e858a]">{index === 0 ? "الآن" : formatHour(hour.time)}</span>
                    <WeatherIcon kind={weather.icon} className="size-6 text-[#27878a]" />
                    <span className="text-lg font-extrabold tabular-nums">{Math.round(hour.temperature)}°</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-[#548a9a]"><Droplets className="size-3" />{hour.probability}%</span>
                  </div>;
                })}
              </div>
            ) : <LoadingRows busy={busy} />}
          </section>

          <section className="rounded-3xl border border-[#e1e9ea] bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-bold text-[#739096]">تفاصيل الجو</p>
            <h2 className="mt-1 text-xl font-extrabold">مؤشرات اليوم</h2>
            {forecast ? <div className="mt-4 grid grid-cols-2 gap-2">
              <Metric icon={<Droplets />} label="الرطوبة" value={`${forecast.current.relative_humidity_2m}%`} />
              <Metric icon={<Wind />} label="سرعة الرياح" value={`${Math.round(forecast.current.wind_speed_10m)} كم/س`} />
              <Metric icon={<CloudRain />} label="الأمطار الآن" value={`${forecast.current.precipitation} مم`} />
              <Metric icon={<Compass />} label="اتجاه الرياح" value="متغير" />
              <Metric icon={<Sunrise />} label="الشروق" value={forecast.daily.sunrise[0] ? formatClock(forecast.daily.sunrise[0]) : "—"} />
              <Metric icon={<Sunset />} label="الغروب" value={forecast.daily.sunset[0] ? formatClock(forecast.daily.sunset[0]) : "—"} />
            </div> : <LoadingRows busy={busy} />}
          </section>
        </div>

        <section className="mt-4 rounded-3xl border border-[#e1e9ea] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-xs font-bold text-[#739096]">خطّط ليومك</p><h2 className="mt-1 text-xl font-extrabold">توقعات ٥ أيام</h2></div>
            {forecast ? <span className="text-xs text-[#7b9296]">درجات الحرارة المئوية</span> : null}
          </div>
          {forecast ? <div className="mt-4 divide-y divide-[#edf1f1]">
            {forecast.daily.time.map((day, index) => {
              const weather = describeWeather(forecast.daily.weather_code[index]);
              return <div key={day} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 first:pt-1 last:pb-1">
                <div className="flex items-center gap-3"><span className="w-12 font-extrabold">{index === 0 ? "اليوم" : formatDay(day)}</span><WeatherIcon kind={weather.icon} className="size-6 text-[#32888a]" /><span className="hidden text-sm text-[#789095] sm:inline">{weather.label}</span></div>
                <span className="text-xs text-[#789095]">{index === 0 && forecast.current.is_day ? "نهارًا" : ""}</span>
                <div className="flex items-center justify-end gap-3 text-sm tabular-nums"><span className="font-extrabold">{Math.round(forecast.daily.temperature_2m_max[index])}°</span><span className="text-[#8da0a4]">{Math.round(forecast.daily.temperature_2m_min[index])}°</span><ArrowDown className="size-3 text-[#a2b3b5]" /></div>
              </div>;
            })}
          </div> : <LoadingRows busy={busy} />}
        </section>
        <footer className="px-2 py-5 text-center text-xs leading-relaxed text-[#83989c]">بيانات التوقعات من Open-Meteo · تُحدّث عند فتح الصفحة أو الضغط على زر التحديث.</footer>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl bg-[#f7f9f9] p-3">
    <div className="flex items-center gap-2 text-xs font-bold text-[#789095]">{icon && <span className="text-[#258187] [&>svg]:size-4">{icon}</span>}{label}</div>
    <p className="mt-2 text-lg font-extrabold tabular-nums">{value}</p>
  </div>;
}

function LoadingRows({ busy }: { busy: boolean }) {
  return <div className="mt-5 flex min-h-28 flex-col items-center justify-center gap-2 text-sm text-[#789095]">
    {busy ? <><RefreshCw className="size-5 animate-spin text-[#258187]" /><span>جارٍ تحميل بيانات الطقس…</span></> : <><Thermometer className="size-5" /><span>لا توجد بيانات لعرضها</span></>}
  </div>;
}

function WeatherIcon({ kind, className }: { kind: string; className?: string }) {
  const props = { className, strokeWidth: 1.7, "aria-hidden": true as const };
  if (kind === "sun") return <Sun {...props} />;
  if (kind === "sun-cloud") return <CloudSun {...props} />;
  if (kind === "fog") return <CloudFog {...props} />;
  if (kind === "rain") return <CloudRain {...props} />;
  if (kind === "storm") return <Zap {...props} />;
  if (kind === "snow") return <CloudFog {...props} />;
  return <Cloud {...props} />;
}
