const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

let serverProcess = null;

/**
 * Python FastAPI 서버(MainServer.exe)를 자식 프로세스로 실행
 * 패키징 여부(app.isPackaged)에 따라 exe 경로가 달라진다
 */
function startServer() {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'MainServer.exe')
    : path.join(__dirname, '..', 'BackEnd', 'dist', 'MainServer.exe');

  serverProcess = spawn(serverPath, [], {
    cwd: path.dirname(serverPath), // DB 파일 경로 기준
    stdio: 'ignore',
  });

  serverProcess.on('error', (err) => {
    console.error('Server start failed:', err.message);
  });
}

/**
 * Python 서버 프로세스 종료
 * Windows에서 child.kill()은 PyInstaller exe가 띄운 하위 프로세스까지
 * 제대로 정리하지 못해 좀비가 남는다. taskkill /F /T로 프로세스 트리 전체를 강제 종료.
 *
 * execFileSync(동기)로 호출하는 이유:
 * 비동기 spawn은 Electron 메인이 app.quit()으로 즉시 종료되면서
 * Job Object 규칙에 따라 taskkill 자식 프로세스도 같이 죽어버려
 * 실제 MainServer.exe 킬이 수행되기 전에 중단될 수 있다.
 * 동기 호출로 taskkill 완료까지 대기시켜 순서를 보장한다.
 */
function stopServer() {
  if (serverProcess && serverProcess.pid) {
    try {
      execFileSync(
        'taskkill',
        ['/pid', String(serverProcess.pid), '/f', '/t'],
        { windowsHide: true, stdio: 'ignore' }
      );
    } catch (_err) {
      // 이미 죽었거나 pid 무효 — 조용히 무시
    }
    serverProcess = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 빌드된 React 앱(dist/index.html)을 로드
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  startServer();
  // 서버 기동 대기 후 창 표시 (FastAPI 초기화 시간 확보)
  setTimeout(createWindow, 2000);
});

// 모든 창이 닫히면 서버도 종료
app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});
