/**
 * CSV 파일 저장 유틸리티
 *
 * Electron 환경: window.electronAPI.saveCSV → 네이티브 저장 다이얼로그
 * 브라우저(dev) 환경: <a download> 방식으로 자동 다운로드
 *
 * BOM(﻿) 추가로 Excel에서 한글 UTF-8 파일을 올바르게 인식한다.
 */
export const saveCSV = async (csvContent, defaultFilename) => {
  // BOM 추가: Excel UTF-8 인식용
  const contentWithBom = '﻿' + csvContent;

  if (window.electronAPI) {
    // Electron: 네이티브 저장 다이얼로그
    return window.electronAPI.saveCSV(contentWithBom, defaultFilename);
  }

  // 브라우저 fallback: blob 다운로드
  const blob = new Blob([contentWithBom], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { success: true };
};

/**
 * CURVE_COLUMNS 구조의 커브 데이터 배열을 CSV 문자열로 변환
 * headers: [{ key, label }, ...] 형태의 컬럼 정의
 */
export const buildCurveCSV = (headers, data) => {
  const headerRow = headers.map((col) => col.label).join(',');
  const dataRows = data.map((row) =>
    headers.map((col) => {
      const val = row[col.key];
      if (val == null) return '';
      if (typeof val === 'number') return val.toFixed(5);
      return val;
    }).join(',')
  );
  return [headerRow, ...dataRows].join('\n');
};
