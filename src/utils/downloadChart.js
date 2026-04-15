/**
 * 차트 DOM 요소를 PNG 이미지로 변환하여 다운로드하는 유틸리티
 *
 * html2canvas 라이브러리를 사용해 wrapper 전체(차트 SVG + Legend 등)를
 * 한 번에 이미지로 캡처한다.
 *
 * 동작 흐름:
 *   1. html2canvas로 wrapper 요소를 canvas에 렌더링
 *   2. canvas를 PNG Blob으로 변환
 *   3. <a download> 링크로 다운로드 트리거
 */

import html2canvas from 'html2canvas';

/**
 * 차트 wrapper 요소를 PNG 파일로 다운로드한다.
 * @param {HTMLElement} wrapperElement - 차트가 들어있는 div 요소
 * @param {string} fileName - 저장할 파일명 (.png 확장자 제외, 자동 추가)
 */
export const downloadChartAsPng = async (wrapperElement, fileName) => {
  if (!wrapperElement) {
    console.error('차트 wrapper 요소를 찾을 수 없습니다.');
    return;
  }

  try {
    // html2canvas: DOM 요소(HTML + SVG + CSS)를 통째로 canvas로 렌더링
    // backgroundColor: 투명 배경 대신 흰색으로 채움
    // scale: 2배 해상도로 렌더링 (고해상도 이미지 출력)
    // useCORS: 외부 이미지 사용 시 CORS 허용 (현재는 외부 이미지 없음)
    const canvas = await html2canvas(wrapperElement, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false, // 콘솔 로그 끄기
    });

    // canvas를 PNG Blob으로 변환
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) {
        console.error('PNG 변환 실패');
        return;
      }

      // 임시 다운로드 링크 생성 후 클릭
      const pngUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `${fileName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 임시 URL 해제 (메모리 정리)
      URL.revokeObjectURL(pngUrl);
    }, 'image/png');
  } catch (error) {
    console.error('차트 이미지 변환 중 오류:', error);
  }
};
