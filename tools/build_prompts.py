# -*- coding: utf-8 -*-
"""把 tools/.build/prompts.json 写入 js/prompts-data.js

只保留库里真实存在的服饰 id（人物不附提示词），并按实际条数刷新文件头注释。
用法：python3 tools/build_prompts.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(__file__).resolve().parent / '.build' / 'prompts.json'
DST = ROOT / 'js' / 'prompts-data.js'

HEAD = '''/* 服饰提示词层 · 覆盖全库 {n} 件服饰（人物不附提示词）
   中文规格：按件分块 **上装/下装/连衣裙/鞋履/配饰・名称**，块内按品类槽位逐项给出
             颜色 / 面料 / 领型 / 袖型 / 衣身 / 腰部 / 门襟 / 车线 / 穿着状态（下装为版型 / 腰头 / 口袋 / 裤长 / 缝线 / 洗水）
   英文段：单段成句，主体 / 面料 / 构造核对 / 置景 / 光位 / 景别 / 镜头 / 画质 / 风格锚点 / 负面约束
   生成：tools/gen_prompts.py（词库 + 结构化拼装 + id 哈希取变体），不调用外部 API
   重新生成：项目根目录执行 `python3 tools/gen_prompts.py && python3 tools/build_prompts.py`
*/
'''


def load_js(path):
    """读取 window.XXX = {...}; 形式的静态数据文件"""
    txt = path.read_text(encoding='utf-8')
    start = txt.index(' = ', txt.index('window.'))
    return json.loads(txt[start + 3:].rstrip().rstrip(';'))


def main():
    if not SRC.exists():
        raise SystemExit(f'缺少 {SRC}，请先运行 python3 tools/gen_prompts.py')

    prompts = json.loads(SRC.read_text(encoding='utf-8'))

    lib = load_js(ROOT / 'js' / 'library-data.js')
    src = load_js(ROOT / 'js' / 'sources-data.js')
    ids = [x['id'] for x in lib['items'] if x['kind'] != 'character'] + [x['id'] for x in src['items']]

    kept = {i: prompts[i] for i in ids if i in prompts}
    missing = [i for i in ids if i not in prompts]
    extra = [k for k in prompts if k not in kept]

    body = json.dumps(kept, ensure_ascii=False, separators=(',', ':'))
    DST.write_text(HEAD.format(n=len(kept)) + 'window.PROMPTS = ' + body + ';\n', encoding='utf-8')

    print(f'wrote {DST.relative_to(ROOT)} · {len(kept)} 条 · {len(body.encode()) / 1024:.0f} KB')
    if missing:
        print('  缺提示词：', len(missing), missing[:5])
    if extra:
        print('  已丢弃（库里不存在）：', len(extra))


if __name__ == '__main__':
    main()
