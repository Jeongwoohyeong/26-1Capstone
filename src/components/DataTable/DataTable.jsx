import { useState, useEffect } from 'react';
import { fetchMeasurements } from '../../utils/api';
import './DataTable.css';

// 채널 목록
const CHANNELS = ['Ch1', 'Ch2', 'Ch3'];

// case 레벨 필터 옵션
const CASE_OPTIONS = [
  { value: null, label: '전체' },
  { value: 1, label: 'Case 1 (표준)' },
  { value: 2, label: 'Case 2 (임시)' },
  { value: 3, label: 'Case 3 (R²미달)' },
  { value: 0, label: 'Case 0 (사용불가)' },
];

// 테이블에 표시할 컬럼 정의
const TABLE_COLUMNS = [
  { key: 'measurementId', label: 'ID' },
  { key: 'measTime', label: '측정시각' },
  { key: 'irradiance', label: '일사량' },
  { key: 'voc', label: 'Voc' },
  { key: 'isc', label: 'Isc' },
  { key: 'vmax', label: 'Vmax' },
  { key: 'imax', label: 'Imax' },
  { key: 'pmax', label: 'Pmax' },
  { key: 'fillFactor', label: 'Fill Factor' },
  { key: 'temp1', label: '온도1' },
  { key: 'temp2', label: '온도2' },
  { key: 'temp3', label: '온도3' },
  { key: 'temp4', label: '온도4' },
  { key: 'temp5', label: '온도5' },
  { key: 'ambientTemp', label: '대기온도' },
];

/**
 * 채널 하나의 데이터를 표시하는 개별 테이블 컴포넌트
 * @param {string} channel - 채널명 (Ch1/Ch2/Ch3)
 */
function ChannelTable({ channel }) {
  const [data, setData] = useState([]);             // 조회된 데이터
  const [selectedCase, setSelectedCase] = useState(null); // 선택된 case 필터
  const [isLoading, setIsLoading] = useState(false); // 로딩 상태
  const [error, setError] = useState('');            // 에러 메시지

  // selectedCase가 변경될 때마다 데이터를 다시 조회
  // useEffect: 특정 값이 변경되면 자동으로 실행되는 React 훅
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError('');

      try {
        // API 호출: 채널 + case 필터로 조회
        const result = await fetchMeasurements(channel, selectedCase);
        setData(result);
      } catch (err) {
        setError(err.message);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [channel, selectedCase]); // channel 또는 selectedCase가 바뀌면 재실행

  return (
    <div className="channel-table">
      <div className="channel-table-header">
        <h3>{channel}</h3>
        {/* case 필터 드롭다운 */}
        <select
          className="case-filter"
          value={selectedCase ?? ''}
          onChange={(e) => {
            // 빈 문자열이면 null (전체), 아니면 숫자로 변환
            const value = e.target.value;
            setSelectedCase(value === '' ? null : Number(value));
          }}
        >
          {CASE_OPTIONS.map((option) => (
            <option key={option.label} value={option.value ?? ''}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* 에러 표시 */}
      {error && <p className="table-error">{error}</p>}

      {/* 로딩 표시 */}
      {isLoading && <p className="table-loading">데이터 조회 중...</p>}

      {/* 데이터 테이블 */}
      {!isLoading && !error && (
        <>
          <p className="data-count">조회 결과: {data.length}건</p>
          {data.length > 0 ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {TABLE_COLUMNS.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.measurementId}>
                      {TABLE_COLUMNS.map((col) => (
                        <td key={col.key}>{row[col.key] ?? '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="no-data">데이터가 없습니다.</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 메인 DataTable 컴포넌트 — 채널별 3개 테이블을 렌더링
 */
function DataTable() {
  return (
    <div className="data-table-container">
      <h2>측정 데이터 조회</h2>
      {/* 각 채널별로 ChannelTable 생성 */}
      {CHANNELS.map((channel) => (
        <ChannelTable key={channel} channel={channel} />
      ))}
    </div>
  );
}

export default DataTable;
