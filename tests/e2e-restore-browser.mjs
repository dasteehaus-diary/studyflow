import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Minimal valid PDF generator
function buildPdf(numPages) {
  const lines = ['%PDF-1.4'];
  const offsets = [];
  function addObj(str) {
    offsets.push(lines.join('\n').length + 1);
    lines.push(str);
  }
  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  const kids = [];
  for (let i = 0; i < numPages; i++) kids.push((3 + i) + ' 0 R');
  addObj('2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + numPages + ' >>\nendobj');
  for (let i = 0; i < numPages; i++) {
    addObj((3 + i) + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj');
  }
  const xrefOffset = lines.join('\n').length + 1;
  lines.push('xref');
  lines.push('0 ' + (3 + numPages));
  lines.push('0000000000 65535 f ');
  for (const off of offsets) {
    lines.push(String(off).padStart(10, '0') + ' 00000 n ');
  }
  lines.push('trailer\n<< /Size ' + (3 + numPages) + ' /Root 1 0 R >>');
  lines.push('startxref');
  lines.push(String(xrefOffset));
  lines.push('%%EOF');
  return lines.join('\n');
}

async function run() {
  console.log('=== StudyFlow E2E Browser Test: Restore Lifecycle & Resume Jump ===');

  const PORT = 3009;
  const SERVER_URL = `http://localhost:${PORT}`;
  let serverProcess = null;
  let chromeProcess = null;
  let tempUserDataDir = null;

  try {
    // 1. Start Next.js production server
    console.log(`[1/7] Starting Next.js production server on port ${PORT}...`);
    serverProcess = spawn('cmd.exe', ['/c', 'npx', 'next', 'start', '-p', String(PORT)], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', d => {
      // console.log('[Server stdout]:', d.toString().trim());
    });
    serverProcess.stderr.on('data', d => {
      // console.error('[Server stderr]:', d.toString().trim());
    });

    // Wait for server to respond
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(SERVER_URL);
        if (res.status === 200 || res.status === 304 || res.status === 404) {
          serverReady = true;
          break;
        }
      } catch (e) {
        // wait
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (!serverReady) {
      throw new Error('Next.js server failed to start within 15 seconds.');
    }
    console.log('✓ Next.js server is ready.');

    // 2. Launch headless Chrome
    console.log('[2/7] Launching Headless Chrome via CDP...');
    tempUserDataDir = mkdtempSync(join(tmpdir(), 'sf-chrome-'));
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

    chromeProcess = spawn(chromePath, [
      '--remote-debugging-port=9222',
      '--headless=new',
      `--user-data-dir=${tempUserDataDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,800',
      'about:blank'
    ]);

    // Connect to CDP Page Target
    let wsUrl = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://localhost:9222/json/list');
        const list = await res.json();
        const pageTarget = list.find(t => t.type === 'page');
        if (pageTarget?.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        // wait
      }
      await new Promise(r => setTimeout(r, 300));
    }

    if (!wsUrl) {
      throw new Error('Failed to obtain Chrome page webSocketDebuggerUrl.');
    }
    console.log('✓ Chrome launched, connecting to CDP Page WebSocket...');

    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const pending = new Map();

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };

    function send(method, params = {}) {
      const id = msgId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(`Eval error: ${JSON.stringify(result.exceptionDetails)}`);
      }
      return result.result?.value;
    }

    await send('Page.enable');
    await send('Runtime.enable');

    // 3. Navigate to Home Page to initialize origin and OPFS/Dexie
    console.log('[3/7] Initializing origin and seeding test document in Dexie & OPFS...');
    await send('Page.navigate', { url: SERVER_URL });
    await new Promise(r => setTimeout(r, 1500));

    // Seed 55-page PDF in OPFS and Dexie
    const pdfData = buildPdf(55);
    const seedResult = await evaluate(`
      (async () => {
        try {
          // 1. Write PDF to OPFS
          const root = await navigator.storage.getDirectory();
          const docDir = await root.getDirectoryHandle('documents', { create: true });
          const fileHandle = await docDir.getFileHandle('doc-e2e-55.pdf', { create: true });
          const writable = await fileHandle.createWritable();
          const pdfRaw = ${JSON.stringify(pdfData)};
          const encoder = new TextEncoder();
          await writable.write(encoder.encode(pdfRaw));
          await writable.close();

          // 2. Write to IndexedDB (studyflow)
          // Wait for Dexie database to be initialized by the page
          let db = null;
          for (let i = 0; i < 20; i++) {
            try {
              const req = indexedDB.open('studyflow');
              db = await new Promise((resolve, reject) => {
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
              });
              if (db.objectStoreNames.contains('documents') && db.objectStoreNames.contains('progress')) {
                break;
              }
              db.close();
            } catch (e) {}
            await new Promise(r => setTimeout(r, 200));
          }

          if (!db || !db.objectStoreNames.contains('documents')) {
            throw new Error('Database studyflow stores not ready.');
          }

          // Helper to put in store
          function put(storeName, val) {
            return new Promise((res, rej) => {
              const tx = db.transaction(storeName, 'readwrite');
              tx.objectStore(storeName).put(val);
              tx.oncomplete = res;
              tx.onerror = rej;
            });
          }

          const now = new Date().toISOString();
          await put('documents', {
            id: 'doc-e2e-55',
            title: 'Test Resume 55-Page PDF',
            fileHash: 'hash-test-55',
            opfsPath: 'documents/doc-e2e-55.pdf',
            totalPages: 55,
            tags: ['test'],
            status: 'in_progress',
            createdAt: now,
            updatedAt: now
          });

          await put('progress', {
            documentId: 'doc-e2e-55',
            currentPage: 4,
            y: 0.5,
            visitedRanges: [[1, 4]],
            completed: false,
            lastMeaningfulActivityAt: now,
            updatedAt: now
          });

          return { success: true };
        } catch (err) {
          return { success: false, error: String(err) };
        }
      })()
    `);

    console.log('Seed result:', seedResult);
    if (!seedResult?.success) {
      throw new Error(`Failed to seed data: ${seedResult?.error}`);
    }

    // 4. Test Scenario A: Open Reader for doc-e2e-55 (saved at page 4, y=0.5)
    console.log('[4/7] Scenario A: Opening Reader with saved locator page 4 / y=0.5...');
    await send('Page.navigate', { url: `${SERVER_URL}/reader/doc-e2e-55` });

    // Wait for PDF render and restore completion
    let restoredA = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      const status = await evaluate(`
        (() => {
          const stage = document.querySelector('.pdfStage');
          const targetPage = document.querySelector('[data-page-number="4"]');
          const badge = document.querySelector('.pdfStage span'); // restore indicator
          const pageInput = document.querySelector('input[title*="Nhập số trang"]') || document.querySelector('.readerToolbar input');
          return {
            stageExists: !!stage,
            scrollTop: stage ? stage.scrollTop : 0,
            targetPageExists: !!targetPage,
            pageHeight: targetPage ? targetPage.offsetHeight : 0,
            hasBadge: badge ? badge.textContent.includes('Đang mở lại trang') : false,
            currentPageValue: pageInput ? pageInput.value : null
          };
        })()
      `);

      if (status.stageExists && status.scrollTop > 100 && !status.hasBadge && status.currentPageValue === '4') {
        restoredA = true;
        console.log(`✓ Restore complete! Stage scrollTop = ${status.scrollTop}px, target page in view, input value = ${status.currentPageValue}`);
        break;
      }
    }

    if (!restoredA) {
      const finalStatus = await evaluate(`
        (() => {
          const stage = document.querySelector('.pdfStage');
          const pageInput = document.querySelector('input[title*="Nhập số trang"]') || document.querySelector('.readerToolbar input');
          return {
            scrollTop: stage ? stage.scrollTop : 0,
            currentPageValue: pageInput ? pageInput.value : null,
            bodyHtml: document.body.innerHTML.slice(0, 500)
          };
        })()
      `);
      throw new Error(`Scenario A restore timed out. Final status: ${JSON.stringify(finalStatus)}`);
    }

    // 5. Test Wheel Event Jump Regression:
    console.log('[5/7] Testing Wheel Event Jump Regression (First wheel event must NOT jump to page 1)...');
    const beforeWheel = await evaluate(`
      (() => {
        const stage = document.querySelector('.pdfStage');
        const pageInput = document.querySelector('input[title*="Nhập số trang"]') || document.querySelector('.readerToolbar input');
        return {
          scrollTop: stage.scrollTop,
          page: pageInput.value
        };
      })()
    `);

    // Dispatch small wheel scroll
    await evaluate(`
      (() => {
        const stage = document.querySelector('.pdfStage');
        stage.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, bubbles: true }));
      })()
    `);

    await new Promise(r => setTimeout(r, 600));

    const afterWheel = await evaluate(`
      (() => {
        const stage = document.querySelector('.pdfStage');
        const pageInput = document.querySelector('input[title*="Nhập số trang"]') || document.querySelector('.readerToolbar input');
        return {
          scrollTop: stage.scrollTop,
          page: pageInput.value
        };
      })()
    `);

    console.log(`Before wheel: page ${beforeWheel.page}, scroll ${beforeWheel.scrollTop}`);
    console.log(`After wheel: page ${afterWheel.page}, scroll ${afterWheel.scrollTop}`);

    if (afterWheel.page === '1') {
      throw new Error('REGRESSION DETECTED: First wheel event jumped reader back to page 1!');
    }
    if (afterWheel.page !== '4') {
      throw new Error(`Expected reader to stay on page 4, but got page ${afterWheel.page}`);
    }
    console.log('✓ PASS: Wheel event did NOT jump to page 1. Remained on page 4!');

    // 6. Test Scenario B: Reload with locator page 40 / y = 0.2
    console.log('[6/7] Scenario B: Updating progress to page 40 / y=0.2 and testing reload...');
    await evaluate(`
      (async () => {
        const req = indexedDB.open('studyflow');
        await new Promise((res, rej) => { req.onsuccess = res; req.onerror = rej; });
        const db = req.result;
        return new Promise((res, rej) => {
          const tx = db.transaction('progress', 'readwrite');
          tx.objectStore('progress').put({
            documentId: 'doc-e2e-55',
            currentPage: 40,
            y: 0.2,
            visitedRanges: [[1, 40]],
            completed: false,
            lastMeaningfulActivityAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          tx.oncomplete = res;
          tx.onerror = rej;
        });
      })()
    `);

    // Reload page
    console.log('Reloading reader page...');
    await send('Page.reload');

    let restoredB = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      const status = await evaluate(`
        (() => {
          const stage = document.querySelector('.pdfStage');
          const targetPage = document.querySelector('[data-page-number="40"]');
          const badge = document.querySelector('.pdfStage span');
          const pageInput = document.querySelector('input[title*="Nhập số trang"]') || document.querySelector('.readerToolbar input');
          return {
            stageExists: !!stage,
            scrollTop: stage ? stage.scrollTop : 0,
            targetPageExists: !!targetPage,
            hasBadge: badge ? badge.textContent.includes('Đang mở lại trang') : false,
            currentPageValue: pageInput ? pageInput.value : null
          };
        })()
      `);

      if (status.stageExists && status.scrollTop > 5000 && !status.hasBadge && status.currentPageValue === '40') {
        restoredB = true;
        console.log(`✓ Restore to page 40 complete! Stage scrollTop = ${status.scrollTop}px, input value = ${status.currentPageValue}`);
        break;
      }
    }

    if (!restoredB) {
      const finalStatusB = await evaluate(`
        (() => {
          const stage = document.querySelector('.pdfStage');
          const pageInput = document.querySelector('input[title*="Nhập số trang"]') || document.querySelector('.readerToolbar input');
          return {
            scrollTop: stage ? stage.scrollTop : 0,
            currentPageValue: pageInput ? pageInput.value : null
          };
        })()
      `);
      throw new Error(`Scenario B restore to page 40 failed. Status: ${JSON.stringify(finalStatusB)}`);
    }

    // Wheel event at page 40
    await evaluate(`
      (() => {
        const stage = document.querySelector('.pdfStage');
        stage.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    const afterWheelB = await evaluate(`
      (() => {
        const pageInput = document.querySelector('input[title*="Nhập số trang"]') || document.querySelector('.readerToolbar input');
        return pageInput ? pageInput.value : null;
      })()
    `);

    if (afterWheelB !== '40') {
      throw new Error(`Expected reader to stay on page 40 after wheel event, got ${afterWheelB}`);
    }
    console.log('✓ PASS: Wheel event at page 40 remained on page 40 (did NOT jump to page 1)!');

    // 7. Test Scenario C: Resume from Home ContinueCard
    console.log('[7/7] Scenario C: Testing Resume from Home ContinueCard...');
    await send('Page.navigate', { url: SERVER_URL });
    await new Promise(r => setTimeout(r, 1500));

    const homeCheck = await evaluate(`
      (() => {
        const continueSection = document.querySelector('.continueCard');
        const resumeLink = continueSection ? continueSection.querySelector('a.primary') : null;
        return {
          hasContinueCard: !!continueSection,
          linkHref: resumeLink ? resumeLink.getAttribute('href') : null
        };
      })()
    `);

    console.log('Home ContinueCard status:', homeCheck);
    if (!homeCheck.hasContinueCard || homeCheck.linkHref !== '/reader/doc-e2e-55') {
      throw new Error(`ContinueCard not rendered properly on home page: ${JSON.stringify(homeCheck)}`);
    }
    console.log('✓ PASS: ContinueCard correctly targets /reader/doc-e2e-55');

    console.log('\n======================================================');
    console.log('🎉 ALL BROWSER E2E TESTS PASSED WITH 0 REGRESSIONS!');
    console.log('======================================================\n');

  } finally {
    // Teardown
    if (chromeProcess) {
      try {
        chromeProcess.kill('SIGKILL');
      } catch (e) {}
    }
    if (tempUserDataDir) {
      try {
        rmSync(tempUserDataDir, { recursive: true, force: true });
      } catch (e) {}
    }
    if (serverProcess) {
      try {
        serverProcess.kill('SIGKILL');
      } catch (e) {}
    }
  }
}

run().catch(err => {
  console.error('\n❌ BROWSER E2E TEST FAILED:', err);
  process.exit(1);
});
