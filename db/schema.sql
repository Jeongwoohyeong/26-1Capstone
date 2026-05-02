--기존 테이블이 있다면 삭제 (초기화용)
DROP TABLE IF EXISTS ivCurveData;
DROP TABLE IF EXISTS measurementInfo;

-- 1. 측정 정보 테이블
CREATE TABLE measurementInfo (
    measurementId INTEGER PRIMARY KEY AUTOINCREMENT,
    measTime TEXT NOT NULL,
    channel TEXT NOT NULL,
    irradiance REAL,
    isc REAL,
    voc REAL,
    vmax REAL,
    imax REAL,
    pmax REAL,
    fillFactor REAL,
    centerTemp REAL,
    -- 온도 데이터
    temp1 REAL, temp2 REAL, temp3 REAL, temp4 REAL, temp5 REAL, ambientTemp REAL,
    -- STC 보정 최대 전력 지점
    vmaxStc REAL, imaxStc REAL, pmaxStc REAL,
    --필터링 및 분석 결과 조건 [0:사용불가, 1:표준(10쌍+ALL PASS), 2:임시(2쌍+ALL PASS), 3:R²미달]
    caseLevel INTEGER DEFAULT 0,
    --중복 저장을 막는 핵심 제약 조건
    UNIQUE(measTime, channel)
);

-- 2. I-V 커브 상세 데이터 테이블
CREATE TABLE ivCurveData (
    curveDataId INTEGER PRIMARY KEY AUTOINCREMENT,
    measurementId INTEGER NOT NULL,
    vMeasured REAL,
    iMeasured REAL,
    powerMeasured REAL,
    vStc REAL,
    iStc REAL,
    FOREIGN KEY (measurementId) REFERENCES measurementInfo(measurementId) ON DELETE CASCADE
);

-- 3. 인덱스 설정 (조회 성능 최적화)
CREATE INDEX idx_meas_time_level ON measurementInfo (measTime, caseLevel);
CREATE INDEX idx_iv_link ON ivCurveData (measurementId);