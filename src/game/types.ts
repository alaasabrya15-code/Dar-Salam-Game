export type VehicleId = "malaky" | "taxi" | "micro" | "tuktuk" | "truck";
export type Mode = "shift" | "cruise" | "rush";
export type Phase = "menu" | "play" | "pause" | "summary";
export type UpgradeId = "motor" | "fuel" | "seats" | "tires";
export type Upgrades = Record<UpgradeId, number>;

export type VehicleSpec = {
  id: VehicleId;
  name: string;
  blurb: string;
  max: number;
  accel: number;
  brake: number;
  turn: number;
  width: number;
  length: number;
  seats: number;
  fare: number;
  freight: number;
  speed: number;
  grip: number;
  haul: number;
};

export const VEHICLES: VehicleSpec[] = [
  {
    id: "malaky",
    name: "ملاكي",
    blurb: "عدّى بسرعة",
    max: 32,
    accel: 15,
    brake: 28,
    turn: 1.55,
    width: 1.8,
    length: 4.4,
    seats: 3,
    fare: 1,
    freight: 0,
    speed: 4,
    grip: 4,
    haul: 2,
  },
  {
    id: "taxi",
    name: "تاكسي",
    blurb: "واقف على الخط",
    max: 30,
    accel: 14,
    brake: 26,
    turn: 1.5,
    width: 1.8,
    length: 4.5,
    seats: 3,
    fare: 1.3,
    freight: 0,
    speed: 4,
    grip: 3,
    haul: 3,
  },
  {
    id: "micro",
    name: "ميكروباص",
    blurb: "بيقف فجأة",
    max: 24,
    accel: 11,
    brake: 18,
    turn: 1.15,
    width: 2.1,
    length: 5.1,
    seats: 11,
    fare: 1,
    freight: 0,
    speed: 3,
    grip: 2,
    haul: 5,
  },
  {
    id: "tuktuk",
    name: "توكتوك",
    blurb: "بتاع الشارع",
    max: 17,
    accel: 15,
    brake: 26,
    turn: 2.65,
    width: 1.35,
    length: 2.55,
    seats: 2,
    fare: 0.9,
    freight: 0,
    speed: 2,
    grip: 5.4,
    haul: 1,
  },
  {
    id: "truck",
    name: "نقل",
    blurb: "خد بالك منه",
    max: 20,
    accel: 7,
    brake: 12,
    turn: 0.85,
    width: 2.45,
    length: 8.4,
    seats: 0,
    fare: 0,
    freight: 0,
    speed: 2,
    grip: 1,
    haul: 5,
  },
];

export const PAINTS = [
  { id: "yellow", hex: "#f0b429", name: "أصفر", price: 0 },
  { id: "nile", hex: "#1aa6a6", name: "زيتي", price: 40 },
  { id: "brick", hex: "#d4654a", name: "أحمر", price: 40 },
  { id: "white", hex: "#f4f1ea", name: "أبيض", price: 50 },
  { id: "soot", hex: "#2a3340", name: "فحمي", price: 45 },
  { id: "green", hex: "#3d7a48", name: "أخضر", price: 55 },
] as const;

export const SLOGANS = [
  { id: "dar", text: "دار السلام", price: 0 },
  { id: "tawakkal", text: "توكلنا على الله", price: 35 },
  { id: "farag", text: "الفرج قريب", price: 35 },
  { id: "allah", text: "خليها على الله", price: 40 },
  { id: "mesh", text: "مش هتفرق", price: 30 },
  { id: "setr", text: "يا رب سترك", price: 45 },
] as const;

export const STICKERS = [
  { id: "none", name: "من غير", price: 0 },
  { id: "heart", name: "قلب", price: 25 },
  { id: "star", name: "نجمة", price: 25 },
  { id: "eye", name: "عين", price: 30 },
  { id: "palm", name: "نخلة", price: 30 },
] as const;

export const ACCESSORIES = [
  { id: "flag", name: "علم", blurb: "على الضهر", price: 55 },
  { id: "neon", name: "نيون", blurb: "شريط على السقف", price: 70 },
  { id: "lamp", name: "كشاف", blurb: "نور زيادة", price: 60 },
  { id: "beads", name: "سبحة", blurb: "متدلية من الضهر", price: 40 },
] as const;

export type SloganId = (typeof SLOGANS)[number]["id"];
export type StickerId = (typeof STICKERS)[number]["id"];
export type AccessoryId = (typeof ACCESSORIES)[number]["id"];
export type CosmeticSlot = "paint" | "slogan" | "sticker" | "accessory";

export type Workshop = {
  paint: string;
  slogan: SloganId;
  sticker: StickerId;
  accessories: AccessoryId[];
  ownedPaints: string[];
  ownedSlogans: SloganId[];
  ownedStickers: StickerId[];
  ownedAccessories: AccessoryId[];
};

export const MODES: { id: Mode; name: string; blurb: string }[] = [
  { id: "shift", name: "وردية", blurb: "سدّد إيجار اليوم" },
  { id: "rush", name: "توصيلات", blurb: "أربع مشاوير على الساعة" },
  { id: "cruise", name: "فضاوة", blurb: "لف في الحتة" },
];

export const DENSITIES = [
  { id: 0, name: "سالكة" },
  { id: 1, name: "زحمة" },
  { id: 2, name: "واقفة" },
] as const;

export const UPGRADES: {
  id: UpgradeId;
  name: string;
  blurb: string;
  max: number;
  costs: number[];
}[] = [
  { id: "motor", name: "موتور", blurb: "يمشي أسرع", max: 3, costs: [80, 160, 280] },
  { id: "fuel", name: "بنزين أوفر", blurb: "التانك يطول", max: 3, costs: [70, 140, 240] },
  { id: "seats", name: "فرش", blurb: "الأجرة أعلى", max: 3, costs: [90, 180, 300] },
  { id: "tires", name: "كاوتش", blurb: "يلف في الزحمة", max: 3, costs: [60, 130, 220] },
];

export const EMPTY_UPGRADES: Upgrades = { motor: 0, fuel: 0, seats: 0, tires: 0 };

export const RENT = 160;
export const SHIFT_SECONDS = 180;
export const GAS_COST = 22;
export const JOBS_NEED = 4;

export type Pax = { dest: number };

export type Hud = {
  phase: Phase;
  speed: number;
  money: number;
  km: number;
  time: number;
  crashes: number;
  passengers: { dest: string }[];
  seats: number;
  stopName: string;
  stopDist: number;
  legCue: string;
  hint: string;
  mode: Mode;
  vehicleName: string;
  message: string;
  alert: null | "radar" | "crash" | "cash" | "fuel";
  fuel: number;
  rent: number;
  shiftLeft: number;
  wallet: number;
  upgrades: Upgrades;
  lowFuel: boolean;
  jobsDone: number;
  jobsNeed: number;
  jobName: string;
  bestMoney: number;
  bestKm: number;
  bestTrial: number | null;
  night: boolean;
  sound: boolean;
  progress: number;
  workshop: Workshop;
};

export type PreviewCfg = {
  mode: Mode;
  vehicle: VehicleId;
  night: boolean;
  density: number;
  paint: string;
  sound: boolean;
};

export const ROUTE: { name: string; cue: string }[] = [
  { name: "مدرسة المعمارية", cue: "البداية قدام المدرسة" },
  { name: "شارع أبو طالب", cue: "ادخل شارع أبو طالب" },
  { name: "شارع الجمهورية", cue: "كمّل على شارع الجمهورية" },
  { name: "شارع الجمعية", cue: "شارع الجمعية" },
  { name: "شارع الأكحل", cue: "شارع الأكحل" },
  { name: "السنترال", cue: "عدّي السنترال" },
  { name: "مجمع المدارس", cue: "مجمع المدارس" },
  { name: "شارع مخيمر", cue: "شارع مخيمر" },
  { name: "شارع أبو أشرف", cue: "شارع أبو أشرف" },
  { name: "كشري أبو حنفي", cue: "عدّي كشري أبو حنفي" },
  { name: "عبد الهادي", cue: "عبد الهادي" },
  { name: "التوحيد والنور", cue: "قدام التوحيد والنور" },
  { name: "الملف", cue: "عدّي الملف" },
  { name: "شارع صالح عابدين", cue: "شارع صالح عابدين" },
  { name: "شارع المشير", cue: "شارع المشير" },
  { name: "مزرعة البط", cue: "عدّي مزرعة البط" },
  { name: "شارع فرج يوسف", cue: "شارع فرج يوسف" },
  { name: "فايدة كامل", cue: "فايدة كامل" },
  { name: "شارع الحرية", cue: "شارع الحرية" },
  { name: "السد العالي", cue: "السد العالي" },
  { name: "حسنين دسوقي", cue: "كمّل حسنين دسوقي لحد سور المترو" },
  { name: "سور المترو · شارع ٩", cue: "سور المترو على شمالك، ماشي على شارع ٩" },
  { name: "مترو دار السلام", cue: "المحطة والمترو يفضلوا على شمالك" },
  { name: "كوبري المترو", cue: "كوبري قدامك معدّي فوق المترو، والسور على شمالك" },
  { name: "يمين عند الكوبري", cue: "واحد يمين، والكوبري يفضل على شمالك" },
  { name: "محطة أبو طالب", cue: "كده طلعت على محطة أبو طالب" },
];

export const STOP_NAMES = ROUTE.map((leg) => leg.name);

export function vehicleById(id: VehicleId) {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[3];
}
