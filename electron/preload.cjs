const { contextBridge, ipcRenderer } = require('electron');

// renderer 프로세스에서 window.electronAPI 로 접근 가능한 안전한 IPC 인터페이스
contextBridge.exposeInMainWorld('electronAPI', {
  // CSV 파일 저장: 네이티브 저장 다이얼로그를 열고 지정 경로에 파일 기록
  saveCSV: (csvContent, defaultFilename) =>
    ipcRenderer.invoke('save-csv', csvContent, defaultFilename),
});
