/**
 * FastAPI 서버(포트 8000)와 통신하는 유틸리티
 * 모든 API 호출을 한 곳에서 관리하여 주소 변경 시 여기만 수정하면 됨
 */

// API 서버 기본 주소
const API_BASE_URL = 'http://localhost:8000';

/**
 * 측정 정보 목록 조회
 * @param {string|null} channel - 채널 필터 (Ch1/Ch2/Ch3), null이면 전체
 * @param {number|null} caseLevel - case 필터 (0~3), null이면 전체
 * @returns {Promise<Array>} 측정 정보 배열
 */
export const fetchMeasurements = async (channel = null, caseLevel = null) => {
  // 쿼리 파라미터 구성
  const params = new URLSearchParams();
  if (channel !== null) params.append('channel', channel);
  if (caseLevel !== null) params.append('caseLevel', caseLevel);

  const queryString = params.toString();
  const url = `${API_BASE_URL}/api/measurements${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || '데이터 조회에 실패했습니다.');
  }

  return result.data;
};

// 한 번의 HTTP 요청에 담을 최대 파일 수 — 너무 크면 메모리/파일핸들/타임아웃 문제가 생긴다.
// 작은 CSV(수 KB) 기준으로 메모리/네트워크 부담이 거의 없고,
// 배치당 처리 시간이 2~5초 수준이라 진행률이 멈춘 것처럼 보이지 않는 균형점.
const UPLOAD_BATCH_SIZE = 50;

/**
 * CSV 파일 여러 개를 서버에 배치 단위로 업로드
 * @param {Array} fileEntries - { file, channel } 객체 배열
 * @param {Function} onProgress - (processed, total) 콜백. 배치 1건 완료마다 호출
 * @returns {Promise<Object>} 업로드 결과
 */
export const uploadFiles = async (fileEntries, onProgress) => {
  // 같은 채널의 파일들만 한 번에 전송 가능 (API 제약)
  // 채널별로 그룹화하여 순차 전송
  const groupedByChannel = {};
  fileEntries.forEach((entry) => {
    if (!groupedByChannel[entry.channel]) {
      groupedByChannel[entry.channel] = [];
    }
    groupedByChannel[entry.channel].push(entry);
  });

  const allResults = [];
  const total = fileEntries.length;
  let processed = 0;

  for (const [channel, entries] of Object.entries(groupedByChannel)) {
    // 채널별 파일을 UPLOAD_BATCH_SIZE 단위로 쪼개 순차 전송
    for (let start = 0; start < entries.length; start += UPLOAD_BATCH_SIZE) {
      const batch = entries.slice(start, start + UPLOAD_BATCH_SIZE);

      const formData = new FormData();
      formData.append('channel', channel);
      batch.forEach((entry) => {
        formData.append('files', entry.file);
      });

      try {
        const response = await fetch(`${API_BASE_URL}/api/upload/multiple`, {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (result.results) {
          allResults.push(...result.results);
        }
      } catch (error) {
        // 배치 단위 실패 시 해당 배치의 모든 파일을 실패로 처리하고 다음 배치 계속
        batch.forEach((entry) => {
          allResults.push({
            fileName: entry.file.name,
            error: error.message || '네트워크 오류',
          });
        });
      }

      processed += batch.length;
      if (onProgress) {
        onProgress(processed, total);
      }
    }
  }

  return allResults;
};

/**
 * 특정 측정의 I-V 커브 데이터 조회
 * @param {number} measurementId - 측정 ID
 * @returns {Promise<Array>} I-V 커브 데이터 배열
 */
export const fetchCurveData = async (measurementId) => {
  const response = await fetch(`${API_BASE_URL}/api/curves/${measurementId}`);
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || '커브 데이터 조회에 실패했습니다.');
  }

  return result.data;
};
