import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { fetchMeasurements, fetchCurveData } from '../../utils/api';
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

// 측정 정보 테이블 컬럼 정의
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

// I-V 커브 데이터(정규화 포함) 테이블 컬럼 정의
const CURVE_COLUMNS = [
  { key: 'vMeasured', label: 'V (측정)' },
  { key: 'iMeasured', label: 'I (측정)' },
  { key: 'powerMeasured', label: 'P (측정)' },
  { key: 'vStc', label: 'V (STC)' },
  { key: 'iStc', label: 'I (STC)' },
];

/**
 * 채널 하나의 데이터를 표시하는 개별 테이블 컴포넌트
 * @param {string} channel - 채널명 (Ch1/Ch2/Ch3)
 */
function ChannelTable({ channel }) {
  const [data, setData] = useState([]);                       // 측정 정보 목록
  const [selectedCase, setSelectedCase] = useState(null);     // 선택된 case 필터
  const [isLoading, setIsLoading] = useState(false);          // 측정 목록 로딩 상태
  const [error, setError] = useState('');                     // 측정 목록 에러

  // 정규화 커브 데이터 관련 상태
  const [selectedMeasurementId, setSelectedMeasurementId] = useState(null); // 선택된 측정 ID
  const [curveData, setCurveData] = useState([]);             // 정규화 커브 데이터
  const [isCurveLoading, setIsCurveLoading] = useState(false); // 커브 로딩 상태
  const [curveError, setCurveError] = useState('');           // 커브 에러

  // 채널 또는 case 필터 변경 시 측정 목록 재조회
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const result = await fetchMeasurements(channel, selectedCase);
        setData(result);
        // 필터가 바뀌면 선택된 측정도 초기화
        setSelectedMeasurementId(null);
        setCurveData([]);
      } catch (err) {
        setError(err.message);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [channel, selectedCase]);

  // 측정 행 클릭 시 해당 측정의 정규화 커브 데이터 조회
  const handleRowClick = async (measurementId) => {
    // 같은 행을 다시 클릭하면 선택 해제 (토글)
    if (selectedMeasurementId === measurementId) {
      setSelectedMeasurementId(null);
      setCurveData([]);
      return;
    }

    setSelectedMeasurementId(measurementId);
    setIsCurveLoading(true);
    setCurveError('');

    try {
      const result = await fetchCurveData(measurementId);
      setCurveData(result);
    } catch (err) {
      setCurveError(err.message);
      setCurveData([]);
    } finally {
      setIsCurveLoading(false);
    }
  };

  return (
    <div className="channel-table">
      <div className="channel-table-header">
        <h3>{channel}</h3>
        {/* case 필터 드롭다운 */}
        <select
          className="case-filter"
          value={selectedCase ?? ''}
          onChange={(e) => {
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

      {/* 에러 / 로딩 표시 */}
      {error && <p className="table-error">{error}</p>}
      {isLoading && <p className="table-loading">데이터 조회 중...</p>}

      {/* 측정 정보 테이블 */}
      {!isLoading && !error && (
        <>
          <p className="data-count">
            조회 결과: {data.length}건 (행을 클릭하면 정규화 데이터 표시)
          </p>
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
                    <tr
                      key={row.measurementId}
                      // 클릭 가능한 행 스타일 + 선택된 행 강조
                      className={`clickable-row ${
                        selectedMeasurementId === row.measurementId ? 'selected-row' : ''
                      }`}
                      onClick={() => handleRowClick(row.measurementId)}
                    >
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

      {/* 정규화 커브 데이터 표시 영역 (측정 선택 시에만 표시) */}
      {selectedMeasurementId !== null && (
        <div className="curve-section">
          <h4>정규화 데이터 (측정 ID: {selectedMeasurementId})</h4>

          {curveError && <p className="table-error">{curveError}</p>}
          {isCurveLoading && <p className="table-loading">커브 데이터 조회 중...</p>}

          {!isCurveLoading && !curveError && (
            <>
              {curveData.length > 0 ? (
                <>
                  {/* I-V 커브 그래프 */}
                  <div className="chart-wrapper">
                    <ResponsiveContainer width="100%" height={420}>
                      {/*
                        LineChart: recharts의 선 그래프 컴포넌트
                        - 측정값(파란선)과 STC 정규화값(보라선)을 같이 표시
                        - X축은 전압, Y축은 전류
                        - margin: Y축 라벨이 잘리지 않도록 left 여백을 늘림
                      */}
                      <LineChart
                        data={curveData}
                        margin={{ top: 30, right: 30, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="vMeasured"
                          label={{
                            value: '전압 (V)',
                            position: 'insideBottom',
                            offset: -18, // 축 숫자 아래에 라벨 배치 (3px 더 내림)
                          }}
                          type="number"
                          domain={['auto', 'auto']}
                          stroke="var(--text)"
                        />
                        <YAxis
                          label={{
                            value: '전류 (A)',
                            angle: -90,
                            position: 'insideLeft',
                            offset: 10, // Y축 라벨이 잘리지 않도록 안쪽으로 이동
                            style: { textAnchor: 'middle' },
                          }}
                          stroke="var(--text)"
                        />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                          }}
                        />
                        {/* Legend: 기본 위치에서 3px 아래로 */}
                        <Legend
                          verticalAlign="bottom"
                          wrapperStyle={{ paddingTop: 3 }}
                        />
                        {/* 측정값 곡선 (파란색) */}
                        <Line
                          type="monotone"
                          dataKey="iMeasured"
                          name="측정값"
                          stroke="#3182ce"
                          dot={false}
                          strokeWidth={2}
                        />
                        {/* STC 정규화값 곡선 (보라색) - case 0은 vStc/iStc가 null이라 안 그려짐 */}
                        <Line
                          type="monotone"
                          dataKey="iStc"
                          name="STC 정규화"
                          stroke="#aa3bff"
                          dot={false}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 정규화 데이터 테이블 */}
                  <div className="table-wrapper curve-table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {CURVE_COLUMNS.map((col) => (
                            <th key={col.key}>{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {curveData.map((row, index) => (
                          <tr key={index}>
                            {CURVE_COLUMNS.map((col) => (
                              <td key={col.key}>{row[col.key] ?? '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="no-data">커브 데이터가 없습니다.</p>
              )}
            </>
          )}
        </div>
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
