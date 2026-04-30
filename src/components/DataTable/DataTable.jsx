import { useState, useEffect, useRef } from 'react';
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
import { downloadChartAsPng } from '../../utils/downloadChart';
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
  { value: 3, label: 'Case 3 (R²미달, 사용불가)' },
  { value: 0, label: 'Case 0 (조건/일사량 미달, 사용불가)' },
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
 * 한국어 12시간제 measTime 문자열을 24시간제 요소로 파싱
 * 입력: "2024-10-25 오후 4:33:04" 또는 "2024-10-25 오전 9:15:00"
 * 반환: { year, month, day, hour, minute, second } (모두 number, 실패 시 null)
 */
const parseKoreanMeasTime = (measTime) => {
  if (!measTime) return null;

  // 공백으로 분리: [날짜, 오전/오후, 시간]
  const parts = measTime.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const [datePart, ampm, timePart] = parts;
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const [hourStr, minuteStr, secondStr] = timePart.split(':');

  let hour = parseInt(hourStr, 10);
  // 12시간제 → 24시간제 변환 (오후 12시=12 그대로, 오전 12시=0시)
  if (ampm === '오후' && hour !== 12) hour += 12;
  else if (ampm === '오전' && hour === 12) hour = 0;

  return {
    year: parseInt(yearStr, 10),
    month: parseInt(monthStr, 10),
    day: parseInt(dayStr, 10),
    hour,
    minute: parseInt(minuteStr || '0', 10),
    second: parseInt(secondStr || '0', 10),
  };
};

/**
 * measTime 문자열을 Date 객체로 변환 (시간대 범위 필터 비교용)
 */
const measTimeToDate = (measTime) => {
  const p = parseKoreanMeasTime(measTime);
  if (!p) return null;
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
};

/**
 * 측정 시각 문자열을 파일명용 형식으로 변환
 * 입력: "2024-10-25 오후 4:33:04" / 출력: "20241025_163304"
 */
const formatMeasTimeForFilename = (measTime) => {
  const p = parseKoreanMeasTime(measTime);
  if (!p) return 'unknown';

  const yyyy = String(p.year);
  const MM = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  const ss = String(p.second).padStart(2, '0');

  return `${yyyy}${MM}${dd}_${hh}${mm}${ss}`;
};

/**
 * 숫자 범위 필터 항목 정의
 * key: 데이터 행의 필드명, label: UI에 표시할 라벨
 * 이 배열에만 추가하면 상태/UI/필터 로직이 자동 반영된다
 */
const NUMERIC_FILTERS = [
  { key: 'irradiance', label: '일사량' },
  { key: 'voc', label: 'Voc' },
  { key: 'isc', label: 'Isc' },
  { key: 'vmax', label: 'Vmax' },
  { key: 'imax', label: 'Imax' },
  { key: 'pmax', label: 'Pmax' },
  { key: 'fillFactor', label: 'Fill Factor' },
  { key: 'ambientTemp', label: '대기온도' },
];

/**
 * 필터 UI의 행별 배치 (시간대는 '__time__' 토큰으로 표현)
 * 각 배열이 한 줄을 이룬다
 */
const FILTER_ROWS = [
  ['__time__', 'irradiance', 'ambientTemp'],   // 환경 조건
  ['voc', 'isc', 'fillFactor'],                // I-V 커브 한계점 + 품질 지표
  ['vmax', 'imax', 'pmax'],                    // 최대 출력점 (MPP)
];

/**
 * 필터 입력 상태의 초기값 (모든 필드 빈 문자열 = "제한 없음")
 * 시간대 4필드 + 숫자 필터별 Min/Max 2필드 × N
 */
const EMPTY_FILTER = {
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  ...Object.fromEntries(
    NUMERIC_FILTERS.flatMap(({ key }) => [
      [`${key}Min`, ''],
      [`${key}Max`, ''],
    ])
  ),
};

/**
 * 적용된 필터 조건에 따라 측정 데이터를 걸러낸다
 * 모든 조건은 AND로 결합, 빈 값은 해당 방향 제한 없음
 */
const applyFilters = (rows, filter) => {
  // 시간대 경계 Date 생성 (날짜만 있고 시간 비었으면 00:00 / 23:59:59 보정)
  const toDate = (dateStr, timeStr, isEnd) => {
    if (!dateStr) return null;
    const time = timeStr || (isEnd ? '23:59:59' : '00:00:00');
    return new Date(`${dateStr}T${time}`);
  };
  const startDt = toDate(filter.startDate, filter.startTime, false);
  const endDt = toDate(filter.endDate, filter.endTime, true);

  // 숫자 범위 경계를 한 번만 파싱해 캐싱 (빈 문자열 → null)
  const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const bounds = NUMERIC_FILTERS.map(({ key }) => ({
    key,
    min: toNum(filter[`${key}Min`]),
    max: toNum(filter[`${key}Max`]),
  }));

  return rows.filter((row) => {
    // 시간대 필터
    if (startDt || endDt) {
      const rowDt = measTimeToDate(row.measTime);
      if (!rowDt) return false;
      if (startDt && rowDt < startDt) return false;
      if (endDt && rowDt > endDt) return false;
    }
    // 숫자 범위 필터들 (Min/Max 각각 검사, null이면 skip)
    for (const { key, min, max } of bounds) {
      const value = row[key];
      if (min !== null && !(value >= min)) return false;
      if (max !== null && !(value <= max)) return false;
    }
    return true;
  });
};

/**
 * 채널 하나의 데이터를 표시하는 개별 테이블 컴포넌트
 *
 * 필터 상태는 부모(DataTable)가 관리한다 — appliedFilter, selectedCase를 props로 수신
 * 측정 데이터 로드 완료 시 onMeasurementsLoaded 콜백으로 부모에게 전달 (일시 매핑용)
 */
function ChannelTable({
  channel,
  refreshKey,
  selectedCase,
  appliedFilter,
  selectedMeasurementId,
  curveData,
  isCurveLoading,
  curveError,
  isCurveExpanded,
  onSelect,
  onClearSelection,
  onToggleExpand,
  onMeasurementsLoaded,
}) {
  const [data, setData] = useState([]);                       // 측정 정보 목록 (원본)
  const [isLoading, setIsLoading] = useState(false);          // 측정 목록 로딩 상태
  const [error, setError] = useState('');                     // 측정 목록 에러

  // 차트 DOM 요소 참조 (이미지 저장 시 SVG 추출용)
  const chartRef = useRef(null);

  // 채널 또는 case 필터 변경 시 측정 목록 재조회
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const result = await fetchMeasurements(channel, selectedCase);
        setData(result);
        // 로드된 데이터를 부모에게 전달 (종합 그래프 일시 매핑용)
        onMeasurementsLoaded(channel, result);
        // 데이터가 바뀌면 선택도 초기화 (부모에게 알림)
        onClearSelection(channel);
      } catch (err) {
        setError(err.message);
        setData([]);
        onMeasurementsLoaded(channel, []);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, selectedCase, refreshKey]);

  // 측정 행 클릭 시 부모 콜백 호출
  const handleRowClick = (measurementId) => {
    onSelect(channel, measurementId);
  };

  // 적용된 필터로 걸러낸 화면용 데이터
  const filteredData = applyFilters(data, appliedFilter);

  return (
    <div className="channel-table">
      <div className="channel-table-header">
        <h3>{channel}</h3>
      </div>

      {/* 에러 / 로딩 표시 */}
      {error && <p className="table-error">{error}</p>}
      {isLoading && <p className="table-loading">데이터 조회 중...</p>}

      {/* 측정 정보 테이블 */}
      {!isLoading && !error && (
        <>
          <p className="data-count">
            조회 결과: {filteredData.length}건
            {filteredData.length !== data.length && ` / 전체 ${data.length}건`}
            {' '}(행을 클릭하면 정규화 데이터 표시)
          </p>
          {filteredData.length > 0 ? (
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
                  {filteredData.map((row) => (
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
          {/* 헤더: 제목 + 이미지 저장 + 펼치기/닫기 토글 버튼 */}
          <div className="curve-section-header">
            <h4>정규화 데이터 (측정 ID: {selectedMeasurementId})</h4>
            <div className="curve-section-actions">
              {/* 이미지 저장 버튼: 차트가 있을 때만 활성화 */}
              {isCurveExpanded && curveData && curveData.length > 0 && (
                <button
                  className="download-button"
                  onClick={() => {
                    // 선택된 측정의 measTime을 찾아서 파일명에 사용
                    const measurement = data.find(
                      (row) => row.measurementId === selectedMeasurementId
                    );
                    const timeStr = formatMeasTimeForFilename(measurement?.measTime);
                    downloadChartAsPng(
                      chartRef.current,
                      `${channel}_${timeStr}_${selectedMeasurementId}`
                    );
                  }}
                >
                  이미지 저장
                </button>
              )}
              <button
                className="toggle-button"
                onClick={() => onToggleExpand(channel)}
              >
                {isCurveExpanded ? '닫기 ▲' : '펼치기 ▼'}
              </button>
            </div>
          </div>

          {/* 펼친 상태일 때만 데이터 표시 */}
          {isCurveExpanded && curveError && <p className="table-error">{curveError}</p>}
          {isCurveExpanded && isCurveLoading && <p className="table-loading">커브 데이터 조회 중...</p>}

          {isCurveExpanded && !isCurveLoading && !curveError && (
            <>
              {curveData && curveData.length > 0 ? (
                <>
                  {/* 채널별 I-V 커브 그래프 (측정값 + STC) */}
                  <div className="chart-wrapper" ref={chartRef}>
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
 *
 * 필터 상태(selectedCase, filterDraft, appliedFilter)를 최상위에서 관리하여
 * 모든 채널에 동일한 필터가 적용된다.
 * 행 선택 시 해당 일시로 다른 채널 데이터를 자동 조회하여 종합 그래프에 표시한다.
 */
function DataTable({ refreshKey, isUploadOpen, onToggleUpload, uploadPanel }) {
  // 통합 차트 DOM 요소 참조 (이미지 저장용)
  const combinedChartRef = useRef(null);

  // ── 공통 필터 상태 (전체 채널에 동일하게 적용) ──
  const [selectedCase, setSelectedCase] = useState(null);
  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTER);
  const [appliedFilter, setAppliedFilter] = useState(EMPTY_FILTER);

  // ── 채널별 측정 데이터 (종합 그래프 일시 매핑용) ──
  // ChannelTable이 데이터를 로드할 때 onMeasurementsLoaded 콜백으로 채운다
  const [measurementsByChannel, setMeasurementsByChannel] = useState({
    Ch1: [],
    Ch2: [],
    Ch3: [],
  });

  // ── 채널별 선택 상태 (채널 IV 커브용 단일 선택) ──
  const [selectionByChannel, setSelectionByChannel] = useState({
    Ch1: null,
    Ch2: null,
    Ch3: null,
  });

  // ── 채널별 커브 데이터 (채널 IV 커브에 표시) ──
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

  // ── 종합 그래프 전용 커브 데이터 (일시 매핑 결과) ──
  // 행 클릭 시 해당 measTime으로 모든 채널을 자동 조회한 결과를 저장한다
  const [combinedChartCurvesByChannel, setCombinedChartCurvesByChannel] = useState({
    Ch1: [],
    Ch2: [],
    Ch3: [],
  });

  // 종합 그래프를 마지막으로 트리거한 행 정보 (해제 시 종합 그래프 초기화 판단용)
  const [combinedChartDriver, setCombinedChartDriver] = useState(null);
  // 형태: { channel: 'Ch1', measurementId: 5 } | null

  // ChannelTable이 데이터를 로드했을 때 measurementsByChannel 업데이트
  const handleMeasurementsLoaded = (channel, data) => {
    setMeasurementsByChannel((prev) => ({ ...prev, [channel]: data }));
  };

  // 필터 입력값 변경 핸들러 (공통)
  const handleFilterChange = (key, value) => {
    setFilterDraft((prev) => ({ ...prev, [key]: value }));
  };

  // 적용 버튼: draft를 적용 상태로 복사 + 모든 채널 선택/커브 해제
  const handleApplyFilter = () => {
    setAppliedFilter(filterDraft);
    setSelectionByChannel({ Ch1: null, Ch2: null, Ch3: null });
    setCurveDataByChannel({ Ch1: [], Ch2: [], Ch3: [] });
    setCombinedChartCurvesByChannel({ Ch1: [], Ch2: [], Ch3: [] });
    setCombinedChartDriver(null);
  };

  // 초기화 버튼: draft/applied 모두 초기화 + 모든 채널 선택/커브 해제
  const handleResetFilter = () => {
    setFilterDraft(EMPTY_FILTER);
    setAppliedFilter(EMPTY_FILTER);
    setSelectionByChannel({ Ch1: null, Ch2: null, Ch3: null });
    setCurveDataByChannel({ Ch1: [], Ch2: [], Ch3: [] });
    setCombinedChartCurvesByChannel({ Ch1: [], Ch2: [], Ch3: [] });
    setCombinedChartDriver(null);
  };

  // Case 변경: 모든 채널 재조회 + 선택/커브 전체 초기화
  const handleCaseChange = (value) => {
    setSelectedCase(value === '' ? null : Number(value));
    setSelectionByChannel({ Ch1: null, Ch2: null, Ch3: null });
    setCurveDataByChannel({ Ch1: [], Ch2: [], Ch3: [] });
    setCombinedChartCurvesByChannel({ Ch1: [], Ch2: [], Ch3: [] });
    setCombinedChartDriver(null);
  };

  /**
   * 측정 행 선택 핸들러
   *
   * 1. 해당 채널의 커브 데이터를 조회하여 채널 IV 커브에 표시
   * 2. 선택된 행의 measTime으로 다른 채널을 자동 조회하여 종합 그래프에 표시
   */
  const handleSelect = async (channel, measurementId) => {
    // 같은 행 다시 클릭 시 토글로 해제
    if (selectionByChannel[channel] === measurementId) {
      setSelectionByChannel((prev) => ({ ...prev, [channel]: null }));
      setCurveDataByChannel((prev) => ({ ...prev, [channel]: [] }));
      // 이 행이 종합 그래프를 트리거한 행이었다면 종합 그래프도 초기화
      if (
        combinedChartDriver?.channel === channel &&
        combinedChartDriver?.measurementId === measurementId
      ) {
        setCombinedChartDriver(null);
        setCombinedChartCurvesByChannel({ Ch1: [], Ch2: [], Ch3: [] });
      }
      return;
    }

    // 선택 상태 업데이트 + 새로 선택 시 자동으로 펼침
    setSelectionByChannel((prev) => ({ ...prev, [channel]: measurementId }));
    setExpandedByChannel((prev) => ({ ...prev, [channel]: true }));
    setLoadingByChannel((prev) => ({ ...prev, [channel]: true }));
    setErrorByChannel((prev) => ({ ...prev, [channel]: '' }));

    try {
      // 선택된 채널의 커브 데이터 조회
      const result = await fetchCurveData(measurementId);
      setCurveDataByChannel((prev) => ({ ...prev, [channel]: result }));

      // 종합 그래프 일시 매핑:
      // 선택된 측정의 measTime으로 다른 채널에서 동일 일시 데이터를 자동 조회한다
      const selectedMeasurement = measurementsByChannel[channel]
        .find((m) => m.measurementId === measurementId);

      if (selectedMeasurement) {
        const { measTime } = selectedMeasurement;
        setCombinedChartDriver({ channel, measurementId });

        // 모든 채널(선택 채널 포함) 일시 매핑 결과 초기화
        const newCombinedCurves = { Ch1: [], Ch2: [], Ch3: [] };
        newCombinedCurves[channel] = result; // 선택 채널은 이미 조회된 결과 재사용

        // 나머지 채널: 같은 measTime의 측정을 찾아 커브 병렬 조회
        const otherChannels = CHANNELS.filter((ch) => ch !== channel);
        await Promise.all(
          otherChannels.map(async (otherCh) => {
            const matched = measurementsByChannel[otherCh]
              .find((m) => m.measTime === measTime);
            if (matched) {
              try {
                newCombinedCurves[otherCh] = await fetchCurveData(matched.measurementId);
              } catch {
                // 매핑 실패 시 해당 채널은 종합 그래프에서 미표시
              }
            }
          })
        );

        setCombinedChartCurvesByChannel(newCombinedCurves);
      }
    } catch (err) {
      setErrorByChannel((prev) => ({ ...prev, [channel]: err.message }));
      setCurveDataByChannel((prev) => ({ ...prev, [channel]: [] }));
    } finally {
      setLoadingByChannel((prev) => ({ ...prev, [channel]: false }));
    }
  };

  // 채널 데이터 재조회 시 해당 채널 선택 해제 (ChannelTable useEffect에서 호출)
  const handleClearSelection = (channel) => {
    setSelectionByChannel((prev) => ({ ...prev, [channel]: null }));
    setCurveDataByChannel((prev) => ({ ...prev, [channel]: [] }));
  };

  // 채널별 펼침/닫힘 토글
  const handleToggleExpand = (channel) => {
    setExpandedByChannel((prev) => ({ ...prev, [channel]: !prev[channel] }));
  };

  // 종합 차트 데이터 (일시 매핑 결과 기반)
  const combinedChartData = buildCombinedChartData(combinedChartCurvesByChannel);

  // 종합 차트에 표시할 채널 (STC 데이터가 있는 채널만)
  const channelsWithStcData = CHANNELS.filter((channel) => {
    const data = combinedChartCurvesByChannel[channel];
    return data && data.some((point) => point.vStc !== null);
  });

  return (
    <div className="data-table-container">
      <div className="data-table-header">
        <h2>측정 데이터 조회</h2>
        {/* 토글 버튼 + 업로드 패널을 하나의 컨테이너로 묶어 우측 정렬 */}
        <div className="upload-toggle-wrapper">
          <button
            className="upload-toggle-button"
            onClick={onToggleUpload}
          >
            {isUploadOpen ? '파일 업로드 닫기 ▲' : '파일 업로드 ▼'}
          </button>
          {/* 파일 업로드 영역 (토글 시에만 표시, 버튼 바로 아래) */}
          {uploadPanel}
        </div>
      </div>

      {/* 공통 필터 패널: 모든 채널에 동일한 필터 적용 */}
      <div className="shared-filter-section">
        <div className="shared-filter-header">
          <h3>데이터 필터 (전체 채널 공통)</h3>
          {/* Case 필터: 공통으로 적용 */}
          <select
            className="case-filter"
            value={selectedCase ?? ''}
            onChange={(e) => handleCaseChange(e.target.value)}
          >
            {CASE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ''}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* 범위 필터 패널: FILTER_ROWS 설정에 따라 행 단위 렌더링 */}
        <div className="range-filter">
          {FILTER_ROWS.map((row, rowIdx) => (
            <div className="range-filter-row" key={rowIdx}>
              {row.map((token) => {
                // 시간대 필드: 4개 input (시작 date/time ~ 종료 date/time)
                if (token === '__time__') {
                  return (
                    <span key="__time__" className="range-filter-group">
                      <label className="range-filter-label">시간대</label>
                      <input
                        type="date"
                        className="range-filter-input"
                        value={filterDraft.startDate}
                        onChange={(e) => handleFilterChange('startDate', e.target.value)}
                      />
                      <input
                        type="time"
                        className="range-filter-input"
                        value={filterDraft.startTime}
                        onChange={(e) => handleFilterChange('startTime', e.target.value)}
                      />
                      <span className="range-filter-sep">~</span>
                      <input
                        type="date"
                        className="range-filter-input"
                        value={filterDraft.endDate}
                        onChange={(e) => handleFilterChange('endDate', e.target.value)}
                      />
                      <input
                        type="time"
                        className="range-filter-input"
                        value={filterDraft.endTime}
                        onChange={(e) => handleFilterChange('endTime', e.target.value)}
                      />
                    </span>
                  );
                }
                // 숫자 범위 필드: NUMERIC_FILTERS에서 라벨 찾아 렌더링
                const field = NUMERIC_FILTERS.find((f) => f.key === token);
                if (!field) return null;
                return (
                  <span key={field.key} className="range-filter-group">
                    <label className="range-filter-label">{field.label}</label>
                    <input
                      type="number"
                      className="range-filter-input range-filter-number"
                      placeholder="최소"
                      value={filterDraft[`${field.key}Min`]}
                      onChange={(e) => handleFilterChange(`${field.key}Min`, e.target.value)}
                    />
                    <span className="range-filter-sep">~</span>
                    <input
                      type="number"
                      className="range-filter-input range-filter-number"
                      placeholder="최대"
                      value={filterDraft[`${field.key}Max`]}
                      onChange={(e) => handleFilterChange(`${field.key}Max`, e.target.value)}
                    />
                  </span>
                );
              })}
            </div>
          ))}

          {/* 적용/초기화 버튼: 필터 패널 하단에 배치 */}
          <div className="range-filter-row range-filter-buttons-row">
            <div className="range-filter-actions">
              <button className="filter-apply-button" onClick={handleApplyFilter}>
                적용
              </button>
              <button className="filter-reset-button" onClick={handleResetFilter}>
                초기화
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 각 채널별 ChannelTable 렌더링 */}
      {CHANNELS.map((channel) => (
        <ChannelTable
          key={channel}
          channel={channel}
          refreshKey={refreshKey}
          selectedCase={selectedCase}
          appliedFilter={appliedFilter}
          selectedMeasurementId={selectionByChannel[channel]}
          curveData={curveDataByChannel[channel]}
          isCurveLoading={loadingByChannel[channel]}
          curveError={errorByChannel[channel]}
          isCurveExpanded={expandedByChannel[channel]}
          onSelect={handleSelect}
          onClearSelection={handleClearSelection}
          onToggleExpand={handleToggleExpand}
          onMeasurementsLoaded={handleMeasurementsLoaded}
        />
      ))}

      {/* 통합 STC 비교 차트: 기준행 선택 시 일시 매핑된 채널 커브를 표시 */}
      <div className="combined-chart-section">
        <div className="combined-chart-header">
          <h3>채널별 STC 정규화 IV 커브 비교</h3>
          {/* 이미지 저장 버튼: 데이터가 있을 때만 활성화 */}
          {channelsWithStcData.length > 0 && (
            <button
              className="download-button"
              onClick={() =>
                downloadChartAsPng(combinedChartRef.current, 'STC_channel_comparison')
              }
            >
              이미지 저장
            </button>
          )}
        </div>
        {channelsWithStcData.length === 0 && (
          <p className="no-data">측정 데이터를 선택하면 해당 일시의 채널별 STC 정규화 곡선이 표시됩니다.</p>
        )}
        <div className="chart-wrapper" ref={combinedChartRef}>
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
