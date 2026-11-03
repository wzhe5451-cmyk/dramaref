# -*- coding: utf-8 -*-
"""服饰提示词生成器

读取 js/library-data.js 与 js/sources-data.js，按「上装/下装/鞋履/配饰 + 分项规格」
结构为每件服饰生成中文规格 + 英文 prompt，输出到 tools/.build/prompts.json。
由 build_prompts.py 负责过滤并写入 js/prompts-data.js。

用法：python3 tools/gen_prompts.py [-v]
"""
import json, re, hashlib, random, sys
from pathlib import Path
from dict import (GARMENT, LENGTH, MATERIAL, PATTERN, DETAIL, THEME, COLOR_MAP,
                  COLOR_ZH_KEYS, COLOR_EN_ALIAS, QUALITY, QUALITY_ANIME,
                  NEG_CLEAN, NEG_WORN, NEG_ANIME, USAGE,
                  EXTRA_GARMENT, EXTRA_MATERIAL, EXTRA_DETAIL,
                  BUILD_CHECK, LIGHT_BY_TONE, FRAME_BY_CAT)
from slots import (COLOR_DESC, MAT_DESC, GROUP, LABEL, SLOT_ORDER,
                   DETAIL_SLOT, DETAIL_SENT, DEF, DEF_MAT, GLOSS, SAT, COLOR_REL)

ROOT = str(Path(__file__).resolve().parents[1])
BUILD = Path(__file__).resolve().parent / '.build'
G_ALL = GARMENT + EXTRA_GARMENT
M_ALL = MATERIAL + EXTRA_MATERIAL
D_ALL = DETAIL + EXTRA_DETAIL

ORDER = {'TOP': 0, 'DRESS': 1, 'ROBE': 2, 'BOTTOM': 3, 'SKIRT': 4,
         'SWIM': 5, 'SHOE': 6, 'ACC': 7}

NAME_FIX = {
    '蝴蝶结丝带': '蝴蝶结领', '荷叶腰摆': '荷叶摆', '细吊带': '吊带',
    '纽扣门襟': '纽扣门襟', '骨撑束身': '束身胸衣', '镂空绣眼': '绣眼镂空',
    '冷肩镂空': '冷肩', '单肩': '单肩', '撞色拼接': '撞色拼接',
}
NAME_SKIP = {'长袖', '短袖', '无袖', '拉链', '绑带', '贴袋', '连帽',
             '金属铆钉', '带扣', '铆接', '镶边'}
PRIO = {'领型': 0, '袖型': 1, '衣身': 2, '腰部': 3, '门襟': 4}

HUE = {
    '红': 'warm', '酒红': 'warm', '砖红': 'warm', '橘红': 'warm', '珊瑚': 'warm',
    '粉': 'warm', '浅粉': 'warm', '玫红': 'warm', '紫红': 'warm', '橙': 'warm',
    '杏色': 'warm', '裸色': 'warm', '黄': 'warm', '芥末黄': 'warm', '淡黄': 'warm',
    '奶油': 'warm', '驼色': 'warm', '卡其': 'warm', '棕': 'warm', '咖啡': 'warm',
    '深棕': 'warm', '米色': 'warm', '金': 'warm',
    '绿': 'cool', '墨绿': 'cool', '橄榄绿': 'cool', '薄荷绿': 'cool',
    '浅绿': 'cool', '青': 'cool', '深青': 'cool', '藏蓝': 'cool', '蓝': 'cool',
    '浅蓝': 'cool', '蓝灰': 'cool', '紫': 'cool', '淡紫': 'cool', '灰紫': 'cool',
    '银': 'cool', '白': 'cool', '黑': 'neutral', '米白': 'neutral',
    '象牙': 'neutral', '浅灰': 'neutral', '中灰': 'neutral', '深灰': 'neutral',
    '灰': 'neutral',
}
GLOSSY = {'缎面', '亮片', '皮革', '真丝', '钢板', '黄铜', '锁甲', '珠饰'}
SEMI = {'丝绒', '雪纺', '欧根纱', '薄纱网纱', '蕾丝', '针织', '绗缝', '钩针'}


def load(p):
    s = open(p, encoding='utf-8').read()
    j = s.index(' = ', s.index('window.'))
    return json.loads(s[j + 3:].rstrip().rstrip(';'))


def pick(tab, t):
    for r in tab:
        if re.search(r[0], t):
            return r
    return None


def pick_all(tab, t, n=4):
    out = []
    for r in tab:
        if re.search(r[0], t) and r not in out:
            out.append(r)
        if len(out) >= n:
            break
    return out


def h(s, n):
    return int(hashlib.md5(s.encode('utf-8')).hexdigest()[:8], 16) % n


def color_of(zh, en):
    for k in COLOR_ZH_KEYS:
        if k in zh:
            return k
    t = ' ' + en.lower() + ' '
    for k in ['off-white', 'navy', 'olive', 'mint', 'emerald', 'burgundy', 'wine',
              'blush', 'chocolate', 'mustard', 'lavender', 'lilac', 'turquoise',
              'charcoal', 'khaki', 'nude', 'coral', 'plum', 'black', 'white',
              'ivory', 'cream', 'beige', 'red', 'blue', 'green', 'yellow', 'pink',
              'orange', 'brown', 'purple', 'teal', 'grey', 'gray', 'silver',
              'gold', 'camel', 'tan', 'peach', 'rose']:
        if re.search(r'\b' + re.escape(k) + r'\b', t):
            return COLOR_EN_ALIAS.get(k, '')
    return ''


def split_pieces(en):
    segs = [s.strip(' .,') for s in re.split(r'\s*/\s*', en) if s.strip(' .,')]
    if len(segs) == 1:
        alt = [s.strip(' .,') for s in re.split(r'\s+and\s+', en) if s.strip(' .,')]
        if len(alt) >= 2 and all(pick(G_ALL, ' ' + a.lower() + ' ') for a in alt):
            segs = alt
    return segs[:3] if segs else [en]


# 长度词 → 完整句（按组）
LEN_SENT = {
    'SKIRT': {
        '拖地长款': '下缘拖地，在地面形成自然堆量，行走时轻微拖动',
        '及踝长款': '下缘及踝，距地面约 2cm，垂坠完整',
        '中长及膝下': '中长，下缘落在膝下约 10cm 的小腿中段',
        '迷你短款': '迷你长度，下缘落在大腿中段',
        '及膝': '下缘落在膝盖位置，行走时不遮膝窝',
        '前短后长': '前短后长，前中下缘高于后摆约 15cm',
        '长款': '长款，下缘落至小腿中段',
        '短款': '短款，下缘落在大腿中段',
        '短版': '短版，下缘收在腰线下约 10cm',
    },
    'BOTTOM': {
        '拖地长款': '全长拖地，裤脚在地面形成堆量',
        '及踝长款': '全长，裤脚落在鞋面上，盖住鞋帮上部',
        '中长及膝下': '七分长度，裤脚落在小腿中段',
        '迷你短款': '短裤长度，裤脚落在大腿中段',
        '及膝': '裤脚落在膝盖附近',
        '长款': '全长，裤脚自然垂至鞋面',
        '短款': '短裤，裤脚落在大腿中段',
        '短版': '九分长度，裤脚收在踝上约 5cm',
    },
}
LEN_SENT['DRESS'] = LEN_SENT['SKIRT']
LEN_SENT['ROBE'] = LEN_SENT['SKIRT']

# 品类特征默认（优先于通用 DEF）
CAT_OVERRIDE = [
    (r'camisole|cami\b|spaghetti', '袖型',
     ['细吊带，两条窄带自肩点垂落，宽度约 0.8cm，可调节，间距贴合胸型',
      '细吊带结构，肩带细而承力，无袖管无肩线覆盖']),
    (r'tank top|\btank\b', '袖型',
     ['无袖，袖窿收在肩点以内，腋下开口贴合，边缘用同料斜条包边',
      '无袖结构，肩带较宽，肩点收窄，袖窿边缘平整']),
    (r'strapless|bandeau', '袖型',
     ['无袖无肩带，上缘水平横切，内衬防滑条承力']),
    (r'sweater|jumper|pullover|knit', '袖型',
     ['长袖，袖口为罗纹收口宽约 5cm，袖管顺手臂自然收窄',
      '针织长袖，袖山圆顺，袖口罗纹收紧，袖臂无堆量']),
    (r'hoodie|sweatshirt', '袖型',
     ['长袖，袖口罗纹收口，袖山略有落肩量，袖管宽松']),
    (r'blazer|jacket|coat|trench|parka', '袖型',
     ['长袖，袖山有结构感，袖口为常规包边，可露出内搭袖口约 1cm',
      '长袖，袖窿收高，袖管顺直，袖口平整便于叠穿']),
    (r'jeans', '腰头',
     ['标准牛仔腰头，宽约 3.5cm，配古铜色圆形金属纽扣，拉链门襟，双侧裤耳',
      '牛仔腰头，腰头硬挺无衬料外露，配金属纽扣与拉链门襟']),
    (r'jeans', '版型',
     ['修身直筒版型，胯部贴合，自膝盖向下保持基本等宽',
      '高腰微喇版型，胯至膝修身，膝下裤管微微张开']),
    (r'jeans', '口袋',
     ['前侧两个斜插袋，右侧前袋上方有小表袋，后侧两个对称弧形贴袋',
      '五袋结构：双侧斜插袋 + 右前表袋 + 后侧双贴袋，袋口压明线']),
    (r'jeans', '缝线',
     ['棕黄色撞色明线，沿侧缝、内缝、口袋边缘、腰头走双针车线',
      '撞色明线沿所有接缝走双针，针距均匀，转角回针加固']),
    (r'boots?\b', '鞋口',
     ['靴口翻折或平切，边缘收整，筒高及踝，靴口贴合小腿下段不留空隙',
      '靴筒及踝，靴口平齐，边缘有一定厚度']),
    (r'heels?|pumps?|stilettos?', '鞋底',
     ['细高跟结构，跟高约 7cm，跟底为小面积着地面，前掌薄底',
      '中高跟，跟型收细，鞋底前掌薄、后跟窄']),
    (r'sneakers?|trainers?', '鞋底',
     ['橡胶运动底，底纹为防滑齿，中底有缓震厚度，鞋底包边与鞋面撞色']),
    (r'sandals?', '鞋口',
     ['多条带状结构跨过脚背，开口通透，脚趾与脚踝露出']),
    (r'pleat', '褶量',
     ['刀形褶裥（Knife Pleats），褶向统一、间距均匀，褶面压出清晰直线']),
    (r'tulle|organza', '裙摆',
     ['多层薄纱撑起体积，外摆挺括，边缘有清晰阴影层次']),
    (r'cardigan', '门襟',
     ['前中开襟，纽扣或敞开式，门襟边缘有同色罗纹包边，可完全打开',
      '开襟结构，门襟两条边缘平直，闭合件与衣身同色']),
    (r'sweater|jumper|pullover|knit', '门襟',
     ['套头结构，前中无门襟，仅领口为唯一开口',
      '无前中门襟，领口套入，肩缝与侧缝构成全部接缝']),
    (r'tee\b|t-shirt|tshirt|sweatshirt|hoodie', '门襟',
     ['套头结构，前中无门襟，领口罗纹收口',
      '无门襟，直接套入，下摆为平直折边']),
    (r'\bdress\b|gown', '门襟',
     ['套头或侧缝隐形拉链闭合，前中无可见门襟',
      '前中无独立门襟，闭合靠侧拉链或后背结构']),
    (r'skirt\b', '腰头',
     ['腰头平整，侧缝或后中隐形拉链闭合，腰里衬定型条',
      '腰头贴服，隐形拉链收在侧缝内，正面看不到链齿']),
    (r'boots?\b', '鞋底',
     ['橡胶底，厚度约 2-3cm，底面有防滑齿，鞋底侧面与鞋面同色或深一档',
      '厚底结构，厚度约 4-5cm，底面为哑光深色锯齿防滑纹，侧面有分层设计']),
]

SHOE_WEAR = ['穿在脚上承重自然，鞋面受力处有轻微折痕，鞋型不变形',
             '与下装自然衔接，裤脚或裙摆落在靴口上方，露出鞋面与鞋头']
ACC_WEAR = ['佩戴位置按参考帧还原，贴合身体，不悬空不乱摆',
            '佩戴后自然下垂，受力均匀，位置稳定，与服装接触处无勾挂']


def remap(group, slot):
    """把细节命中的 slot 名适配到该组的槽位"""
    if group == 'BOTTOM':
        m = {'衣身': '版型', '腰部': '腰头', '门襟': '版型', '口袋': '口袋',
             '车线': '缝线', '下摆': '裤长', '裙摆': '裤长'}
    elif group == 'SKIRT':
        m = {'衣身': '褶量', '腰部': '腰头', '门襟': '版型', '车线': '缝线',
             '下摆': '裙长', '裙摆': '裙长'}
    elif group == 'SHOE':
        m = {'材质': '鞋面', '衣身': '鞋型', '五金': '装饰'}
    elif group == 'ACC':
        m = {'材质': '材质', '形制': '形制', '五金': '五金'}
    elif group == 'SWIM':
        m = {'衣身': '结构', '腰部': '结构', '门襟': '闭合', '袖型': '肩带'}
    elif group == 'ROBE':
        m = {'衣身': '版型', '腰部': '闭合', '门襟': '闭合', '车线': '闭合'}
    else:
        m = {}
    return m.get(slot, slot)


GARMENT_CHARS = set('衣裙裤衫鞋靴包帽袍甲袜巾带裙')
BAD_NAME = ('单一标准', '同上', '标准', '未知', '无', '-')


def build_name(p, group):
    """块标题：优先用原始中文名，补颜色前缀；否则合成 颜色+细节+材质+品类"""
    base = (p.get('zhseg') or '').strip()
    if base in BAD_NAME or not (set(base) & GARMENT_CHARS):
        base = ''
    if not base or len(base) > 22:
        parts = []
        if p['clr']:
            parts.append(p['clr'])
        ds = []
        for d in p['dets']:
            slot = DETAIL_SLOT.get(d[2])
            if not slot or d[2] in NAME_SKIP:
                continue
            ds.append((PRIO.get(slot, 9), NAME_FIX.get(d[2], d[2])))
        ds.sort()
        for _, n in ds[:1]:
            if n and n not in parts:
                parts.append(n)
        if p['mats']:
            parts.append(p['mats'][0][2])
        if p['pats']:
            parts.append(p['pats'][0][2])
        base = ''.join(parts) + (p['g'][2] if p['g'] else '服饰')
        if len(base) > 20 and len(parts) > 2:
            base = ''.join(parts[:1] + parts[2:]) + (p['g'][2] if p['g'] else '服饰')
    if p['clr'] and p['clr'] not in base:
        base = p['clr'] + base
    gname = p['g'][2] if p['g'] else '服饰'
    if base.strip() == gname:
        base = '同套' + base
    return base


def color_line(p, x):
    c = p['clr']
    if c and c in COLOR_DESC:
        en, hexv = COLOR_MAP.get(c, ('', ''))
        return f'{COLOR_DESC[c]}；参考色值 {hexv}（{en}）'
    return '按参考帧取样主体布料色，色相与饱和度均不许加码'


def mat_line(p, group):
    if p['mats']:
        seg = [MAT_DESC.get(m[2], m[2]) for m in p['mats'][:2]]
        s = '；'.join(seg)
        if p['pats']:
            s += f'；表面覆盖{p["pats"][0][2]}，纹样尺度均匀、对花对齐'
        return s
    s = DEF_MAT.get(group, DEF_MAT['TOP'])
    if p['pats']:
        s += f'；表面有{p["pats"][0][2]}，纹样清晰不糊'
    return s


def wear_line(p, kind, group, groups=frozenset()):
    if kind == 'costume':
        base = ['在隐形人台上撑起，廓形完整，无人体、无手部、无堆叠褶皱',
                '以幽灵人台形态悬空成型，衣身自然展开，接缝朝向正面']
        if group in ('SHOE', 'ACC'):
            base = ['单品静置状态，以正面展示角度呈现，无人体、无手部入画',
                    '单独摆放展示，光影只依靠产品布光，无其他道具']
        return base[h(p['raw'] + 'w', len(base))]
    base = ['真人穿着，衣摆自然落位，无夸张动作，褶皱由身体姿态自然产生',
            '真人穿着，整体姿态稳定，服装受重力自然垂落，无飘动',
            '真人穿着，面料贴合身体转折，接缝不拉扯']
    layered = groups & {'BOTTOM', 'SKIRT'}
    if group == 'TOP' and layered:
        base = ['真人穿着，下摆按参考帧塞入下装腰内或自然外放，腰线处不堆量，前襟保持平整',
                '真人穿着，衣身垂落自然，下摆与下装腰线衔接干净，无上翻或卷边',
                '真人穿着，上装压在下装之上或收进腰头，衔接处只有一道自然褶']
    elif group in ('BOTTOM', 'SKIRT') and 'SHOE' in groups:
        base = ['真人穿着，裤脚（裙摆）自然落在鞋面上，与鞋口衔接干净，无刻意堆叠',
                '真人穿着，下缘与鞋帮交叠，露出的鞋面比例与参考帧一致']
    elif group == 'SHOE' and layered:
        base = ['穿在脚上承重自然，鞋面受力处有轻微折痕，与裤脚（裙摆）衔接处过渡自然',
                '穿着状态下鞋型完整，鞋头朝前，鞋面与下缘交叠处不挤压变形']
    elif group == 'SHOE':
        base = ['穿在脚上承重自然，鞋面受力处有轻微折痕，鞋型不变形',
                '穿着状态下鞋型完整，鞋头朝前，鞋底自然着地']
    return base[h(p['raw'] + 'w2', len(base))]


def slots_for(p, index, kind, groups=frozenset()):
    group = p['grp']
    order = SLOT_ORDER[group]
    en_low = ' ' + p['raw'].lower() + ' '
    buckets = {}
    for d in p['dets']:
        slot = DETAIL_SLOT.get(d[2])
        if not slot:
            continue
        slot = remap(group, slot)
        if slot not in order:
            continue
        sent = DETAIL_SENT.get(d[2], '')
        if sent:
            buckets.setdefault(slot, []).append(sent)

    out = []
    for slot in order:
        if slot == '颜色':
            txt = color_line(p, None)
        elif slot in ('面料', '材质'):
            txt = mat_line(p, group)
        elif slot == '穿着状态':
            if group == 'SHOE':
                txt = SHOE_WEAR[h(p['raw'] + 'sw', len(SHOE_WEAR))]
            elif group == 'ACC':
                txt = ACC_WEAR[h(p['raw'] + 'aw', len(ACC_WEAR))]
            else:
                txt = wear_line(p, kind, group, groups)
        elif slot in ('裙长', '裤长', '下摆') and p['ln'] \
                and p['ln'][2] in LEN_SENT.get(group, {}):
            txt = LEN_SENT[group][p['ln'][2]]
        else:
            if slot in buckets:
                txt = '；'.join(buckets[slot][:3])
            else:
                hit = None
                for rx, s2, pool in CAT_OVERRIDE:
                    if s2 == slot and re.search(rx, en_low):
                        hit = pool
                        break
                if hit:
                    txt = hit[h(p['raw'] + slot + 'c', len(hit))]
                else:
                    pool = DEF.get((group, slot))
                    if not pool:
                        continue
                    txt = pool[h(p['raw'] + slot + str(index), len(pool))]
        out.append((slot, txt))
    return out


def overall(pieces, kind):
    mats = []
    for p in pieces:
        for m in p['mats']:
            if m[2] not in mats:
                mats.append(m[2])
    glossy = [m for m in mats if m in GLOSSY]
    semi = [m for m in mats if m in SEMI]
    if glossy:
        gloss = f'局部高光泽材质（{"、".join(glossy[:2])}）承担全部反光，其余部分保持哑光'
    elif semi:
        gloss = GLOSS['微光'] + f'（{"、".join(semi[:2])}）'
    else:
        gloss = GLOSS['哑光']

    if any(m in ('牛仔布', '皮革') for m in mats):
        fold = '丹宁与皮革保留真实穿着痕迹：褶脊处有轻微磨白，边缘有自然折痕，不做刻意破洞或做旧'
    elif any(m in ('雪纺', '真丝', '缎面', '欧根纱', '薄纱网纱') for m in mats):
        fold = '轻薄面料有自然垂坠褶皱，褶线细而连续，不做硬挺造型'
    elif any(m in ('针织', '羊绒', '羊毛', '毛绒') for m in mats):
        fold = '针织与绒面有柔和的面料起伏，褶量浅、边缘软，无硬折'
    else:
        fold = '褶皱由重力与身体姿态自然产生，褶量克制，无人工定型痕'

    cols = [p['clr'] for p in pieces if p['clr']]
    uniq = []
    for c in cols:
        if c not in uniq:
            uniq.append(c)
    hues = {HUE.get(c, 'neutral') for c in uniq} - {'neutral'}
    if not uniq:
        rel = '以参考帧为准，不增加画面里没有的颜色'
    elif len(uniq) <= 1:
        rel = '整体为单一主色，层次靠材质光泽与明暗变化拉开，无第二种颜色介入'
    elif len(hues) <= 1:
        rel = COLOR_REL[0]
    else:
        rel = COLOR_REL[1]
    if len(uniq) >= 3:
        chain = '→'.join(uniq[:4])
        rel = f'配色递进为 {chain}，' + rel
    elif len(uniq) == 2:
        rel = f'{uniq[0]} + {uniq[1]} 两色，' + rel

    return [('光泽', gloss), ('褶皱', fold), ('配色', rel),
            ('饱和度', SAT[h(''.join(uniq) + 'sat', len(SAT))])]


def build(x):
    en_txt, zh_txt = x['en'], x['zh']
    kind = x['kind']
    cat = x.get('cat') or '服饰'
    clr = color_of(zh_txt, en_txt)
    theme = pick(THEME, ' ' + en_txt.lower() + ' ')
    zp = [z.strip() for z in re.split(r'\s*·\s*', zh_txt) if z.strip()]

    pieces = []
    segs_raw = split_pieces(en_txt)
    aligned = len(zp) == len(segs_raw)
    for pi, p in enumerate(segs_raw):
        t = ' ' + p.lower() + ' '
        g = pick(G_ALL, t)
        pc = color_of(zp[pi], p) if pi < len(zp) else ''
        pieces.append(dict(g=g, ln=pick(LENGTH, t), mats=pick_all(M_ALL, t, 2),
                           pats=pick_all(PATTERN, t, 2), dets=pick_all(D_ALL, t, 4),
                           raw=p, clr=pc,
                           zhseg=zp[pi] if aligned and pi < len(zp) else ''))
    if all(not q['clr'] for q in pieces):
        pieces[0]['clr'] = clr

    no_g = all(not p['g'] for p in pieces)
    is_runway = bool(re.search(r'\brtw\b|runway', en_txt.lower())) \
        or x.get('source') == 'vogue' or cat == '秀场造型'
    if no_g and not is_runway:
        cg = {'大衣外套': ('coat', '大衣', '大衣外套'), '礼服正装': ('evening piece', '礼服', '礼服正装'),
              '连衣裙': ('dress', '连衣裙', '连衣裙'), '半裙': ('skirt', '半身裙', '半裙'),
              '裤装': ('pants', '长裤', '裤装'), '上衣': ('top', '上衣', '上衣'),
              '泳装': ('swimsuit', '泳衣', '泳装'), '内衣': ('lingerie set', '内衣', '内衣'),
              '鞋履': ('shoes', '鞋履', '鞋履'), '长袍斗篷': ('robe', '长袍', '长袍斗篷')}.get(cat)
        if cg:
            pieces[0]['g'] = (None, cg[0], cg[1], cg[2])

    for p in pieces:
        gname = p['g'][3] if p['g'] else cat
        grp = GROUP.get(gname, 'TOP')
        if grp == 'DRESS' and p['g'] and re.search(r'外套|夹克|大衣|披风|斗篷|围裙', p['g'][2]):
            grp = 'TOP'
        p['grp'] = grp

    pieces.sort(key=lambda q: ORDER.get(q['grp'], 9))
    groups = frozenset(q['grp'] for q in pieces)

    # ---------------- 中文 ----------------
    lines = []
    for i, p in enumerate(pieces):
        label = LABEL[p['grp']]
        head = f"**{label}・{build_name(p, p['grp'])}**"
        lines.append(head)
        for slot, txt in slots_for(p, i, kind, groups):
            lines.append(f'- {slot}：{txt}')
        lines.append('')

    lines.append('**整体质感**')
    for slot, txt in overall(pieces, kind):
        lines.append(f'- {slot}：{txt}')
    zh = '\n'.join(lines).strip()

    # ---------------- 英文（沿用旧结构） ----------------
    en = en_prompt(x, pieces, theme, cat, no_g, is_runway, kind)
    return {'zh': zh, 'en': en}


def cap(s):
    return s[0].upper() + s[1:] if s else s


def join_list(items, conj='and'):
    items = [i for i in items if i]
    if not items:
        return ''
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f'{items[0]} {conj} {items[1]}'
    return ', '.join(items[:-1]) + f' {conj} ' + items[-1]


PLURAL = {'pants', 'shorts', 'jeans', 'briefs', 'leggings', 'boots', 'shoes',
          'sandals', 'gloves', 'sneakers', 'heels', 'bracers', 'greaves'}
SLOT = {3: 'outer', 2: 'inner', 1: 'bottom', 0: 'accessory'}
RANK = {'大衣外套': 3, '长袍斗篷': 3, '连衣裙': 2, '上衣': 2, '礼服正装': 2,
        '半裙': 1, '裤装': 1, '内衣': 2, '泳装': 2, '鞋履': 0, '配饰': 0,
        '服饰': 2, '鞋履 ': 0}
SET_CLEAN = [
    "Set on a seamless off-white backdrop as a ghost-mannequin silhouette, camera locked on a tripod, no floor line visible.",
    "Laid flat on a pure white sweep, camera directly overhead, framing trimmed to the garment edges.",
    "Presented on an invisible mannequin against a soft light-grey gradient, straight-on camera, symmetric framing.",
    "Standing still-life on a matte white surface, three-quarter camera angle, full garment in frame with a small margin.",
]
LENS_CLEAN = ["85mm at f/8.", "100mm macro at f/11.", "70mm at f/9.", "90mm at f/10."]
SET_WORN = [
    "On a standing model against a neutral grey wall, camera at chest height.",
    "Editorial full-length frame in an empty interior, plain plaster wall behind.",
    "Cinematic full-body frame on a dark seamless background, subject isolated by the light.",
    "Documentary full-body frame in a real interior, ambient light only, honest colour.",
]
LENS_WORN = ["85mm at f/2.", "50mm at f/2.8.", "135mm at f/2.2.", "35mm at f/2.8."]
MAT_RENDER = {
    "大衣外套": "Render the outer face dense and matte, weave at the scale it reads in the frame, with the shoulder holding a clean structured line.",
    "连衣裙": "Keep the fabric weight consistent with the fold pattern in the frame: stiff where the hem stands away, fluid where it collapses.",
    "半裙": "Read the fabric weight from how the hem breaks; render pleats or seams with a clean, even shadow line.",
    "上衣": "Keep the body of the cloth soft against the frame, with a matte face and only a faint sheen on the raised edges.",
    "裤装": "Render a mid-weight cloth that holds a clean crease down the leg and gathers naturally at the knee and ankle.",
    "泳装": "Keep the surface smooth and tight, with a low sheen and clean tension across the body.",
    "内衣": "Render fine, close-fitting fabric with soft tension and a matte finish.",
    "鞋履": "Keep the surface finish true to the frame: matte leather, satin sheen or polished metal, with crisp edge highlights.",
    "配饰": "Render hard surfaces with tight specular highlights and soft surfaces with a matte, fine-grained face.",
    "长袍斗篷": "Render a heavy, matte drape that falls in long vertical folds and holds weight at the hem.",
    "礼服正装": "Render a structured, close-fitting fabric over the bodice with a smooth, controlled sheen.",
    "服饰": "Surface reading from the frame: matte where the fabric folds, a soft sheen only on the raised edges.",
}
FRAME_READ = [
    "Treat the frame as the only source of truth: read colour, neckline, sleeve and hem straight off the photograph and reproduce them without embellishment.",
    "Nothing here should be invented; colour, proportion and finish all come from the reference frame, and the silhouette is followed edge for edge.",
    "The reference frame is the spec: match its colour, its proportion and every visible seam, and add nothing that is not already there.",
    "Work strictly from the photograph: same colour, same proportion, same visible closures, no added styling and no imagined detail.",
    "Read the garment only from this frame; the colour, the proportion and the finish are taken literally, with no styling of its own.",
    "This is a direct reproduction task: keep the colour, the cut and the visible hardware exactly as the reference shows them.",
    "Start from the photograph rather than from a category: colour, neckline, hem and closures are copied one to one.",
    "Follow the reference instead of a template; every visible seam, edge and proportion is reproduced as photographed.",
]


def en_prompt(x, pieces, theme, cat, no_g, is_runway, kind):
    en_txt = x['en']
    is_anime = x.get('style') == '动漫'
    clr = color_of(x['zh'], en_txt)
    clr_en = COLOR_MAP.get(clr, ('', ''))[0]
    use_cat = pieces[0]['g'][3] if pieces[0]['g'] else cat
    multi = len(pieces) > 1

    segs = []
    seen = {}
    for p in pieces:
        toks = []
        pce = COLOR_MAP.get(p['clr'], ('', ''))[0] if p['clr'] else (clr_en if len(pieces) == 1 else '')
        if pce:
            toks.append(pce)
        if p['mats']:
            toks.append(p['mats'][0][1])
        if p['pats']:
            toks.append(p['pats'][0][1])
        if p['ln']:
            toks.append(p['ln'][1])
        if p['g']:
            toks.append(p['g'][1])
        head = ' '.join(toks) or 'garment'
        ws = head.split()
        if any(w in PLURAL for w in ws):
            body = 'a pair of ' + head
        else:
            body = ('an ' if ws and ws[0][0] in 'aeiou' else 'a ') + head
        dl = [d[1] for d in p['dets']]
        if dl:
            body += ', ' + join_list(dl[:3])
        if multi and p['g']:
            slot = SLOT.get(RANK.get(p['g'][3], 2), 'piece')
            seen[slot] = seen.get(slot, 0) + 1
            if seen[slot] > 1:
                slot = 'second' if seen[slot] == 2 else 'third'
            body = cap(slot) + ' layer: ' + body
        else:
            body = cap(body)
        segs.append(body)

    if not multi:
        look = segs[0] + '.'
    else:
        look = ('A coordinated two-piece look. ' if len(segs) == 2
                else 'A coordinated three-piece look. ') + '; '.join(segs) + '.'

    if is_runway or (no_g and not pieces[0].get('fallback')):
        season = ''
        m = re.search(r'(20\d\d)\s*(春夏|秋冬|早春|早秋)', x['zh'])
        if m:
            season = {'春夏': 'Spring ', '秋冬': 'Autumn ',
                      '早春': 'Resort ', '早秋': 'Pre-Fall '}[m.group(2)] + m.group(1)
        lm = re.search(r'(?:Look|造型)\s*0?(\d+)', x['zh'] + ' ' + en_txt)
        look = (f'A {" " + season if season else ""} runway look'
                f'{" " + lm.group(1) if lm else ""}, one complete look photographed on the catwalk. '
                'The silhouette and every construction detail are read directly from the reference frame.')

    mz = []
    for p in pieces:
        for m in p['mats']:
            if m[3] not in mz:
                mz.append(m[3])
    fab = ' '.join(cap(s) + '.' for s in mz[:2]) if mz else MAT_RENDER.get(use_cat, MAT_RENDER['服饰'])

    dets_all = []
    for p in pieces:
        for d in p['dets']:
            if d[2] not in [y[2] for y in dets_all]:
                dets_all.append(d)
    if dets_all:
        constr = ('Construction reads clearly in the frame — '
                  + join_list([d[1] for d in dets_all[:4]])
                  + '; edges sit flat and the seams are evenly finished.')
    else:
        constr = FRAME_READ[h(x['id'] + 'r', 8)]

    i = h(x['id'], 4)
    setup = (SET_CLEAN if kind == 'costume' else SET_WORN)[i]
    lens = (LENS_CLEAN if kind == 'costume' else LENS_WORN)[i]
    tone = 'colour'
    if clr in ('黑', '深灰', '藏蓝', '墨绿', '酒红', '深棕', '咖啡', '紫红', '深青', '紫'):
        tone = 'dark'
    elif clr in ('白', '米白', '象牙', '奶油', '浅灰', '银', '淡黄', '浅粉', '浅蓝', '淡紫', '杏色'):
        tone = 'light'
    light = 'Light: ' + LIGHT_BY_TONE[tone] + '.'
    frame = 'Frame: ' + FRAME_BY_CAT.get(use_cat, 'three-quarter') + '.'
    qual = QUALITY_ANIME if is_anime else QUALITY
    neg = NEG_ANIME if is_anime else (NEG_CLEAN if kind == 'costume' else NEG_WORN)
    anchor = (x.get('brand') or '').strip()
    if anchor in ('VOGUE 秀场', '服装参考', '动漫服饰参考', 'Shopbop', 'the archive'):
        anchor = ''
    anchor_s = f'Style anchor: {anchor}.' if anchor and len(anchor) > 1 else ''
    en = ' '.join([look, fab, constr, setup, light, frame, lens, qual, anchor_s, neg])
    return re.sub(r'\s+', ' ', en).strip()


def main():
    L = load(f'{ROOT}/js/library-data.js')
    S = load(f'{ROOT}/js/sources-data.js')
    items = [x for x in L['items'] if x['kind'] != 'character'] + S['items']
    out = {}
    for x in items:
        out[x['id']] = build(x)
    BUILD.mkdir(exist_ok=True)
    json.dump(out, open(BUILD / 'prompts.json', 'w', encoding='utf-8'), ensure_ascii=False)
    tot = sum(len(v['zh'].encode()) + len(v['en'].encode()) for v in out.values())
    print('items', len(out), '| total', tot, 'bytes | avg zh',
          round(sum(len(v['zh']) for v in out.values()) / len(out), 1), 'chars')

    if '-v' in sys.argv:
        rd = random.Random(5)
        for k in rd.sample(list(out), 3):
            v = out[k]
            print('=' * 78)
            print(k)
            print(v['zh'])
            print('[EN]', v['en'][:400])


if __name__ == '__main__':
    main()
