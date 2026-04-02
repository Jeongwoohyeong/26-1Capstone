"""
데이터 저장/조회 서비스
CSV 파싱 → Rs 계산 → STC 보정 → DB 저장, DB에서 I-V 커브 데이터 조회
"""

import sqlite3
import pandas as pd
from typing import List, Dict, Optional
from Parser import parseRawDataFile
from Calculator import calculateRs, convertToStc


# CSV 파일 1개를 파싱 → Rs 계산 → STC 보정 → DB 저장
def saveData(
    filePath: str,
    channel: str,
    connection: sqlite3.Connection,
) -> Dict:
    """
    CSV 파일 1개를 파싱 → Rs 계산 → STC 보정 → DB 저장

    Parameters
    ----------
    filePath   : IV_Raw_Data CSV 파일 경로
    channel    : 채널명 ("Ch1", "Ch2", "Ch3")
    connection : SQLite DB 연결 객체

    Returns
    -------
    dict : {"measurementId": int, "case": int}
    """
    # ── 1. CSV 파싱 ────────────────────────────────────────────────
    data = parseRawDataFile(filePath, channel)

    # ── 2. Rs 계산 + case 분류 ─────────────────────────────────────
    rsResult = calculateRs(
        data["voltage"],
        data["current"],
        data["isc"],
        data["irradiance"],
    )

    # ── 3. 측정 정보 테이블에 저장 ─────────────────────────────────
    cursor = connection.execute(
        """
        INSERT INTO measurementInfo (
            measTime, channel, irradiance, isc, voc, vmax, imax, pmax,
            fillFactor, centerTemp, temp1, temp2, temp3, temp4, temp5,
            ambientTemp, caseLevel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["measTime"],
            channel,
            data["irradiance"],
            data["isc"],
            data["voc"],
            data["vmax"],
            data["imax"],
            data["pmax"],
            data["fillFactor"],
            data["centerTemp"],
            data["temp1"],
            data["temp2"],
            data["temp3"],
            data["temp4"],
            data["temp5"],
            data["ambientTemp"],
            rsResult["case"],
        ),
    )
    measurementId = cursor.lastrowid

    # ── 4. STC 보정 (case 0이면 보정 안 함) ────────────────────────
    stcResults = []
    if rsResult["case"] > 0:
        dfCurve = pd.DataFrame({
            "G1":   data["irradiance"],
            "T1":   data["centerTemp"],
            "I1":   data["current"],
            "V1":   data["voltage"],
            "Isc1": data["isc"],
        })
        stcResults = convertToStc(dfCurve, rs=rsResult["rs"])

    # ── 5. I-V 커브 테이블에 저장 ──────────────────────────────────
    for index in range(len(data["voltage"])):
        vMeasured = data["voltage"][index]
        iMeasured = data["current"][index]
        powerMeasured = data["powerMeasured"][index]

        # 보정된 값 찾기 (stcResults는 vStc 기준 정렬되어 있으므로 원본 순서로 매칭)
        vStc = None
        iStc = None
        if stcResults:
            for stcRow in stcResults:
                if stcRow["vMeasured"] == round(vMeasured, 6) and stcRow["iMeasured"] == round(iMeasured, 6):
                    vStc = stcRow["vStc"]
                    iStc = stcRow["iStc"]
                    break

        connection.execute(
            """
            INSERT INTO ivCurveData (
                measurementId, vMeasured, iMeasured, powerMeasured, vStc, iStc
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (measurementId, vMeasured, iMeasured, powerMeasured, vStc, iStc),
        )

    connection.commit()

    return {"measurementId": measurementId, "case": rsResult["case"]}


# 특정 측정 ID의 I-V 커브 데이터 조회
def getCurveData(
    connection: sqlite3.Connection,
    measurementId: int,
) -> List[Dict]:
    """
    특정 측정의 I-V 커브 데이터를 조회한다.

    Parameters
    ----------
    connection    : SQLite DB 연결 객체
    measurementId : 측정 정보 id

    Returns
    -------
    list of dict : [{"vMeasured", "iMeasured", "powerMeasured", "vStc", "iStc"}, ...]
    """
    cursor = connection.execute(
        """
        SELECT vMeasured, iMeasured, powerMeasured, vStc, iStc
        FROM ivCurveData
        WHERE measurementId = ?
        ORDER BY vMeasured ASC
        """,
        (measurementId,),
    )

    return [
        {
            "vMeasured": row[0],
            "iMeasured": row[1],
            "powerMeasured":     row[2],
            "vStc":      row[3],
            "iStc":      row[4],
        }
        for row in cursor.fetchall()
    ]


# 측정 정보 목록 조회 (채널/case 필터링 가능)
def getMeasurementList(
    connection: sqlite3.Connection,
    channel: Optional[str] = None,
    caseLevel: Optional[int] = None,
) -> List[Dict]:
    """
    측정 정보 목록을 조회한다. 채널, case로 필터링 가능.

    Parameters
    ----------
    connection : SQLite DB 연결 객체
    channel    : 채널 필터 ("Ch1", "Ch2", "Ch3") — None이면 전체
    caseLevel  : case 필터 (0, 1, 2, 3) — None이면 전체

    Returns
    -------
    list of dict : [{"id", "measTime", "channel", "irradiance", "caseLevel", ...}, ...]
    """
    query = "SELECT * FROM measurementInfo WHERE 1=1"
    params = []

    if channel is not None:
        query += " AND channel = ?"
        params.append(channel)

    if caseLevel is not None:
        query += " AND caseLevel = ?"
        params.append(caseLevel)

    query += " ORDER BY measTime ASC"

    cursor = connection.execute(query, params)
    columns = [description[0] for description in cursor.description]

    return [
        dict(zip(columns, row))
        for row in cursor.fetchall()
    ]


# 여러 시간대의 I-V 커브 데이터 조회 (시간대 비교용)
def getCurveDataByTime(
    connection: sqlite3.Connection,
    channel: str,
    measTimeList: List[str],
) -> Dict[str, List[Dict]]:
    """
    여러 시간대의 I-V 커브 데이터를 조회한다. (시간대 비교용)

    Parameters
    ----------
    connection   : SQLite DB 연결 객체
    channel      : 채널명 ("Ch1", "Ch2", "Ch3")
    measTimeList : 조회할 측정 시각 리스트

    Returns
    -------
    dict : {measTime: [{"vMeasured", "iMeasured", "powerMeasured", "vStc", "iStc"}, ...], ...}
    """
    result = {}

    for measTime in measTimeList:
        cursor = connection.execute(
            """
            SELECT m.measTime, c.vMeasured, c.iMeasured, c.powerMeasured, c.vStc, c.iStc
            FROM ivCurveData c
            JOIN measurementInfo m ON c.measurementId = m.measurementId
            WHERE m.channel = ? AND m.measTime = ? AND m.caseLevel > 0
            ORDER BY c.vMeasured ASC
            """,
            (channel, measTime),
        )

        result[measTime] = [
            {
                "vMeasured": row[1],
                "iMeasured": row[2],
                "powerMeasured":     row[3],
                "vStc":      row[4],
                "iStc":      row[5],
            }
            for row in cursor.fetchall()
        ]

    return result
