/**
 * data/*.docx 콘티 표 → data/brief.json 의 episodes[].conti 반영
 * 이후: node sync-brief-data.cjs
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = __dirname;
const dataDir = path.join(root, "data");

const DOCX_BY_EP = {
  ep1: "숏폼1_사회혁신기업_콘티_수정.docx",
  ep2: "숏폼2_메세나문화예술_콘티_수정.docx",
  ep3: "숏폼3_금융교육_콘티_수정.docx",
};

/** HOOK·괄호 혼용을 한글 '커버 타이틀' 중심으로 통일 */
function unifyCoverTitlePhrasing(str) {
  if (str == null || str === "") return str;
  let s = String(str);
  s = s.replace(/\bHOOK\s*\(\s*커버\s*타이틀\s*\)/gi, "커버 타이틀");
  s = s.replace(/\bS#(\d+)\s+HOOK\s+커버\s*타이틀\b/gi, "S#$1 커버 타이틀");
  s = s.replace(/^HOOK\s+커버\s*타이틀\b/gim, "커버 타이틀");
  s = s.replace(/^HOOK\s*[—–]\s*/gm, "커버 타이틀 · ");
  s = s.replace(/^커버\s*타이틀\s*[—–]\s*/gm, "커버 타이틀 · ");
  return s;
}

function readDocumentXml(docxPath) {
  const abs = path.resolve(docxPath);
  if (!fs.existsSync(abs)) throw new Error(`파일 없음: ${abs}`);
  return execFileSync("unzip", ["-p", abs, "word/document.xml"], {
    encoding: "utf8",
    maxBuffer: 25 * 1024 * 1024,
  });
}

function cellText(tcXml) {
  let s = "";
  /** `<w:t` 단독 태그만 잡기 — `<w:tcPr>` 등에 붙는 부분 매칭 방지 */
  const re = /<w:t(?=[\s/>])(?:[^>]*)>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = re.exec(tcXml)) !== null) {
    s += m[1];
  }
  return s.replace(/\r/g, "").trim();
}

function parseRowCells(trInner) {
  const cells = [];
  const tcRe = /<w:tc(?=\s|>)(?:[^>]*)>([\s\S]*?)<\/w:tc>/g;
  let m;
  while ((m = tcRe.exec(trInner)) !== null) {
    cells.push(cellText(m[1]));
  }
  return cells;
}

function parseAllTables(xml) {
  const tables = [];
  const tblRe = /<w:tbl(?=\s|>)(?:[^>]*)>([\s\S]*?)<\/w:tbl>/g;
  let tm;
  while ((tm = tblRe.exec(xml)) !== null) {
    const tblInner = tm[1];
    const trRe = /<w:tr(?=\s|>)(?:[^>]*)>([\s\S]*?)<\/w:tr>/g;
    const rows = [];
    let trm;
    while ((trm = trRe.exec(tblInner)) !== null) {
      rows.push(parseRowCells(trm[1]));
    }
    tables.push(rows);
  }
  return tables;
}

function findMainContiTableRows(tables) {
  for (const rows of tables) {
    if (!rows.length) continue;
    const h = rows[0].map((c) => (c || "").trim());
    if (h[0] === "S#" && h[1] === "제목") return rows;
  }
  return null;
}

function normalizeCutKey(numStr) {
  let k = String(numStr);
  if (k.length < 2) k = `0${k}`;
  return k;
}

/** `S# 01` / `S#01` / `S# 01S# 01` 등에서 컷 번호 추출 */
function cutKeyFromMarkerCell(cell) {
  const m = String(cell || "").match(/(\d+)/);
  return m ? normalizeCutKey(m[1]) : null;
}

/**
 * 씬 카드 표 (2행): [S#*, 제목, 긴 제목] + [, 장소/시간, 값]
 */
function extractSceneCardMetaByCut(tables) {
  const meta = new Map();

  for (const rows of tables) {
    if (rows.length !== 2) continue;
    const r0 = rows[0].map((c) => (c || "").trim());
    if (r0[1] !== "제목" || !r0[0] || !/S#\s*\d/i.test(r0[0])) continue;

    const cut = cutKeyFromMarkerCell(r0[0]);
    if (!cut) continue;

    const docSceneTitle = (rows[0][2] || "").trim();
    const r1 = rows[1].map((c) => (c || "").trim());
    let locationTime = "";
    if (r1[1] === "장소/시간" && (r1[2] || "").trim()) locationTime = r1[2].trim();
    else if (r1[0] === "장소/시간" && (r1[1] || "").trim()) locationTime = r1[1].trim();

    meta.set(cut, { docSceneTitle, locationTime });
  }

  return meta;
}

function parseDetailSegmentTable(rows) {
  if (!rows.length) return null;
  const h = rows[0].map((c) => (c || "").trim());
  if (h[0] !== "자막" || h[1] !== "이미지" || h[2] !== "나레이션") return null;

  const main = rows[1] ? rows[1].map((c) => (c || "").trim()) : ["", "", ""];
  let sound = "";
  let timecode = "";

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i].map((c) => (c || "").trim());
    const key = r[0] || "";
    if (key === "사운드" && r[1]) sound = r[1];
    if (key === "시간" && r[1]) timecode = r[1];
  }

  return {
    subtitle: main[0] || "",
    imageDescription: main[1] || "",
    narration: main[2] || "",
    sound,
    timecode,
  };
}

/**
 * S# 씬 카드 다음에 이어지는 「자막·이미지·나레이션」 표들을 컷별로 순서대로 수집 (한 컷에 복수 표 허용)
 */
function extractDetailSegmentsByCut(tables) {
  const byCut = new Map();
  let currentCut = null;

  for (const rows of tables) {
    if (!rows.length) continue;
    const r0 = rows[0].map((c) => (c || "").trim());

    if (
      rows.length === 2 &&
      r0[1] === "제목" &&
      r0[0] &&
      /S#\s*\d/i.test(r0[0])
    ) {
      currentCut = cutKeyFromMarkerCell(r0[0]);
      continue;
    }

    const seg = parseDetailSegmentTable(rows);
    if (seg && currentCut) {
      if (!byCut.has(currentCut)) byCut.set(currentCut, []);
      byCut.get(currentCut).push(seg);
    }
  }

  return byCut;
}

function headerIndices(headers) {
  const idx = (label) => headers.findIndex((h) => (h || "").trim() === label);
  let si = idx("S#");
  let ti = idx("제목");
  let st = idx("시작");
  let en = idx("종료");
  let ln = idx("길이");
  let nt = idx("비고");
  if ([si, ti, st, en, ln, nt].some((i) => i < 0)) {
    si = 0;
    ti = 1;
    st = 2;
    en = 3;
    ln = 4;
    nt = 5;
  }
  return { si, ti, st, en, ln, nt };
}

function rowsToConti(rows) {
  const { si, ti, st, en, ln, nt } = headerIndices(rows[0]);
  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < Math.max(si, ti, st, en, nt) + 1) continue;

    const sRaw = (row[si] || "").trim();
    if (!/^S#\s*\d+/i.test(sRaw) && !/^\d{1,2}$/.test(sRaw)) continue;

    const title = (row[ti] || "").trim();
    const start = (row[st] || "").trim();
    const end = (row[en] || "").trim();
    if (/TOTAL/i.test(title)) continue;
    if (!title && !start && !end) continue;

    const cutMatch = sRaw.match(/(\d+)/);
    if (!cutMatch) continue;
    let cut = cutMatch[1];
    if (cut.length < 2) cut = `0${cut}`;

    const time = `${start}–${end}`;
    const subtitle = title;
    const imageDescription = (row[nt] || "").trim();
    const lengthStr = (row[ln] || "").trim();

    out.push({
      cut,
      time,
      length: lengthStr || undefined,
      subtitle: unifyCoverTitlePhrasing(subtitle),
      imageDescription: unifyCoverTitlePhrasing(imageDescription),
      docSceneTitle: "",
      locationTime: "",
      segments: [],
      narration: "",
    });
  }

  return out;
}

function extractContiFromDocx(docxPath) {
  const xml = readDocumentXml(docxPath);
  const tables = parseAllTables(xml);
  const mainRows = findMainContiTableRows(tables);
  if (!mainRows) throw new Error(`콘티 표(S# 헤더)를 찾을 수 없음: ${docxPath}`);
  const conti = rowsToConti(mainRows);
  const sceneMeta = extractSceneCardMetaByCut(tables);
  const detailByCut = extractDetailSegmentsByCut(tables);

  for (const row of conti) {
    const meta = sceneMeta.get(row.cut);
    if (meta) {
      row.docSceneTitle = unifyCoverTitlePhrasing(meta.docSceneTitle || "");
      row.locationTime = unifyCoverTitlePhrasing(meta.locationTime || "");
    }

    const rawSegs = detailByCut.get(row.cut) || [];
    row.segments = rawSegs.map((s) => ({
      subtitle: unifyCoverTitlePhrasing(s.subtitle),
      imageDescription: unifyCoverTitlePhrasing(s.imageDescription),
      narration: unifyCoverTitlePhrasing(s.narration),
      sound: s.sound ? unifyCoverTitlePhrasing(s.sound) : undefined,
      timecode: s.timecode ? unifyCoverTitlePhrasing(s.timecode) : undefined,
    }));

    const narJoined = row.segments.map((s) => s.narration).filter(Boolean).join("\n\n");
    row.narration = narJoined;
  }

  return conti;
}

function main() {
  const briefPath = path.join(dataDir, "brief.json");
  const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));

  for (const [epId, filename] of Object.entries(DOCX_BY_EP)) {
    const docxPath = path.join(dataDir, filename);
    const conti = extractContiFromDocx(docxPath);
    const ep = brief.episodes.find((e) => e.id === epId);
    if (!ep) throw new Error(`에피소드 없음: ${epId}`);
    ep.conti = conti;
    console.log(epId, filename, "→", conti.length, "rows");
  }

  fs.writeFileSync(briefPath, `${JSON.stringify(brief, null, 2)}\n`);
  console.log("Wrote", briefPath);
}

main();
