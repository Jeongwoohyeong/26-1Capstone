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

/**
 * CSV 파일 여러 개를 서버에 업로드
 * @param {Array} fileEntries - { file, channel } 객체 배열
 * @returns {Promise<Object>} 업로드 결과
 */
export const uploadFiles = async (fileEntries) => {
  const formData = new FormData();

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

  for (const [channel, entries] of Object.entries(groupedByChannel)) {
    const formData = new FormData();
    formData.append('channel', channel);
    entries.forEach((entry) => {
      formData.append('files', entry.file);
    });

    const response = await fetch(`${API_BASE_URL}/api/upload/multiple`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (result.results) {
      allResults.push(...result.results);
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
