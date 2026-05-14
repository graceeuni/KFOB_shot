'use strict';
const fs = require('fs');
const path = require('path');

// ─── Style Constants ───────────────────────────────────────────────────────────
const STYLE_PREFIX =
  '3D clay render, Pixar animation movie style, soft plasticine clay material, ' +
  'rounded smooth shapes, warm cinematic studio lighting, subsurface scattering on skin, ' +
  'vibrant saturated colors, playful cheerful aesthetic, crisp details, ' +
  '9:16 vertical portrait format, ultra high quality';

const NEGATIVE_PROMPT =
  'realistic photo, photograph, 2D flat illustration, dark gritty, ' +
  'low quality, blurry, deformed, ugly, text watermark';

// ─── EP3 (금융교육) Scene Descriptions ────────────────────────────────────────
// English translations of each cut's key visual scene for AI image generation
const EP3_SCENE_DESCRIPTIONS = {
  '01':
    'Extreme close-up of a smartphone screen against a pitch-black background. ' +
    'A suspicious phishing text message is displayed on screen: ' +
    '"[Web] Your account shows unusual activity. Verify now ▶ http://xxx". ' +
    'A large bold red X stamp dramatically slams over the message with the warning label "VOICE PHISHING". ' +
    'Bold red Korean warning text fills the upper portion of the screen. ' +
    'Tense dramatic composition. Clay-textured smartphone with slightly exaggerated proportions.',

  '02':
    'Four-panel split-screen composition in warm clay art style. ' +
    'Panel 1: Worried elderly Korean grandmother holding a phone with trembling hand, ' +
    'confused expression, her young granddaughter watches anxiously beside her. ' +
    'Panel 2: A Korean teenage boy on his bed scrolling a social media feed ' +
    'showing a suspicious "guaranteed high-yield investment" advertisement. ' +
    'Panel 3: A clean motion-graphic news card showing fraud statistics — "7,000 billion KRW annual damage". ' +
    'Panel 4: A warm multi-generational Korean family — grandmother, parents, teenager — ' +
    'seated together at a dinner table, with a glowing text overlay. ' +
    'Soft warm lighting, cozy home environment.',

  '03':
    'Dramatic motion graphic moment. A blood-red threatening background instantly transforms ' +
    'into a calming sky-blue color in a sweeping wipe transition. ' +
    'A large glossy shield icon emerges from the center of the screen, expanding outward ' +
    'with a burst of golden and blue light. ' +
    'The shield is clay-textured with a bank emblem, glowing with a protective aura. ' +
    'Below it, the text "The bank protects you" appears in bold clean typography. ' +
    'Hopeful, powerful, reassuring mood.',

  '04':
    'Bright and energetic classroom scene with three panels. ' +
    'Panel 1: A cheerful Korean bank employee in a navy blue suit stands at the front of a school classroom, ' +
    'enthusiastically teaching. Eager students raise their hands. Sunlight streams through large windows. ' +
    'Panel 2: A group of students gathered around a colorful financial board game on a desk. ' +
    'They are high-fiving each other excitedly, game pieces and colorful cards scattered around. ' +
    'Panel 3: A graduation ceremony inside the classroom — ' +
    'smiling students holding certificates, posing for a group photo with the bank employee. ' +
    'The chalkboard behind them reads "Financial First Steps — Graduation". ' +
    'Warm golden classroom lighting, clay-textured furniture and characters.',

  '05':
    'Heartwarming senior education scene with four panels. ' +
    'Panel 1: A silver-haired elderly Korean woman sits at a table, ' +
    'carefully touching a smartphone screen for the first time. ' +
    'A patient young bank employee sits right beside her, gently guiding her hand. ' +
    'Both are smiling softly. Cozy warm office environment. ' +
    'Panel 2: A group of energetic elderly Korean citizens role-playing a phone scam scenario. ' +
    'One person pretends to receive a suspicious call, while the others cheer her on as she confidently says "Hang up!". ' +
    'Panel 3: The same elderly woman suddenly succeeds in her first mobile bank transfer alone. ' +
    'She claps her hands with pure joy and disbelief, tears of happiness in her eyes — ' +
    'slow-motion golden moment, warm lens flare. ' +
    'Panel 4: Three floating tip cards with icons: ' +
    '"Unknown number → Hang up", "Personal info request → Always a scam", "Government impersonation → Visit in person".',

  '06':
    'Clean and impactful motion graphic recap sequence. ' +
    'Scene 1: Teal background — a large bold number "18,293" animates counting upward ' +
    'with sparkle effects, accompanied by the text "times per year, 50 times a day". ' +
    'Scene 2: Sky-blue background — the number "596,464 people" counts up dramatically ' +
    'with confetti burst, text reads "6% of Seoul\'s population". ' +
    'Scene 3: Soft white background — a warm clay-style family illustration: ' +
    'a smiling grandmother, parents, and a child all holding hands. ' +
    'Above them floats a glowing golden shield, radiating protection. ' +
    'Text overlay: "When you know finance, your family is safe." ' +
    'Scene 4: Clean white background with a bank logo, SDG icons, and a QR code. ' +
    'Screen gently fades to pure white.',
};

// ─── Episode metadata for display ─────────────────────────────────────────────
const EPISODE_META = {
  ep1: { label: '1편', theme: '사회혁신기업' },
  ep2: { label: '2편', theme: '메세나 문화예술' },
  ep3: { label: '3편', theme: '금융교육' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildPrompt(cutNumber, sceneDescriptions) {
  const scene = sceneDescriptions[cutNumber] || '(scene description not available for this cut)';
  return `${STYLE_PREFIX},\n${scene}`;
}

function generateMarkdown(episode, episodeId, sceneDescriptions) {
  const meta = EPISODE_META[episodeId] || { label: episodeId, theme: '' };
  const lines = [];

  lines.push(`# ${meta.label} 콘티 이미지 프롬프트 — ${meta.theme}`);
  lines.push(`> **스타일:** 3D Clay Pixar 애니메이션 스타일 | **비율:** 9:16 세로 | **AI 툴:** 나노바나나 등`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const cut of episode.conti) {
    const sceneTitle = cut.docSceneTitle || cut.subtitle || '';
    lines.push(`## Cut ${cut.cut} — ${sceneTitle} (${cut.time})`);
    lines.push('');
    lines.push(`**장면 요약 (KR):** ${cut.imageDescription}`);
    lines.push('');
    lines.push('### Positive Prompt');
    lines.push('```');
    lines.push(buildPrompt(cut.cut, sceneDescriptions));
    lines.push('```');
    lines.push('');
    lines.push('### Negative Prompt');
    lines.push('```');
    lines.push(NEGATIVE_PROMPT);
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const episodeId = process.argv[2] || 'ep3';

  const briefPath = path.join(__dirname, 'data', 'brief.json');
  if (!fs.existsSync(briefPath)) {
    console.error(`ERROR: brief.json not found at ${briefPath}`);
    process.exit(1);
  }

  const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
  const episode = brief.episodes.find((e) => e.id === episodeId);
  if (!episode) {
    const ids = brief.episodes.map((e) => e.id).join(', ');
    console.error(`ERROR: Episode "${episodeId}" not found. Available: ${ids}`);
    process.exit(1);
  }

  // Pick scene descriptions based on episode
  const sceneMap = episodeId === 'ep3' ? EP3_SCENE_DESCRIPTIONS : {};

  const markdown = generateMarkdown(episode, episodeId, sceneMap);
  const outPath = path.join(__dirname, 'data', `${episodeId}-conti-prompts.md`);
  fs.writeFileSync(outPath, markdown, 'utf8');

  console.log(`✓ 생성 완료: ${outPath}`);
  console.log(`  컷 수: ${episode.conti.length}컷`);
}

main();
