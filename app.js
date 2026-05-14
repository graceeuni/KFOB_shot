const FORMATS_ROOT = document.getElementById("formats-root");
const EPISODE_PICKER = document.getElementById("episode-picker");
const HERO_TITLE = document.getElementById("hero-title");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brLines(text) {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

/** 콘티 셀용: 통일 규칙 후 줄바꿈/HTML 이스케이프 */
function fmtContiText(text) {
  const u = unifyCoverTitlePhrasing(text == null ? "" : String(text));
  if (!u) return "";
  return brLines(u);
}

function segmentHasContent(seg) {
  if (!seg || typeof seg !== "object") return false;
  return Boolean(
    String(seg.subtitle || "").trim() ||
      String(seg.imageDescription || "").trim() ||
      String(seg.narration || "").trim()
  );
}

function sceneTitlesDistinct(docTitle, headline) {
  return compactKey(docTitle) !== compactKey(headline);
}

function renderContiSegment(seg, index, total) {
  const idxLabel =
    total > 1
      ? `<div class="conti-seg__idx">${escapeHtml(`세부 블록 ${index + 1} / ${total}`)}</div>`
      : "";

  const blocks = [];
  if (seg.subtitle) {
    blocks.push(
      `<section class="conti-seg__block"><h5 class="conti-seg__label">자막</h5><div class="conti-seg__body">${fmtContiText(seg.subtitle)}</div></section>`
    );
  }
  if (seg.imageDescription) {
    blocks.push(
      `<section class="conti-seg__block"><h5 class="conti-seg__label">이미지</h5><div class="conti-seg__body conti-seg__body--image">${fmtContiText(seg.imageDescription)}</div></section>`
    );
  }
  if (seg.narration) {
    blocks.push(
      `<section class="conti-seg__block"><h5 class="conti-seg__label">나레이션</h5><div class="conti-seg__body">${fmtContiText(seg.narration)}</div></section>`
    );
  }

  return `<article class="conti-seg">${idxLabel}${blocks.join("")}</article>`;
}

function renderContiTimeMeta(row) {
  const range = escapeHtml(row.time || "");
  const len = row.length ? `<span class="conti-cut__len">${escapeHtml(row.length)}</span>` : "";
  return `<div class="conti-cut__time-meta"><span class="conti-cut__range">${range}</span>${len}</div>`;
}

function renderContiCutHeading(titleHtml) {
  if (!titleHtml) return "";
  return `<h4 class="conti-cut__heading">${titleHtml}</h4>`;
}

/** 컷 번호 패딩 (01 유지, 1 → 01) */
function contiCutNumberPadded(row) {
  const raw = String(row.cut ?? "").trim().replace(/^0+(?=\d)/, "") || row.cut;
  const n = raw.replace(/\D/g, "") || raw;
  return String(n).length >= 2 ? String(n) : `0${n}`;
}

/** 에피소드 id → 콘티 이미지 파일 접두 (shortform-brief/conti/) */
const CONTI_EP_PREFIX = { ep1: "SF1", ep2: "SF2", ep3: "SF3" };

/** 컷 번호 표시 (01 → S#01) */
function contiCutBadge(row) {
  return `S#${contiCutNumberPadded(row)}`;
}

/**
 * conti/SF1-S#02.png 형태 파일을 로드 (#는 URL 인코딩).
 * SF1-S02.png 같은 대체 이름도 순서대로 시도.
 * 숨겨진 패널 안에서는 lazy 로드가 건너뛰어지는 경우가 있어 eager 사용.
 */
function renderContiCutFigure(epId, row) {
  const prefix = CONTI_EP_PREFIX[epId];
  if (!prefix) return "";
  const padded = contiCutNumberPadded(row);
  const stems = [`${prefix}-S#${padded}`, `${prefix}-S${padded}`];
  const urls = [];
  const exts = ["png", "webp", "jpg", "jpeg"];
  for (const stem of stems) {
    const encStem = encodeURIComponent(stem);
    for (const ext of exts) {
      urls.push(`./conti/${encStem}.${ext}`);
    }
  }
  const primary = urls[0];
  const chainJson = escapeHtml(JSON.stringify(urls));
  const badge = contiCutBadge(row);
  const alt = String(row.subtitle || row.docSceneTitle || "").trim() || badge;
  const img = `<img src="${escapeHtml(primary)}" alt="${escapeHtml(alt)}" class="conti-cut__img" loading="eager" decoding="async" data-conti-src-chain="${chainJson}" onerror="(function(el){try{var q=JSON.parse(el.getAttribute('data-conti-src-chain'));var i=(parseInt(el.dataset.contiChainIdx,10)||0)+1;if(i>=q.length)throw 1;el.dataset.contiChainIdx=String(i);el.src=q[i];return;}catch(_){}var fig=el.closest('figure');if(fig)fig.classList.add('conti-cut__figure--missing');})(this)" />`;
  return `<figure class="conti-cut__figure">${img}</figure>`;
}

/** locationTime에서 "장소 / 시간대" 형태일 때 앞부분만 장소로 사용 */
function contiPlaceFromLocationTime(locationTime) {
  const s = String(locationTime || "").trim();
  if (!s) return "";
  const sep = " / ";
  const i = s.indexOf(sep);
  if (i === -1) return s;
  return s.slice(0, i).trim();
}

/** 세그먼트 사운드를 한 줄로 병합 */
function contiSoundsJoined(row) {
  const segs = Array.isArray(row.segments) ? row.segments : [];
  const sounds = segs.map((seg) => String(seg.sound || "").trim()).filter(Boolean);
  if (!sounds.length) return "";
  return sounds.join(" · ");
}

/** 컷 단위 러닝타임 한 줄 (시간 + 길이) */
function contiTimeSummaryLine(row) {
  const t = String(row.time || "").trim();
  const len = String(row.length || "").trim();
  if (t && len) return `${t} (${len})`;
  return t || len || "";
}

/** 장소, 비고, 사운드, 시간, 씬 카드 — 이미지 옆 메타 블록 */
function renderContiMetaAside(row) {
  const parts = [];
  const place = contiPlaceFromLocationTime(row.locationTime);
  if (place) {
    parts.push(
      `<div class="conti-o__line"><span class="conti-o__k">장소</span><div class="conti-o__v">${fmtContiText(place)}</div></div>`
    );
  }
  if (row.imageDescription) {
    parts.push(
      `<div class="conti-o__line"><span class="conti-o__k">비고</span><div class="conti-o__v">${fmtContiText(row.imageDescription)}</div></div>`
    );
  }
  const sounds = contiSoundsJoined(row);
  if (sounds) {
    parts.push(
      `<div class="conti-o__line"><span class="conti-o__k">사운드</span><div class="conti-o__v">${fmtContiText(sounds)}</div></div>`
    );
  }
  const timeLine = contiTimeSummaryLine(row);
  if (timeLine) {
    parts.push(
      `<div class="conti-o__line"><span class="conti-o__k">시간</span><div class="conti-o__v">${fmtContiText(timeLine)}</div></div>`
    );
  }
  if (row.docSceneTitle && sceneTitlesDistinct(row.docSceneTitle, row.subtitle)) {
    parts.push(
      `<div class="conti-o__line"><span class="conti-o__k">씬 카드</span><div class="conti-o__v">${fmtContiText(row.docSceneTitle)}</div></div>`
    );
  }
  if (!parts.length) return "";
  return `<div class="conti-overview conti-overview--aside">${parts.join("")}</div>`;
}

function renderContiVisualRow(epId, row) {
  const figureHtml = renderContiCutFigure(epId, row);
  const asideHtml = renderContiMetaAside(row);
  if (!figureHtml && !asideHtml) return "";
  return `<div class="conti-cut__visual-row">${figureHtml}${asideHtml}</div>`;
}

/** 단일 컷 카드 (표 행 대신 카드 단위로 분리) */
function renderContiCutCard(epId, row) {
  const segs = Array.isArray(row.segments) ? row.segments : [];
  const hasSegments = segs.some(segmentHasContent);
  const cutId = `conti-${escapeHtml(epId)}-cut-${escapeHtml(row.cut)}`;
  const badge = escapeHtml(contiCutBadge(row));

  if (!hasSegments) {
    const titleHtml = fmtContiText(row.subtitle || "");
    const nar = fmtContiText(row.narration || "");
    const body = `
      <div class="conti-cut__flat">
        ${
          nar
            ? `<section class="conti-cut__field"><h5 class="conti-cut__field-label">나레이션</h5><div class="conti-cut__field-body">${nar}</div></section>`
            : ""
        }
      </div>`;
    return `
      <article class="conti-cut" id="${cutId}" data-cut="${escapeHtml(row.cut)}">
        <header class="conti-cut__head">
          <span class="conti-cut__badge">${badge}</span>
          ${renderContiTimeMeta(row)}
        </header>
        ${renderContiCutHeading(titleHtml)}
        ${renderContiVisualRow(epId, row)}
        ${body}
      </article>`;
  }

  const filledSegs = segs.filter(segmentHasContent);
  const segBlocks = filledSegs
    .map((s, i) => renderContiSegment(s, i, filledSegs.length))
    .join("");

  const titleHtml = fmtContiText(row.subtitle || "");

  return `
    <article class="conti-cut conti-cut--detail" id="${cutId}" data-cut="${escapeHtml(row.cut)}">
      <header class="conti-cut__head">
        <span class="conti-cut__badge">${badge}</span>
        ${renderContiTimeMeta(row)}
      </header>
      ${renderContiCutHeading(titleHtml)}
      ${renderContiVisualRow(epId, row)}
      <div class="conti-cut__body">
        <div class="conti-segments">${segBlocks}</div>
      </div>
    </article>`;
}

function renderContiPanel(ep) {
  if (!ep.conti || !ep.conti.length) return "";
  const panelId = `conti-panel-${ep.id}`;
  const cuts = ep.conti
    .map((row) => enrichContiCoverTitleRow(ep, row))
    .map((row) => renderContiCutCard(ep.id, row))
    .join("");
  return `
    <div class="conti-section">
      <button type="button" class="btn-conti" aria-expanded="false" aria-controls="${escapeHtml(panelId)}">
        콘티 보기
      </button>
      <div class="conti-panel" id="${escapeHtml(panelId)}" hidden>
        <p class="conti-hint">
          아래는 <strong>컷(S#)마다 카드가 나뉘어</strong> 있으며, DOCX 세부 표의 <strong>자막·이미지·나레이션</strong>이 블록 단위로 들어 있습니다. 장소·비고·사운드·시간 등 요약은 <strong>이미지 옆</strong>에서 확인할 수 있습니다.
        </p>
        <div class="conti-cuts-stack">${cuts}</div>
      </div>
    </div>`;
}
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

/** 기본 정보 표에서 항목 값 */
function basicInfoValue(ep, label) {
  const row = ep.basicInfo?.find((r) => r.label === label);
  return row?.value ? String(row.value).trim() : "";
}

function compactKey(s) {
  return String(s || "").replace(/\s+/g, "");
}

function coverHeadlineForEp(ep) {
  const ct = basicInfoValue(ep, "커버 타이틀");
  if (ct) return ct;
  return basicInfoValue(ep, "제목");
}

/** S#01 커버 타이틀 씬에 커버 헤드라인 블록 삽입 */
function enrichScenesWithCoverTitle(ep, scenes) {
  const headline = coverHeadlineForEp(ep);
  if (!headline || !Array.isArray(scenes)) return scenes;

  return scenes.map((scene) => {
    const heading = scene.heading || "";
    if (!/^S#01\b/i.test(heading)) return scene;
    const blob = JSON.stringify(scene.blocks || []);
    if (blob.includes(headline)) return scene;

    const blocks = [...(scene.blocks || [])];
    const lenIdx = blocks.findIndex((b) => b.label === "길이");
    const idx = lenIdx >= 0 ? lenIdx + 1 : 0;
    blocks.splice(idx, 0, {
      label: "커버 타이틀",
      quote: true,
      text: headline,
    });
    return { ...scene, blocks };
  });
}

/** 콘티 01컷 자막·이미지 설명 상단에 커버 헤드라인 노출 (이미 포함돼 있으면 생략) */
function enrichContiCoverTitleRow(ep, row) {
  const headline = coverHeadlineForEp(ep);
  const cut = String(row.cut ?? "").replace(/^0+/, "") || "0";
  if (!headline || cut !== "1") return row;

  let subtitle = row.subtitle || "";
  let imageDescription = row.imageDescription || "";
  const hk = compactKey(headline);

  if (!compactKey(subtitle).includes(hk)) {
    subtitle = `${headline}\n${subtitle}`.trim();
  }
  if (!compactKey(imageDescription).includes(hk)) {
    imageDescription = imageDescription
      ? `${headline}\n${imageDescription}`.trim()
      : headline;
  }

  return { ...row, subtitle, imageDescription };
}

function renderBasicTable(rows) {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(unifyCoverTitlePhrasing(r.label))}</td><td>${escapeHtml(unifyCoverTitlePhrasing(r.value))}</td></tr>`
    )
    .join("");
  return `
    <div class="table-wrap">
      <h3 class="section-title">기본 정보</h3>
      <table class="info-table">
        <thead><tr><th>항목</th><th>내용</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderBlock(block) {
  let inner = "";
  if (block.quote && block.text) {
    inner += `<blockquote class="block__quote">${brLines(block.text)}</blockquote>`;
  } else if (block.pre && block.text) {
    inner += `<pre class="block__pre">${escapeHtml(block.text)}</pre>`;
  } else if (block.text) {
    inner += `<div class="block__text">${brLines(block.text)}</div>`;
  }
  if (block.bullets && block.bullets.length) {
    const lis = block.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
    inner += `<ul class="block__bullets">${lis}</ul>`;
  }
  return `
    <div class="block">
      <div class="block__label">${escapeHtml(unifyCoverTitlePhrasing(block.label))}</div>
      ${inner}
    </div>`;
}

function renderScene(scene) {
  const tag = scene.tagline
    ? `<p class="scene__tagline">${escapeHtml(scene.tagline)}</p>`
    : "";
  const range = scene.range
    ? `<span class="scene__range">${escapeHtml(scene.range)}</span>`
    : "";
  const blocks = scene.blocks.map(renderBlock).join("");
  return `
    <section class="scene">
      <header class="scene__head">
        <h4 class="scene__heading">${escapeHtml(unifyCoverTitlePhrasing(scene.heading))}</h4>
        ${range}
        ${tag}
      </header>
      <div class="scene__body">${blocks}</div>
    </section>`;
}

function renderEpisodeCard(ep) {
  const scenes = enrichScenesWithCoverTitle(ep, ep.scenes).map(renderScene).join("");
  const notes = ep.productionNotes
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("");
  const conti = renderContiPanel(ep);
  return `
    <article class="card card--episode" id="${escapeHtml(ep.id)}">
      <header class="card__head">
        <span class="card__badge">${escapeHtml(ep.order)}</span>
        <h2 class="card__title">${escapeHtml(ep.theme)}</h2>
      </header>
      <div class="card__body">
        ${renderBasicTable(ep.basicInfo)}
        <div class="scene-stack">
          <h3 class="section-title">씬별 상세 콘티</h3>
          ${scenes}
        </div>
        <div class="notes">
          <h3 class="section-title">제작 핵심 포인트</h3>
          <ul class="list-check">${notes}</ul>
        </div>
        ${conti}
      </div>
    </article>`;
}

function renderEpisodeShell(ep) {
  return `
    <div class="episode-shell" id="shell-${escapeHtml(ep.id)}" data-episode="${escapeHtml(ep.id)}" hidden>
      ${renderEpisodeCard(ep)}
    </div>`;
}

function renderEpisodePicker(episodes) {
  EPISODE_PICKER.innerHTML = episodes
    .map(
      (ep) =>
        `<button type="button" class="episode-picker__btn" data-episode="${escapeHtml(ep.id)}" aria-expanded="false" aria-controls="shell-${escapeHtml(ep.id)}">${escapeHtml(ep.order)}</button>`
    )
    .join("");
}

function wireEpisodePicker(episodes) {
  const buttons = EPISODE_PICKER.querySelectorAll(".episode-picker__btn");

  function collapseAll() {
    FORMATS_ROOT.querySelectorAll(".episode-shell").forEach((el) => {
      el.hidden = true;
    });
    buttons.forEach((b) => {
      b.classList.remove("is-selected");
      b.setAttribute("aria-expanded", "false");
    });
    document.body.classList.remove("has-episode-open");
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-episode");
      const shell = document.getElementById(`shell-${id}`);
      if (!shell) return;

      const isSelected = btn.classList.contains("is-selected");
      if (isSelected) {
        collapseAll();
        return;
      }

      FORMATS_ROOT.querySelectorAll(".episode-shell").forEach((el) => {
        el.hidden = el.getAttribute("data-episode") !== id;
      });
      buttons.forEach((b) => {
        const on = b.getAttribute("data-episode") === id;
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-expanded", on ? "true" : "false");
      });
      document.body.classList.add("has-episode-open");
      shell.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function loadBrief() {
  try {
    const res = await fetch("./data/brief.json", { cache: "no-store" });
    if (res.ok) return res.json();
  } catch (_) {
    /* file:// 등 */
  }
  if (typeof window.EMBEDDED_BRIEF !== "undefined") return window.EMBEDDED_BRIEF;
  throw new Error("기획 데이터를 불러올 수 없습니다.");
}

function wireActions() {
  document.getElementById("btn-print").addEventListener("click", () => {
    window.print();
  });

  document.getElementById("btn-share").addEventListener("click", async () => {
    const url = window.location.href.split("#")[0];
    try {
      await navigator.clipboard.writeText(url);
      alert("페이지 주소가 클립보드에 복사되었습니다.");
    } catch {
      prompt("아래 주소를 복사해 공유하세요:", url);
    }
  });
}

function wireContiToggles() {
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-conti");
    if (!btn) return;
    const panelId = btn.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) return;
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", expanded ? "false" : "true");
    panel.hidden = expanded;
    if (!expanded) {
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
}

function applyHero(project) {
  HERO_TITLE.textContent = project.title;
  document.title = `${project.title} · 웹 뷰어`;
}

async function main() {
  wireActions();
  wireContiToggles();
  try {
    const data = await loadBrief();
    const { project, episodes } = data;
    applyHero(project);
    renderEpisodePicker(episodes);
    FORMATS_ROOT.innerHTML = episodes.map(renderEpisodeShell).join("");
    wireEpisodePicker(episodes);
  } catch (e) {
    FORMATS_ROOT.innerHTML = `<p class="load-error">${escapeHtml(e.message)}</p>`;
    console.error(e);
  }
}

main();
