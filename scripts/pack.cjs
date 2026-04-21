/**
 * 패키징 후처리 스크립트
 *
 * electron-builder는 dir 타겟으로 release/win-unpacked/ 만 생성한다.
 * 이 스크립트가 그 뒤를 이어받아:
 *   1) win-unpacked/ 의 파일들을 win-unpacked/app/ 하위로 이동 (최상위를 깔끔히)
 *   2) 최상위에 app\Solar Analysis Tool.exe 를 가리키는 .lnk 바로가기 생성
 *   3) 전체를 release/Solar Analysis Tool-<version>-win.zip 으로 압축
 *
 * electron-builder 의 afterPack 훅에서 직접 재배치하면
 * 내부 sanity check(resources/app.asar 위치 확인)가 실패하므로,
 * sanity check/서명까지 모두 끝난 dir 산출물을 후처리하는 방식으로 우회한다.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const archiver = require('archiver');

// package.json 에서 productName / version 읽기 (빌드 설정과 결과물 이름을 일치시키기 위함)
const pkg = require(path.join(__dirname, '..', 'package.json'));
const productName = pkg.build.productName;
const version = pkg.version;

const projectRoot = path.join(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const appSubDir = path.join(unpackedDir, 'app');
const exeName = `${productName}.exe`;
const lnkPath = path.join(unpackedDir, `${productName}.lnk`);
const zipPath = path.join(releaseDir, `${productName}-${version}-win.zip`);

if (!fs.existsSync(unpackedDir)) {
  console.error(`[pack] win-unpacked 디렉토리가 없습니다: ${unpackedDir}`);
  process.exit(1);
}

// 1) win-unpacked/ 내부의 모든 항목을 app/ 하위로 이동
//    (이미 app/ 이 존재하면 이전 빌드 잔해이므로 먼저 삭제)
if (fs.existsSync(appSubDir)) {
  fs.rmSync(appSubDir, { recursive: true, force: true });
}
fs.mkdirSync(appSubDir);

for (const item of fs.readdirSync(unpackedDir)) {
  if (item === 'app') continue;
  fs.renameSync(path.join(unpackedDir, item), path.join(appSubDir, item));
}

// 2) 바로가기(.lnk) 생성 — WScript.Shell COM을 PowerShell에서 호출
//    TargetPath 는 빌드 시점의 절대 경로지만 .lnk 포맷 자체가 상대 경로 힌트를 보관하므로
//    사용자가 zip을 다른 위치에 풀어도 Windows 링크 추적이 상대 위치 app\<exe>를 찾아 실행한다.
if (fs.existsSync(lnkPath)) {
  fs.rmSync(lnkPath);
}
const targetPath = path.join(appSubDir, exeName);
const psEscape = (value) => value.replace(/"/g, '`"');
const psCommand = [
  `$s = (New-Object -ComObject WScript.Shell).CreateShortcut("${psEscape(lnkPath)}")`,
  `$s.TargetPath = "${psEscape(targetPath)}"`,
  `$s.WorkingDirectory = "${psEscape(appSubDir)}"`,
  `$s.Save()`,
].join('; ');

execFileSync(
  'powershell',
  ['-NoProfile', '-NonInteractive', '-Command', psCommand],
  { stdio: 'inherit' }
);

// 3) 재배치된 win-unpacked/ 전체를 표준 zip으로 압축
//    Windows tar.exe(bsdtar)는 엔트리에 "./" 접두사를 붙이거나 deflate를 안 써서
//    Windows 탐색기가 "빈 zip"으로 취급하는 경우가 있다.
//    archiver 라이브러리는 deflate + PKZip 표준 준수 → Windows/7-Zip 모두 호환.
if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath);
}

(async function createZip() {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('warning', (err) => {
      // 심각도 낮은 경고(권한 등) 는 무시, 실제 오류만 reject
      if (err.code !== 'ENOENT') reject(err);
    });
    archive.on('error', reject);

    archive.pipe(output);
    // win-unpacked/ 내부 전체를 zip 루트로 포함
    archive.directory(unpackedDir, false);
    archive.finalize();
  });

  console.log(`[pack] 완료: ${path.relative(projectRoot, zipPath)}`);
})().catch((err) => {
  console.error('[pack] 압축 실패:', err);
  process.exit(1);
});
