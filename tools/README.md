# tools —— 生成脚本

站点的数据与图标都由这里的脚本生成，改词库比手改数据文件安全得多。

| 文件 | 作用 |
|---|---|
| `dict.py` | 词库：品类、材质、图案、细节、配色映射、画质与负面约束 |
| `slots.py` | 中文规格表的槽位词典：每组（上装/下装/连衣裙/鞋履/配饰）有哪些字段、每个字段的候选句 |
| `gen_prompts.py` | 读取 `js/library-data.js` + `js/sources-data.js`，为每件服饰生成中文规格 + 英文 prompt，输出 `tools/.build/prompts.json` |
| `build_prompts.py` | 过滤出库里真实存在的 id，写入 `js/prompts-data.js`（含文件头注释与实际条数） |
| `make_favicon.py` | 站点图标：一份 SVG 几何 → `favicon.svg` / `favicon.ico` / `apple-touch-icon.png` / `icon-192.png` |
| `check_data.py` | 自检：图片是否在位、提示词是否覆盖、id 是否重复、英文是否过短 |

## 常用流程

```bash
# 改完词库，重出全部提示词
python3 tools/gen_prompts.py && python3 tools/build_prompts.py

# 只想看效果，不动数据文件
python3 tools/gen_prompts.py -v

# 改完图标参数，重出图标
python3 tools/make_favicon.py

# 改完任何数据，先自检
python3 tools/check_data.py
```

VS Code 里这些都有对应任务：`Cmd+Shift+B` 起本地预览，`Cmd+Shift+P` → `Tasks: Run Task` 可看到其余几项。

## 改词库的注意点

- `dict.py` 里**中文键配中文值、英文键配英文值**，混用会让中英文段落串味。
- 颜色只在名称里确有依据时才写；没有依据的写「按参考帧取样」，不要编造色值 —— 图库是灰底人台图，靠取色判断颜色不可靠。
- 每个槽位至少留 2–3 个候选句，生成器按 id 哈希取变体，句库太少会让多件服饰读起来一模一样。
- 改完务必跑一次 `check_data.py`，再跑 `gen_prompts.py` 覆写数据。

## 依赖

只用到 Python 3 标准库；只有图标生成会用到 `Pillow`、本机 Chrome（无头渲染 SVG）和 `websocket-client`。

```bash
python3 -m pip install pillow websocket-client
```
