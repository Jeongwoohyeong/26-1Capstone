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

// 다중 선택 행의 IV 커브 색상 팔레트 (measurementId % 길이 로 할당하여 안정적인 색상 유지)
const SELECTION_COLORS = [
  '#3182ce', // 파랑
  '#805ad5', // 보라
  '#2f855a', // 초록
  '#c05621', // 주황
  '#b83280', // 핑크
];

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
 * 채널 내 다중 선택된 행들의 커브 데이터를 통합 LineChart용 배열로 변환
 *
 * 각 행의 데이터 포인트를 하나의 배열로 합치되 행별로 다른 키를 사용한다.
 * 예: [{ vMeasured: 1.5, iMeasured_5: 3.2, iStc_5: 3.1, iMeasured_12: 3.0, iStc_12: 2.9 }, ...]
 * recharts의 connectNulls=true 로 행별 포인트를 자연스럽게 잇는다.
 */
const buildChannelCurveData = (selectedIds, curvesMap) => {
  const combined = [];

  selectedIds.forEach((id) => {
    const data = curvesMap[id];
    if (!data || data.length === 0) return;

    data.forEach((point) => {
      combined.push({
        vMeasured: point.vMeasured,
        [`iMeasured_${id}`]: point.iMeasured,
        [`iStc_${id}`]: point.iStc,
      });
    });
  });

  // X축(vMeasured) 기준 오름차순 정렬
  combined.sort((a, b) => a.vMeasured - b.vMeasured);
  return combined;
};

/**
 * 채널 하나의 데이터를 표시하는 개별 테이블 컴포넌트
 *
 * - 행 클릭(onRowClick): 해당 행을 IV 커브 표시 목록에 추가/제거 (토글)
 * - 라디오(onPrimaryChange): 기준행 지정/해제 (종합 그래프 + 상세 테이블 결정)
 * - 기준행은 전역 단일 선택 (DataTable에서 관리)
 */
function ChannelTable({
  channel,
  refreshKey,
  selectedCase,
  appliedFilter,
  selectedIds,           // 이 채널에서 IV 커브에 추가된 ID 배열
  primaryMeasurementId,  // 이 채널의 기준행 ID (전역 primaryRow에서 계산, 없으면 null)
  curvesBySelectedId,    // { measurementId: data[] } 이 채널의 커브 데이터 맵
  loadingCurveIds,       // 현재 커브 조회 중인 ID 배열
  isCurveExpanded,
  onRowClick,
  onPrimaryChange,
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

  // 측정 행의 CSS 클래스 결정
  const getRowClassName = (measurementId) => {
    const classes = ['clickable-row'];
    if (measurementId === primaryMeasurementId) {
      classes.push('selected-row-primary'); // 기준행: 진한 강조
    } else if (selectedIds.includes(measurementId)) {
      classes.push('selected-row');         // 선택 행: 옅은 보조
    }
    return classes.join(' ');
  };

  // 적용된 필터로 걸러낸 화면용 데이터
  const filteredData = applyFilters(data, appliedFilter);

  // 현재 채널에서 커브 데이터가 있는 선택 ID 목록
  const idsWithCurveData = selectedIds.filter((id) => curvesBySelectedId[id]);

  // 기준행의 커브 데이터 (상세 테이블에 표시)
  const primaryCurveData = primaryMeasurementId
    ? (curvesBySelectedId[primaryMeasurementId] || null)
    : null;

  // 다중 라인 IV 차트 데이터 (선택된 모든 행 합산)
  const channelCurveChartData = buildChannelCurveData(selectedIds, curvesBySelectedId);

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
            {' '}(행 클릭: IV 커브 추가 / 라디오: 기준행 지정)
          </p>
          {filteredData.length > 0 ? (
            <div className="table-wrapper measurement-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {/* 기준행 지정 라디오 버튼 컬럼 */}
                    <th className="radio-col" title="기준행 지정">기준</th>
                    {TABLE_COLUMNS.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row) => (
                    <tr
                      key={row.measurementId}
                      className={getRowClassName(row.measurementId)}
                      onClick={() => onRowClick(channel, row.measurementId)}
                    >
                      {/* 라디오 클릭은 행 클릭 이벤트와 분리 */}
                      <td
                        className="radio-col"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="radio"
                          className="primary-radio"
                          checked={primaryMeasurementId === row.measurementId}
                          onChange={() => {}}
                          onClick={() => onPrimaryChange(channel, row.measurementId)}
                        />
                      </td>
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

      {/* IV 커브 + 상세 데이터 영역 (행이 하나 이상 선택되면 표시) */}
      {selectedIds.length > 0 && (
        <div className="curve-section">
          {/* 헤더: 제목 + 이미지 저장 + 펼치기/닫기 토글 */}
          <div className="curve-section-header">
            <h4>
              {primaryMeasurementId
                ? `IV 커브 / 기준행 상세 (측정 ID: ${primaryMeasurementId})`
                : 'IV 커브 (기준행 미지정)'}
            </h4>
            <div className="curve-section-actions">
              {/* 이미지 저장: 차트가 있을 때만 활성화 */}
              {isCurveExpanded && idsWithCurveData.length > 0 && (
                <button
                  className="download-button"
                  onClick={() => {
                    // 기준행이 있으면 기준행 ID와 measTime으로 파일명 생성, 없으면 채널명만 사용
                    const measurement = primaryMeasurementId
                      ? data.find((row) => row.measurementId === primaryMeasurementId)
                      : null;
                    const timeStr = measurement
                      ? formatMeasTimeForFilename(measurement.measTime)
                      : 'multi';
                    downloadChartAsPng(
                      chartRef.current,
                      `${channel}_${timeStr}`
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

          {/* 커브 조회 중 표시 */}
          {isCurveExpanded && loadingCurveIds.length > 0 && (
            <p className="table-loading">
              커브 데이터 조회 중... ({loadingCurveIds.length}건)
            </p>
          )}

          {isCurveExpanded && (
            <>
              {/* 다중 선택 행 IV 커브 차트 */}
              {channelCurveChartData.length > 0 ? (
                <div className="chart-wrapper" ref={chartRef}>
                  <ResponsiveContainer width="100%" height={415}>
                    <LineChart
                      data={channelCurveChartData}
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
                      {/* 선택된 각 행의 측정값(solid) + STC(dashed) 라인 쌍 렌더링 */}
                      {selectedIds.map((id) => {
                        // 기준행은 굵고 불투명하게, 추가 행은 얇고 반투명하게 표시
                        const isPrimary = id === primaryMeasurementId;
                        const color = SELECTION_COLORS[id % SELECTION_COLORS.length];
                        const strokeWidth = isPrimary ? 2.5 : 1.5;
                        const strokeOpacity = isPrimary ? 1 : 0.6;
                        return [
                          <Line
                            key={`iMeasured_${id}`}
                            type="monotone"
                            dataKey={`iMeasured_${id}`}
                            name={`측정 (ID:${id})`}
                            stroke={color}
                            dot={false}
                            strokeWidth={strokeWidth}
                            strokeOpacity={strokeOpacity}
                            connectNulls
                          />,
                          <Line
                            key={`iStc_${id}`}
                            type="monotone"
                            dataKey={`iStc_${id}`}
                            name={`STC (ID:${id})`}
                            stroke={color}
                            dot={false}
                            strokeWidth={strokeWidth}
                            strokeOpacity={strokeOpacity}
                            strokeDasharray={isPrimary ? '' : '5 5'}
                            connectNulls
                          />,
                        ];
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                loadingCurveIds.length === 0 && (
                  <p className="no-data">커브 데이터가 없습니다.</p>
                )
              )}

              {/* 기준행 상세 데이터 테이블: 기준행이 지정된 경우에만 표시 */}
              {primaryMeasurementId ? (
                primaryCurveData && primaryCurveData.length > 0 ? (
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
                        {primaryCurveData.map((row, index) => (
                          <tr key={index}>
                            {CURVE_COLUMNS.map((col) => (
                              <td key={col.key}>{row[col.key] ?? '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  loadingCurveIds.includes(primaryMeasurementId)
                    ? null  // 로딩 중이면 위에서 이미 표시
                    : <p className="no-data">기준행의 커브 데이터가 없습니다.</p>
                )
              ) : (
                <p className="no-data-hint">
                  라디오 버튼으로 기준행을 지정하면 상세 데이터가 표시됩니다.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 채널별 STC 곡선을 통합한 차트 데이터 생성 (종합 그래프용)
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
 * 선택 구조:
 * - 행 클릭(다중): selectedIdsByChannel — 각 채널별로 여러 행 선택 가능, IV 커브 표시
 * - 라디오(단일): primaryRow — 전역에서 하나만 지정, 종합 그래프 + 상세 테이블 결정
 * 필터는 전체 채널 공통으로 적용된다.
 */
function DataTable({ refreshKey, isUploadOpen, onToggleUpload, uploadPanel }) {
  // 통합 차트 DOM 요소 참조 (이미지 저장용)
  const combinedChartRef = useRef(null);

  // ── 공통 필터 상태 (전체 채널에 동일하게 적용) ──
  const [selectedCase, setSelectedCase] = useState(null);
  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTER);
  const [appliedFilter, setAppliedFilter] = useState(EMPTY_FILTER);

  // ── 채널별 측정 데이터 (종합 그래프 일시 매핑용) ──
  const [measurementsByChannel, setMeasurementsByChannel] = useState({
    Ch1: [],
    Ch2: [],
    Ch3: [],
  });

  // ── 채널별 다중 선택 상태 (IV 커브 표시용) ──
  const [selectedIdsByChannel, setSelectedIdsByChannel] = useState({
    Ch1: [],
    Ch2: [],
    Ch3: [],
  });

  // ── 채널별 커브 데이터 맵 { measurementId: data[] } ──
  const [curvesByChannel, setCurvesByChannel] = useState({
    Ch1: {},
    Ch2: {},
    Ch3: {},
  });

  // ── 채널별 커브 로딩 중인 ID 목록 ──
  const [loadingCurveIdsByChannel, setLoadingCurveIdsByChannel] = useState({
    Ch1: [],
    Ch2: [],
    Ch3: [],
  });

  // ── 전역 기준행: 종합 그래프 + 상세 테이블 결정 ──
  // 형태: { channel: 'Ch1', measurementId: 5 } | null
  const [primaryRow, setPrimaryRow] = useState(null);

  // ── 채널별 펼침/닫힘 상태 ──
  const [expandedByChannel, setExpandedByChannel] = useState({
    Ch1: true,
    Ch2: true,
    Ch3: true,
  });

  // ── 종합 그래프 전용 커브 데이터 (기준행 일시 매핑 결과) ──
  const [combinedChartCurvesByChannel, setCombinedChartCurvesByChannel] = useState({
    Ch1: [],
    Ch2: [],
    Ch3: [],
  });

  // 모든 선택 상태 초기화 (필터 변경 / case 변경 시 사용)
  const clearAllSelections = () => {
    setSelectedIdsByChannel({ Ch1: [], Ch2: [], Ch3: [] });
    setCurvesByChannel({ Ch1: {}, Ch2: {}, Ch3: {} });
    setLoadingCurveIdsByChannel({ Ch1: [], Ch2: [], Ch3: [] });
    setPrimaryRow(null);
    setCombinedChartCurvesByChannel({ Ch1: [], Ch2: [], Ch3: [] });
  };

  // ChannelTable 데이터 로드 완료 시 measurementsByChannel 업데이트
  const handleMeasurementsLoaded = (channel, data) => {
    setMeasurementsByChannel((prev) => ({ ...prev, [channel]: data }));
  };

  // 필터 입력값 변경 핸들러 (공통)
  const handleFilterChange = (key, value) => {
    setFilterDraft((prev) => ({ ...prev, [key]: value }));
  };

  // 적용 버튼: 모든 채널 선택/커브 해제 후 필터 적용
  const handleApplyFilter = () => {
    setAppliedFilter(filterDraft);
    clearAllSelections();
  };

  // 초기화 버튼: 필터 + 선택 전체 초기화
  const handleResetFilter = () => {
    setFilterDraft(EMPTY_FILTER);
    setAppliedFilter(EMPTY_FILTER);
    clearAllSelections();
  };

  // Case 변경: 모든 채널 재조회 + 선택 전체 초기화
  const handleCaseChange = (value) => {
    setSelectedCase(value === '' ? null : Number(value));
    clearAllSelections();
  };

  /**
   * 행 클릭 핸들러 — 해당 행을 IV 커브 표시 목록에 토글 추가/제거
   *
   * 기준행(primaryRow)은 건드리지 않는다.
   * 단, 기준행으로 지정된 행을 클릭으로 제거하면 기준행도 함께 해제된다.
   */
  const handleRowClick = async (channel, measurementId) => {
    const currentIds = selectedIdsByChannel[channel];
    const isAlreadySelected = currentIds.includes(measurementId);

    if (isAlreadySelected) {
      // 선택 해제: selectedIds에서 제거 + 커브 데이터 삭제
      setSelectedIdsByChannel((prev) => ({
        ...prev,
        [channel]: prev[channel].filter((id) => id !== measurementId),
      }));
      setCurvesByChannel((prev) => {
        const updated = { ...prev[channel] };
        delete updated[measurementId];
        return { ...prev, [channel]: updated };
      });
      // 해제된 행이 기준행이었다면 기준행 + 종합 그래프도 초기화
      if (primaryRow?.channel === channel && primaryRow?.measurementId === measurementId) {
        setPrimaryRow(null);
        setCombinedChartCurvesByChannel({ Ch1: [], Ch2: [], Ch3: [] });
      }
      return;
    }

    // 신규 선택: selectedIds에 추가 + 커브 데이터 조회
    setSelectedIdsByChannel((prev) => ({
      ...prev,
      [channel]: [...prev[channel], measurementId],
    }));
    setExpandedByChannel((prev) => ({ ...prev, [channel]: true }));

    // 커브 로딩 시작
    setLoadingCurveIdsByChannel((prev) => ({
      ...prev,
      [channel]: [...prev[channel], measurementId],
    }));

    try {
      const result = await fetchCurveData(measurementId);
      setCurvesByChannel((prev) => ({
        ...prev,
        [channel]: { ...prev[channel], [measurementId]: result },
      }));
    } catch {
      // 로드 실패 시 selectedIds에서 롤백
      setSelectedIdsByChannel((prev) => ({
        ...prev,
        [channel]: prev[channel].filter((id) => id !== measurementId),
      }));
    } finally {
      setLoadingCurveIdsByChannel((prev) => ({
        ...prev,
        [channel]: prev[channel].filter((id) => id !== measurementId),
      }));
    }
  };

  /**
   * 라디오 클릭 핸들러 — 기준행 지정/해제
   *
   * 1. 기준행으로 지정: selectedIds에도 자동 추가 + 종합 그래프 일시 매핑
   * 2. 이미 기준행이면 해제 (토글): 종합 그래프 초기화
   */
  const handlePrimaryChange = async (channel, measurementId) => {
    const isAlreadyPrimary =
      primaryRow?.channel === channel && primaryRow?.measurementId === measurementId;

    if (isAlreadyPrimary) {
      // 기준행 해제 (토글)
      setPrimaryRow(null);
      setCombinedChartCurvesByChannel({ Ch1: [], Ch2: [], Ch3: [] });
      return;
    }

    // 새 기준행 지정
    setPrimaryRow({ channel, measurementId });
    setExpandedByChannel((prev) => ({ ...prev, [channel]: true }));

    // 기준행은 selectedIds에도 포함되어야 IV 커브에 표시됨
    const alreadySelected = selectedIdsByChannel[channel].includes(measurementId);
    if (!alreadySelected) {
      setSelectedIdsByChannel((prev) => ({
        ...prev,
        [channel]: [...prev[channel], measurementId],
      }));
    }

    // 커브 데이터가 없으면 조회
    let primaryCurveData = curvesByChannel[channel][measurementId];

    if (!primaryCurveData) {
      setLoadingCurveIdsByChannel((prev) => ({
        ...prev,
        [channel]: [...prev[channel], measurementId],
      }));
      try {
        primaryCurveData = await fetchCurveData(measurementId);
        setCurvesByChannel((prev) => ({
          ...prev,
          [channel]: { ...prev[channel], [measurementId]: primaryCurveData },
        }));
      } catch {
        // 커브 조회 실패 시 기준행 유지하되 종합 그래프는 건너뜀
        setLoadingCurveIdsByChannel((prev) => ({
          ...prev,
          [channel]: prev[channel].filter((id) => id !== measurementId),
        }));
        return;
      } finally {
        setLoadingCurveIdsByChannel((prev) => ({
          ...prev,
          [channel]: prev[channel].filter((id) => id !== measurementId),
        }));
      }
    }

    // 종합 그래프 일시 매핑: 기준행의 measTime으로 다른 채널 자동 조회
    const selectedMeasurement = measurementsByChannel[channel]
      .find((m) => m.measurementId === measurementId);

    if (selectedMeasurement) {
      const { measTime } = selectedMeasurement;
      const newCombinedCurves = { Ch1: [], Ch2: [], Ch3: [] };
      newCombinedCurves[channel] = primaryCurveData;

      // 나머지 채널: 같은 measTime 데이터 병렬 조회
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
  };

  // 채널 데이터 재조회 시 해당 채널 선택 해제 (ChannelTable useEffect에서 호출)
  const handleClearSelection = (channel) => {
    setSelectedIdsByChannel((prev) => ({ ...prev, [channel]: [] }));
    setCurvesByChannel((prev) => ({ ...prev, [channel]: {} }));
    setLoadingCurveIdsByChannel((prev) => ({ ...prev, [channel]: [] }));
    // 이 채널이 기준행이었다면 기준행 + 종합 그래프 초기화
    if (primaryRow?.channel === channel) {
      setPrimaryRow(null);
      setCombinedChartCurvesByChannel({ Ch1: [], Ch2: [], Ch3: [] });
    }
  };

  // 채널별 펼침/닫힘 토글
  const handleToggleExpand = (channel) => {
    setExpandedByChannel((prev) => ({ ...prev, [channel]: !prev[channel] }));
  };

  // 종합 차트 데이터 (기준행의 일시 매핑 결과 기반)
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
          selectedIds={selectedIdsByChannel[channel]}
          primaryMeasurementId={
            primaryRow?.channel === channel ? primaryRow.measurementId : null
          }
          curvesBySelectedId={curvesByChannel[channel]}
          loadingCurveIds={loadingCurveIdsByChannel[channel]}
          isCurveExpanded={expandedByChannel[channel]}
          onRowClick={handleRowClick}
          onPrimaryChange={handlePrimaryChange}
          onClearSelection={handleClearSelection}
          onToggleExpand={handleToggleExpand}
          onMeasurementsLoaded={handleMeasurementsLoaded}
        />
      ))}

      {/* 통합 STC 비교 차트: 기준행 지정 시 일시 매핑된 채널별 STC 커브 표시 */}
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
          <p className="no-data">
            기준행을 지정하면 해당 일시의 채널별 STC 정규화 곡선이 표시됩니다.
          </p>
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
                  connectNulls
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
