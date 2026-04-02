// React 훅: useState(상태관리), useRef(DOM 요소 직접 참조)
import { useState, useRef } from 'react';
import './FileUpload.css';

// 채널 목록 상수 — 채널 추가/변경 시 여기만 수정
const CHANNELS = ['Ch1', 'Ch2', 'Ch3'];

function FileUpload() {
  // 상태 선언: [현재값, 변경함수] = useState(초기값)
  // 변경함수 호출 시 화면이 자동으로 다시 그려짐
  const [selectedChannel, setSelectedChannel] = useState('');   // 선택된 채널 (''이면 미선택)
  const [uploadedFiles, setUploadedFiles] = useState([]);       // 업로드된 파일 목록
  const [warning, setWarning] = useState('');                   // 경고 메시지 (''이면 숨김)
  const fileInputRef = useRef(null); // 숨겨진 <input type="file">을 가리키는 참조

  // 파일 선택 시 호출되는 핸들러
  const handleFileSelect = (event) => {
    // 채널 미선택 시 경고 후 중단
    if (!selectedChannel) {
      setWarning('채널을 먼저 선택해주세요.');
      event.target.value = '';
      return;
    }

    setWarning('');
    // event.target.files는 유사배열이라 Array.from()으로 배열 변환
    const files = Array.from(event.target.files);

    // .csv 파일만 분리
    const csvFiles = files.filter((file) => file.name.endsWith('.csv'));
    const rejectedFiles = files.filter((file) => !file.name.endsWith('.csv'));

    if (rejectedFiles.length > 0) {
      setWarning(`CSV 파일만 업로드 가능합니다. (${rejectedFiles.length}개 제외됨)`);
    }

    if (csvFiles.length === 0) {
      return;
    }

    // 중복 체크: 같은 채널 + 같은 파일명이면 제외
    const newFiles = csvFiles
      .filter((file) => {
        const isDuplicate = uploadedFiles.some(
          (existing) => existing.name === file.name && existing.channel === selectedChannel
        );
        return !isDuplicate;
      })
      // 통과한 파일을 { name, size, channel, file } 객체로 변환
      .map((file) => ({
        name: file.name,
        size: file.size,
        channel: selectedChannel, // 선택된 채널을 태그로 부착
        file: file,               // 원본 File 객체 (파싱 시 사용)
      }));

    // 중복으로 제외된 파일이 있으면 경고
    if (newFiles.length < csvFiles.length) {
      const skippedCount = csvFiles.length - newFiles.length;
      setWarning(`이미 업로드된 파일 ${skippedCount}개가 제외되었습니다.`);
    }

    // 기존 목록에 새 파일 추가 (...은 스프레드 문법: 배열을 펼쳐서 합침)
    setUploadedFiles((prev) => [...prev, ...newFiles]);
    // input 초기화 (같은 파일을 다시 선택할 수 있도록)
    event.target.value = '';
    // 채널 선택 초기화 — 다음 업로드 시 채널을 다시 선택하도록 강제하여 실수 방지
    setSelectedChannel('');
  };

  // 개별 파일 삭제: 해당 인덱스만 제외한 새 배열 생성
  const handleRemoveFile = (index) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // 전체 파일 삭제
  const handleClearAll = () => {
    setUploadedFiles([]);
    setWarning('');
  };

  // 파일 크기를 읽기 쉬운 단위로 변환 (B → KB → MB)
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // JSX: HTML처럼 생긴 JavaScript 문법. React에서 화면을 그리는 방식
  return (
    <div className="file-upload">
      <h2>파일 업로드</h2>

      {/* 채널 선택 라디오 버튼 영역 */}
      <div className="channel-select">
        <label className="channel-label">채널 선택</label>
        <div className="channel-options">
          {/* CHANNELS 배열을 순회하며 라디오 버튼 생성 */}
          {CHANNELS.map((channel) => (
            <label key={channel} className="radio-item">
              <input
                type="radio"
                name="channel"
                value={channel}
                checked={selectedChannel === channel}  // 현재 선택된 채널이면 체크
                onChange={(e) => {
                  setSelectedChannel(e.target.value);  // 채널 상태 변경
                  setWarning('');                      // 경고 초기화
                }}
              />
              {channel}
            </label>
          ))}
        </div>
      </div>

      {/* 조건부 렌더링: warning이 빈 문자열이면 표시 안 함 */}
      {warning && <p className="warning">{warning}</p>}

      {/* 파일 선택 영역 */}
      <div className="upload-area">
        {/* 실제 file input은 숨기고, 커스텀 버튼으로 대체 (디자인 제어 목적) */}
        <input
          type="file"
          ref={fileInputRef}    // useRef로 이 요소를 참조
          accept=".csv"         // 파일 선택 창에서 .csv만 표시
          multiple              // 다중 파일 선택 허용
          onChange={handleFileSelect}
          className="file-input" // display: none으로 숨김
        />
        <button
          className="select-button"
          onClick={() => {
            if (!selectedChannel) {
              setWarning('채널을 먼저 선택해주세요.');
              return;
            }
            fileInputRef.current.click(); // 숨겨진 file input을 대신 클릭
          }}
        >
          파일 선택 (.csv)
        </button>
        <p className="upload-hint">여러 파일을 한 번에 선택할 수 있습니다</p>
      </div>

      {/* 업로드된 파일이 있을 때만 목록 테이블 표시 */}
      {uploadedFiles.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <h3>업로드된 파일 ({uploadedFiles.length}개)</h3>
            <button className="clear-button" onClick={handleClearAll}>
              전체 삭제
            </button>
          </div>
          <table className="file-table">
            <thead>
              <tr>
                <th>파일명</th>
                <th>채널</th>
                <th>크기</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {/* 각 파일마다 테이블 행 생성 */}
              {uploadedFiles.map((file, index) => (
                <tr key={index}>
                  <td>{file.name}</td>
                  <td>{file.channel}</td>
                  <td>{formatFileSize(file.size)}</td>
                  <td>
                    <button
                      className="remove-button"
                      onClick={() => handleRemoveFile(index)}
                    >
                      X
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 다른 파일에서 import할 수 있도록 내보내기
export default FileUpload;
