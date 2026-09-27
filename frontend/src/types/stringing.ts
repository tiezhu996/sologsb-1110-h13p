/** 弦材质 */
export type StringType = '丝弦' | '钢弦';

/** 试音毛病（多选标记；勾了具体毛病就不挂「无」） */
export type StringDefect = '打板' | '抗指' | '沙音';

/**
 * 一次试音留一笔：日期、试音人、散音/按音/泛音三段评语、九德简述、
 * 本次挂着的毛病（打板/抗指/沙音；无毛病为空数组）。
 * 历史各笔只追加、不改写。
 */
export interface ToneCheck {
  id: string;
  /** 试音日期 ISO */
  checkedAt: string;
  /** 试音人 */
  checker: string;
  /** 散音评语（纯文本） */
  sanNote: string;
  /** 按音评语（纯文本） */
  anNote: string;
  /** 泛音评语（纯文本） */
  fanNote: string;
  /** 九德文字简述 */
  nineVirtues: string;
  /** 本次试音的毛病；无毛病为 []（不挂「无」） */
  defects: StringDefect[];
}

/** 上弦记录（静态上弦信息 + 历次试音笔账） */
export interface Stringing {
  id: string;
  /** 琴号 */
  guqinNo: string;
  /** 弦材质 */
  stringType: StringType;
  /** 雁足与绒扣 */
  nut: string;
  /** 弦距（mm） */
  stringGap: number;
  /** 上弦日期 ISO */
  strungAt: string;
  /** 上弦人 */
  operator: string;
  /** 历次试音（升序，最早在前；最新一笔为末尾） */
  checks: ToneCheck[];
}

/** 新增试音一笔的输入 */
export interface ToneCheckInput {
  checkedAt?: string;
  checker: string;
  sanNote: string;
  anNote: string;
  fanNote: string;
  nineVirtues: string;
  defects: StringDefect[];
}

/** 三段评语 + 九德的编辑草稿 */
export interface ToneDraft {
  sanNote: string;
  anNote: string;
  fanNote: string;
  nineVirtues: string;
}

export const STRING_TYPES: StringType[] = ['丝弦', '钢弦'];
/** 试音可勾选的毛病；「无」不是勾选项，无毛病时留空即可 */
export const STRING_DEFECTS: StringDefect[] = ['打板', '抗指', '沙音'];
export const NINE_VIRTUES = ['奇', '古', '透', '静', '润', '圆', '清', '匀', '芳'];

/** 过滤掉非法项与重复项；具体毛病与「无」不并存 */
export function normalizeDefects(defects: readonly string[] | undefined | null): StringDefect[] {
  if (!Array.isArray(defects)) return [];
  return Array.from(new Set(defects.filter((d): d is StringDefect => STRING_DEFECTS.includes(d as StringDefect))));
}

/** 取最新一笔试音（无试音记录时为 undefined） */
export function latestCheck(stringing: Stringing): ToneCheck | undefined {
  return stringing.checks.length ? stringing.checks[stringing.checks.length - 1] : undefined;
}

/** 最新一笔还挂着的毛病（空数组表示已去净或尚未试音） */
export function remainingDefects(stringing: Stringing): StringDefect[] {
  return latestCheck(stringing)?.defects ?? [];
}

/** 上弦过关：至少试音过一笔，且最近一笔无毛病 */
export function isStringingPassed(stringing: Stringing): boolean {
  const latest = latestCheck(stringing);
  return Boolean(latest) && latest!.defects.length === 0;
}
