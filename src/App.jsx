import FileUpload from './components/FileUpload/FileUpload';
import './App.css';

function App() {
  return (
    <div className="app">
      <h1>태양광 모듈 I-V 커브 분석 툴</h1>
      <FileUpload />
    </div>
  );
}

export default App;
