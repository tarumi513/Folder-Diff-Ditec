"""
フォルダ差分検知ツール（ファイル容量版）
リネームされたファイルも同一容量のファイルとして検知します。
"""

import os
import threading
import tkinter as tk
from tkinter import filedialog, font, scrolledtext, ttk


# ──────────────────────────────────────────
#  容量取得
# ──────────────────────────────────────────
def build_size_map(folder: str, status_cb=None) -> dict[int, list[str]]:
    """
    フォルダ内の全ファイルを走査し、
    {size: [相対パス, ...]} の辞書を返す。
    """
    size_map: dict[int, list[str]] = {}
    for root, _, files in os.walk(folder):
        for name in files:
            abs_path = os.path.join(root, name)
            rel_path = os.path.relpath(abs_path, folder)
            if status_cb:
                status_cb(f"走査中... {rel_path}")
            try:
                size = os.path.getsize(abs_path)
                size_map.setdefault(size, []).append(rel_path)
            except (OSError, PermissionError):
                continue
    return size_map


# ──────────────────────────────────────────
#  差分計算
# ──────────────────────────────────────────
def compare_folders(
    map_a: dict[int, list[str]],
    map_b: dict[int, list[str]],
) -> tuple[list, list, list]:
    """
    Returns:
        only_in_a  : Aにしか存在しないファイルのリスト [(size, [paths])]
        only_in_b  : Bにしか存在しないファイルのリスト [(size, [paths])]
        renamed    : 同一容量・名前違いのペアリスト [(size, paths_a, paths_b)]
    """
    sizes_a = set(map_a.keys())
    sizes_b = set(map_b.keys())

    only_in_a = [(s, map_a[s]) for s in (sizes_a - sizes_b)]
    only_in_b = [(s, map_b[s]) for s in (sizes_b - sizes_a)]

    renamed = []
    for s in sizes_a & sizes_b:
        names_a = {os.path.basename(p) for p in map_a[s]}
        names_b = {os.path.basename(p) for p in map_b[s]}
        # 少なくとも一方の名前が異なれば「リネームあり（同容量・異名）」
        if names_a != names_b:
            renamed.append((s, map_a[s], map_b[s]))

    return only_in_a, only_in_b, renamed


# ──────────────────────────────────────────
#  GUI
# ──────────────────────────────────────────
class App(tk.Tk):
    # カラーパレット
    BG = "#1e1e2e"
    PANEL = "#2a2a3e"
    ACCENT = "#7c6af7"
    ACCENT2 = "#56d3a0"
    FG = "#cdd6f4"
    FG_DIM = "#6c7086"
    RED = "#f38ba8"
    GREEN = "#a6e3a1"
    YELLOW = "#f9e2af"

    def __init__(self):
        super().__init__()
        self.title("フォルダ差分検知ツール（ファイル容量ベース）")
        self.geometry("900x680")
        self.configure(bg=self.BG)
        self.resizable(True, True)

        self._folder_a = tk.StringVar()
        self._folder_b = tk.StringVar()
        self._status = tk.StringVar(value="フォルダを選択して「比較開始」をクリックしてください。")

        self._build_ui()

    # ── UI構築 ────────────────────────────
    def _build_ui(self):
        title_font = font.Font(family="Yu Gothic UI", size=14, weight="bold")
        label_font = font.Font(family="Yu Gothic UI", size=10)
        mono_font  = font.Font(family="Consolas", size=9)

        # タイトルバー
        header = tk.Frame(self, bg=self.ACCENT, height=4)
        header.pack(fill="x")

        tk.Label(
            self, text="📂 フォルダ差分検知ツール（ファイル容量ベース）",
            font=title_font, bg=self.BG, fg=self.FG, pady=10,
        ).pack()

        # フォルダ選択パネル
        sel_frame = tk.Frame(self, bg=self.PANEL, padx=16, pady=12)
        sel_frame.pack(fill="x", padx=16, pady=(0, 8))

        for i, (label, var) in enumerate(
            [("フォルダ A：", self._folder_a), ("フォルダ B：", self._folder_b)]
        ):
            tk.Label(sel_frame, text=label, font=label_font,
                     bg=self.PANEL, fg=self.FG, width=12, anchor="w").grid(
                row=i, column=0, sticky="w", pady=4)
            tk.Entry(sel_frame, textvariable=var, font=label_font,
                     bg=self.BG, fg=self.FG, insertbackground=self.FG,
                     relief="flat", bd=4, width=60).grid(
                row=i, column=1, sticky="ew", padx=6)
            tk.Button(
                sel_frame, text="参照", font=label_font,
                bg=self.ACCENT, fg="white", relief="flat", padx=10,
                cursor="hand2",
                command=lambda v=var: self._browse(v),
            ).grid(row=i, column=2, padx=(0, 4), pady=4)

        sel_frame.columnconfigure(1, weight=1)

        # 比較ボタン
        self._btn = tk.Button(
            self, text="▶ 比較開始", font=font.Font(family="Yu Gothic UI", size=11, weight="bold"),
            bg=self.ACCENT, fg="white", relief="flat", padx=20, pady=8,
            cursor="hand2", command=self._start_compare,
        )
        self._btn.pack(pady=(0, 8))

        # ステータスバー
        tk.Label(
            self, textvariable=self._status,
            font=label_font, bg=self.BG, fg=self.FG_DIM,
        ).pack()

        # 結果タブ
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TNotebook", background=self.BG, borderwidth=0)
        style.configure("TNotebook.Tab", background=self.PANEL, foreground=self.FG,
                        padding=[12, 5], font=("Yu Gothic UI", 10))
        style.map("TNotebook.Tab", background=[("selected", self.ACCENT)],
                  foreground=[("selected", "white")])

        self._nb = ttk.Notebook(self)
        self._nb.pack(fill="both", expand=True, padx=16, pady=8)

        self._text_a   = self._add_tab("🔴 Aのみ（削除/未追加）", self.RED,   mono_font)
        self._text_b   = self._add_tab("🟢 Bのみ（追加/新規）",   self.GREEN, mono_font)
        self._text_ren = self._add_tab("🟡 リネームの可能性",       self.YELLOW, mono_font)

    def _add_tab(self, title: str, tag_color: str, mono_font) -> scrolledtext.ScrolledText:
        frame = tk.Frame(self._nb, bg=self.BG)
        self._nb.add(frame, text=title)
        txt = scrolledtext.ScrolledText(
            frame, font=mono_font, bg=self.PANEL, fg=self.FG,
            insertbackground=self.FG, relief="flat", bd=0,
            wrap="none", state="disabled",
        )
        txt.pack(fill="both", expand=True, padx=4, pady=4)
        txt.tag_configure("highlight", foreground=tag_color)
        txt.tag_configure("dim",       foreground=self.FG_DIM)
        return txt

    # ── フォルダ選択 ──────────────────────
    def _browse(self, var: tk.StringVar):
        path = filedialog.askdirectory()
        if path:
            var.set(path)

    # ── 比較処理（別スレッド） ───────────
    def _start_compare(self):
        folder_a = self._folder_a.get().strip()
        folder_b = self._folder_b.get().strip()

        if not folder_a or not folder_b:
            self._status.set("⚠ フォルダA・Bの両方を指定してください。")
            return
        if not os.path.isdir(folder_a):
            self._status.set(f"⚠ フォルダAが存在しません: {folder_a}")
            return
        if not os.path.isdir(folder_b):
            self._status.set(f"⚠ フォルダBが存在しません: {folder_b}")
            return

        self._btn.configure(state="disabled")
        self._set_text(self._text_a,   "")
        self._set_text(self._text_b,   "")
        self._set_text(self._text_ren, "")
        self._status.set("走査中... しばらくお待ちください。")

        def worker():
            map_a = build_size_map(folder_a, self._update_status)
            map_b = build_size_map(folder_b, self._update_status)
            self._update_status("差分を比較中...")
            only_a, only_b, renamed = compare_folders(map_a, map_b)
            self.after(0, lambda: self._show_results(only_a, only_b, renamed))

        threading.Thread(target=worker, daemon=True).start()

    def _update_status(self, msg: str):
        self.after(0, lambda: self._status.set(msg))

    # ── 結果表示 ──────────────────────────
    def _show_results(self, only_a, only_b, renamed):
        # ── Aのみ
        lines_a = []
        for size, paths in sorted(only_a, key=lambda x: x[1][0]):
            lines_a.append((f"  {paths[0]}", "highlight"))
            for p in paths[1:]:
                lines_a.append((f"  {p}", "highlight"))
            lines_a.append((f"  容量: {size:,} バイト", "dim"))
            lines_a.append(("", ""))
        self._set_text(self._text_a,
            f"Aにしか存在しないファイル: {len(only_a)} 件\n" + "─" * 60 + "\n",
            lines_a)

        # ── Bのみ
        lines_b = []
        for size, paths in sorted(only_b, key=lambda x: x[1][0]):
            lines_b.append((f"  {paths[0]}", "highlight"))
            for p in paths[1:]:
                lines_b.append((f"  {p}", "highlight"))
            lines_b.append((f"  容量: {size:,} バイト", "dim"))
            lines_b.append(("", ""))
        self._set_text(self._text_b,
            f"Bにしか存在しないファイル: {len(only_b)} 件\n" + "─" * 60 + "\n",
            lines_b)

        # ── リネーム
        lines_r = []
        for size, paths_a, paths_b in sorted(renamed, key=lambda x: x[1][0]):
            lines_r.append((f"  [A] {', '.join(paths_a)}", "highlight"))
            lines_r.append((f"  [B] {', '.join(paths_b)}", "highlight"))
            lines_r.append((f"  容量: {size:,} バイト", "dim"))
            lines_r.append(("", ""))
        self._set_text(self._text_ren,
            f"リネームの可能性があるファイル: {len(renamed)} 件\n" + "─" * 60 + "\n",
            lines_r)

        self._status.set(
            f"✅ 比較完了  |  Aのみ: {len(only_a)} 件  |  Bのみ: {len(only_b)} 件  |  リネーム: {len(renamed)} 件"
        )
        self._btn.configure(state="normal")

        # 件数をタブに反映
        self._nb.tab(0, text=f"🔴 Aのみ（{len(only_a)}件）")
        self._nb.tab(1, text=f"🟢 Bのみ（{len(only_b)}件）")
        self._nb.tab(2, text=f"🟡 リネーム（{len(renamed)}件）")

    def _set_text(self, widget: scrolledtext.ScrolledText,
                  header: str = "", tagged_lines: list = None):
        widget.configure(state="normal")
        widget.delete("1.0", "end")
        if header:
            widget.insert("end", header)
        if tagged_lines:
            for text, tag in tagged_lines:
                if tag:
                    widget.insert("end", text + "\n", tag)
                else:
                    widget.insert("end", text + "\n")
        widget.configure(state="disabled")


# ──────────────────────────────────────────
# if __name__ == "__main__":
#     app = App()
#     app.mainloop()
# ──────────────────────────────────────────
if __name__ == "__main__":
    app = App()
    app.mainloop()
