import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const endpoint = "https://api.weather.yandex.ru/graphql/query";
const apiKey = process.env.YANDEX_WEATHER_API_KEY;
const outputUrl = new URL("../data/weather.json", import.meta.url);
const outputPath = fileURLToPath(outputUrl);
const targetDates = new Set([
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
  "2026-08-15",
  "2026-08-16",
  "2026-08-17",
]);
const periodNames = ["morning", "day", "evening", "night"];

if (!apiKey) {
  throw new Error("YANDEX_WEATHER_API_KEY is not configured");
}

const query = `
  query RouteWeather($request: PointInput!, $language: Language) {
    weatherByPoint(request: $request, language: $language) {
      forecast {
        days(limit: 14) {
          time
          parts {
            morning { avgTemperature condition icon(format: CODE) precProbability precType }
            day { avgTemperature condition icon(format: CODE) precProbability precType }
            evening { avgTemperature condition icon(format: CODE) precProbability precType }
            night { avgTemperature condition icon(format: CODE) precProbability precType }
          }
        }
      }
    }
  }
`;

const conditionText = {
  CLEAR: "Ясно",
  PARTLY_CLOUDY: "Малооблачно",
  CLOUDY: "Облачно",
  OVERCAST: "Пасмурно",
  LIGHT_RAIN: "Небольшой дождь",
  RAIN: "Дождь",
  HEAVY_RAIN: "Сильный дождь",
  SHOWERS: "Ливень",
  SLEET: "Дождь со снегом",
  LIGHT_SNOW: "Небольшой снег",
  SNOW: "Снег",
  SNOWFALL: "Снегопад",
  HAIL: "Град",
  THUNDERSTORM: "Гроза",
  THUNDERSTORM_WITH_RAIN: "Дождь с грозой",
  THUNDERSTORM_WITH_HAIL: "Гроза с градом",
};

function dateFromForecast(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || "";
}

function normalizeProbability(value) {
  if (!Number.isFinite(Number(value))) return null;
  const probability = Number(value);
  return Math.round(probability <= 1 ? probability * 100 : probability);
}

function normalizePeriod(period) {
  if (!period) return null;
  const precipitationProbability = normalizeProbability(period.precProbability);
  const precipitationType = period.precType || "NO_TYPE";
  const condition = period.condition || "CLOUDY";
  const hasRain = precipitationType === "RAIN" || precipitationType === "SLEET" || condition.includes("RAIN") || condition === "SHOWERS" || condition === "THUNDERSTORM";
  return {
    temperature: Number.isFinite(Number(period.avgTemperature)) ? Math.round(Number(period.avgTemperature)) : null,
    condition,
    conditionText: conditionText[condition] || "Переменная облачность",
    icon: period.icon || null,
    precipitationProbability,
    precipitationType,
    hasRain,
  };
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Yandex-Weather-Key": apiKey,
  },
  body: JSON.stringify({
    query,
    variables: {
      request: { lat: 56.327436, lon: 44.006948 },
      language: "RU",
    },
  }),
});

if (!response.ok) {
  throw new Error(`Yandex Weather request failed with status ${response.status}`);
}

const result = await response.json();
if (result.errors?.length) {
  const details = result.errors
    .map((error) => {
      const path = Array.isArray(error.path) ? ` at ${error.path.join(".")}` : "";
      return `${error.message || "Unknown GraphQL error"}${path}`;
    })
    .join("; ");
  throw new Error(`Yandex Weather returned ${result.errors.length} API error(s): ${details}`);
}

const weather = result.data?.weatherByPoint;
const forecasts = weather?.forecast?.days;
if (!Array.isArray(forecasts)) {
  throw new Error("Yandex Weather response does not contain forecast days");
}

const days = {};
for (const forecast of forecasts) {
  const date = dateFromForecast(forecast.time);
  if (!targetDates.has(date)) continue;
  const normalized = {};
  for (const periodName of periodNames) {
    normalized[periodName] = normalizePeriod(forecast.parts?.[periodName]);
  }
  days[date] = normalized;
}

if (!Object.keys(days).length) {
  try {
    const current = JSON.parse(await readFile(outputPath, "utf8"));
    if (current?.days && Object.keys(current.days).length) {
      console.log("No trip dates are available in the current forecast horizon; keeping the last valid forecast.");
      process.exit(0);
    }
  } catch {
    // The initial placeholder remains valid until the trip enters the forecast horizon.
  }
  console.log("No trip dates are available in the current forecast horizon.");
  process.exit(0);
}

const payload = {
  generatedAt: new Date().toISOString(),
  location: {
    title: "Площадь Минина и Пожарского",
    lat: 56.327436,
    lon: 44.006948,
  },
  source: "Яндекс Погода",
  sourceUrl: "https://yandex.ru/pogoda/nizhny-novgorod",
  days,
};

try {
  const current = JSON.parse(await readFile(outputPath, "utf8"));
  const currentForecast = {
    location: current.location,
    source: current.source,
    sourceUrl: current.sourceUrl,
    days: current.days,
  };
  const nextForecast = {
    location: payload.location,
    source: payload.source,
    sourceUrl: payload.sourceUrl,
    days: payload.days,
  };
  if (JSON.stringify(currentForecast) === JSON.stringify(nextForecast)) {
    console.log("Weather forecast has not changed.");
    process.exit(0);
  }
} catch {
  // A missing or invalid output file is replaced only after a valid API response.
}

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
console.log(`Weather forecast updated for ${Object.keys(days).length} trip day(s).`);
