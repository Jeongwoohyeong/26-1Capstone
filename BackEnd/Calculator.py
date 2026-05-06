"""
KS C IEC 60891 보정절차 1 - STC 보정 계산기
태양광 실측 I-V 커브 데이터를 표준 시험 조건(STC)으로 변환한다.
Rs는 6.5절 방법으로 I-V 곡선의 고전압 영역에서 자동 계산한다.
"""

import numpy as np
import pandas as pd
from typing import List, Dict
from itertools import combinations


# ── 보정 상수 ──────────────────────────────────────────────────────
ALPHA = 0.00032 * 11.38      # 전류 온도 계수 [A/°C]
BETA = -0.00268 * 54.1       # 전압 온도 계수 [V/°C]
KAPPA = 0                    # 곡선 보정 계수 [Ω/°C]
G_STC = 1000.0               # STC 목표 일사량 [W/m²]
T_STC = 25.0                 # STC 목표 온도 [°C]
MIN_IRRADIANCE = 300.0       # 최소 일사량 기준 [W/m²]

# ── 고장 검출 기준값 (제조사 스펙 기반) ───────────────────────────
NORMAL_ISC_STC = 11.38       # 정상 단락전류 [A] (제조사 스펙)
NORMAL_VOC_STC = 54.1        # 정상 개방전압 [V] (제조사 스펙)
NORMAL_VRATIO  = 0.836       # 정상 vmaxStc / vocStc 비율 (45.2/54.1)
NORMAL_IRATIO  = 0.944       # 정상 imaxStc / iscStc 비율 (10.74/11.38)
NORMAL_FF      = 0.788       # 정상 충전율 (485/(54.1×11.38))
FAULT_THRESHOLD = 0.90       # 고장 판단 임계값 (정상의 90% 미만)
STEP_CURVATURE_THRESHOLD = 0.5   # 변동 1 (계단) 검출용 2차 미분 임계값


# 6.5절 방법으로 내부 직렬 저항 Rs 계산 + case 분류
def calculateRs(            #Rs값은 논문에 있는 식으로 직접 구해야함
    voltage: np.ndarray,
    current: np.ndarray,
    isc: float,
    irradiance: float,
) -> Dict:
    """
    KS C IEC 60891 6.5절 방법으로 내부 직렬 저항 Rs를 계산한다.
    I-V 곡선의 고전압 영역 데이터 점들로 선형 회귀하여 y절편 = Rs를 구한다.
    일사량이 300 W/m² 미만이면 case 0을 반환한다.

    Parameters
    ----------
    voltage    : 전압 배열 [V] (I-V 커브 전체)
    current    : 전류 배열 [A] (I-V 커브 전체)
    isc        : 단락전류 [A]
    irradiance : 일사량 [W/m²]

    Returns
    -------
    dict
        {
            "rs":          float or None,  # Rs [Ω]
            "rSquared":    float,          # R² 결정계수
            "dataPoints":  int,            # 고전압 영역 유효 데이터 점 수
            "case":        int,            # 1, 2, 3, 0 (분류)
        }

    case 분류:
        1 — 데이터 ≥ 10개, R² ≥ 0.995, X범위 충족, Rs > 0 (논문 기준 표준 보정)
        2 — 데이터 ≥ 2개, R² ≥ 0.995, X범위 충족, Rs > 0 (데이터 부족 임시 기준)
        3 — Rs > 0, X범위 충족, 데이터 ≥ 2개이지만 R² < 0.995
        0 — 위 조건 모두 미충족 (사용 불가)
    """
    # ── 일사량 300 W/m² 미만이면 case 0 ──────────────────────────
    if irradiance < MIN_IRRADIANCE:
        return {"rs": None, "rSquared": 0, "dataPoints": 0, "case": 0}

    # ── 고전압 영역 선택 (Vmax ~ Voc 근처) ─────────────────────────
    power = voltage * current
    indexPmax = np.argmax(power)
    highVoltageIndex = np.where(np.arange(len(voltage)) >= indexPmax)[0]

    voltageHigh = voltage[highVoltageIndex]
    currentHigh = current[highVoltageIndex]

    # 포화 데이터 제외: Isc - I > 0 인 점만
    validMask = (isc - currentHigh) > 0
    voltageHigh = voltageHigh[validMask]
    currentHigh = currentHigh[validMask]

    dataPoints = len(voltageHigh)

    #고전압 부근 전류-전압 쌍이 2쌍 미만일경우 필터링
    if dataPoints < 2:
        return {"rs": None, "rSquared": 0, "dataPoints": dataPoints, "case": 0}

    # ── 모든 2점 조합으로 X, Y 계산 ────────────────────────────────
    xList = []
    yList = []

    for i, j in combinations(range(len(voltageHigh)), 2):
        ia, va = currentHigh[i], voltageHigh[i]
        ib, vb = currentHigh[j], voltageHigh[j]

        # 분모 0 방지
        if ia == ib:
            continue
        # ln 내부 양수 확인
        if (isc - ia) <= 0 or (isc - ib) <= 0:
            continue

        x = -(np.log(isc - ia) - np.log(isc - ib)) / (ia - ib)
        y = -(va - vb) / (ia - ib)

        xList.append(x)
        yList.append(y)

    if len(xList) < 2:
        return {"rs": None, "rSquared": 0, "dataPoints": dataPoints, "case": 0}

    xArr = np.array(xList)
    yArr = np.array(yList)

    # ── X 범위 조건 확인: (Xmax - Xmin) > 2 × Xmin ────────────────
    xMin, xMax = xArr.min(), xArr.max()
    if xMin > 0:
        xRangePass = (xMax - xMin) > 2 * xMin
    else:
        xRangePass = False

    # ── 선형 회귀: Y = m * X + Rs ─────────────────────────────────
    coeffs = np.polyfit(xArr, yArr, 1)
    m = coeffs[0]
    rs = coeffs[1]  # y절편 = Rs

    # R² 계산
    yPred = m * xArr + rs
    ssRes = np.sum((yArr - yPred) ** 2)
    ssTot = np.sum((yArr - np.mean(yArr)) ** 2)
    rSquared = 1 - (ssRes / ssTot) if ssTot != 0 else 0

    # ── case 분류 ──────────────────────────────────────────────────
    rsPositive = rs > 0

    if dataPoints >= 10 and rSquared >= 0.995 and xRangePass and rsPositive:
        case = 1
    elif dataPoints >= 2 and rSquared >= 0.995 and xRangePass and rsPositive:
        case = 2
    elif dataPoints >= 2 and xRangePass and rsPositive and rSquared < 0.995:
        case = 3
    else:
        case = 0

    return {"rs": rs, "rSquared": rSquared, "dataPoints": dataPoints, "case": case}


# 보정절차 1 적용: 실측 I-V 데이터를 STC 조건으로 보정
def convertToStc(
    df: pd.DataFrame,
    rs: float,
    alpha: float = ALPHA,
    beta: float = BETA,
    kappa: float = KAPPA,
) -> List[Dict]:
    """
    KS C IEC 60891 보정절차 1을 적용해 실측 I-V 데이터를 STC로 보정한다.

    Parameters
    ----------
    df    : pd.DataFrame
        필수 컬럼: G1, T1, I1, V1, Isc1
          - G1   : 측정 일사량 [W/m²]
          - T1   : 측정 모듈 온도 [°C]
          - I1   : 측정 전류 [A]
          - V1   : 측정 전압 [V]
          - Isc1 : 측정 단락전류 [A]
    rs    : 내부 직렬 저항 [Ω] (calculateRs로 계산)
    alpha : 전류 온도 계수 [A/°C]
    beta  : 전압 온도 계수 [V/°C]
    kappa : 곡선 보정 계수 [Ω/°C]

    Returns
    -------
    list of dict
        [{"vMeasured": V1, "iMeasured": I1, "vStc": V2, "iStc": I2}, ...]
        vStc 기준 오름차순 정렬.
    """

    # ── 1. 컬럼 검증 ──────────────────────────────────────────────
    requiredCols = {"G1", "T1", "I1", "V1", "Isc1"}
    missing = requiredCols - set(df.columns)
    if missing:
        raise ValueError(f"데이터프레임에 필수 컬럼이 없습니다: {missing}")

    # ── 2. G1 == 0 방어 (일사량 필터링은 parser.py에서 처리) ─────────
    df = df[df["G1"] != 0.0].copy()

    if df.empty:
        return []

    # ── 3. 보정절차 1 수식 적용 (온도: 섭씨 그대로) ─────────────────

    # 식 (2): I2 = I1 + Isc1 × (G2/G1 - 1) + α × (T2 - T1)
    df["i2"] = (
        df["I1"]
        + df["Isc1"] * (G_STC / df["G1"] - 1)
        + alpha * (T_STC - df["T1"])
    )

    # 식 (3): V2 = V1 - Rs × (I2 - I1) - κ × I2 × (T2 - T1) + β × (T2 - T1)
    df["v2"] = (
        df["V1"]
        - rs * (df["i2"] - df["I1"])
        - kappa * df["i2"] * (T_STC - df["T1"])
        + beta * (T_STC - df["T1"])
    )

    # ── 4. 결과 딕셔너리 생성 및 정렬 ──────────────────────────────
    result = [
        {
            "vMeasured": round(row["V1"], 6),
            "iMeasured": round(row["I1"], 6),
            "vStc":      round(row["v2"], 6),
            "iStc":      round(row["i2"], 6),
        }
        for _, row in df.iterrows()
    ]

    # vStc 기준 오름차순 정렬 (프론트엔드 I-V 차트 선 꼬임 방지)
    result.sort(key=lambda x: x["vStc"])

    return result


# STC 보정된 (vStc, iStc) 포인트들에서 최대 전력 지점을 찾는다.
def findMaxPowerPoint(stcResults: List[Dict]) -> Dict:
    """
    STC 보정된 I-V 커브에서 최대 전력 지점(MPP)의 전압/전류/전력을 반환한다.

    Parameters
    ----------
    stcResults : convertToStc()의 반환 리스트
                 [{"vMeasured", "iMeasured", "vStc", "iStc"}, ...]

    Returns
    -------
    dict : {"vmaxStc": float, "imaxStc": float, "pmaxStc": float}
           stcResults가 비어있으면 모두 None
    """
    if not stcResults:
        return {"vmaxStc": None, "imaxStc": None, "pmaxStc": None}

    maxRow = max(stcResults, key=lambda row: row["vStc"] * row["iStc"])
    vmaxStc = maxRow["vStc"]
    imaxStc = maxRow["iStc"]
    pmaxStc = vmaxStc * imaxStc

    return {
        "vmaxStc": round(vmaxStc, 6),
        "imaxStc": round(imaxStc, 6),
        "pmaxStc": round(pmaxStc, 6),
    }


# STC 보정된 곡선의 끝점 두 개로 iscStc, vocStc를 외삽한다.
def extrapolateIscVocStc(stcResults: List[Dict]) -> Dict:
    """
    STC 보정 곡선의 양 끝점들을 사용해 iscStc(V=0)와 vocStc(I=0)를 외삽한다.

    Parameters
    ----------
    stcResults : convertToStc()의 반환 리스트 (vStc 오름차순 정렬)

    Returns
    -------
    dict : {"iscStc": float, "vocStc": float}
           점이 부족하면 None
    """
    if not stcResults or len(stcResults) < 2:
        return {"iscStc": None, "vocStc": None}

    # iscStc 외삽 (V=0): 처음 2점으로 선형 외삽
    v0, i0 = stcResults[0]["vStc"], stcResults[0]["iStc"]
    v1, i1 = stcResults[1]["vStc"], stcResults[1]["iStc"]
    if v1 != v0:
        slopeStart = (i1 - i0) / (v1 - v0)
        iscStc = i0 - slopeStart * v0
    else:
        iscStc = i0

    # vocStc 외삽 (I=0): 마지막 2점으로 선형 외삽
    vN1, iN1 = stcResults[-2]["vStc"], stcResults[-2]["iStc"]
    vN, iN = stcResults[-1]["vStc"], stcResults[-1]["iStc"]
    if iN != iN1:
        slopeEnd = (iN - iN1) / (vN - vN1)
        vocStc = vN - iN / slopeEnd
    else:
        vocStc = vN

    return {
        "iscStc": round(iscStc, 6),
        "vocStc": round(vocStc, 6),
    }


# STC 보정 곡선에서 6가지 고장 유형(IEC 62446-1 부속서 D)을 검출한다.
def detectFaults(stcResults: List[Dict], maxPowerPoint: Dict, iscVocStc: Dict) -> List[int]:
    """
    6가지 변동을 검출하여 발생한 변동 번호 리스트를 반환한다.

    Parameters
    ----------
    stcResults     : STC 보정 결과 (vStc 오름차순)
    maxPowerPoint  : findMaxPowerPoint() 반환값 (vmaxStc, imaxStc, pmaxStc)
    iscVocStc      : extrapolateIscVocStc() 반환값 (iscStc, vocStc)

    Returns
    -------
    list of int : [1, 3, 5] 처럼 검출된 변동 번호 리스트. 정상이면 빈 리스트.
    """
    faults = []

    if not stcResults or maxPowerPoint["pmaxStc"] is None:
        return faults

    iscStc = iscVocStc["iscStc"]
    vocStc = iscVocStc["vocStc"]
    vmaxStc = maxPowerPoint["vmaxStc"]
    imaxStc = maxPowerPoint["imaxStc"]
    pmaxStc = maxPowerPoint["pmaxStc"]

    # ── 변동 1: 계단형 커브 (2차 미분 급변 검출) ──────────────────
    vArray = np.array([row["vStc"] for row in stcResults])
    iArray = np.array([row["iStc"] for row in stcResults])
    if len(vArray) >= 4:
        dvSafe = np.where(np.diff(vArray) == 0, 1e-9, np.diff(vArray))
        firstDerivative = np.diff(iArray) / dvSafe
        secondDerivative = np.diff(firstDerivative)
        abnormalCount = int(np.sum(np.abs(secondDerivative) > STEP_CURVATURE_THRESHOLD))
        if abnormalCount >= 2:
            faults.append(1)

    # ── 변동 2: 낮은 단락전류 ─────────────────────────────────────
    if iscStc is not None and iscStc / NORMAL_ISC_STC < FAULT_THRESHOLD:
        faults.append(2)

    # ── 변동 3: 낮은 개방전압 ─────────────────────────────────────
    if vocStc is not None and vocStc / NORMAL_VOC_STC < FAULT_THRESHOLD:
        faults.append(3)

    # ── 변동 4: 곡률 반경 증가 (FF 감소) ──────────────────────────
    if iscStc and vocStc and iscStc > 0 and vocStc > 0:
        ff = pmaxStc / (vocStc * iscStc)
        if ff / NORMAL_FF < FAULT_THRESHOLD:
            faults.append(4)

    # ── 변동 5: 낮은 전압비 (수직 레그 완만) ──────────────────────
    if vocStc and vocStc > 0:
        vRatio = vmaxStc / vocStc
        if vRatio / NORMAL_VRATIO < FAULT_THRESHOLD:
            faults.append(5)

    # ── 변동 6: 낮은 전류비 (수평 레그 가파름) ────────────────────
    if iscStc and iscStc > 0:
        iRatio = imaxStc / iscStc
        if iRatio / NORMAL_IRATIO < FAULT_THRESHOLD:
            faults.append(6)

    return faults


# ════════════════════════════════════════════════════════════════════
# 더미 데이터 실행 예시
# ════════════════════════════════════════════════════════════════════
# if __name__ == "__main__":
#     import json

#     # ── 1. IV_Raw_Data 형태의 더미 I-V 커브 (고전압 영역 포함) ──────
#     dummyVoltage = np.array([
#         0.03, 1.09, 2.16, 3.22, 4.29, 5.35, 6.42, 7.49, 8.54, 9.61,
#         10.67, 11.74, 12.81, 13.88, 14.93, 16.01, 17.06, 18.13, 19.20,
#         20.27, 21.32, 22.40, 23.46, 24.53, 25.59, 26.66, 27.72, 28.79,
#         29.85, 30.92, 31.98, 33.05, 34.11, 35.18, 36.25, 37.32, 38.37,
#         39.45, 40.51, 41.57, 42.64, 43.71, 44.77, 45.84, 46.90, 47.97,
#         49.03, 50.10, 51.16, 51.65,
#     ])
#     dummyCurrent = np.array([
#         4.347, 4.345, 4.343, 4.343, 4.341, 4.339, 4.339, 4.337, 4.334,
#         4.331, 4.329, 4.327, 4.321, 4.317, 4.319, 4.315, 4.314, 4.311,
#         4.309, 4.306, 4.303, 4.300, 4.300, 4.296, 4.293, 4.290, 4.288,
#         4.286, 4.283, 4.280, 4.276, 4.274, 4.269, 4.265, 4.262, 4.262,
#         4.257, 4.253, 4.249, 4.238, 4.203, 4.134, 4.021, 3.839, 3.559,
#         3.137, 2.534, 1.696, 0.608, 0.000,
#     ])
#     dummyIsc = 4.347
#     dummyG1 = 360.2
#     dummyT1 = 20.3  # 온도3 (Ch1 중심 센서)

#     # ── 2. Rs 자동 계산 ────────────────────────────────────────────
#     print("=" * 60)
#     print("Rs 계산 (6.5절 방법)")
#     rsResult = calculateRs(dummyVoltage, dummyCurrent, dummyIsc, dummyG1)
#     print(f"  Rs = {rsResult['rs']:.6f} Ω")
#     print(f"  R² = {rsResult['rSquared']:.6f}")
#     print(f"  데이터 점: {rsResult['dataPoints']}개")
#     print(f"  Case: {rsResult['case']}")

#     # ── 3. STC 보정 실행 ───────────────────────────────────────────
#     if rsResult["case"] == 0:
#         print("\nRs 계산 실패 (case 0) — STC 보정 불가")
#     else:
#         dfCurve = pd.DataFrame({
#             "G1":   dummyG1,
#             "T1":   dummyT1,
#             "I1":   dummyCurrent,
#             "V1":   dummyVoltage,
#             "Isc1": dummyIsc,
#         })

#         print(f"\n원본 커브 데이터: {len(dfCurve)}개 포인트")
#         print(f"  G1={dummyG1} W/m², T1={dummyT1}°C, Isc={dummyIsc} A")

#         print("\n" + "=" * 60)
#         print("STC 보정 결과 (보정절차 1, vStc 오름차순)")
#         results = convertToStc(dfCurve, rs=rsResult["rs"])
#         print(json.dumps(results[:5], indent=2, ensure_ascii=False))
#         print(f"  ... 외 {len(results) - 5}개")
#         print(f"\n총 {len(results)}개 포인트 반환")
