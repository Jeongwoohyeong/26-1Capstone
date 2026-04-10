import { useState } from 'react';
import FileUpload from './components/FileUpload/FileUpload';
import DataTable from './components/DataTable/DataTable';
import './App.css';

function App() {
  // 데이터 새로고침 트리거 (업로드 성공 시 증가 → DataTable 재조회)
  const [refreshKey, setRefreshKey] = useState(0);

  // 업로드 성공 시 호출되는 콜백
  const handleUploadSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="app">
      <h1>태양광 모듈 I-V 커브 분석 툴</h1>
      <FileUpload onUploadSuccess={handleUploadSuccess} />
      {/* 구분선 */}
      <hr className="section-divider" />
      <DataTable refreshKey={refreshKey} />
    </div>
  );
}

export default App;
