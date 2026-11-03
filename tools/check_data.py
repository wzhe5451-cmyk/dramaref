# -*- coding: utf-8 -*-
"""数据自检：图片是否在位、提示词是否覆盖、各项计数是否对得上

改完 js/*-data.js 或重新生成提示词后跑一次，确认没有漏图或漏词。
用法：python3 tools/check_data.py
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_js(name):
    """读取 window.XXX = {...}; 形式的数据文件。

    多数文件是严格 JSON；chars-data.js 是 JS 对象字面量（键未加引号），
    解析失败时交给 node 转一次 JSON。
    """
    txt = (ROOT / 'js' / name).read_text(encoding='utf-8')
    start = txt.index(' = ', txt.index('window.'))
    body = txt[start + 3:].rstrip().rstrip(';')
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        code = 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.stringify(eval("("+s+")")));});'
        res = subprocess.run(['node', '-e', code], input=body, capture_output=True, text=True)
        if res.returncode != 0:
            raise SystemExit(f'{name} 解析失败：{res.stderr[:300]}')
        return json.loads(res.stdout)


def main():
    lib = load_js('library-data.js')
    src = load_js('sources-data.js')
    cha = load_js('chars-data.js')
    pro = load_js('prompts-data.js')

    clothing = [x for x in lib['items'] if x['kind'] != 'character'] + src['items']
    # 人物以 chars-data.js 为准：library-data.js 里另有一批旧人物条目，
    # 工作台只用 CHARS（两边 id 不重叠），这里保持一致，避免重复计数。
    characters = cha['items']
    all_items = clothing + characters

    print(f'服装 {len(clothing)} · 人物 {len(characters)} · 提示词 {len(pro)}')

    # 1) 图片在位
    missing_img = [x['id'] for x in all_items if not (ROOT / x['img']).exists()]
    print(f'缺图片：{len(missing_img)}' + (f'  例：{missing_img[:5]}' if missing_img else '  ✓'))

    # 2) 提示词覆盖（人物不附提示词）
    no_prompt = [x['id'] for x in clothing if x['id'] not in pro]
    orphan = [k for k in pro if k not in {x["id"] for x in clothing}]
    print(f'服装缺提示词：{len(no_prompt)}' + (f'  例：{no_prompt[:5]}' if no_prompt else '  ✓'))
    print(f'多余提示词（库里已无此件）：{len(orphan)}' + (f'  例：{orphan[:5]}' if orphan else '  ✓'))

    # 3) id 唯一性
    ids = [x['id'] for x in all_items]
    dup = {i for i in ids if ids.count(i) > 1} if len(ids) != len(set(ids)) else set()
    print(f'重复 id：{len(dup)}' + (f'  例：{list(dup)[:5]}' if dup else '  ✓'))

    # 4) 提示词结构
    def blocks(zh):
        return zh.count('**') // 2

    no_block = [k for k, v in pro.items() if blocks(v['zh']) < 1]
    no_en = [k for k, v in pro.items() if len(v.get('en', '').split()) < 40]
    print(f'提示词缺分块：{len(no_block)}' + (f'  例：{no_block[:5]}' if no_block else '  ✓'))
    print(f'英文过短（<40 词）：{len(no_en)}' + (f'  例：{no_en[:5]}' if no_en else '  ✓'))

    # 5) 体积
    big = (ROOT / 'js' / 'prompts-data.js').stat().st_size / 1024
    imgs = list((ROOT / 'assets' / 'lib').glob('*'))
    print(f'prompts-data.js {big:.0f} KB · 本地图片 {len(imgs)} 张')

    ok = not (missing_img or no_prompt or orphan or dup or no_block or no_en)
    print('\n通过 ✓' if ok else '\n有需要处理的问题，见上 ↑')


if __name__ == '__main__':
    main()
