import { useEffect, useRef, useState, type PointerEvent as ReactPointer, type RefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Fuel,
  Gauge,
  MapPin,
  Megaphone,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import {
  ACCESSORIES,
  JOBS_NEED,
  MODES,
  PAINTS,
  ROUTE,
  SLOGANS,
  STICKERS,
  UPGRADES,
  type CosmeticSlot,
  type Hud,
  type PreviewCfg,
  type UpgradeId,
} from "@/game/types";
import type { GameHandle } from "@/game/engine";

const INITIAL: PreviewCfg = {
  mode: "shift",
  vehicle: "tuktuk",
  night: false,
  density: 1,
  paint: "#f0b429",
  sound: true,
};

const ACCESSORY_ART: Record<string, string> = {
  flag: "/ui/flag.jpg",
  neon: "/ui/neon.jpg",
  lamp: "/ui/lamp.jpg",
  beads: "/ui/beads.jpg",
};

const UPGRADE_ART: Record<string, string> = {
  motor: "/ui/motor.jpg",
  fuel: "/ui/fuel.jpg",
  seats: "/ui/seats.jpg",
  tires: "/ui/tires.jpg",
};

function formatTime(t: number) {
  const m = Math.floor(Math.max(0, t) / 60);
  const s = Math.floor(Math.max(0, t) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function DarSalam() {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const holds = useRef({ l: false, r: false, g: false, b: false });
  const [ready, setReady] = useState(false);
  const [boot, setBoot] = useState(6);
  const [cfg, setCfg] = useState<PreviewCfg>(INITIAL);
  const [snap, setSnap] = useState<Hud | null>(null);
  const [shop, setShop] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);

  useEffect(() => {
    const canvas = viewRef.current;
    const map = mapRef.current;
    if (!canvas || !map) return;
    let dead = false;
    let handle: GameHandle | null = null;
    void import("@/game/engine").then(({ mountGame }) => {
      if (dead) return;
      handle = mountGame(canvas, map, setSnap);
      gameRef.current = handle;
      const heard = handle.getHud();
      setCfg((c) => ({ ...c, sound: heard.sound, paint: heard.workshop.paint }));
      const started = Date.now();
      const waitStreet = () => {
        if (dead) return;
        const street = (window as unknown as { __streetReady?: boolean }).__streetReady;
        if (street || Date.now() - started > 20000) setReady(true);
        else window.setTimeout(waitStreet, 200);
      };
      waitStreet();
    });
    return () => {
      dead = true;
      handle?.dispose();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) {
      setBoot(100);
      return;
    }
    const id = window.setInterval(() => {
      setBoot((n) => (n >= 90 ? 90 : n + 4 + Math.random() * 8));
    }, 160);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    gameRef.current?.setPreview(cfg);
  }, [cfg]);

  const phase = snap?.phase ?? "menu";

  const syncTouch = () => {
    const h = holds.current;
    const steer = (h.l ? 1 : 0) + (h.r ? -1 : 0);
    gameRef.current?.setTouch({
      steer,
      throttle: h.g ? 1 : 0,
      brake: h.b ? 1 : 0,
    });
  };

  const hold = (key: "l" | "r" | "g" | "b") => ({
    onPointerDown: (e: ReactPointer<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      holds.current[key] = true;
      syncTouch();
    },
    onPointerUp: () => {
      holds.current[key] = false;
      syncTouch();
    },
    onPointerCancel: () => {
      holds.current[key] = false;
      syncTouch();
    },
    onLostPointerCapture: () => {
      holds.current[key] = false;
      syncTouch();
    },
  });

  const patch = (partial: Partial<PreviewCfg>) => setCfg((c) => ({ ...c, ...partial }));
  const startLabel =
    cfg.mode === "rush" ? "ابدأ التوصيلات" : cfg.mode === "cruise" ? "انزل الشارع" : "ابدأ الوردية";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-asphalt font-sans text-ink touch-none select-none">
      <canvas ref={viewRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={mapRef}
        width={180}
        height={180}
        className={
          phase === "play" || phase === "pause"
            ? "absolute top-2 left-1/2 z-20 h-14 w-14 -translate-x-1/2 rounded-full border border-line md:top-4 md:h-24 md:w-24"
            : "pointer-events-none absolute h-px w-px opacity-0"
        }
      />

      {snap?.alert === "radar" ? <div className="pointer-events-none absolute inset-0 z-10 bg-brick/25" /> : null}
      {snap?.alert === "crash" ? <div className="pointer-events-none absolute inset-0 z-10 bg-brick/35" /> : null}
      {snap?.lowFuel && phase === "play" ? (
        <div className="pointer-events-none absolute inset-0 z-10 bg-brick/15" />
      ) : null}

      {phase === "menu" ? (
        <div
          className={
            shop
              ? "absolute inset-2 z-20 flex sm:inset-8 sm:items-center sm:justify-center"
              : "pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-3 sm:p-5"
          }
        >
          <section
            className={
              shop
                ? "flex h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-xl sm:h-auto sm:max-h-full"
                : "pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-line bg-panel/90 shadow-xl"
            }
          >
            {shop && snap ? (
              <Workshop
                snap={snap}
                onBack={() => setShop(false)}
                onBuy={(slot, id) => {
                  const ok = gameRef.current?.buyCosmetic(slot, id) ?? false;
                  if (ok && slot === "paint") patch({ paint: id });
                }}
                onUpgrade={(id) => gameRef.current?.buy(id)}
              />
            ) : (
              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-amber">ورشة الحي</p>
                    <h1 className="text-2xl font-extrabold leading-none sm:text-3xl">توكتوك دار السلام</h1>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      من قدام مدرسة المعمارية لحد محطة أبو طالب
                    </p>
                  </div>
                  <div className="shrink-0 rounded-md border-2 border-amber bg-asphalt px-2.5 py-1 text-center" aria-label="لوحة رقم ١">
                    <p className="text-xs font-extrabold leading-none text-amber">دار السلام</p>
                    <p className="mt-0.5 text-2xl font-extrabold leading-none">١</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => patch({ mode: m.id })}
                      className={
                        cfg.mode === m.id
                          ? "rounded-xl bg-amber px-2 py-3 text-amber-ink"
                          : "rounded-xl bg-panel-2 px-2 py-3 text-ink"
                      }
                    >
                      <span className="block text-sm font-extrabold">{m.name}</span>
                      <span
                        className={
                          cfg.mode === m.id
                            ? "mt-1 block text-xs leading-snug opacity-80"
                            : "mt-1 block text-xs leading-snug text-muted"
                        }
                      >
                        {m.blurb}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShop(true)}
                    className="flex-1 rounded-xl bg-amber px-3 py-3 text-right text-amber-ink"
                  >
                    <span className="block text-base font-extrabold">الورشة</span>
                    <span className="mt-0.5 block text-xs font-bold opacity-80">ألوان · إكسسوارات · جمل · فرش وكاوتش</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ sound: !cfg.sound })}
                    className="rounded-xl bg-panel-2 p-3"
                    aria-label={cfg.sound ? "كتم الصوت" : "تشغيل الصوت"}
                  >
                    {cfg.sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setRouteOpen((open) => !open)}
                  className="mt-3 w-full rounded-xl bg-panel-2 px-3 py-2 text-right"
                >
                  <span className="text-sm font-extrabold">{routeOpen ? "إخفاء المسار" : "المسار"}</span>
                  <span className="mt-0.5 block text-xs text-muted">٢٦ نزلة، آخرها يمين والكوبري على شمالك</span>
                </button>
                {routeOpen ? (
                  <ol className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {ROUTE.map((leg, i) => (
                      <li key={leg.name} className="flex gap-2 text-xs leading-snug">
                        <span className="w-5 shrink-0 font-extrabold text-amber tabular-nums" dir="ltr">
                          {i + 1}
                        </span>
                        <span>
                          <span className="font-extrabold">{leg.name}</span>
                          <span className="text-muted"> — {leg.cue}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {snap && (snap.bestMoney > 0 || snap.bestKm > 0 || snap.bestTrial != null) ? (
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    أحسن وردية {snap.bestMoney} ج · أطول لفة {snap.bestKm} كم
                    {snap.bestTrial != null ? ` · أسرع توصيلات ${formatTime(snap.bestTrial)}` : ""}
                  </p>
                ) : null}
              </div>
            )}
            <div className={shop ? "border-t border-line p-3" : "px-4 pb-4"}>
              {ready ? (
                <button
                  type="button"
                  onClick={() => gameRef.current?.start(cfg)}
                  className="w-full rounded-xl bg-amber py-3 text-lg font-extrabold text-amber-ink"
                >
                  {startLabel}
                </button>
              ) : (
                <div>
                  <p className="text-center text-base font-extrabold">لحظة، بنجهّز التوكتوك</p>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-amber transition-[width] duration-150"
                      style={{ width: `${boot}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {phase !== "menu" && snap ? (
        <PlayHud snap={snap} hold={hold} game={gameRef} onAgain={() => gameRef.current?.start(cfg)} />
      ) : null}
    </main>
  );
}

function Workshop({
  snap,
  onBack,
  onBuy,
  onUpgrade,
}: {
  snap: Hud;
  onBack: () => void;
  onBuy: (slot: CosmeticSlot, id: string) => void;
  onUpgrade: (id: UpgradeId) => void;
}) {
  const shop = snap.workshop;
  const wallet = snap.wallet;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative h-28 shrink-0 sm:h-36">
        <img src="/ui/garage.jpg" alt="ورشة التوكتوك" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-asphalt/55" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div>
            <button type="button" onClick={onBack} className="text-sm font-extrabold text-amber">
              رجوع
            </button>
            <p className="text-xl font-extrabold leading-tight">الورشة</p>
          </div>
          <p className="flex items-center gap-1 rounded-full bg-asphalt/80 px-3 py-1 text-sm font-extrabold text-amber">
            <Wallet className="size-4" />
            <span dir="ltr">{wallet}</span>
            <span className="text-xs font-bold text-muted">ج</span>
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <p className="text-xs font-bold text-muted">ألوان</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PAINTS.map((paint) => {
            const owned = shop.ownedPaints.includes(paint.hex);
            const on = shop.paint === paint.hex;
            const afford = wallet >= paint.price;
            return (
              <button
                key={paint.id}
                type="button"
                disabled={!owned && !afford}
                onClick={() => onBuy("paint", paint.hex)}
                className={
                  on
                    ? "flex items-center gap-2 rounded-full border-2 border-amber bg-panel-2 py-1 pr-1 pl-3 disabled:opacity-45"
                    : "flex items-center gap-2 rounded-full border-2 border-line bg-panel-2 py-1 pr-1 pl-3 disabled:opacity-45"
                }
              >
                <span className="text-xs font-extrabold">{paint.name}</span>
                <span className="text-xs text-muted">{owned ? (on ? "مركّب" : "ركّب") : `${paint.price} ج`}</span>
                <span className="size-8 rounded-full border border-line" style={{ background: paint.hex }} />
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs font-bold text-muted">إكسسوارات</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {ACCESSORIES.map((item) => {
            const owned = shop.ownedAccessories.includes(item.id);
            const on = shop.accessories.includes(item.id);
            const afford = wallet >= item.price;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!owned && !afford}
                onClick={() => onBuy("accessory", item.id)}
                className={
                  on
                    ? "overflow-hidden rounded-xl border-2 border-amber bg-panel-2 text-right disabled:opacity-45"
                    : "overflow-hidden rounded-xl border-2 border-line bg-panel-2 text-right disabled:opacity-45"
                }
              >
                <img src={ACCESSORY_ART[item.id]} alt={item.name} className="h-20 w-full object-cover" />
                <span className="flex items-center justify-between gap-2 px-2 py-2">
                  <span className="text-sm font-extrabold">{item.name}</span>
                  <span className="text-xs font-bold text-amber">{owned ? (on ? "فك" : "ركّب") : `${item.price} ج`}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs font-bold text-muted">جمل على الضهر</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SLOGANS.map((item) => {
            const owned = shop.ownedSlogans.includes(item.id);
            const on = shop.slogan === item.id;
            const afford = wallet >= item.price;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!owned && !afford}
                onClick={() => onBuy("slogan", item.id)}
                className={
                  on
                    ? "rounded-full border border-amber bg-asphalt px-3 py-2 text-xs font-extrabold text-amber disabled:opacity-45"
                    : "rounded-full border border-line bg-panel-2 px-3 py-2 text-xs font-extrabold disabled:opacity-45"
                }
              >
                {item.text}
                {owned ? "" : <span className="mr-1 text-xs text-muted"> · {item.price} ج</span>}
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs font-bold text-muted">استيكرات</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STICKERS.map((item) => {
            const owned = shop.ownedStickers.includes(item.id);
            const on = shop.sticker === item.id;
            const afford = wallet >= item.price;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!owned && !afford}
                onClick={() => onBuy("sticker", item.id)}
                className={
                  on
                    ? "rounded-full border border-amber bg-asphalt px-3 py-2 text-xs font-extrabold text-amber disabled:opacity-45"
                    : "rounded-full border border-line bg-panel-2 px-3 py-2 text-xs font-extrabold disabled:opacity-45"
                }
              >
                {item.name}
                {owned ? "" : <span className="mr-1 text-xs text-muted"> · {item.price} ج</span>}
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs font-bold text-muted">تطوير</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {UPGRADES.map((u) => {
            const lvl = snap.upgrades[u.id] ?? 0;
            const maxed = lvl >= u.max;
            const cost = u.costs[lvl] ?? 0;
            const afford = wallet >= cost;
            return (
              <button
                key={u.id}
                type="button"
                disabled={maxed || !afford}
                onClick={() => onUpgrade(u.id)}
                className="overflow-hidden rounded-xl border border-line bg-panel-2 text-right disabled:opacity-45"
              >
                <img src={UPGRADE_ART[u.id]} alt={u.name} className="h-20 w-full object-cover" />
                <span className="block px-2 py-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold">{u.name}</span>
                    <span className="text-xs font-bold text-amber">{maxed ? "كامل" : `${cost} ج`}</span>
                  </span>
                  <span className="mt-2 flex gap-1">
                    {Array.from({ length: u.max }, (_, i) => (
                      <span
                        key={i}
                        className={i < lvl ? "h-1.5 flex-1 rounded-full bg-amber" : "h-1.5 flex-1 rounded-full bg-line"}
                      />
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {wallet <= 0 ? <p className="mt-3 text-xs text-muted">العب وردية عشان تجمع جنيه وتشتري من الورشة.</p> : null}
      </div>
    </div>
  );
}

function PlayHud({
  snap,
  hold,
  game,
  onAgain,
}: {
  snap: Hud;
  hold: (key: "l" | "r" | "g" | "b") => {
    onPointerDown: (e: ReactPointer<HTMLButtonElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onLostPointerCapture: () => void;
  };
  game: RefObject<GameHandle | null>;
  onAgain: () => void;
}) {
  const shift = snap.mode === "shift";
  const rush = snap.mode === "rush";
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto w-32 rounded-2xl border border-line bg-panel/90 px-3 py-2 sm:w-40">
          <div className="flex items-center gap-1 text-xs text-muted">
            <Gauge className="size-3.5 text-amber" />
            كم/س
          </div>
          <p dir="ltr" className="text-3xl font-extrabold leading-none tabular-nums">
            {snap.speed}
          </p>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted">
            <Fuel className={snap.lowFuel ? "size-3.5 text-brick" : "size-3.5 text-amber"} />
            بنزين
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className={snap.lowFuel ? "h-full bg-brick" : "h-full bg-nile"}
              style={{ width: `${Math.max(0, Math.min(100, snap.fuel))}%` }}
            />
          </div>
          {shift ? (
            <>
              <p className="mt-2 text-lg font-extrabold tabular-nums" dir="ltr">
                {snap.money} <span className="text-xs font-bold text-muted">ج</span>
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-amber"
                  style={{ width: `${Math.min(100, (snap.money / snap.rent) * 100)}%` }}
                />
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                <Timer className="size-3.5 text-amber" />
                <span dir="ltr">{formatTime(snap.shiftLeft)}</span>
                <span>· إيجار {snap.rent}</span>
              </p>
            </>
          ) : rush ? (
            <>
              <p className="mt-2 text-lg font-extrabold tabular-nums" dir="ltr">
                {snap.jobsDone}/{snap.jobsNeed || JOBS_NEED}
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm font-extrabold tabular-nums" dir="ltr">
                <Timer className="size-3.5 text-amber" />
                {formatTime(snap.time)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-extrabold tabular-nums" dir="ltr">
                {snap.money} <span className="text-xs font-bold text-muted">ج</span>
              </p>
              <p className="mt-1 text-xs text-muted">{snap.km} كم</p>
            </>
          )}
          {snap.seats > 0 && !rush ? (
            <p className="mt-1 truncate text-xs text-muted">
              ركاب {snap.passengers.length}/{snap.seats}
              {snap.passengers[0] ? ` · ${snap.passengers[0].dest}` : ""}
            </p>
          ) : null}
        </div>

        <div className="pointer-events-auto w-32 rounded-2xl border border-line bg-panel/90 px-3 py-2 sm:w-40">
          <div className="flex items-center gap-1 text-xs text-muted">
            <MapPin className="size-3.5 text-nile" />
            {rush ? "التوصيلة" : "النزلة"}
          </div>
          <p className="text-sm font-extrabold leading-snug">{rush ? snap.jobName : snap.stopName}</p>
          <p dir="ltr" className="text-sm font-bold text-amber tabular-nums">
            {snap.stopDist} m
          </p>
          {snap.legCue ? <p className="mt-1 text-xs leading-snug text-ink">{snap.legCue}</p> : null}
          {snap.hint ? <p className="mt-1 text-xs font-bold text-amber">{snap.hint}</p> : null}
        </div>
      </div>

      {snap.message ? (
        <p className="pointer-events-none absolute bottom-52 left-1/2 z-20 w-max max-w-[90%] -translate-x-1/2 rounded-full bg-asphalt/80 px-4 py-2 text-center text-sm font-bold md:bottom-24">
          {snap.message}
        </p>
      ) : null}

      <div className="absolute bottom-36 left-1/2 z-30 flex -translate-x-1/2 gap-2 md:bottom-6">
        <button
          type="button"
          className="rounded-full bg-panel/90 p-3"
          aria-label="إيقاف"
          onClick={() => (snap.phase === "pause" ? game.current?.resume() : game.current?.pause())}
        >
          {snap.phase === "pause" ? <Play className="size-5" /> : <Pause className="size-5" />}
        </button>
        <button
          type="button"
          className="rounded-full bg-panel/90 p-3"
          aria-label="كلاكس"
          onClick={() => game.current?.horn()}
        >
          <Megaphone className="size-5" />
        </button>
        <button
          type="button"
          className="rounded-full bg-panel/90 px-3 py-2 text-xs font-bold"
          onClick={() => game.current?.cycleCam()}
        >
          كاميرا
        </button>
      </div>

      <div dir="ltr" className="absolute inset-x-0 bottom-4 z-30 flex items-end justify-between px-3 md:hidden">
        <div className="flex gap-2">
          <button type="button" className="h-16 w-16 touch-none rounded-2xl bg-panel/90 text-ink" aria-label="يسار" {...hold("l")}>
            <ChevronLeft className="mx-auto size-8" />
          </button>
          <button type="button" className="h-16 w-16 touch-none rounded-2xl bg-panel/90 text-ink" aria-label="يمين" {...hold("r")}>
            <ChevronRight className="mx-auto size-8" />
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" className="h-16 w-20 touch-none rounded-2xl bg-panel-2 text-sm font-extrabold" {...hold("b")}>
            فرامل
          </button>
          <button
            type="button"
            className="h-16 w-20 touch-none rounded-2xl bg-amber text-sm font-extrabold text-amber-ink"
            {...hold("g")}
          >
            بنزين
          </button>
        </div>
      </div>

      {snap.phase === "pause" || snap.phase === "summary" ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-asphalt/75 p-4">
          <section className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 text-center">
            <h2 className="text-2xl font-extrabold text-amber">
              {snap.phase === "pause" ? "وقفة" : rush ? "التوصيلات" : shift ? "خلصت الوردية" : "خلصت اللفة"}
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-muted">{rush ? "المشاوير" : "المكسب"}</span>
                <span className="font-extrabold">
                  {rush ? `${snap.jobsDone}/${snap.jobsNeed}` : `${snap.money} ج`}
                </span>
              </li>
              {shift ? (
                <li className="flex justify-between">
                  <span className="text-muted">الإيجار</span>
                  <span className="font-extrabold">{snap.rent} ج</span>
                </li>
              ) : null}
              <li className="flex justify-between">
                <span className="text-muted">المحفظة</span>
                <span className="font-extrabold">{snap.wallet} ج</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted">المسافة</span>
                <span className="font-extrabold">{snap.km} كم</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted">الوقت</span>
                <span className="font-extrabold" dir="ltr">
                  {formatTime(snap.time)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted">الخبطات</span>
                <span className="font-extrabold">{snap.crashes}</span>
              </li>
            </ul>
            {snap.message ? <p className="mt-3 text-sm font-bold text-amber">{snap.message}</p> : null}
            <div className="mt-5 flex gap-2">
              {snap.phase === "pause" ? (
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber py-3 font-extrabold text-amber-ink"
                  onClick={() => game.current?.resume()}
                >
                  <Play className="size-4" />
                  كمّل
                </button>
              ) : (
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber py-3 font-extrabold text-amber-ink"
                  onClick={onAgain}
                >
                  <RotateCcw className="size-4" />
                  تاني
                </button>
              )}
              {snap.phase === "pause" ? (
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-panel-2 py-3 font-bold"
                  onClick={() => game.current?.finish()}
                >
                  <Flag className="size-4" />
                  خلّص
                </button>
              ) : null}
              <button
                type="button"
                className="flex-1 rounded-xl bg-panel-2 py-3 font-bold"
                onClick={() => game.current?.quit()}
              >
                القائمة
              </button>
            </div>
          </section>
        </div>
      ) : (
        <button
          type="button"
          className="absolute bottom-6 left-4 z-20 hidden rounded-full bg-panel/80 px-4 py-2 text-xs font-bold text-muted md:block"
          onClick={() => game.current?.finish()}
        >
          خلّص المشوار
        </button>
      )}
    </>
  );
}
