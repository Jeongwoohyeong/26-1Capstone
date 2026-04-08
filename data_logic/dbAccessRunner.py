import sqlite3
import os
from DbAccess import saveData, getMeasurementList, getFullMeasurementData

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def runDbTasks(csvFile: str = "BackEnd/IV_Raw_Data(2024_1025_1552).csv"):
    """
    이 함수는 CSV 파일을 파싱하여 DB에 저장하고 목록을 출력합니다.
    테스트를 원할 시 csvFile 인자에 본인의 파일명을 넣어서 호출 가능
    """
    dbPath = os.path.join(BASE_DIR, "..", "db", "project.db")
    dbConnection = None

    try:
        dbConnection = sqlite3.connect(dbPath)

        # --- [1단계: 파싱 데이터를 DB로 옮기기] ---
        print(f"\n 1단계 시작: {csvFile} 데이터 저장 중...")
        saveResult = saveData(csvFile, "Ch1", dbConnection)
        print(f" 저장 완료! 생성된 ID: {saveResult['measurementId']}")

        # --- [2단계: 데이터베이스 전체 조회하기] ---
        print("\n 2단계 시작: 저장된 모든 측정 목록 조회 중...")
        allMeasurements = getMeasurementList(dbConnection)

        print("-" * 50)
        print(f"{'ID':<3} | {'측정 시각':<20} | {'채널':<5} | {'Case':<5}")
        print("-" * 50)

        for measurement in allMeasurements:
            print(f"{measurement['measurementId']:<3} | {measurement['measTime']:<20} | {measurement['channel']:<5} | {measurement['caseLevel']:<5}")

        print("-" * 50)
        print(f"총 {len(allMeasurements)}건의 데이터가 조회되었습니다.")

        # --- [3단계: 상세 데이터(JOIN) 조회하기] ---
        print("\n 3단계 시작: 측정 정보와 I-V 상세 데이터 합쳐서 조회 중...")
        fullData = getFullMeasurementData(dbConnection)

        print("-" * 70)
        print(f"{'ID':<3} | {'시각':<15} | {'전압(V)':<8} | {'전류(I)':<8} | {'전력(P)':<8}")
        print("-" * 70)

        # 상위 10개만 출력해보기 
        for dataRow in fullData[:10]:
            print(f"{dataRow['measurementId']:<3} | {dataRow['measTime'][11:19]:<15} | {dataRow['vMeasured']:<8.2f} | {dataRow['iMeasured']:<8.2f} | {dataRow['powerMeasured']:<8.2f}")

        print("-" * 70)
        print(f"상세 데이터 총 {len(fullData)}건이 매칭되어 조회되었습니다.")

    except Exception as error:
        print(f" 작업 중 에러 발생: {error}")

    finally:
        if dbConnection:
            dbConnection.close()
            print("\n DB 연결 종료")

if __name__ == "__main__":
    runDbTasks()
