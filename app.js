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
const spinner = document.getElementById('spinner');

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

function showLoading(msg) {
  spinner.style.display = 'block';
  statusBar.innerText = msg;
}

function hideLoading(msg) {
  spinner.style.display = 'none';
  if (msg) statusBar.innerText = msg;
}

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
    const rawFiles = e.dataTransfer.files;
    
    showLoading(`${target === 'A' ? 'フォルダ A' : 'フォルダ B'} をスキャン中...`);

    // 1. webkitGetAsEntry を優先使用（フォルダ構造を正しく再現するため）
    let item = null;
    if (items && items.length > 0) {
      item = items[0].webkitGetAsEntry();
    }

    if (item && item.isDirectory) {
      const rootName = item.name;
      const fileDataList = await scanDirectory(item, "");
      applyFolderData(target, rootName, fileDataList, zone);
    } 
    // 2. webkitGetAsEntryが失敗または非対応の場合のフォールバック (e.dataTransfer.files)
    else if (rawFiles && rawFiles.length > 0) {
      const fileDataList = [];
      let rootName = "選択フォルダ";

      // フォルダ構造を持つファイル群をパース
      for (let i = 0; i < rawFiles.length; i++) {
        const file = rawFiles[i];
        const fullPath = file.webkitRelativePath || file.name;
        const parts = fullPath.split('/');
        
        if (parts.length > 1) {
          rootName = parts[0];
          const relPath = fullPath.substring(fullPath.indexOf('/') + 1);
          fileDataList.push({
            name: file.name,
            relPath: relPath,
            size: file.size
          });
        } else {
          fileDataList.push({
            name: file.name,
            relPath: file.name,
            size: file.size
          });
        }
      }

      applyFolderData(target, rootName, fileDataList, zone);
    } else {
      hideLoading('⚠ フォルダの読み込みに失敗しました。');
    }
  }, false);
}

function applyFolderData(target, rootName, fileDataList, zone) {
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
  hideLoading(`${rootName} の読み込みが完了しました。`);
  checkReadyState();
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

// 比較結果の内部キャッシュ（Paging処理用）
let activeTab = 'tabA';
let resultsData = {
  tabA: [],  // [{relPath, size}]
  tabB: [],  // [{relPath, size}]
  tabRen: [] // [{pathsA, pathsB, size}]
};
let visibleCounts = {
  tabA: 0,
  tabB: 0,
  tabRen: 0
};
const PAGE_SIZE = 100;

// 比較処理
compareBtn.addEventListener('click', () => {
  showLoading('差分を計算中...');
  
  // レンダリングラグを防ぐため一時的に遅延させてUIを描画
  setTimeout(() => {
    // AとBそれぞれの相対パスごとのマップを構築して高速化 { relPath: size }
    const pathMapA = {};
    filesA.forEach(f => { pathMapA[f.relPath] = f.size; });

    const pathMapB = {};
    filesB.forEach(f => { pathMapB[f.relPath] = f.size; });

    // 1. 完全一致（相対パスもサイズも同じ）のファイルをリストから除外
    const unmatchedA = [];
    filesA.forEach(f => {
      if (pathMapB[f.relPath] === f.size) {
        // 同一ファイルが存在するため除外
      } else {
        unmatchedA.push(f);
      }
    });

    const unmatchedB = [];
    filesB.forEach(f => {
      if (pathMapA[f.relPath] === f.size) {
        // 同一ファイルが存在するため除外
      } else {
        unmatchedB.push(f);
      }
    });

    // 2. 残った不一致ファイルをサイズごとにグループ化
    const sizeMapA = buildSizeMap(unmatchedA);
    const sizeMapB = buildSizeMap(unmatchedB);

    const allSizes = new Set([...Object.keys(sizeMapA), ...Object.keys(sizeMapB)]);

    resultsData.tabA = [];
    resultsData.tabB = [];
    resultsData.tabRen = [];

    allSizes.forEach(sizeStr => {
      const size = parseInt(sizeStr);
      const listA = sizeMapA[size] || [];
      const listB = sizeMapB[size] || [];

      // 同じ容量を持つファイルが、それぞれ不一致ファイルの中に何個あるか
      const countA = listA.length;
      const countB = listB.length;

      // 個数の差分から「Aのみ」「Bのみ」を確定
      if (countA > countB) {
        // Aの方が多い ＝ 差分個数分だけ「Aのみに存在する」
        const diffCount = countA - countB;
        for (let i = 0; i < diffCount; i++) {
          resultsData.tabA.push({ relPath: listA[i].relPath, size: size });
        }
        // ペアになる分はリネーム候補とする
        if (countB > 0) {
          resultsData.tabRen.push({
            type: 'rename',
            size: size,
            pathsA: listA.slice(diffCount).map(f => f.relPath),
            pathsB: listB.map(f => f.relPath)
          });
        }
      } else if (countB > countA) {
        // Bの方が多い ＝ 差分個数分だけ「Bのみに存在する」
        const diffCount = countB - countA;
        for (let i = 0; i < diffCount; i++) {
          resultsData.tabB.push({ relPath: listB[i].relPath, size: size });
        }
        // ペアになる分はリネーム候補とする
        if (countA > 0) {
          resultsData.tabRen.push({
            type: 'rename',
            size: size,
            pathsA: listA.map(f => f.relPath),
            pathsB: listB.slice(diffCount).map(f => f.relPath)
          });
        }
      } else {
        // 個数が同じだがパスが異なる ＝ すべてリネーム候補
        if (countA > 0) {
          resultsData.tabRen.push({
            type: 'rename',
            size: size,
            pathsA: listA.map(f => f.relPath),
            pathsB: listB.map(f => f.relPath)
          });
        }
      }
    });

    // 4. 同一フォルダ単体内での重複コピー検出（全ファイル対象）
    const fullSizeMapA = buildSizeMap(filesA);
    const fullSizeMapB = buildSizeMap(filesB);

    Object.keys(fullSizeMapA).forEach(sizeStr => {
      const listA = fullSizeMapA[sizeStr];
      if (listA.length > 1) {
        resultsData.tabRen.push({
          type: 'dupA',
          size: parseInt(sizeStr),
          paths: listA.map(f => f.relPath)
        });
      }
    });

    Object.keys(fullSizeMapB).forEach(sizeStr => {
      const listB = fullSizeMapB[sizeStr];
      if (listB.length > 1) {
        resultsData.tabRen.push({
          type: 'dupB',
          size: parseInt(sizeStr),
          paths: listB.map(f => f.relPath)
        });
      }
    });

    // 初期化
    visibleCounts.tabA = 0;
    visibleCounts.tabB = 0;
    visibleCounts.tabRen = 0;

    badgeA.innerText = resultsData.tabA.length;
    badgeB.innerText = resultsData.tabB.length;
    document.getElementById('badgeRen').innerText = resultsData.tabRen.length;

    // 初期描画
    renderTabResults('tabA', true);
    renderTabResults('tabB', true);
    renderTabResults('tabRen', true);

    updateLoadMoreButton();

    hideLoading(`✅ 比較完了 | Aのみ: ${resultsData.tabA.length}件 | Bのみ: ${resultsData.tabB.length}件 | リネーム・コピー: ${resultsData.tabRen.length}件`);
  }, 50);
});

function buildSizeMap(fileList) {
  const map = {};
  const len = fileList.length;
  for (let i = 0; i < len; i++) {
    const file = fileList[i];
    if (!map[file.size]) {
      map[file.size] = [];
    }
    map[file.size].push(file);
  }
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

// タブごとの結果描画（Paging対応）
function renderTabResults(tabId, isNew = false) {
  const container = document.getElementById(tabId);
  const data = resultsData[tabId];
  const startIndex = visibleCounts[tabId];
  const endIndex = Math.min(startIndex + PAGE_SIZE, data.length);

  if (data.length === 0) {
    container.innerHTML = getEmptyStateHTML();
    return;
  }

  let html = isNew ? '<div class="result-list">' : container.querySelector('.result-list').innerHTML;

  for (let i = startIndex; i < endIndex; i++) {
    const item = data[i];
    if (tabId === 'tabA') {
      html += `
        <div class="result-item tab-a">
          <div class="filepath">📁 Aのみ: ${item.relPath}</div>
          <div class="file-meta">
            <span>⚖ 容量: ${formatBytes(item.size)}</span>
          </div>
        </div>
      `;
    } else if (tabId === 'tabB') {
      html += `
        <div class="result-item tab-b">
          <div class="filepath">📁 Bのみ: ${item.relPath}</div>
          <div class="file-meta">
            <span>⚖ 容量: ${formatBytes(item.size)}</span>
          </div>
        </div>
      `;
    } else if (tabId === 'tabRen') {
      if (item.type === 'dupA') {
        html += `
          <div class="result-item tab-ren" style="border-left: 4px solid var(--red);">
            <div style="font-size: 0.8rem; color: var(--red); margin-bottom: 0.25rem; font-weight: bold;">[フォルダ A内でのコピー・重複]</div>
            <div class="rename-pair">
              ${item.paths.map(p => `<div class="filepath">${p}</div>`).join('<div class="divider"></div>')}
            </div>
            <div class="file-meta" style="margin-top: 0.5rem;">
              <span>⚖ 同一容量: ${formatBytes(item.size)}</span>
            </div>
          </div>
        `;
      } else if (item.type === 'dupB') {
        html += `
          <div class="result-item tab-ren" style="border-left: 4px solid var(--green);">
            <div style="font-size: 0.8rem; color: var(--green); margin-bottom: 0.25rem; font-weight: bold;">[フォルダ B内でのコピー・重複]</div>
            <div class="rename-pair">
              ${item.paths.map(p => `<div class="filepath">${p}</div>`).join('<div class="divider"></div>')}
            </div>
            <div class="file-meta" style="margin-top: 0.5rem;">
              <span>⚖ 同一容量: ${formatBytes(item.size)}</span>
            </div>
          </div>
        `;
      } else if (item.type === 'rename') {
        html += `
          <div class="result-item tab-ren">
            <div style="font-size: 0.8rem; color: var(--yellow); margin-bottom: 0.25rem; font-weight: bold;">[フォルダ間でのリネーム]</div>
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
      }
    }
  }

  if (isNew) {
    html += '</div>';
    container.innerHTML = html;
  } else {
    container.querySelector('.result-list').innerHTML = html;
  }

  visibleCounts[tabId] = endIndex;
}

function updateLoadMoreButton() {
  const container = document.getElementById('loadMoreContainer');
  const btnCount = document.getElementById('loadMoreCount');
  
  const currentData = resultsData[activeTab];
  const currentVisible = visibleCounts[activeTab];

  if (currentData && currentVisible < currentData.length) {
    container.style.display = 'block';
    btnCount.innerText = currentData.length - currentVisible;
  } else {
    container.style.display = 'none';
  }
}

// さらに読み込むボタン
document.getElementById('loadMoreBtn').addEventListener('click', () => {
  renderTabResults(activeTab, false);
  updateLoadMoreButton();
});

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
    activeTab = btn.getAttribute('data-tab');
    document.getElementById(activeTab).classList.add('active');

    updateLoadMoreButton();
  });
});
