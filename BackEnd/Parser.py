"""
IV_Raw_Data CSV 파일 파서
전기안전공사 측정 장비에서 출력된 IV_Raw_Data CSV 파일을 읽어
커브 데이터와 메타데이터를 추출한다.
"""

import numpy as np
from typing import Dict, Optional


# ── 채널별 온도 센서 매핑 ──────────────────────────────────────────
TEMP_SENSOR_MAP = {
    "Ch1": {"range": range(1, 6),   "center": 3},
    "Ch2": {"range": range(6, 11),  "center": 8},
    "Ch3": {"range": range(11, 16), "center": 12},
}


# IV_Raw_Data CSV 파일 1개를 읽어 커브 데이터 + 메타데이터 추출
def parseRawDataFile(
    filePath: str,
    channel: str,
) -> Dict:
    """
    IV_Raw_Data CSV 파일 1개를 읽어 필요한 데이터를 추출한다.

    Parameters
    ----------
    filePath : CSV 파일 경로
    channel  : 채널명 ("Ch1", "Ch2", "Ch3") — T1에 사용할 온도 센서 결정

    Returns
    -------
    dict
        {
            "voltage":     np.ndarray,  # 전압 배열 [V]
            "current":     np.ndarray,  # 전류 배열 [A]
            "powerMeasured": np.ndarray,  # 전력 배열 [W]
            "measTime":    str,         # 측정 시각
            "irradiance":  float,       # 일사량 G1 [W/m²]
            "voc":         float,       # 개방 전압 [V]
            "isc":         float,       # 단락 전류 [A]
            "vmax":        float,       # 최대전력 전압 [V]
            "imax":        float,       # 최대전력 전류 [A]
            "pmax":        float,       # 최대 전력 [W]
            "fillFactor":  float,       # Fill Factor [%]
            "centerTemp":  float,       # 채널별 중심 모듈 온도 T1 [°C]
            "temp1":       float,       # 채널별 온도 센서 1번 [°C]
            "temp2":       float,       # 채널별 온도 센서 2번 [°C]
            "temp3":       float,       # 채널별 온도 센서 3번 [°C]
            "temp4":       float,       # 채널별 온도 센서 4번 [°C]
            "temp5":       float,       # 채널별 온도 센서 5번 [°C]
            "ambientTemp": float,       # 대기 온도 [°C]
        }
    """
    voltage = []
    current = []
    power = []
    metadata = {}
    temperatures = {}
    sensorRange = TEMP_SENSOR_MAP[channel]["range"]

    with open(filePath, "r", encoding="cp949", errors="ignore") as file:
        lines = file.readlines()

    dataSection = True

    for line in lines:
        stripped = line.strip()

        # END 이후는 메타데이터 영역
        if stripped.startswith("END"):
            dataSection = False
            continue

        # ── 커브 데이터 영역 ───────────────────────────────────────
        if dataSection:
            parts = stripped.split(",")
            if len(parts) >= 3:
                try:
                    voltage.append(float(parts[0]))
                    current.append(float(parts[1]))
                    power.append(float(parts[2]))
                except ValueError:
                    pass
            continue

        # ── 메타데이터 영역 (END 이후) ────────────────────────────
        if ":" not in stripped:
            continue

        key, _, value = stripped.partition(":")
        value = value.strip().rstrip(",").strip()

        if "Meas.Time" in key:
            metadata["measTime"] = value

        elif "Isc" in key:
            try:
                metadata["isc"] = float(value)
            except ValueError:
                pass

        elif "Voc" in key:
            try:
                metadata["voc"] = float(value)
            except ValueError:
                pass

        elif "Vmax" in key:
            try:
                metadata["vmax"] = float(value)
            except ValueError:
                pass

        elif "Imax" in key:
            try:
                metadata["imax"] = float(value)
            except ValueError:
                pass

        elif "Pmax" in key:
            try:
                metadata["pmax"] = float(value)
            except ValueError:
                pass

        elif "Fill Factor" in key:
            try:
                metadata["fillFactor"] = float(value)
            except ValueError:
                pass

        elif "W/" in key:
            # 일사량 [W/㎡]
            try:
                metadata["irradiance"] = float(value)
            except ValueError:
                pass

        elif key.strip().startswith("\xc0\xcf") and "W/" in key:
            # cp949 인코딩된 '일사량'
            try:
                metadata["irradiance"] = float(value)
            except ValueError:
                pass

        elif key.strip().endswith("]"):
            # 온도 파싱: 채널별 센서 범위만 추출 + 대기온도
            keyStripped = key.strip()

            # 숫자 추출 시도: "온도 3[℃]" → 3
            sensorNumber = None
            for number in range(15, 0, -1):  # 15부터 역순으로 (15를 1보다 먼저 매칭)
                if f"{number}[" in keyStripped:
                    sensorNumber = number
                    break

            if sensorNumber is not None and sensorNumber in sensorRange:
                temperatures[sensorNumber] = _parseFloat(value)
            elif sensorNumber is None:
                # 숫자가 없으면 대기온도
                metadata["ambientTemp"] = _parseFloat(value)

    # ── 채널별 온도 결정 ──────────────────────────────────────────
    centerSensor = TEMP_SENSOR_MAP[channel]["center"]
    centerTemp = temperatures.get(centerSensor, None)
    sensorList = list(sensorRange)

    return {
        "voltage":      np.array(voltage),
        "current":      np.array(current),
        "powerMeasured": np.array(power),
        "measTime":     metadata.get("measTime", ""),
        "irradiance":   metadata.get("irradiance", 0.0),
        "voc":          metadata.get("voc", 0.0),
        "isc":          metadata.get("isc", 0.0),
        "vmax":         metadata.get("vmax", 0.0),
        "imax":         metadata.get("imax", 0.0),
        "pmax":         metadata.get("pmax", 0.0),
        "fillFactor":   metadata.get("fillFactor", 0.0),
        "centerTemp":   centerTemp,
        "temp1":        temperatures.get(sensorList[0], None),
        "temp2":        temperatures.get(sensorList[1], None),
        "temp3":        temperatures.get(sensorList[2], None),
        "temp4":        temperatures.get(sensorList[3], None),
        "temp5":        temperatures.get(sensorList[4], None),
        "ambientTemp":  metadata.get("ambientTemp", 0.0),
    }


# 문자열을 float로 변환 (실패 시 None)
def _parseFloat(value: str) -> Optional[float]:
    """문자열을 float로 변환. 실패 시 None 반환."""
    try:
        return float(value.strip().rstrip(",").strip())
    except (ValueError, AttributeError):
        return None


# ════════════════════════════════════════════════════════════════════
# 테스트 실행
# ════════════════════════════════════════════════════════════════════
# if __name__ == "__main__":
#     testFile = (
#         "Result_Data (4)/Result_Data/IV_Data/Ch1/IV_Raw_Data/"
#         "IV_Raw_Data(2026_0311_1640).csv"
#     )

#     data = parseRawDataFile(testFile, channel="Ch1")

#     print("=== 파싱 결과 ===")
#     print(f"  측정 시각:   {data['measTime']}")
#     print(f"  일사량 G1:   {data['irradiance']} W/m²")
#     print(f"  Isc:         {data['isc']} A")
#     print(f"  Voc:         {data['voc']} V")
#     print(f"  Vmax:        {data['vmax']} V")
#     print(f"  Imax:        {data['imax']} A")
#     print(f"  Pmax:        {data['pmax']} W")
#     print(f"  Fill Factor: {data['fillFactor']} %")
#     print(f"  중심 온도:   {data['centerTemp']} °C")
#     print(f"  temp1~5:     {data['temp1']}, {data['temp2']}, {data['temp3']}, {data['temp4']}, {data['temp5']}")
#     print(f"  대기 온도:   {data['ambientTemp']} °C")
#     print(f"  커브 포인트: {len(data['voltage'])}개")
#     print(f"  전압 범위:   {data['voltage'].min():.2f} ~ {data['voltage'].max():.2f} V")
#     print(f"  전류 범위:   {data['current'].min():.3f} ~ {data['current'].max():.3f} A")
