import FileUpload from './components/FileUpload/FileUpload';
import DataTable from './components/DataTable/DataTable';
import './App.css';

function App() {
  return (
    <div className="app">
      <h1>태양광 모듈 I-V 커브 분석 툴</h1>
      <FileUpload />
      {/* 구분선 */}
      <hr className="section-divider" />
      <DataTable />
    </div>
  );
}

export default App;
