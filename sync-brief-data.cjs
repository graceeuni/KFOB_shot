const fs = require("fs");
const path = require("path");

/** MD 원문에서 생성 시: node build-brief-from-md.cjs 후 이 스크립트 실행. DOCX 콘티 반영 시 그 다음에 node merge-conti-from-docx.cjs 후 다시 실행. */

const root = __dirname;
const briefPath = path.join(root, "data", "brief.json");
const outPath = path.join(root, "brief-data.js");

const data = JSON.parse(fs.readFileSync(briefPath, "utf8"));
fs.writeFileSync(
  outPath,
  `window.EMBEDDED_BRIEF = ${JSON.stringify(data, null, 2)};\n`
);
console.log("Wrote", outPath);
