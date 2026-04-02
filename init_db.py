import sqlite3

# 1. DB 파일 연결 (없으면 새로 생성됨)
dbConnection = sqlite3.connect('project.db')
dbCursor = dbConnection.cursor()

# 2. schema.sql 파일 읽기
with open('schema.sql', 'r', encoding='utf-8') as schemaFile:
    sqlScript = schemaFile.read()

# 3. SQL 스크립트 실행
try:
    dbCursor.executescript(sqlScript)
    dbConnection.commit()
    print("성공: project.db 파일이 생성되고 테이블이 만들어졌습니다.")
except Exception as error:
    print(f"오류 발생: {error}")
finally:
    dbConnection.close()