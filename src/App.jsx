import { useState } from 'react';
import FileUpload from './components/FileUpload/FileUpload';
import DataTable from './components/DataTable/DataTable';
import './App.css';

function App() {
  // 데이터 새로고침 트리거 (업로드 성공 시 증가 → DataTable 재조회)
  const [refreshKey, setRefreshKey] = useState(0);
  // 파일 업로드 영역 펼침/닫힘 (기본: 닫힘)
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // 업로드 성공 시 호출되는 콜백
  const handleUploadSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="app">
      <DataTable
        refreshKey={refreshKey}
        isUploadOpen={isUploadOpen}
        onToggleUpload={() => setIsUploadOpen((prev) => !prev)}
        uploadPanel={
          isUploadOpen
            ? <FileUpload onUploadSuccess={handleUploadSuccess} />
            : null
        }
      />
    </div>
  );
}

export default App;
