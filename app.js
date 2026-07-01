// フォルダ内のファイルデータ保持用
let filesA = [];
let filesB = [];
let nameA = "";
let nameB = "";

// DOM要素の取得
const dropzoneA = document.getElementById('dropzoneA');
const dropzoneB = document.getElementById('dropzoneB');
const inputA = document.getElementById('inputA');
const inputB = document.getElementById('inputB');
const labelA = document.getElementById('labelA');
const labelB = document.getElementById('labelB');
const compareBtn = document.getElementById('compareBtn');
const statusBar = document.getElementById('statusBar');

const tabA = document.getElementById('tabA');
const tabB = document.getElementById('tabB');
const tabRen = document.getElementById('tabRen');

const badgeA = document.getElementById('badgeA');
const badgeB = document.getElementById('badgeB');
const badgeRen = document.getElementById('badgeRen');

// フォルダ選択時のクリックイベント紐付け
dropzoneA.addEventListener('click', () => inputA.click());
dropzoneB.addEventListener('click', () => inputB.click());

// 入力チェンジハンドラ
inputA.addEventListener('change', (e) => handleFileSelect(e, 'A'));
inputB.addEventListener('change', (e) => handleFileSelect(e, 'B'));

// ドラッグ＆ドロップ関連イベントリスナーの設定
setupDragAndDrop(dropzoneA, 'A');
setupDragAndDrop(dropzoneB, 'B');

function setupDragAndDrop(zone, target) {
  // ドラッグ進入・移動時のデフォルト挙動を抑制してハイライト
  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    }, false);
  });

  // ドラッグ退出時のデフォルト挙動を抑制してハイライト解除
  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    }, false);
  });

  // ドロップ時のファイル解析
  zone.addEventListener('drop', async (e) => {
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    statusBar.innerText = `${target === 'A' ? 'フォルダ A' : 'フォルダ B'} をスキャン中...`;
    
    // 最初のアイテムをエントリ（ファイルまたはディレクトリ）として取得
    const item = items[0].webkitGetAsEntry();
    if (!item) return;

    if (item.isDirectory) {
      // フォルダ名をルートフォルダ名にする
      const rootName = item.name;
      const fileDataList = await scanDirectory(item, "");

      if (target === 'A') {
        filesA = fileDataList;
        nameA = rootName;
        labelA.innerText = `A: ${rootName}`;
        zone.classList.add('loaded');
        zone.querySelector('p').innerHTML = `${filesA.length} 個のファイルが読み込まれました`;
      } else {
        filesB = fileDataList;
        nameB = rootName;
        labelB.innerText = `B: ${rootName}`;
        zone.classList.add('loaded');
        zone.querySelector('p').innerHTML = `${filesB.length} 個のファイルが読み込まれました`;
      }
      statusBar.innerText = `${rootName} の読み込みが完了しました。`;
      checkReadyState();
    } else {
      statusBar.innerText = '⚠ フォルダをドロップしてください（ファイル単体は比較できません）。';
    }
  }, false);
}

// FileSystemDirectoryEntry を再帰的にスキャンしてファイル名・相対パス・サイズを収集する関数
async function scanDirectory(dirEntry, path = "") {
  return new Promise((resolve) => {
    const dirReader = dirEntry.createReader();
    const allEntries = [];

    // readEntriesは一度に全てを返さないことがあるため、空配列が返るまで再帰的に読み込む
    const readAll = () => {
      dirReader.readEntries(async (entries) => {
        if (entries.length === 0) {
          // すべてのエントリの解析プロミスを作成
          const promises = allEntries.map(entry => {
            if (entry.isFile) {
              return new Promise((resFile) => {
                entry.file((file) => {
                  resFile([{
                    name: file.name,
                    relPath: path + file.name,
                    size: file.size
                  }]);
                });
              });
            } else if (entry.isDirectory) {
              // サブディレクトリ内を再帰スキャン
              return scanDirectory(entry, path + entry.name + "/");
            }
            return Promise.resolve([]);
          });

          const results = await Promise.all(promises);
          resolve(results.flat());
        } else {
          allEntries.push(...entries);
          readAll();
        }
      });
    };
    readAll();
  });
}

function handleFileSelect(event, target) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  // 最初の相対パスからフォルダ名を取得
  const firstPath = files[0].webkitRelativePath || "";
  const rootName = firstPath.split('/')[0] || "選択済みフォルダ";

  // ファイル名とサイズのリストを生成
  const fileData = files.map(file => {
    // webkitRelativePathは "フォルダ名/サブフォルダ名/ファイル名.txt" のようになるので、
    // フォルダ名以降の相対パスを抽出
    const fullPath = file.webkitRelativePath || file.name;
    const relPath = fullPath.substring(fullPath.indexOf('/') + 1);
    return {
      name: file.name,
      relPath: relPath,
      size: file.size
    };
  });

  if (target === 'A') {
    filesA = fileData;
    nameA = rootName;
    labelA.innerText = `A: ${rootName}`;
    dropzoneA.classList.add('loaded');
    document.querySelector('#dropzoneA p').innerText = `${filesA.length} 個のファイルが読み込まれました`;
  } else {
    filesB = fileData;
    nameB = rootName;
    labelB.innerText = `B: ${rootName}`;
    dropzoneB.classList.add('loaded');
    document.querySelector('#dropzoneB p').innerText = `${filesB.length} 個のファイルが読み込まれました`;
  }

  checkReadyState();
}

function checkReadyState() {
  if (filesA.length > 0 && filesB.length > 0) {
    compareBtn.removeAttribute('disabled');
    statusBar.innerText = '比較準備が整いました。「比較開始」をクリックしてください。';
  } else {
    compareBtn.setAttribute('disabled', 'true');
  }
}

// 比較処理
compareBtn.addEventListener('click', () => {
  statusBar.innerText = '差分を計算中...';
  
  // サイズマップを構築 { size: [fileData, ...] }
  const mapA = buildSizeMap(filesA);
  const mapB = buildSizeMap(filesB);

  const sizesA = new Set(Object.keys(mapA));
  const sizesB = new Set(Object.keys(mapB));

  // Aにしかないサイズ
  const onlyInA = [];
  for (const size of sizesA) {
    if (!sizesB.has(size)) {
      onlyInA.push({ size: parseInt(size), files: mapA[size] });
    }
  }

  // Bにしかないサイズ
  const onlyInB = [];
  for (const size of sizesB) {
    if (!sizesA.has(size)) {
      onlyInB.push({ size: parseInt(size), files: mapB[size] });
    }
  }

  // リネーム可能性（AとBの両方に同一サイズが存在し、かつファイル名が異なるもの）
  const renamed = [];
  const commonSizes = [...sizesA].filter(size => sizesB.has(size));

  for (const size of commonSizes) {
    const listA = mapA[size];
    const listB = mapB[size];

    const namesA = new Set(listA.map(f => f.name));
    const namesB = new Set(listB.map(f => f.name));

    // ファイル名セットが一致しない ＝ 名前に違い（リネーム）がある
    if (!isSetEqual(namesA, namesB)) {
      renamed.push({
        size: parseInt(size),
        pathsA: listA.map(f => f.relPath),
        pathsB: listB.map(f => f.relPath)
      });
    }
  }

  // 結果の表示更新
  renderResults(onlyInA, onlyInB, renamed);
});

function buildSizeMap(fileList) {
  const map = {};
  fileList.forEach(file => {
    if (!map[file.size]) {
      map[file.size] = [];
    }
    map[file.size].push(file);
  });
  return map;
}

function isSetEqual(set1, set2) {
  if (set1.size !== set2.size) return false;
  for (const item of set1) {
    if (!set2.has(item)) return false;
  }
  return true;
}

// 単位変換
function formatBytes(bytes) {
  if (bytes === 0) return '0 バイト';
  const k = 1024;
  const sizes = ['バイト', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i === 0) return bytes + ' バイト';
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i] + ` (${bytes.toLocaleString()} バイト)`;
}

// 結果描画
function renderResults(onlyA, onlyB, renamed) {
  // バッジ件数更新
  const countA = onlyA.reduce((acc, curr) => acc + curr.files.length, 0);
  const countB = onlyB.reduce((acc, curr) => acc + curr.files.length, 0);
  const countRen = renamed.length;

  badgeA.innerText = countA;
  badgeB.innerText = countB;
  badgeRen = countRen; // 更新可能な変数に変更するため、badgeRenの参照を更新
  document.getElementById('badgeRen').innerText = countRen;

  // Aのみ描画
  if (countA === 0) {
    tabA.innerHTML = getEmptyStateHTML();
  } else {
    let html = '<div class="result-list">';
    onlyA.forEach(item => {
      item.files.forEach(f => {
        html += `
          <div class="result-item tab-a">
            <div class="filepath">📁 Aのみ: ${f.relPath}</div>
            <div class="file-meta">
              <span>⚖ 容量: ${formatBytes(f.size)}</span>
            </div>
          </div>
        `;
      });
    });
    html += '</div>';
    tabA.innerHTML = html;
  }

  // Bのみ描画
  if (countB === 0) {
    tabB.innerHTML = getEmptyStateHTML();
  } else {
    let html = '<div class="result-list">';
    onlyB.forEach(item => {
      item.files.forEach(f => {
        html += `
          <div class="result-item tab-b">
            <div class="filepath">📁 Bのみ: ${f.relPath}</div>
            <div class="file-meta">
              <span>⚖ 容量: ${formatBytes(f.size)}</span>
            </div>
          </div>
        `;
      });
    });
    html += '</div>';
    tabB.innerHTML = html;
  }

  // リネーム描画
  if (countRen === 0) {
    tabRen.innerHTML = getEmptyStateHTML();
  } else {
    let html = '<div class="result-list">';
    renamed.forEach(item => {
      html += `
        <div class="result-item tab-ren">
          <div class="rename-pair">
            <div class="filepath"><span class="rename-label">[A]</span>${item.pathsA.join(', ')}</div>
            <div class="divider"></div>
            <div class="filepath"><span class="rename-label">[B]</span>${item.pathsB.join(', ')}</div>
          </div>
          <div class="file-meta" style="margin-top: 0.5rem;">
            <span>⚖ 同一容量: ${formatBytes(item.size)}</span>
          </div>
        </div>
      `;
    });
    html += '</div>';
    tabRen.innerHTML = html;
  }

  statusBar.innerText = `✅ 比較完了 | Aのみ: ${countA}件 | Bのみ: ${countB}件 | リネーム: ${countRen}件`;
}

function getEmptyStateHTML() {
  return `
    <div class="empty-state">
      <div class="icon">✨</div>
      <div>差分はありません</div>
    </div>
  `;
}

// タブ切り替え制御
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const targetTabId = btn.getAttribute('data-tab');
    document.getElementById(targetTabId).classList.add('active');
  });
});
