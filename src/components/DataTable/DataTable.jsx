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

// 채널별 색상 (통합 차트에서 구분용)
const CHANNEL_COLORS = {
  Ch1: '#3182ce', // 파랑
  Ch2: '#38a169', // 초록
  Ch3: '#e53e3e', // 빨강
};

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
 *
 * 부모(DataTable)로부터 selection 상태를 받아서 사용 (state lifting)
 * 행 클릭 시 onSelect 콜백으로 부모에게 알림
 */
function ChannelTable({
  channel,
  selectedMeasurementId,
  curveData,
  isCurveLoading,
  curveError,
  isCurveExpanded,
  onSelect,
  onClearSelection,
  onToggleExpand,
}) {
  const [data, setData] = useState([]);                       // 측정 정보 목록
  const [selectedCase, setSelectedCase] = useState(null);     // 선택된 case 필터
  const [isLoading, setIsLoading] = useState(false);          // 측정 목록 로딩 상태
  const [error, setError] = useState('');                     // 측정 목록 에러

  // 채널 또는 case 필터 변경 시 측정 목록 재조회
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const result = await fetchMeasurements(channel, selectedCase);
        setData(result);
        // 필터가 바뀌면 선택도 초기화 (부모에게 알림)
        onClearSelection(channel);
      } catch (err) {
        setError(err.message);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, selectedCase]);

  // 측정 행 클릭 시 부모 콜백 호출
  const handleRowClick = (measurementId) => {
    onSelect(channel, measurementId);
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
            <div className="table-wrapper measurement-table-wrapper">
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
          {/* 헤더: 제목 + 펼치기/닫기 토글 버튼 */}
          <div className="curve-section-header">
            <h4>정규화 데이터 (측정 ID: {selectedMeasurementId})</h4>
            <button
              className="toggle-button"
              onClick={() => onToggleExpand(channel)}
            >
              {isCurveExpanded ? '닫기 ▲' : '펼치기 ▼'}
            </button>
          </div>

          {/* 펼친 상태일 때만 데이터 표시 */}
          {isCurveExpanded && curveError && <p className="table-error">{curveError}</p>}
          {isCurveExpanded && isCurveLoading && <p className="table-loading">커브 데이터 조회 중...</p>}

          {isCurveExpanded && !isCurveLoading && !curveError && (
            <>
              {curveData && curveData.length > 0 ? (
                <>
                  {/* 채널별 I-V 커브 그래프 (측정값 + STC) */}
                  <div className="chart-wrapper">
                    <ResponsiveContainer width="100%" height={415}>
                      <LineChart
                        data={curveData}
                        margin={{ top: 30, right: 30, left: 20, bottom: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="vMeasured"
                          label={{
                            value: '전압 (V)',
                            position: 'insideBottom',
                            offset: -18,
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
                            offset: 10,
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
                        <Legend
                          verticalAlign="bottom"
                          wrapperStyle={{ bottom: 10 }}
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
                        {/* STC 정규화값 곡선 (붉은색) - case 0은 안 그려짐 */}
                        <Line
                          type="monotone"
                          dataKey="iStc"
                          name="STC 정규화"
                          stroke="#e53e3e"
                          dot={false}
                          strokeWidth={2}
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
 * 채널별 STC 곡선을 통합한 차트 데이터 생성
 *
 * 각 채널의 curveData를 하나의 배열로 합치되, 채널별로 다른 키를 사용한다.
 * 예: [{ vStc: 1.5, iStc_Ch1: 5.2 }, { vStc: 1.6, iStc_Ch2: 5.1 }, ...]
 * recharts는 connectNulls={true}로 같은 라인의 점들을 자연스럽게 잇는다.
 */
const buildCombinedChartData = (curveDataByChannel) => {
  const combined = [];

  CHANNELS.forEach((channel) => {
    const data = curveDataByChannel[channel];
    if (!data || data.length === 0) return;

    data.forEach((point) => {
      // STC 값이 있는 포인트만 추가 (case 0은 vStc/iStc가 null)
      if (point.vStc !== null && point.iStc !== null) {
        combined.push({
          vStc: point.vStc,
          [`iStc_${channel}`]: point.iStc,
        });
      }
    });
  });

  // X축(vStc) 기준 오름차순 정렬
  combined.sort((a, b) => a.vStc - b.vStc);

  return combined;
};

/**
 * 메인 DataTable 컴포넌트 — 채널별 3개 테이블 + 통합 비교 차트 렌더링
 */
function DataTable() {
  // 채널별 선택 상태: { Ch1: measurementId, Ch2: ..., Ch3: ... }
  const [selectionByChannel, setSelectionByChannel] = useState({
    Ch1: null,
    Ch2: null,
    Ch3: null,
  });

  // 채널별 커브 데이터: { Ch1: [...], Ch2: [...], Ch3: [...] }
  const [curveDataByChannel, setCurveDataByChannel] = useState({
    Ch1: [],
    Ch2: [],
    Ch3: [],
  });

  // 채널별 로딩/에러 상태
  const [loadingByChannel, setLoadingByChannel] = useState({});
  const [errorByChannel, setErrorByChannel] = useState({});

  // 채널별 펼침/닫힘 상태 (선택과 별개로 관리)
  const [expandedByChannel, setExpandedByChannel] = useState({
    Ch1: true,
    Ch2: true,
    Ch3: true,
  });

  // 측정 행 선택 핸들러: 채널과 measurementId를 받아서 커브 데이터 조회
  const handleSelect = async (channel, measurementId) => {
    // 같은 행 다시 클릭 시 토글로 해제
    if (selectionByChannel[channel] === measurementId) {
      setSelectionByChannel((prev) => ({ ...prev, [channel]: null }));
      setCurveDataByChannel((prev) => ({ ...prev, [channel]: [] }));
      return;
    }

    // 선택 상태 업데이트 + 새로 선택 시 자동으로 펼침
    setSelectionByChannel((prev) => ({ ...prev, [channel]: measurementId }));
    setExpandedByChannel((prev) => ({ ...prev, [channel]: true }));
    setLoadingByChannel((prev) => ({ ...prev, [channel]: true }));
    setErrorByChannel((prev) => ({ ...prev, [channel]: '' }));

    try {
      const result = await fetchCurveData(measurementId);
      setCurveDataByChannel((prev) => ({ ...prev, [channel]: result }));
    } catch (err) {
      setErrorByChannel((prev) => ({ ...prev, [channel]: err.message }));
      setCurveDataByChannel((prev) => ({ ...prev, [channel]: [] }));
    } finally {
      setLoadingByChannel((prev) => ({ ...prev, [channel]: false }));
    }
  };

  // 채널 필터 변경 시 해당 채널 선택 해제
  const handleClearSelection = (channel) => {
    setSelectionByChannel((prev) => ({ ...prev, [channel]: null }));
    setCurveDataByChannel((prev) => ({ ...prev, [channel]: [] }));
  };

  // 채널별 펼침/닫힘 토글
  const handleToggleExpand = (channel) => {
    setExpandedByChannel((prev) => ({ ...prev, [channel]: !prev[channel] }));
  };

  // 통합 차트 데이터 계산 (선택된 채널들의 STC 곡선 합치기)
  const combinedChartData = buildCombinedChartData(curveDataByChannel);

  // 통합 차트에 표시할 채널 (선택된 채널 + STC 데이터가 있는 채널만)
  const channelsWithStcData = CHANNELS.filter((channel) => {
    const data = curveDataByChannel[channel];
    return data && data.some((point) => point.vStc !== null);
  });

  return (
    <div className="data-table-container">
      <h2>측정 데이터 조회</h2>

      {/* 각 채널별 ChannelTable 렌더링 */}
      {CHANNELS.map((channel) => (
        <ChannelTable
          key={channel}
          channel={channel}
          selectedMeasurementId={selectionByChannel[channel]}
          curveData={curveDataByChannel[channel]}
          isCurveLoading={loadingByChannel[channel]}
          curveError={errorByChannel[channel]}
          isCurveExpanded={expandedByChannel[channel]}
          onSelect={handleSelect}
          onClearSelection={handleClearSelection}
          onToggleExpand={handleToggleExpand}
        />
      ))}

      {/* 통합 STC 비교 차트: 항상 표시 (선택된 데이터 없으면 빈 차트) */}
      <div className="combined-chart-section">
        <h3>채널별 STC 정규화 IV 커브 비교</h3>
        {channelsWithStcData.length === 0 && (
          <p className="no-data">측정 데이터를 선택하면 STC 정규화 곡선이 표시됩니다.</p>
        )}
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={415}>
            <LineChart
              data={combinedChartData}
              margin={{ top: 30, right: 30, left: 20, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="vStc"
                label={{
                  value: '전압 (V)',
                  position: 'insideBottom',
                  offset: -18,
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
                  offset: 10,
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
              <Legend
                verticalAlign="bottom"
                wrapperStyle={{ bottom: 10 }}
              />
              {/* 채널별로 Line 컴포넌트 생성 (STC 데이터가 있는 채널만) */}
              {channelsWithStcData.map((channel) => (
                <Line
                  key={channel}
                  type="monotone"
                  dataKey={`iStc_${channel}`}
                  name={channel}
                  stroke={CHANNEL_COLORS[channel]}
                  dot={false}
                  strokeWidth={2}
                  connectNulls // null 값 건너뛰고 같은 채널의 점들을 잇기
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default DataTable;
