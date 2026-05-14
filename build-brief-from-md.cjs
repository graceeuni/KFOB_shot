/**
 * data/2안_기획서 .md → data/brief.json (웹 뷰어 스키마)
 * 실행 후: node sync-brief-data.cjs
 * DOCX 콘티를 쓰는 경우: 위 실행 후 node merge-conti-from-docx.cjs → sync 재실행
 */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dataDir = path.join(root, "data");

function findPlanMd() {
  const exact = path.join(dataDir, "2안_기획서 .md");
  if (fs.existsSync(exact)) return exact;
  const files = fs.readdirSync(dataDir);
  const hit = files.find((f) => /^2안_기획서\s*\.md$/u.test(f));
  if (hit) return path.join(dataDir, hit);
  throw new Error("data 폴더에서 2안_기획서 .md 파일을 찾을 수 없습니다.");
}

function stripBold(s) {
  return String(s).replace(/\*\*(.+?)\*\*/g, "$1").trim();
}

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

function parseTableRows(tableText) {
  const lines = tableText.split("\n").filter((l) => /^\|/.test(l.trim()));
  if (lines.length < 2) return { headers: [], rows: [] };

  const cells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => stripBold(c.trim()));

  const headers = cells(lines[0]);
  let start = 1;
  if (/^:?-+:?\|/.test(lines[1].replace(/\s/g, "")) || /^\|[\s:|_-]+\|/.test(lines[1]))
    start = 2;

  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const row = cells(lines[i]);
    if (row.length !== headers.length) continue;
    const obj = {};
    headers.forEach((h, j) => {
      obj[h] = row[j];
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function sliceBetween(src, startPat, endPat, startOffset = 0) {
  let i = src.indexOf(startPat, startOffset);
  if (i < 0) return "";
  i += startPat.length;
  const j = endPat ? src.indexOf(endPat, i) : -1;
  return (j < 0 ? src.slice(i) : src.slice(i, j)).trim();
}

function extractEpisodeBlock(md, num) {
  const head = `### 3-${num}.`;
  const start = md.indexOf(head);
  if (start < 0) return "";
  let end = md.length;
  if (num < 3) {
    const next = md.indexOf(`### 3-${num + 1}.`, start + 1);
    if (next >= 0) end = next;
  } else {
    const next = md.indexOf("\n## 4.", start + 1);
    if (next >= 0) end = next;
  }
  return md.slice(start, end);
}

function extractPipeTableAfter(marker, block) {
  const rest = block.slice(block.indexOf(marker) + marker.length);
  const lines = [];
  for (const line of rest.split("\n")) {
    const t = line.trim();
    if (!t) {
      if (lines.length) break;
      continue;
    }
    if (/^\|/.test(t)) lines.push(line);
    else if (lines.length) break;
  }
  return parseTableRows(lines.join("\n"));
}

function overviewFromEpisode(block) {
  return sliceBetween(block, "#### 영상 개요", "#### 타임라인 구조").replace(/^###?\s*/gm, "").trim();
}

/** 나레이션을 S# 기준으로 묶어 컷 번호(패딩 2자리) → 문단 배열 */
function narrationChunksByCut(block) {
  const raw = sliceBetween(block, "#### 나레이션 전문", "#### 핵심 데이터 출처");
  const flat = raw
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trim())
    .join("\n")
    .trim();
  if (!flat) return new Map();

  const map = new Map();
  const re = /\*\*\(S#([^)]+)\)\*\*\s*([\s\S]*?)(?=\*\*\(S#|$)/g;
  let m;
  while ((m = re.exec(flat)) !== null) {
    const idRaw = m[1].trim();
    const body = stripBold(m[2].trim());
    if (!body) continue;
    const mainCut = idRaw.split("-")[0];
    const key = padCut(mainCut);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(body);
  }
  return map;
}

function padCut(s) {
  const n = String(s || "").replace(/\D/g, "");
  if (!n) return "";
  return n.length >= 2 ? n : `0${n}`;
}

function timelineToScenesAndConti(block, narrationByCut) {
  const tableTextStart = block.indexOf("#### 타임라인 구조");
  const tableTextEnd = block.indexOf("#### 나레이션 전문", tableTextStart);
  const chunk =
    tableTextEnd > tableTextStart ? block.slice(tableTextStart, tableTextEnd) : block.slice(tableTextStart);
  const { rows } = extractPipeTableAfter("", chunk);

  const scenes = [];
  const conti = [];

  for (const row of rows) {
    const sHash = (row["S#"] || "").trim();
    const title = unifyCoverTitlePhrasing(stripBold(row["제목"] || ""));
    const time = stripBold(row["시간"] || "");
    const dur = stripBold(row["길이"] || "");
    const hook = unifyCoverTitlePhrasing(stripBold(row["핵심 연출"] || ""));

    if (/TOTAL/i.test(title)) continue;
    if (!sHash && !title) continue;

    const sceneHeading = unifyCoverTitlePhrasing(
      `${sHash ? `S#${sHash}` : "구간"} ${title}`.trim()
    );
    const range = time.replace(/~/g, " ~ ");

    const blocks = [
      ...(dur ? [{ label: "길이", text: dur }] : []),
      { label: "핵심 연출", text: hook || "(연출 없음)" },
    ];

    const cut = padCut(sHash);
    if (cut && narrationByCut?.has(cut)) {
      const parts = narrationByCut.get(cut).filter(Boolean);
      const narrText = parts.join("\n\n").trim();
      if (narrText)
        blocks.push({ label: "나레이션", quote: true, text: narrText });
    }

    scenes.push({
      heading: sceneHeading,
      range,
      blocks,
    });

    if (cut) {
      conti.push({
        cut,
        time: time.replace(/~/g, "–"),
        length: dur || undefined,
        subtitle: title,
        imageDescription: hook,
        docSceneTitle: "",
        locationTime: "",
        segments: [],
        narration: "",
      });
    }
  }

  return { scenes, conti };
}

function comparisonByEpisode(md) {
  const sec = sliceBetween(md, "## 2. 3편 총괄 비교표", "## 3.");
  const { headers, rows } = parseTableRows(sec.split("\n").filter((l) => /^\|/.test(l)).join("\n"));

  const colEp = ["ep1", "ep2", "ep3"];
  const idxByEp = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (/1편/.test(h)) idxByEp.ep1 = i;
    else if (/2편/.test(h)) idxByEp.ep2 = i;
    else if (/3편/.test(h)) idxByEp.ep3 = i;
  }

  const out = { ep1: [], ep2: [], ep3: [] };

  const labelMap = {
    영상제목: "제목",
    "영상 제목": "제목",
    러닝타임: "러닝타임",
    SDGs: "SDGs",
    타겟: "타겟",
    톤앤무드: "톤앤무드",
    "톤 앤 무드": "톤앤무드",
    HOOK: "커버 타이틀",
    "HOOK (커버 타이틀)": "커버 타이틀",
    핵심수치: "핵심 수치",
    "핵심 수치": "핵심 수치",
    감성키워드: "감성 키워드",
    "감성 키워드": "감성 키워드",
    CTA: "CTA",
    해시태그: "해시태그",
  };

  for (const row of rows) {
    const 구분 = stripBold(row["구분"] || "");
    const norm = 구분.replace(/\s+/g, "");
    let label =
      labelMap[구분] ||
      labelMap[norm] ||
      구분.replace(/\*\*/g, "").replace(/\(커버타이틀\)/i, "(커버 타이틀)");

    label = unifyCoverTitlePhrasing(label);

    if (!label || /^구분$/i.test(label)) continue;

    for (const ep of colEp) {
      const idx = idxByEp[ep];
      if (idx == null) continue;
      const headersKeys = Object.keys(row);
      const val =
        row[headers[idx]] ??
        row[headersKeys[idx]];
      const value = stripBold(val || "").trim();
      if (value) out[ep].push({ label, value });
    }
  }

  return out;
}

function projectTitle(md) {
  const lines = md.split("\n");
  const h1 = (lines.find((l) => /^#\s+/.test(l)) || "").replace(/^#\s+/, "").trim();
  const h2 = (lines.find((l) => /^##\s+/.test(l)) || "").replace(/^##\s+/, "").trim();
  if (h1 && h2) return `${h1} · ${h2}`;
  return h1 || h2 || "숏폼 기획서";
}

function commonHashtags(md) {
  const block = sliceBetween(md, "**공통 해시태그:**", "**편별 해시태그:**");
  const line = block.split("\n").find((l) => /^#/.test(l.trim()));
  return line ? line.trim() : "";
}

function main() {
  const mdPath = findPlanMd();
  const md = fs.readFileSync(mdPath, "utf8").replace(/\r\n/g, "\n");

  const compare = comparisonByEpisode(md);
  const hashtags = commonHashtags(md);

  const episodes = [1, 2, 3].map((num) => {
    const block = extractEpisodeBlock(md, num);
    const themeLine =
      (block.match(new RegExp(`###\\s*3-${num}\\.\\s*(.+)`)) || [])[1]?.trim() || `숏폼 ${num}편`;

    const overview = overviewFromEpisode(block);
    const narrByCut = narrationChunksByCut(block);
    const { scenes: tlScenes, conti } = timelineToScenesAndConti(block, narrByCut);

    const scenes = [...tlScenes];

    const epKey = `ep${num}`;
    const basicInfo = compare[epKey] || [];

    const notes = [];
    if (overview) notes.push(overview);

    return {
      id: epKey,
      order: `숏폼 ${num}편`,
      theme: themeLine,
      basicInfo,
      scenes,
      productionNotes: notes.length ? notes : ["—"],
      conti,
    };
  });

  const brief = {
    project: {
      title: projectTitle(md),
      summary: `원문 기준: ${path.basename(mdPath)} — 수정 후 이 파일을 다시 빌드하세요.`,
      meta: [
        ...(hashtags ? [{ label: "공통 해시태그", value: hashtags }] : []),
        { label: "원문 파일", value: path.basename(mdPath) },
      ],
    },
    episodes,
  };

  const outPath = path.join(dataDir, "brief.json");
  fs.writeFileSync(outPath, `${JSON.stringify(brief, null, 2)}\n`);
  console.log("Wrote", outPath, "from", path.basename(mdPath));
}

main();
