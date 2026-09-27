/** 弦材质 */
export type StringType = '丝弦' | '钢弦';

/** 常见缺陷（多选文字标记） */
export type StringDefect = '打板' | '抗指' | '沙音' | '无';

/**
 * 一次试音记录：上弦后师傅隔几天听一回，每回留一笔。
 * 只增不改，往次的原样保留，便于回溯哪次调掉打板、哪次又冒抗指。
 */
export interface ToneTrial {
  id: string;
  /** 试音日期 ISO */
  testedAt: string;
  /** 试音人 */
  tester: string;
  /** 散音评语（纯文本） */
  sanNote: string;
  /** 按音评语（纯文本） */
  anNote: string;
  /** 泛音评语（纯文本） */
  fanNote: string;
  /** 本次试音的缺陷标记（打板/抗指/沙音标在这一笔上） */
  defects: StringDefect[];
}

/** 上弦记录：琴与弦的固定信息 + 历次试音 */
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
  /** 九德文字简述 */
  nineVirtues: string;
  /** 上弦日期 ISO */
  strungAt: string;
  /** 上弦人 */
  operator: string;
  /** 历次试音记录（按试音日期倒序，最新一笔在前） */
  trials: ToneTrial[];
}

/** 三段评语的编辑草稿 */
export interface ToneDraft {
  sanNote: string;
  anNote: string;
  fanNote: string;
}

/** 记一笔试音的输入 */
export interface TrialInput extends ToneDraft {
  /** 试音日期 ISO，缺省取当前时间 */
  testedAt?: string;
  tester: string;
  defects: StringDefect[];
}

export const STRING_TYPES: StringType[] = ['丝弦', '钢弦'];
export const STRING_DEFECTS: StringDefect[] = ['无', '打板', '抗指', '沙音'];
export const NINE_VIRTUES = ['奇', '古', '透', '静', '润', '圆', '清', '匀', '芳'];

/** 缺陷归一：勾了具体毛病就不再挂「无」；一样没勾则记「无」 */
export function normalizeDefects(defects: StringDefect[]): StringDefect[] {
  const real = defects.filter((d) => d !== '无');
  return real.length ? real : ['无'];
}

/** 按试音日期倒序排列（稳定排序，同日期保持原有先后） */
export function sortTrials(trials: ToneTrial[]): ToneTrial[] {
  return [...trials].sort((a, b) => b.testedAt.localeCompare(a.testedAt));
}

/** 最新一笔试音（trials 已按日期倒序，取第一笔） */
export function latestTrial(stringing: Stringing): ToneTrial | undefined {
  return stringing.trials[0];
}

/** 该笔试音仍挂着的具体毛病（不含「无」） */
export function remainingDefects(trial: ToneTrial | undefined): StringDefect[] {
  return trial ? trial.defects.filter((d) => d !== '无') : [];
}
