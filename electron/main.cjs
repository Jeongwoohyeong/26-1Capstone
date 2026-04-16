const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

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
 */
function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
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
