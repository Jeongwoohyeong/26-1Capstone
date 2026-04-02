# React ↔ Python 데이터 전달 방식 비교

## 개요
UI(React)에서 파싱한 데이터를 분석(Python) 및 DB(SQLite)로 전달하는 방식을 비교한다.

---

## 방식 1: 파일 기반 (JSON)

### 흐름
```
React에서 파싱 → JSON 파일로 저장 → Python이 파일을 읽어서 처리 → 결과를 JSON으로 저장 → React가 결과 파일 읽기
```

### 구현 방법
1. React에서 파싱된 데이터를 JSON 형식으로 변환
2. 사용자가 "내보내기" 버튼을 누르면 로컬에 JSON 파일 저장 (브라우저 다운로드)
3. Python 스크립트가 해당 JSON 파일을 읽어서 분석 수행
4. 분석 결과를 별도 JSON 파일로 저장
5. React에서 결과 파일을 업로드하여 화면에 표시

### 장점
- 구현이 가장 단순하다
- 팀원 간 독립 작업이 가능하다 (파일 형식만 합의하면 됨)
- 서버 실행이 필요 없다

### 단점
- 매번 파일을 수동으로 저장/불러오기 해야 한다
- 실시간 연동이 불가능하다
- 사용자 경험(UX)이 불편하다

### 자동화가 불가능한 이유
파일명을 통일하면 자동 저장/불러오기가 가능할 것 같지만, **브라우저 보안 제한** 때문에 불가능하다.
React는 브라우저에서 실행되는데, 브라우저는 사용자 PC의 파일 시스템에 자유롭게 접근할 수 없다.

- **읽기**: 사용자가 파일 선택 창에서 직접 골라야만 가능. 코드에서 경로를 지정해서 자동으로 읽을 수 없다.
- **쓰기**: 브라우저 "다운로드" 형태로만 가능. 저장 경로나 파일명을 코드에서 강제할 수 없다.

이는 웹 보안의 기본 원칙(샌드박스)으로, 웹 페이지가 사용자 동의 없이 로컬 파일을 읽거나 쓰는 것을 방지하기 위한 것이다.
따라서 파일 기반 방식에서는 수동 파일 교환이 필수적이며, 자동화가 필요하면 서버를 통한 방식(방식 2)으로 전환해야 한다.

### 적합한 경우
- 프로토타입 단계에서 빠르게 연동 테스트할 때
- 팀원 간 인터페이스가 아직 확정되지 않은 초기 단계

---

## 방식 2: 로컬 HTTP 서버 (Flask / FastAPI)

### 흐름
```
React → fetch('http://localhost:5000/api/...') → Python 서버(Flask) → SQLite DB
                                                                         ↓
React ← JSON 응답 ←────────────────────────────────────── Python 서버(Flask)
```

### 구현 방법

#### Python 서버 (Flask 예시)
```python
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # React에서의 요청 허용

@app.route('/api/upload', methods=['POST'])
def upload_data():
    """React에서 보낸 파싱 데이터를 받아 DB에 저장"""
    data = request.get_json()  # React가 보낸 JSON 데이터
    # DB 저장 로직 수행
    # ...
    return jsonify({'status': 'success', 'count': len(data)})

@app.route('/api/query', methods=['GET'])
def query_data():
    """조건에 맞는 데이터를 DB에서 조회하여 반환"""
    channel = request.args.get('channel')
    # DB 조회 로직 수행
    # ...
    return jsonify({'data': results})

if __name__ == '__main__':
    app.run(port=5000)
```

#### React에서 호출
```javascript
// 파싱 데이터를 Python 서버로 전송
const response = await fetch('http://localhost:5000/api/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(parsedData),
});
const result = await response.json();
```

#### 실행 방법
1. 터미널 1: `python server.py` (Python 서버 실행, 포트 5000)
2. 터미널 2: `npm run dev` (React 개발 서버 실행, 포트 5173)
3. 브라우저에서 `http://localhost:5173` 접속

### 장점
- 실시간 데이터 송수신이 가능하다
- React와 Python이 명확한 API로 소통하여 구조가 깔끔하다
- 나중에 Electron으로 감싸서 데스크탑 앱으로 배포 가능하다
- REST API 패턴은 범용적이라 확장성이 좋다

### 단점
- Python 서버를 별도로 실행해야 한다 (개발 시 터미널 2개 필요, 배치 파일로 해소 가능)
- Flask/FastAPI 및 flask-cors 등 추가 패키지 설치가 필요하다
- 방식 1보다 초기 세팅이 복잡하다
- 최종 사용자 PC에 Python이 설치되어 있어야 한다 (PyInstaller로 .exe 패키징 시 해소 가능)

### 적합한 경우
- UI와 분석/DB 간 실시간 연동이 필요할 때
- 최종 결과물이 하나의 통합 앱 형태일 때

---

## 방식 3: Electron + Python

### 흐름
```
Electron 데스크탑 앱
├── React UI (렌더러 프로세스)
├── Node.js (메인 프로세스) → Python 자식 프로세스 실행
└── SQLite DB
```

### 구현 방법
1. Electron으로 React 앱을 데스크탑 앱으로 패키징
2. Electron의 메인 프로세스에서 Python 스크립트를 자식 프로세스(child_process)로 실행
3. Node.js ↔ Python 간 stdin/stdout 또는 IPC로 데이터 교환
4. 사용자는 하나의 .exe 파일만 실행하면 됨

```javascript
// Electron 메인 프로세스에서 Python 호출 예시
const { spawn } = require('child_process');
const python = spawn('python', ['analysis.py', '--input', 'data.json']);

python.stdout.on('data', (data) => {
  console.log(`결과: ${data}`);
});
```

### 장점
- 사용자가 하나의 앱만 실행하면 된다 (.exe 배포)
- 서버 실행/종료를 신경 쓸 필요 없다
- 가장 완성도 높은 사용자 경험

### 단점
- 구현 복잡도가 가장 높다
- Electron 자체가 무겁다 (앱 용량 100MB 이상)
- Python을 앱 안에 포함시키거나 사용자 PC에 설치되어 있어야 한다
- 디버깅이 어렵다

### 적합한 경우
- 최종 배포 단계에서 완성된 앱을 만들 때
- IT 비전공 사용자에게 배포해야 할 때

---

## 비교 요약

| 항목 | 방식 1 (파일) | 방식 2 (로컬 서버) | 방식 3 (Electron) |
|------|:---:|:---:|:---:|
| 구현 난이도 | 낮음 | 보통 | 높음 |
| 실시간 연동 | X | O | O |
| 사용자 경험 | 불편 | 보통 | 좋음 |
| 서버 실행 필요 | X | O (터미널 2개) | X |
| 확장성 | 낮음 | 높음 | 높음 |
| 배포 편의성 | - | 보통 | 좋음 |

## 권장 사항
- **개발 단계**: 방식 2 (로컬 HTTP 서버) — 실시간 연동 + 적절한 구현 난이도
- **배포 단계**: 방식 2 기반에서 Electron 또는 PyInstaller로 패키징하여 .exe 배포
- 방식 2로 개발한 코드는 방식 3 전환 시 거의 그대로 재사용 가능
