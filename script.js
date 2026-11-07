"use strict";

const $ = id => document.getElementById(id);
const sectors = ["Alimentos", "Comercio", "Servicios"];
const channels = ["Ninguno", "Redes sociales", "Volantes", "Radio local"];
const promotions = ["Ninguna", "Descuento", "Combo"];

const variables = [
  {
    key: "sector", label: "Sector", type: "Nominal",
    question: "¿Cuál es la actividad principal del negocio?",
    coding: "Alimentos; Comercio; Servicios.", categories: sectors
  },
  {
    key: "months", label: "Antigüedad (meses)", type: "Cuantitativa discreta",
    question: "¿Cuántos meses completos lleva funcionando?",
    coding: "Número entero de meses.", unit: "meses"
  },
  {
    key: "employees", label: "Trabajadores", type: "Cuantitativa discreta",
    question: "¿Cuántas personas trabajan, incluyendo al propietario?",
    coding: "Número entero de personas.", unit: "personas"
  },
  {
    key: "channel", label: "Canal principal", type: "Nominal",
    question: "¿Cuál fue su principal canal de publicidad pagada el último mes?",
    coding: "Ninguno; Redes sociales; Volantes; Radio local.", categories: channels
  },
  {
    key: "ad", label: "Gasto publicitario (C$)", type: "Cuantitativa continua",
    question: "¿Cuánto gastó en publicidad pagada el último mes?",
    coding: "Córdobas; cero si no pagó publicidad.", unit: "C$"
  },
  {
    key: "posts", label: "Publicaciones", type: "Cuantitativa discreta",
    question: "¿Cuántas publicaciones del negocio realizó en redes el último mes?",
    coding: "Número entero; incluye publicaciones orgánicas.", unit: "publicaciones"
  },
  {
    key: "promo", label: "Promoción principal", type: "Nominal",
    question: "¿Qué promoción utilizó durante más días el último mes?",
    coding: "Ninguna; Descuento; Combo.", categories: promotions
  },
  {
    key: "discount", label: "Descuento máximo (%)", type: "Cuantitativa continua",
    question: "¿Cuál fue el mayor descuento explícito aplicado?",
    coding: "Porcentaje de 0 a 100; cero si no hubo descuento.", unit: "%"
  },
  {
    key: "days", label: "Días de promoción", type: "Cuantitativa discreta",
    question: "¿Durante cuántos días aplicó su promoción principal?",
    coding: "Entero de 0 a 30; periodo de referencia de 30 días.", unit: "días"
  },
  {
    key: "customers", label: "Clientes por día", type: "Cuantitativa continua",
    question: "¿Cuál fue el promedio de clientes atendidos por día de apertura?",
    coding: "Promedio diario de clientes, puede tener decimales.", unit: "clientes/día"
  },
  {
    key: "previous", label: "Ventas anteriores (C$)", type: "Cuantitativa continua",
    question: "¿Cuánto vendió en total el mes anterior al último mes completo?",
    coding: "Ingresos por ventas en córdobas.", unit: "C$"
  },
  {
    key: "sales", label: "Ventas actuales (C$)", type: "Cuantitativa continua",
    question: "¿Cuánto vendió en total el último mes completo?",
    coding: "Ingresos por ventas en córdobas.", unit: "C$"
  },
  {
    key: "satisfaction", label: "Satisfacción", type: "Ordinal",
    question: "¿Qué tan satisfecho está con sus ventas del último mes?",
    coding: "1 = Muy insatisfecho; 2 = Insatisfecho; 3 = Neutral; 4 = Satisfecho; 5 = Muy satisfecho.",
    categories: [1, 2, 3, 4, 5]
  },
  {
    key: "records", label: "Registro de ventas", type: "Nominal",
    question: "¿Lleva un registro escrito o digital de sus ventas?",
    coding: "Sí; No.", categories: ["Sí", "No"]
  }
];

const derived = [
  {
    key: "growth", label: "Cambio de ventas (%)",
    type: "Cuantitativa continua", unit: "%"
  },
  {
    key: "grew", label: "Crecimiento de ventas",
    type: "Nominal", categories: ["No creció", "Creció"]
  }
];

const allVariables = [...variables, ...derived];
const quantitative = allVariables.filter(v => !v.categories);
const categorical = allVariables.filter(v => v.categories);
const meta = key => allVariables.find(v => v.key === key);

let data = [];
let visible = [];
let sortKey = "id";
let sortAscending = true;
let model = null;

const numberFormat = new Intl.NumberFormat("es-NI", {
  maximumFractionDigits: 2
});

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return "No disponible";
  return new Intl.NumberFormat("es-NI", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map(h =>
    `<th>${escapeHTML(h)}</th>`).join("")}</tr></thead><tbody>${
    rows.length ? rows.map(row => `<tr>${row.map(cell =>
      `<td>${escapeHTML(cell)}</td>`).join("")}</tr>`).join("") :
      `<tr><td colspan="${headers.length}">No hay datos válidos.</td></tr>`
  }</tbody></table>`;
}

function values(key) {
  return visible.map(row => row[key]).filter(Number.isFinite);
}

function mean(a) {
  return a.length ? a.reduce((sum, x) => sum + x, 0) / a.length : NaN;
}

function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] +
    fraction * (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]);
}

function stats(a) {
  const sorted = [...a].sort((x, y) => x - y);
  const n = a.length;
  const average = mean(a);
  const variance = n > 1 ?
    a.reduce((sum, x) => sum + (x - average) ** 2, 0) / (n - 1) : NaN;
  const counts = new Map();
  a.forEach(x => counts.set(x, (counts.get(x) || 0) + 1));
  const highest = Math.max(0, ...counts.values());
  const modes = highest > 1 ?
    [...counts].filter(([, count]) => count === highest).map(([x]) => x) : [];

  return {
    n, mean: average, variance, sd: Math.sqrt(variance),
    min: n ? sorted[0] : NaN,
    max: n ? sorted[n - 1] : NaN,
    median: quantile(sorted, .5),
    q1: quantile(sorted, .25), q3: quantile(sorted, .75),
    p10: quantile(sorted, .1), p90: quantile(sorted, .9),
    modes, highest
  };
}

const random = (min, max) => min + Math.random() * (max - min);
const choose = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const rounded = (x, digits = 2) => Number(x.toFixed(digits));

function normal() {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generate() {
  const requested = Number($("sampleSize").value);
  const n = Number.isFinite(requested) ?
    clamp(Math.round(requested), 40, 500) : 80;
  $("sampleSize").value = n;

  data = Array.from({ length: n }, (_, i) => {
    const sector = choose(sectors);
    const employees = Math.floor(random(1, 9));
    const months = Math.floor(random(6, 145));
    const channel = choose(channels);
    const ad = channel === "Ninguno" ? 0 :
      rounded(random(250, 4800) + employees * random(20, 150));
    const posts = channel === "Redes sociales" ?
      Math.floor(random(8, 39)) : Math.floor(random(0, 18));
    const promo = choose(promotions);
    const discount = promo === "Descuento" ? Math.floor(random(5, 26)) : 0;
    const days = promo === "Ninguna" ? 0 : Math.floor(random(3, 25));
    const previous = rounded(
      11000 + employees * random(2800, 6500) + random(3000, 38000)
    );
    const sectorEffect = sector === "Alimentos" ? .025 :
      sector === "Servicios" ? -.015 : 0;
    const growthRate = -.07 + ad / 33000 +
      (promo === "Ninguna" ? 0 : .045) +
      sectorEffect + normal() * .16;
    const sales = rounded(Math.max(4000, previous * (1 + growthRate)));
    const growth = 100 * (sales - previous) / previous;
    const ticket = sector === "Alimentos" ? random(80, 180) :
      sector === "Servicios" ? random(180, 420) : random(120, 300);
    const customers = rounded(sales / (ticket * 26), 1);
    const satisfaction = clamp(
      Math.round(3 + growth / 18 + normal() * .85), 1, 5
    );

    return {
      id: `N${String(i + 1).padStart(3, "0")}`,
      sector, months, employees, channel, ad, posts, promo, discount, days,
      customers, previous, sales, satisfaction,
      records: Math.random() < .7 ? "Sí" : "No",
      growth, grew: growth > 0 ? "Creció" : "No creció"
    };
  });

  applyFilters();
  $("status").textContent =
    `Se generaron ${n} negocios sintéticos. Los filtros actuales siguen aplicándose.`;
}

function populateSelect(id, list, selected) {
  $(id).innerHTML = list.map(v =>
    `<option value="${escapeHTML(v.key)}">${escapeHTML(v.label)}</option>`
  ).join("");
  if (selected) $(id).value = selected;
}

function setup() {
  $("questionnaire").innerHTML = table(
    ["N.º", "Pregunta", "Variable", "Tipo", "Codificación"],
    variables.map((v, i) => [i + 1, v.question, v.key, v.type, v.coding])
  );

  $("sectorFilter").innerHTML =
    '<option value="">Todos los sectores</option>' +
    sectors.map(x => `<option>${x}</option>`).join("");

  $("promoFilter").innerHTML =
    '<option value="">Todas las promociones</option>' +
    promotions.map(x => `<option>${x}</option>`).join("");

  populateSelect("freqVar", allVariables, "channel");
  populateSelect("descVar", quantitative, "sales");
  populateSelect("chiRow", categorical, "promo");
  populateSelect("chiCol", categorical, "grew");
  populateSelect("xVar", quantitative, "ad");
  populateSelect("yVar", quantitative, "sales");

  $("generate").addEventListener("click", generate);
  $("download").addEventListener("click", downloadCSV);
  $("print").addEventListener("click", () => window.print());
  $("search").addEventListener("input", applyFilters);
  $("sectorFilter").addEventListener("change", applyFilters);
  $("promoFilter").addEventListener("change", applyFilters);

  $("clear").addEventListener("click", () => {
    $("search").value = "";
    $("sectorFilter").value = "";
    $("promoFilter").value = "";
    applyFilters();
  });

  ["freqVar", "descVar", "chiRow", "chiCol", "xVar", "yVar"].forEach(id => {
    $(id).addEventListener("change", render);
  });

  $("predict").addEventListener("click", predict);
  $("prediction").addEventListener("keydown", event => {
    if (event.key === "Enter") predict();
  });

  generate();
}

function applyFilters() {
  const term = $("search").value.trim().toLocaleLowerCase("es");
  visible = data.filter(row => {
    const matchesSearch = !term || [
      row.id, row.sector, row.channel, row.promo, row.records, row.grew
    ].some(value => String(value).toLocaleLowerCase("es").includes(term));

    return matchesSearch &&
      (!$("sectorFilter").value || row.sector === $("sectorFilter").value) &&
      (!$("promoFilter").value || row.promo === $("promoFilter").value);
  });

  render();
}

function render() {
  renderData();
  renderMetrics();
  renderFrequency();
  renderDescriptive();
  renderChi();
  renderRegression();
  renderCharts();
  renderConclusions();
}

function renderData() {
  visible.sort((a, b) => {
    const comparison = typeof a[sortKey] === "number" ?
      a[sortKey] - b[sortKey] :
      String(a[sortKey]).localeCompare(String(b[sortKey]), "es");
    return sortAscending ? comparison : -comparison;
  });

  const cols = [{ key: "id", label: "Negocio" }, ...allVariables];

  $("rowCount").textContent =
    `${visible.length} de ${data.length} negocios seleccionados.`;

  $("dataTable").innerHTML =
    `<table><thead><tr>${cols.map(v => {
      const selected = sortKey === v.key;
      return `<th aria-sort="${selected ?
        (sortAscending ? "ascending" : "descending") : "none"}">
        <button data-sort="${v.key}">${escapeHTML(v.label)}
        ${selected ? (sortAscending ? "↑" : "↓") : "↕"}</button></th>`;
    }).join("")}</tr></thead><tbody>${
      visible.length ? visible.map(row => `<tr>${cols.map(v => {
        const val = row[v.key];
        return `<td>${escapeHTML(
          val == null ? "Faltante" :
          typeof val === "number" ? numberFormat.format(val) : val
        )}</td>`;
      }).join("")}</tr>`).join("") :
      `<tr><td colspan="${cols.length}">No hay registros con estos filtros.</td></tr>`
    }</tbody></table>`;

  $("dataTable").querySelectorAll("[data-sort]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      sortAscending = key === sortKey ? !sortAscending : true;
      sortKey = key;
      renderData();
    });
  });
}

function renderMetrics() {
  const cards = [
    ["Negocios seleccionados", visible.length],
    ["Ventas promedio (C$)", fmt(mean(values("sales")))],
    ["Publicidad promedio (C$)", fmt(mean(values("ad")))],
    ["Cambio promedio (%)", fmt(mean(values("growth")))]
  ];

  $("metrics").innerHTML = cards.map(([label, value]) =>
    `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`
  ).join("");
}

function grouped(a) {
  if (!a.length) return [];
  const min = Math.min(...a);
  const max = Math.max(...a);
  if (min === max) {
    return [{ low: min, high: max, mark: min, count: a.length }];
  }

  const k = Math.min(12, Math.ceil(1 + Math.log2(a.length)));
  const width = (max - min) / k;
  const bins = Array.from({ length: k }, (_, i) => ({
    low: min + i * width,
    high: i === k - 1 ? max : min + (i + 1) * width,
    mark: min + (i + .5) * width,
    count: 0
  }));

  a.forEach(x => {
    const index = Math.min(k - 1, Math.floor((x - min) / width));
    bins[index].count++;
  });

  return bins;
}

function countsFor(key) {
  const v = meta(key);
  return v.categories.map(label => ({
    label: String(label),
    count: visible.filter(row => row[key] === label).length
  }));
}

function renderFrequency() {
  const key = $("freqVar").value;
  const v = meta(key);
  let cumulative = 0;

  if (v.categories) {
    const counts = countsFor(key);
    const n = counts.reduce((sum, item) => sum + item.count, 0);
    const ordinal = v.type === "Ordinal";

    const rows = counts.map(item => {
      cumulative += item.count;
      return [
        item.label, item.count,
        n ? fmt(item.count / n, 4) : "—",
        n ? fmt(100 * item.count / n) + "%" : "—",
        ...(ordinal ? [
          cumulative, n ? fmt(100 * cumulative / n) + "%" : "—"
        ] : [])
      ];
    });

    $("freqTable").innerHTML = table(
      ["Categoría", "fi", "hi", "%", ...(ordinal ? ["Fi", "% acumulado"] : [])],
      rows
    );

    const top = [...counts].sort((a, b) => b.count - a.count)[0];
    $("freqExplanation").textContent = n ?
      `${v.label}: se analizaron ${n} respuestas válidas. ` +
      `La categoría con mayor frecuencia es ${top.label}, con ${top.count} ` +
      `negocios (${fmt(100 * top.count / n)}%). fi cuenta respuestas; ` +
      `hi representa su proporción. ${ordinal ?
        "La acumulación respeta el orden de la escala; los códigos no implican distancias iguales." :
        "No se acumulan frecuencias porque estas categorías no tienen un orden natural."}` +
      ` Se excluyeron ${visible.length - n} respuestas faltantes. ` +
      "Estos porcentajes describen únicamente la selección." :
      "No hay respuestas válidas para esta distribución.";
  } else {
    const a = values(key);
    const bins = grouped(a);
    $("freqTable").innerHTML = table(
      ["Intervalo", "Marca de clase", "fi", "hi", "%", "Fi", "% acumulado"],
      bins.map((b, i) => {
        cumulative += b.count;
        return [
          `[${fmt(b.low)}; ${fmt(b.high)}${i === bins.length - 1 ? "]" : ")"}`,
          fmt(b.mark), b.count, fmt(b.count / a.length, 4),
          fmt(100 * b.count / a.length) + "%", cumulative,
          fmt(100 * cumulative / a.length) + "%"
        ];
      })
    );

    $("freqExplanation").textContent = a.length ?
      `Se agruparon ${a.length} valores de ${v.label} en ${bins.length} clases. ` +
      "Cada fi indica cuántos negocios se encuentran en el intervalo; " +
      "la marca es su punto medio. Fi suma los conteos hasta esa clase. " +
      "Los límites se muestran redondeados, pero se calculan con su precisión completa. " +
      `Se excluyeron ${visible.length - a.length} faltantes. Agrupar facilita observar ` +
      "la distribución, aunque oculta diferencias dentro de cada intervalo." :
      "No hay valores numéricos válidos.";
  }
}

function renderDescriptive() {
  const key = $("descVar").value;
  const v = meta(key);
  const s = stats(values(key));
  const mode = !s.modes.length ? "Sin moda: no hay repeticiones" :
    s.modes.length > 8 ?
      `${s.modes.length} modas; frecuencia ${s.highest}` :
      s.modes.map(x => fmt(x)).join("; ");

  $("descTable").innerHTML = table(["Estadístico", "Resultado"], [
    ["n válido", s.n],
    ["Faltantes excluidos", visible.length - s.n],
    ["Media", fmt(s.mean)],
    ["Mediana / P50", fmt(s.median)],
    ["Moda de los valores registrados", mode],
    ["Mínimo", fmt(s.min)], ["Máximo", fmt(s.max)],
    ["Rango", fmt(s.max - s.min)],
    ["Varianza muestral (unidad al cuadrado)", fmt(s.variance)],
    ["Desviación estándar muestral", fmt(s.sd)],
    ["Q1 / P25", fmt(s.q1)], ["Q3 / P75", fmt(s.q3)],
    ["P10", fmt(s.p10)], ["P90", fmt(s.p90)]
  ]);

  $("descExplanation").textContent = s.n ?
    `Para ${v.label}, la media es ${fmt(s.mean)} ${v.unit}, mientras que la ` +
    `mediana es ${fmt(s.median)} ${v.unit}. La mediana divide los datos ordenados ` +
    "en dos mitades y suele ser menos sensible a valores extremos. " +
    `La desviación estándar muestral es ${fmt(s.sd)} ${v.unit}; resume la ` +
    "dispersión alrededor de la media. La varianza expresa esa dispersión " +
    "en unidades al cuadrado. " +
    `El 50% central queda aproximadamente entre ${fmt(s.q1)} y ${fmt(s.q3)} ${v.unit}. ` +
    "Los percentiles son puntos de posición, no porcentajes de ventas. " +
    "La moda puede ser poco informativa en mediciones continuas. " +
    (s.n < 2 ? "Con un solo dato no se puede estimar la varianza muestral." :
      "Estas medidas describen la selección y no identifican causas.") :
    "No hay datos válidos. Modifica los filtros.";
}

/* Logaritmo de gamma: aproximación de Lanczos. */
function logGamma(z) {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7
  ];

  if (z < .5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) -
      logGamma(1 - z);
  }

  z--;
  let x = .9999999999998099;
  coefficients.forEach((c, i) => { x += c / (z + i + 1); });
  const t = z + coefficients.length - .5;
  return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) -
    t + Math.log(x);
}

/* Gamma regularizada superior Q(a,x): cola de chi-cuadrado. */
function gammaQ(a, x) {
  if (!(a > 0) || x < 0) return NaN;
  if (x === 0) return 1;
  const eps = 1e-13;
  const tiny = 1e-300;
  const factor = Math.exp(-x + a * Math.log(x) - logGamma(a));

  if (x < a + 1) {
    let sum = 1 / a;
    let delta = sum;
    let ap = a;
    for (let i = 1; i <= 10000; i++) {
      delta *= x / ++ap;
      sum += delta;
      if (Math.abs(delta) < Math.abs(sum) * eps) break;
    }
    return clamp(1 - sum * factor, 0, 1);
  }

  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / (Math.abs(b) < tiny ? tiny : b);
  let h = d;

  for (let i = 1; i <= 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }

  return clamp(factor * h, 0, 1);
}

function formatP(p) {
  return !Number.isFinite(p) ? "No disponible" :
    p < .0001 ? "< 0.0001" : p.toFixed(4);
}

function renderChi() {
  const rowKey = $("chiRow").value;
  const colKey = $("chiCol").value;

  if (rowKey === colKey) {
    $("chiTable").innerHTML = "";
    $("chiResult").textContent = "Selecciona dos variables diferentes.";
    $("chiExplanation").textContent =
      "Cruzar una variable consigo misma no aporta una prueba de asociación útil.";
    return;
  }

  const pairs = visible.filter(r =>
    meta(rowKey).categories.includes(r[rowKey]) &&
    meta(colKey).categories.includes(r[colKey])
  );
  const rows = meta(rowKey).categories.filter(x => pairs.some(r => r[rowKey] === x));
  const cols = meta(colKey).categories.filter(x => pairs.some(r => r[colKey] === x));
  const observed = rows.map(a =>
    cols.map(b => pairs.filter(r => r[rowKey] === a && r[colKey] === b).length)
  );
  const rowTotals = observed.map(r => r.reduce((a, b) => a + b, 0));
  const colTotals = cols.map((_, j) =>
    observed.reduce((sum, r) => sum + r[j], 0));
  const n = pairs.length;
  let chi = 0;
  let small = 0;
  let belowOne = 0;
  let minExpected = Infinity;

  const body = observed.map((r, i) => [
    String(rows[i]),
    ...r.map((o, j) => {
      const expected = rowTotals[i] * colTotals[j] / n;
      chi += (o - expected) ** 2 / expected;
      if (expected < 5) small++;
      if (expected < 1) belowOne++;
      minExpected = Math.min(minExpected, expected);
      return `${o} (${fmt(expected)})`;
    }),
    rowTotals[i]
  ]);

  if (n) body.push(["Total", ...colTotals, n]);
  $("chiTable").innerHTML = table(
    [meta(rowKey).label, ...cols.map(String), "Total"], body
  );

  if (rows.length < 2 || cols.length < 2) {
    $("chiResult").textContent =
      "No se calcula chi-cuadrado: se requieren al menos dos categorías presentes en cada variable.";
    $("chiExplanation").textContent =
      "La selección carece de variabilidad suficiente. Amplía los filtros o elige otras variables.";
    return;
  }

  const df = (rows.length - 1) * (cols.length - 1);
  const p = gammaQ(df / 2, chi / 2);
  const cells = rows.length * cols.length;
  const valid = belowOne === 0 && small / cells <= .2;
  const cramer = Math.sqrt(chi / (n * Math.min(rows.length - 1, cols.length - 1)));

  $("chiResult").innerHTML = `<div class="result">
    χ² = ${fmt(chi, 4)} · gl = ${df} · p ${p < .0001 ? "" : "="} ${formatP(p)}
    · n = ${n} · V de Cramér = ${fmt(cramer, 3)}.<br>
    Esperada mínima: ${fmt(minExpected)}.
    Celdas con esperada &lt; 5: ${small}/${cells} (${fmt(100 * small / cells)}%).
    Celdas con esperada &lt; 1: ${belowOne}.
    Faltantes excluidos: ${visible.length - n}.
  </div>`;

  $("chiExplanation").textContent =
    "Chi-cuadrado compara las frecuencias observadas con las esperadas si las variables fueran independientes. " +
    (valid ?
      `El criterio de frecuencias esperadas se cumple: ninguna menor de 1 y no más del 20% menores de 5. ` +
      (p < .05 ?
        "Con α = 0.05 se rechaza H₀: existe evidencia de asociación en esta simulación. " :
        "Con α = 0.05 no se rechaza H₀: no hay evidencia suficiente de asociación; esto no demuestra independencia. ") :
      "No se cumple el criterio de frecuencias esperadas. El valor p es aproximado y no debe usarse para una conclusión firme. " +
      "Como alternativa, utiliza una prueba exacta para tablas pequeñas o una prueba por Monte Carlo en un programa estadístico; " +
      "también puedes aumentar la muestra o reagrupar categorías solo si hay una justificación conceptual. ") +
    "V de Cramér resume la magnitud de asociación entre 0 y 1, sin indicar dirección. " +
    "Se requiere independencia entre negocios y categorías mutuamente excluyentes. " +
    "Los resultados no prueban causalidad ni representan una población real.";
}

function regression(xKey, yKey) {
  const pairs = visible.filter(r =>
    Number.isFinite(r[xKey]) && Number.isFinite(r[yKey])
  );
  if (pairs.length < 3 || xKey === yKey) return null;
  const x = pairs.map(r => r[xKey]);
  const y = pairs.map(r => r[yKey]);
  const mx = mean(x);
  const my = mean(y);
  const sxx = x.reduce((sum, v) => sum + (v - mx) ** 2, 0);
  const syy = y.reduce((sum, v) => sum + (v - my) ** 2, 0);
  const sxy = x.reduce((sum, v, i) => sum + (v - mx) * (y[i] - my), 0);
  if (sxx <= 0 || syy <= 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r = clamp(sxy / Math.sqrt(sxx * syy), -1, 1);

  return {
    pairs, xKey, yKey, slope, intercept, r, r2: r * r,
    minX: Math.min(...x), maxX: Math.max(...x),
    minY: Math.min(...y), maxY: Math.max(...y)
  };
}

function strength(r) {
  const a = Math.abs(r);
  return a < .2 ? "muy débil" : a < .4 ? "débil" :
    a < .6 ? "moderada" : a < .8 ? "fuerte" : "muy fuerte";
}

function renderRegression() {
  const xKey = $("xVar").value;
  const yKey = $("yVar").value;
  model = regression(xKey, yKey);
  $("predictionResult").textContent = "";

  if (!model) {
    $("regResult").textContent =
      "No se puede estimar el modelo: elige variables distintas, al menos tres pares válidos y variabilidad en ambas.";
    $("regExplanation").textContent =
      "Pearson necesita variación en X e Y. Con una variable constante no se define la correlación. " +
      "La app exige al menos tres observaciones para ofrecer un resumen educativo.";
    $("estimates").innerHTML = "";
    $("prediction").value = "";
    $("predict").disabled = true;
    return;
  }

  $("predict").disabled = false;
  const m = model;
  const x = meta(xKey);
  const y = meta(yKey);
  const sign = m.slope >= 0 ? "+" : "−";

  $("regResult").innerHTML = `<div class="result">
    Pearson r = ${fmt(m.r, 4)} · R² = ${fmt(m.r2, 4)}
    (${fmt(100 * m.r2)}%) · n = ${m.pairs.length}.<br>
    Ŷ = ${fmt(m.intercept, 4)} ${sign} ${fmt(Math.abs(m.slope), 6)} × X.<br>
    Intercepto = ${fmt(m.intercept, 4)} · Pendiente = ${fmt(m.slope, 6)}.<br>
    X: ${escapeHTML(x.label)}. Y: ${escapeHTML(y.label)}.
    Pares excluidos: ${visible.length - m.pairs.length}.
  </div>`;

  const mechanical = [xKey, yKey].includes("growth") &&
    [xKey, yKey].some(k => ["sales", "previous"].includes(k));
  const pairedMonths = [xKey, yKey].includes("sales") &&
    [xKey, yKey].includes("previous");

  $("regExplanation").textContent =
    `La relación lineal entre ${x.label} y ${y.label} es ${strength(m.r)} ` +
    `y ${m.r > 0 ? "positiva" : m.r < 0 ? "negativa" : "nula"}. ` +
    `Por cada unidad adicional de X, el modelo estima un cambio promedio ` +
    `de ${fmt(m.slope, 4)} ${y.unit} en Y. ` +
    `R² indica que la recta describe el ${fmt(100 * m.r2)}% de la variación de Y ` +
    "en los pares analizados; no es un porcentaje de ventas causadas por X. " +
    `El intercepto representa Y estimada cuando X = 0${m.minX > 0 ?
      ", un valor fuera del rango observado que aquí no tiene interpretación práctica directa" : ""}. ` +
    "Pearson no detecta todas las relaciones no lineales y es sensible a valores atípicos. " +
    "La inferencia requeriría revisar linealidad, independencia, dispersión de residuos y otros supuestos. " +
    "La correlación no demuestra causalidad. " +
    (mechanical ?
      "Advertencia: el cambio porcentual se calcula usando las ventas; esta asociación contiene dependencia matemática. " : "") +
    (pairedMonths ?
      "Ambas mediciones pertenecen al mismo negocio: la asociación también refleja diferencias de tamaño entre negocios. " : "");

  $("prediction").min = m.minX;
  $("prediction").max = m.maxX;
  $("prediction").value = rounded(mean(m.pairs.map(r => r[xKey])), 4);
  $("predictionLabel").firstChild.textContent =
    `X: ${x.label} (${fmt(m.minX)} a ${fmt(m.maxX)}) `;

  $("estimates").innerHTML = table(
    ["Negocio", x.label, `${y.label}: observado`, "Y estimada", "Residuo: Y − Ŷ"],
    m.pairs.map(r => {
      const predicted = m.intercept + m.slope * r[xKey];
      return [r.id, fmt(r[xKey]), fmt(r[yKey]), fmt(predicted), fmt(r[yKey] - predicted)];
    })
  );
}

function predict() {
  if (!model) return;
  const raw = $("prediction").value.trim();
  const x = Number(raw);
  if (!raw || !Number.isFinite(x)) {
    $("predictionResult").textContent = "Introduce un número válido.";
    return;
  }
  if (x < model.minX || x > model.maxX) {
    $("predictionResult").textContent =
      `Usa un valor entre ${fmt(model.minX)} y ${fmt(model.maxX)}. No se realiza extrapolación.`;
    return;
  }

  const y = model.intercept + model.slope * x;
  $("predictionResult").textContent =
    `Para X = ${fmt(x)}, la estimación de ${meta(model.yKey).label} es ${fmt(y)}. ` +
    (y < 0 && model.yKey !== "growth" ?
      "El resultado negativo no es físicamente plausible para esta variable: el modelo lineal es inadecuado en este punto." :
      "Es una estimación asociativa, no una garantía ni un efecto causal.");
}

/* Gráficos SVG nativos, sin dependencias externas. */
const palette = ["#245B70", "#6B9B83", "#D5A443", "#879EB5", "#A99B83"];
const W = 720;
const H = 380;
const left = 85;
const right = 25;
const top = 32;
const bottom = 95;
const plotW = W - left - right;
const plotH = H - top - bottom;

function svg(content, title) {
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHTML(title)}">
    <title>${escapeHTML(title)}</title>${content}</svg>`;
}

function text(x, y, value, anchor = "middle", size = 12, fill = "#64748B") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}"
    font-size="${size}" fill="${fill}">${escapeHTML(value)}</text>`;
}

function emptyChart(id, message = "No hay datos suficientes.") {
  $(id).innerHTML = svg(text(W / 2, H / 2, message), message);
}

function axes(maxY, xLabel, yLabel) {
  let result = "";
  const upper = maxY > 0 ? maxY : 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + plotH - i * plotH / 4;
    result += `<line x1="${left}" y1="${y}" x2="${W - right}" y2="${y}"
      stroke="#E2E8ED"/>`;
    result += text(left - 10, y + 4, fmt(i * upper / 4, 1), "end", 11);
  }
  result += text(left, 17, yLabel, "start", 12, "#245B70");
  result += text(left + plotW / 2, H - 10, xLabel, "middle", 12, "#245B70");
  return result;
}

function barChart(id, items, xLabel, yLabel) {
  if (!items.length || !items.some(item => item.value > 0)) {
    emptyChart(id);
    return;
  }

  const maximum = Math.max(...items.map(item => item.value)) * 1.15;
  let out = axes(maximum, xLabel, yLabel);
  const width = plotW / items.length;

  items.forEach((item, i) => {
    const x = left + i * width + width * .15;
    const h = item.value / maximum * plotH;
    out += `<rect x="${x}" y="${top + plotH - h}" width="${width * .7}"
      height="${h}" rx="3" fill="${palette[i % palette.length]}">
      <title>${escapeHTML(item.label)}: ${fmt(item.value)}</title></rect>`;
    out += text(x + width * .35, top + plotH - h - 8, fmt(item.value, 1), "middle", 11);
    out += text(x + width * .35, top + plotH + 22, item.label, "middle", 11);
  });

  $(id).innerHTML = svg(out, `${yLabel} por ${xLabel}`);
}

function pieChart() {
  const items = countsFor("sector").filter(item => item.count);
  const n = items.reduce((s, item) => s + item.count, 0);
  if (!n) {
    emptyChart("pieChart");
    return;
  }

  const cx = 225;
  const cy = 180;
  const radius = 125;
  let angle = -Math.PI / 2;
  let out = "";

  items.forEach((item, i) => {
    const end = angle + item.count / n * Math.PI * 2;
    const color = palette[i];
    if (item.count === n) {
      out += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"/>`;
    } else {
      const x1 = cx + radius * Math.cos(angle);
      const y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(end);
      const y2 = cy + radius * Math.sin(end);
      out += `<path d="M ${cx} ${cy} L ${x1} ${y1}
        A ${radius} ${radius} 0 ${end - angle > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z"
        fill="${color}" stroke="white" stroke-width="2">
        <title>${escapeHTML(item.label)}: ${fmt(100 * item.count / n)}%</title></path>`;
    }
    out += `<rect x="390" y="${100 + i * 55}" width="15" height="15" fill="${color}"/>`;
    out += text(415, 113 + i * 55,
      `${item.label}: ${item.count} (${fmt(100 * item.count / n, 1)}%)`, "start", 13);
    angle = end;
  });

  $("pieChart").innerHTML = svg(out, "Distribución de negocios por sector");
}

function distributionCharts() {
  const chosen = meta($("freqVar").value);
  const key = chosen.categories ? $("descVar").value : chosen.key;
  const v = meta(key);
  const bins = grouped(values(key));
  $("histTitle").textContent = `Histograma: ${v.label}`;

  if (!bins.length) {
    emptyChart("histChart");
    emptyChart("polygonChart");
    $("histText").textContent = "No hay valores numéricos válidos.";
    return;
  }

  const maxY = Math.max(...bins.map(b => b.count)) * 1.2;
  const width = plotW / bins.length;
  let hist = axes(maxY, v.label, "Frecuencia (negocios)");
  let polygon = axes(maxY, v.label, "Frecuencia (negocios)");
  const points = [];

  bins.forEach((b, i) => {
    const x = left + i * width;
    const y = top + plotH - b.count / maxY * plotH;
    hist += `<rect x="${x + .5}" y="${y}" width="${Math.max(.1, width - 1)}"
      height="${top + plotH - y}" fill="#6B9B83">
      <title>[${fmt(b.low)}; ${fmt(b.high)}]: ${b.count}</title></rect>`;
    points.push([x + width / 2, y]);

    const labelX = x + width / 2;
    const labelY = top + plotH + 18;
    const label = fmt(b.mark, 1);
    const markLabel = `<text x="${labelX}" y="${labelY}"
      transform="rotate(35 ${labelX} ${labelY})"
      text-anchor="start" font-size="10" fill="#64748B">${escapeHTML(label)}</text>`;
    hist += markLabel;
    polygon += markLabel;
  });

  polygon += `<polyline points="${points.map(p => p.join(",")).join(" ")}"
    fill="none" stroke="#245B70" stroke-width="3"/>`;
  points.forEach(([x, y], i) => {
    polygon += `<circle cx="${x}" cy="${y}" r="4" fill="#245B70">
      <title>Marca ${fmt(bins[i].mark)}: ${bins[i].count} negocios</title></circle>`;
  });

  $("histChart").innerHTML = svg(hist, `Histograma de ${v.label}`);
  $("polygonChart").innerHTML = svg(polygon, `Polígono de ${v.label}`);
  $("histText").textContent =
    `Las barras contiguas muestran negocios por intervalo de ${v.label}. ` +
    "El eje horizontal etiqueta las marcas de clase; los límites exactos se calculan " +
    "antes de redondear. Las alturas son frecuencias absolutas, no importes de ventas. " +
    (bins.length === 1 ?
      "Todos los valores coinciden y se presenta una única clase." :
      "La forma depende del ancho de clase; no basta para afirmar normalidad.");
}

function scatterChart() {
  if (!model) {
    emptyChart("scatterChart");
    $("scatterText").textContent =
      "Selecciona dos variables con datos suficientes y variación.";
    return;
  }

  const m = model;
  const lineY1 = m.intercept + m.slope * m.minX;
  const lineY2 = m.intercept + m.slope * m.maxX;
  const rawMinY = Math.min(m.minY, lineY1, lineY2);
  const rawMaxY = Math.max(m.maxY, lineY1, lineY2);
  const paddingY = (rawMaxY - rawMinY) * .08;
  const minY = rawMinY - paddingY;
  const maxY = rawMaxY + paddingY;
  const sx = x => left + (x - m.minX) / (m.maxX - m.minX) * plotW;
  const sy = y => top + plotH - (y - minY) / (maxY - minY) * plotH;
  let out = "";

  for (let i = 0; i <= 4; i++) {
    const y = top + plotH - i * plotH / 4;
    out += `<line x1="${left}" y1="${y}" x2="${W - right}" y2="${y}"
      stroke="#E2E8ED"/>`;
    out += text(left - 10, y + 4, fmt(minY + i * (maxY - minY) / 4, 1), "end", 10);
    out += text(left + i * plotW / 4, top + plotH + 22,
      fmt(m.minX + i * (m.maxX - m.minX) / 4, 1), "middle", 10);
  }

  out += text(left, 17, meta(m.yKey).label, "start", 12, "#245B70");
  out += text(left + plotW / 2, H - 20, meta(m.xKey).label, "middle", 12, "#245B70");

  m.pairs.forEach(row => {
    out += `<circle cx="${sx(row[m.xKey])}" cy="${sy(row[m.yKey])}"
      r="4" fill="#6B9B83" fill-opacity=".7">
      <title>${row.id}: X=${fmt(row[m.xKey])}; Y=${fmt(row[m.yKey])}</title></circle>`;
  });

  out += `<line x1="${sx(m.minX)}" y1="${sy(lineY1)}"
    x2="${sx(m.maxX)}" y2="${sy(lineY2)}" stroke="#245B70" stroke-width="3"/>`;

  $("scatterChart").innerHTML = svg(out, "Dispersión y regresión lineal");
  $("scatterText").textContent =
    `Cada punto representa un negocio. La recta resume la relación lineal ` +
    `(r = ${fmt(m.r, 3)}; R² = ${fmt(m.r2, 3)}). ` +
    "La distancia vertical entre un punto y la recta es su residuo. " +
    "Una nube amplia indica que otros factores y la variación individual " +
    "son relevantes. La recta se dibuja únicamente dentro del rango de X observado.";
}

function renderCharts() {
  const channelCounts = countsFor("channel");
  barChart("barChart",
    channelCounts.map(x => ({ label: x.label, value: x.count })),
    "Canal publicitario", "Número de negocios"
  );

  const topChannel = [...channelCounts].sort((a, b) => b.count - a.count)[0];
  $("barText").textContent = visible.length ?
    `El canal más frecuente es ${topChannel.label}, con ${topChannel.count} negocios. ` +
    "La frecuencia de uso no mide la eficacia del canal ni sus ventas atribuibles." :
    "No hay registros seleccionados.";

  pieChart();
  $("pieText").textContent = visible.length ?
    "Cada sector ocupa una proporción de los negocios seleccionados. " +
    "Las partes suman 100% antes del redondeo. No representan cuotas de mercado ni de ventas." :
    "No hay registros seleccionados.";

  distributionCharts();
  scatterChart();

  const comparison = promotions.map(label => {
    const rows = visible.filter(row => row.promo === label && Number.isFinite(row.sales));
    return { label, value: mean(rows.map(r => r.sales)), n: rows.length };
  }).filter(item => item.n);

  barChart("comparisonChart", comparison, "Promoción principal", "Ventas promedio (C$)");
  $("comparisonText").textContent = comparison.length ?
    comparison.map(item => `${item.label}: C$ ${fmt(item.value)} (n=${item.n})`).join("; ") +
    ". Las diferencias son descriptivas: los grupos pueden tener distintos tamaños, " +
    "sectores y niveles previos de ventas. La comparación no demuestra que una promoción sea mejor." :
    "No hay datos para comparar.";
}

function renderConclusions() {
  if (!visible.length) {
    $("conclusions").textContent =
      "La selección está vacía. Limpia los filtros para recuperar los análisis.";
    return;
  }

  const growCount = visible.filter(r => r.grew === "Creció").length;
  $("conclusions").innerHTML = `<p>
    En los ${visible.length} negocios seleccionados, las ventas mensuales promedio
    son C$ ${fmt(mean(values("sales")))} y el gasto publicitario promedio es
    C$ ${fmt(mean(values("ad")))}.
    ${growCount} negocios (${fmt(100 * growCount / visible.length)}%)
    aumentaron sus ventas respecto al mes anterior.
    El cambio porcentual promedio por negocio es ${fmt(mean(values("growth")))}%.
    Este promedio no equivale al cambio porcentual de las ventas totales.
  </p><p>
    ${model ?
      `Para las variables seleccionadas, Pearson es ${fmt(model.r, 3)}
      y R² es ${fmt(model.r2, 3)}. Estos resultados describen una asociación
      lineal dentro de la selección.` :
      "No hay un modelo de regresión válido para la selección actual."}
    Antes de tomar decisiones comerciales se necesitan datos reales,
    revisión de calidad y un diseño de investigación adecuado.
  </p>`;
}

function downloadCSV() {
  const columns = [{ key: "id", label: "Negocio" }, ...allVariables];
  const quote = value => {
    let s = value == null ? "" : String(value);
    if (/^[=+@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const rows = [
    columns.map(v => v.key),
    ...visible.map(row => columns.map(v => row[v.key]))
  ];

  const csv = "\uFEFF" + rows.map(row => row.map(quote).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "datos_sinteticos_publicidad_promociones_ventas.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("status").textContent =
    `Se exportaron ${visible.length} registros sintéticos de la selección actual.`;
}

setup();