/**
 * CSV 파일(EUC-KR 인코딩)에서 메타데이터를 파싱하는 유틸리티
 *
 * IV_Raw_Data CSV 파일 구조:
 *   1행~END: 전압/전류/전력 (I-V 커브 데이터)
 *   END 이후: 측정 메타데이터 (DB 저장 대상)
 */

// 메타데이터 키 → DB 필드명 매핑
const FIELD_MAP = {
  'Meas.Time': 'measTime',
  '일사량 [W/㎡]': 'irradiance',
  'Voc [V]': 'voc',
  'Isc [A]': 'isc',
  'Vmax [V]': 'vmax',
  'Imax [A]': 'imax',
  'Pmax [W]': 'pmax',
  'Fill Factor [%]': 'fillFactor',
  '온도 1[℃]': 'temp1',
  '온도 2[℃]': 'temp2',
  '온도 3[℃]': 'temp3',
  '온도 4[℃]': 'temp4',
  '온도 5[℃]': 'temp5',
  '대기온도 [℃]': 'ambientTemp',
};

/**
 * File 객체를 EUC-KR로 디코딩하여 텍스트로 변환
 * 브라우저의 FileReader로 ArrayBuffer를 읽고, TextDecoder('euc-kr')로 변환
 */
const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // ArrayBuffer → EUC-KR 텍스트로 디코딩
      const decoder = new TextDecoder('euc-kr');
      const text = decoder.decode(reader.result);
      resolve(text);
    };
    reader.onerror = () => reject(reader.error);
    // 바이너리로 읽기 (인코딩 변환을 위해)
    reader.readAsArrayBuffer(file);
  });
};

/**
 * CSV 텍스트에서 END 이후 메타데이터를 파싱
 * @param {string} text - EUC-KR 디코딩된 CSV 전체 텍스트
 * @param {string} channel - 사용자가 선택한 채널 (Ch1/Ch2/Ch3)
 * @returns {object} DB 스키마에 맞는 파싱 결과 객체
 */
const parseMetadata = (text, channel) => {
  const lines = text.split('\n');

  // END 이후 줄만 추출
  const endIndex = lines.findIndex((line) => line.trim() === 'END');
  if (endIndex === -1) {
    throw new Error('파일에서 END 구분자를 찾을 수 없습니다.');
  }
  const metadataLines = lines.slice(endIndex + 1);

  // 결과 객체 초기화 (channel은 사용자 선택값)
  const result = { channel };

  // 각 줄을 "키 : 값" 형식으로 파싱
  metadataLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return; // 빈 줄 무시

    // 첫 번째 ':' 기준으로 키/값 분리
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) return;

    const key = trimmed.substring(0, colonIndex).trim();
    const value = trimmed.substring(colonIndex + 1).trim();

    // FIELD_MAP에 등록된 키만 파싱
    const dbField = FIELD_MAP[key];
    if (dbField) {
      // measTime은 문자열 그대로, 나머지는 숫자로 변환
      result[dbField] = dbField === 'measTime' ? value : parseFloat(value);
    }
  });

  return result;
};

/**
 * 파일 하나를 파싱하여 DB 스키마에 맞는 객체 반환
 * @param {File} file - 브라우저 File 객체
 * @param {string} channel - 선택된 채널
 * @returns {Promise<object>} 파싱된 메타데이터 객체
 */
export const parseCSVFile = async (file, channel) => {
  const text = await readFileAsText(file);
  return parseMetadata(text, channel);
};

/**
 * 여러 파일을 한 번에 파싱
 * @param {Array} fileEntries - { file, channel } 객체 배열
 * @returns {Promise<Array>} 파싱 결과 배열 (에러 발생 시 해당 파일은 error 포함)
 */
export const parseMultipleFiles = async (fileEntries) => {
  const results = await Promise.all(
    fileEntries.map(async (entry) => {
      try {
        const parsed = await parseCSVFile(entry.file, entry.channel);
        return { ...parsed, fileName: entry.name, status: 'success' };
      } catch (error) {
        return { fileName: entry.name, channel: entry.channel, status: 'error', error: error.message };
      }
    })
  );
  return results;
};
