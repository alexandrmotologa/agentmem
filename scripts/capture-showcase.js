import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/alexander/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright');

const IMAGES_DIR = path.resolve('docs/images');
const FRAMES_DIR = path.resolve('temp_frames');

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
  if (fs.existsSync(FRAMES_DIR)) {
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  console.log('Launching Chromium for high-res screenshots...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const hiResContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await hiResContext.newPage();

  console.log('Navigating to http://localhost:50094...');
  await page.goto('http://localhost:50094', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const nsSelect = page.locator('select').first();

  // 1. Capture Graph Canvas (production namespace)
  console.log('1/6: Capturing Graph Canvas (production namespace)...');
  if (await nsSelect.isVisible()) {
    await nsSelect.selectOption('production');
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(IMAGES_DIR, 'agentmem_studio_graph.png') });

  // 2. Capture Recall Simulator
  console.log('2/6: Capturing Recall Simulator...');
  await page.locator('button:has-text("Recall Simulator")').click();
  await page.waitForTimeout(600);
  const simBtn = page.locator('button:has-text("Simulate Recall")');
  if (await simBtn.isVisible()) {
    await simBtn.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(IMAGES_DIR, 'agentmem_simulator.png') });

  // 3. Capture Ingestion Playground
  console.log('3/6: Capturing Ingestion Playground...');
  await page.locator('button:has-text("Ingestion Playground")').click();
  await page.waitForTimeout(600);
  const ingestBtn = page.locator('button:has-text("Ingest & Extract Facts")');
  if (await ingestBtn.isVisible()) {
    await ingestBtn.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(IMAGES_DIR, 'agentmem_ingestion.png') });

  // 4. Capture Conflict Resolver (default namespace)
  console.log('4/6: Capturing Conflict Resolver...');
  await page.locator('button:has-text("Conflict Resolver")').click();
  await page.waitForTimeout(600);
  if (await nsSelect.isVisible()) {
    await nsSelect.selectOption('default');
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: path.join(IMAGES_DIR, 'agentmem_conflicts.png') });

  // 5. Capture Episodic Timeline
  console.log('5/6: Capturing Episodic Timeline...');
  await page.locator('button:has-text("Episodic Timeline")').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(IMAGES_DIR, 'agentmem_timeline.png') });

  // 6. Mobile Responsiveness (390px)
  console.log('6/6: Capturing Mobile Responsiveness (390x844)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('button:has-text("Graph Canvas")').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(IMAGES_DIR, 'agentmem_mobile_390.png') });

  await hiResContext.close();

  // 7. Record Animated Demo Frames in standard 1x scale for maximum speed & smoothness
  console.log('Recording frames for animated demo GIF...');
  const demoContext = await browser.newContext({
    viewport: { width: 1200, height: 750 },
    deviceScaleFactor: 1,
  });
  const demoPage = await demoContext.newPage();
  await demoPage.goto('http://localhost:50094', { waitUntil: 'networkidle' });
  await demoPage.waitForTimeout(1000);

  const demoNsSelect = demoPage.locator('select').first();
  let frameIdx = 0;

  const snap = async (count = 1) => {
    for (let c = 0; c < count; c++) {
      const filename = path.join(FRAMES_DIR, `frame_${String(frameIdx).padStart(4, '0')}.png`);
      await demoPage.screenshot({ path: filename });
      frameIdx++;
    }
  };

  // Scene 1: Graph Canvas Overview (production namespace)
  await demoNsSelect.selectOption('production');
  await demoPage.waitForTimeout(1500);
  await snap(6);

  // Scene 2: Switch to Ingestion Playground
  await demoPage.locator('button:has-text("Ingestion Playground")').click();
  await demoPage.waitForTimeout(600);
  await snap(4);

  // Click Ingest and show live badges
  const dIngestBtn = demoPage.locator('button:has-text("Ingest & Extract Facts")');
  await dIngestBtn.click();
  await demoPage.waitForTimeout(1200);
  await snap(8);

  // Scene 3: Switch to Recall Simulator
  await demoPage.locator('button:has-text("Recall Simulator")').click();
  await demoPage.waitForTimeout(600);
  await snap(4);

  // Trigger recall simulation
  const dSimBtn = demoPage.locator('button:has-text("Simulate Recall")');
  await dSimBtn.click();
  await demoPage.waitForTimeout(1200);
  await snap(8);

  // Scene 4: Switch to Conflict Resolver
  await demoPage.locator('button:has-text("Conflict Resolver")').click();
  await demoNsSelect.selectOption('default');
  await demoPage.waitForTimeout(1000);
  await snap(6);

  // Scene 5: Back to Graph Canvas in default namespace
  await demoPage.locator('button:has-text("Graph Canvas")').click();
  await demoPage.waitForTimeout(1000);
  await snap(6);

  await browser.close();

  console.log(`Recorded ${frameIdx} frames. Compiling with FFmpeg into docs/images/agentmem_demo.gif...`);
  const gifPath = path.join(IMAGES_DIR, 'agentmem_demo.gif');
  const ffmpegCmd = `ffmpeg -y -framerate 4 -i "${FRAMES_DIR}/frame_%04d.png" -vf "fps=4,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:reserve_transparent=0[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" "${gifPath}"`;

  try {
    execSync(ffmpegCmd, { stdio: 'inherit' });
    console.log(`✓ Animated demo GIF created at: ${gifPath}`);
  } catch (err) {
    console.error('FFmpeg compilation failed:', err);
  } finally {
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    console.log('✓ Temporary frame buffer cleaned.');
  }

  console.log('✓ All authentic screenshots and animated demo successfully generated!');
}

main().catch((err) => {
  console.error('Showcase capture failed:', err);
  process.exit(1);
});
