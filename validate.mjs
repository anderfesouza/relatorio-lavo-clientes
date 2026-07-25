// Valida report-core.js contra os relatorios reais do ~/Downloads.
// Uso: node validate.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("./report-core.js");

const DL = path.join(os.homedir(), "Downloads");
const files = fs.readdirSync(DL);

function acha(prefixo, us) {
  // pega o maior arquivo (evita exports truncados/vazios com mesmo prefixo)
  const cand = files.filter(f => f.startsWith(prefixo + "-" + us) && f.endsWith(".csv"))
    .map(f => path.join(DL, f));
  cand.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return cand[0] || null;
}

function parseHoje(dstr) {
  const [d, m, y] = dstr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

const alvos = files
  .map(f => (f.match(/^Clientes_LAVO_BETHA_(\d{2}-\d{2}-\d{4})\.csv$/) || [])[1])
  .filter(Boolean)
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort();

let okTotal = 0, falhaTotal = 0;
for (const d of alvos) {
  const us = d.replace(/-/g, "_");
  const pc = acha("customerReport", us);
  const ps = acha("salesReport", us);
  const po = path.join(DL, `Clientes_LAVO_BETHA_${d}.csv`);
  if (!pc || !ps) continue;

  const out = R.gerar(
    fs.readFileSync(pc, "utf8"),
    fs.readFileSync(ps, "utf8"),
    parseHoje(d)
  );
  const esperado = fs.readFileSync(po, "utf8");

  if (out.csv === esperado) {
    console.log(`  OK  ${d}  (${out.linhas} clientes, byte-identico)`);
    okTotal++;
    continue;
  }

  // diff detalhado por campo
  const A = R.leCSV(out.csv), B = R.leCSV(esperado);
  const mapA = {}, mapB = {};
  A.forEach(r => mapA[r.Documento.replace(/\D/g, "")] = r);
  B.forEach(r => mapB[r.Documento.replace(/\D/g, "")] = r);
  const comuns = Object.keys(mapA).filter(k => mapB[k]);
  const cont = {};
  const ex = {};
  for (const k of comuns) {
    for (const col of R.COLUNAS) {
      const a = (mapA[k][col] || "").trim(), b = (mapB[k][col] || "").trim();
      if (a !== b) {
        cont[col] = (cont[col] || 0) + 1;
        if (!ex[col]) ex[col] = `${mapB[k].Nome}: gerado=${JSON.stringify(a)} esperado=${JSON.stringify(b)}`;
      }
    }
  }
  const cols = Object.keys(cont);
  if (!cols.length && A.length !== B.length) {
    console.log(`  DIF ${d}  linhas ${A.length} vs ${B.length} (contagem)`);
  } else {
    console.log(`  DIF ${d}  ${cols.map(c => `${c}:${cont[c]}`).join(", ")}`);
    for (const c of cols) console.log(`         ${c} -> ${ex[c]}`);
  }
  falhaTotal++;
}
console.log(`\n${okTotal} byte-identicos, ${falhaTotal} com diferenca.`);
