"""
FastAPI 서버 - 태양광 I-V 커브 STC 보정 시스템
프론트(React)와 백엔드를 API로 연결한다.
"""

from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import tempfile
import os
from typing import List, Optional
from DbAccess import saveData, getCurveData, getMeasurementList, getCurveDataByTime


app = FastAPI()

# ── CORS 설정 (React에서 요청 허용) ───────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB 연결 ────────────────────────────────────────────────────────
DATABASE_PATH = "solar.db"


def getConnection():
    """SQLite DB 연결 객체를 반환한다."""
    connection = sqlite3.connect(DATABASE_PATH)
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


# ── API 엔드포인트 ─────────────────────────────────────────────────

# CSV 파일 업로드 → 파싱 → 계산 → DB 저장
@app.post("/api/upload")
async def uploadFile(file: UploadFile, channel: str = Form(...)):
    """
    CSV 파일 1개를 업로드하여 파싱 → Rs 계산 → STC 보정 → DB 저장

    요청: CSV 파일 + channel (Ch1/Ch2/Ch3)
    응답: { success, measurementId, caseLevel }
    """
    # 임시 파일로 저장 (Parser.py가 파일 경로를 받으므로)
    tempFile = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
    try:
        content = await file.read()
        tempFile.write(content)
        tempFile.close()

        connection = getConnection()
        try:
            result = saveData(tempFile.name, channel, connection)
            return {
                "success": True,
                "measurementId": result["measurementId"],
                "caseLevel": result["case"],
            }
        except Exception as error:
            return {"success": False, "error": str(error)}
        finally:
            connection.close()
    finally:
        os.unlink(tempFile.name)


# 여러 CSV 파일 한번에 업로드
@app.post("/api/upload/multiple")
async def uploadMultipleFiles(files: List[UploadFile], channel: str = Form(...)):
    """
    CSV 파일 여러 개를 한번에 업로드

    요청: CSV 파일 리스트 + channel (Ch1/Ch2/Ch3)
    응답: { success, results: [{ fileName, measurementId, caseLevel }, ...] }
    """
    results = []
    connection = getConnection()

    try:
        for file in files:
            tempFile = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
            try:
                content = await file.read()
                tempFile.write(content)
                tempFile.close()

                result = saveData(tempFile.name, channel, connection)
                results.append({
                    "fileName": file.filename,
                    "measurementId": result["measurementId"],
                    "caseLevel": result["case"],
                })
            except Exception as error:
                results.append({
                    "fileName": file.filename,
                    "error": str(error),
                })
            finally:
                os.unlink(tempFile.name)

        return {"success": True, "results": results}
    finally:
        connection.close()


# 특정 측정의 I-V 커브 데이터 조회
@app.get("/api/curves/{measurementId}")
def getCurves(measurementId: int):
    """
    특정 측정 ID의 I-V 커브 데이터를 조회

    응답: { success, data: [{ vMeasured, iMeasured, powerMeasured, vStc, iStc }, ...] }
    """
    connection = getConnection()
    try:
        data = getCurveData(connection, measurementId)
        return {"success": True, "data": data}
    finally:
        connection.close()


# 측정 목록 조회 (채널/case 필터링)
@app.get("/api/measurements")
def getMeasurements(channel: Optional[str] = None, caseLevel: Optional[int] = None):
    """
    측정 정보 목록을 조회 (필터링 가능)

    쿼리 파라미터: channel (선택), caseLevel (선택)
    응답: { success, data: [{ measurementId, measTime, channel, caseLevel, ... }, ...] }
    """
    connection = getConnection()
    try:
        data = getMeasurementList(connection, channel, caseLevel)
        return {"success": True, "data": data}
    finally:
        connection.close()


# 여러 시간대 I-V 커브 비교 조회
@app.get("/api/curves/compare")
def compareCurves(channel: str, times: str):
    """
    여러 시간대의 I-V 커브 데이터를 조회 (겹쳐 비교용)

    쿼리 파라미터: channel, times (쉼표 구분, 예: "09:00,12:00,15:00")
    응답: { success, data: { "09:00": [...], "12:00": [...] } }
    """
    measTimeList = [time.strip() for time in times.split(",")]
    connection = getConnection()
    try:
        data = getCurveDataByTime(connection, channel, measTimeList)
        return {"success": True, "data": data}
    finally:
        connection.close()


# ════════════════════════════════════════════════════════════════════
# 서버 실행
# ════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
