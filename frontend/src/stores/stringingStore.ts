import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import {
  normalizeDefects,
  remainingDefects,
  type StringType,
  type Stringing,
  type ToneCheck,
  type ToneCheckInput,
} from '../types/stringing';

/** 登记上弦时只录静态信息；试音评语走「追加试音一笔」 */
export interface StringingInput {
  guqinNo: string;
  stringType: StringType;
  nut: string;
  stringGap: number;
  strungAt?: string;
  operator: string;
}

/** 上弦信息的可改字段（不影响历次试音笔账） */
export type StringingPatch = Partial<StringingInput>;

interface StringingState {
  stringings: Stringing[];
  hydrated: boolean;
}

/** 上弦记录与历次试音笔账（纯文本，不做音频处理） */
export const useStringingStore = defineStore('stringing', {
  state: (): StringingState => ({ stringings: [], hydrated: false }),

  getters: {
    byGuqin(state) {
      return (guqinNo: string): Stringing | undefined => state.stringings.find((s) => s.guqinNo === guqinNo);
    },
    /** 琴号、上弦人、试音人与各笔三段评语/毛病的文字检索 */
    search(state) {
      return (keyword: string): Stringing[] => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return state.stringings;
        return state.stringings.filter((s) => {
          const haystack = [
            s.guqinNo,
            s.operator,
            ...s.checks.flatMap((c) => [c.checker, c.sanNote, c.anNote, c.fanNote, c.nineVirtues, c.defects.join(' ')]),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(kw);
        });
      };
    },
    /** 最近一笔试音仍挂着毛病的上弦记录数（进度未过关） */
    defectCount(state): number {
      return state.stringings.filter((s) => remainingDefects(s).length > 0).length;
    },
  },

  actions: {
    async hydrate() {
      const rows = await db.stringings.orderBy('strungAt').reverse().toArray();
      this.stringings = rows.map((row) => this.fromStorage(row));
      this.hydrated = true;
    },

    /** 兜底整理：老数据迁移后再保证 checks 为按日期升序的合法数组 */
    fromStorage(row: Stringing): Stringing {
      const checks = Array.isArray(row.checks)
        ? row.checks.map((c) => ({
            id: c.id,
            checkedAt: c.checkedAt,
            checker: c.checker ?? '',
            sanNote: c.sanNote ?? '',
            anNote: c.anNote ?? '',
            fanNote: c.fanNote ?? '',
            nineVirtues: c.nineVirtues ?? '',
            defects: normalizeDefects(c.defects),
          }))
        : [];
      checks.sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
      return {
        id: row.id,
        guqinNo: row.guqinNo,
        stringType: row.stringType,
        nut: row.nut,
        stringGap: Number(row.stringGap) || 0,
        strungAt: row.strungAt,
        operator: row.operator,
        checks,
      };
    },

    async addStringing(input: StringingInput): Promise<Stringing> {
      const stringing: Stringing = {
        id: uid('stringing'),
        guqinNo: input.guqinNo.trim(),
        stringType: input.stringType,
        nut: input.nut.trim(),
        stringGap: Number(input.stringGap) || 0,
        strungAt: input.strungAt ?? new Date().toISOString(),
        operator: input.operator.trim(),
        checks: [],
      };
      await db.stringings.put(toPlain(stringing));
      this.stringings = [stringing, ...this.stringings];
      return stringing;
    },

    /** 只改上弦静态信息；历次试音一笔不动 */
    async updateStringing(id: string, patch: StringingPatch) {
      const current = this.stringings.find((s) => s.id === id);
      if (!current) return;
      const next: Stringing = {
        ...current,
        guqinNo: patch.guqinNo?.trim() ?? current.guqinNo,
        stringType: patch.stringType ?? current.stringType,
        nut: patch.nut?.trim() ?? current.nut,
        stringGap: patch.stringGap !== undefined ? Number(patch.stringGap) || 0 : current.stringGap,
        strungAt: patch.strungAt ?? current.strungAt,
        operator: patch.operator?.trim() ?? current.operator,
      };
      await db.stringings.put(toPlain(next));
      this.stringings = this.stringings.map((s) => (s.id === id ? next : s));
    },

    /**
     * 追加试音一笔：记下日期、试音人、三段评语与本笔毛病。
     * 以前各笔照原样留着，进度以最新一笔为准。
     */
    async addCheck(stringingId: string, input: ToneCheckInput): Promise<ToneCheck | undefined> {
      const current = this.stringings.find((s) => s.id === stringingId);
      if (!current) return undefined;
      const check: ToneCheck = {
        id: uid('check'),
        checkedAt: input.checkedAt ?? new Date().toISOString(),
        checker: input.checker.trim(),
        sanNote: input.sanNote.trim(),
        anNote: input.anNote.trim(),
        fanNote: input.fanNote.trim(),
        nineVirtues: input.nineVirtues.trim(),
        defects: normalizeDefects(input.defects),
      };
      const checks = [...current.checks, check].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
      const next = { ...current, checks };
      await db.stringings.put(toPlain(next));
      this.stringings = this.stringings.map((s) => (s.id === stringingId ? next : s));
      return check;
    },

    /** 删除某笔试音（仅用于记错作废；不改动其他各笔） */
    async removeCheck(stringingId: string, checkId: string) {
      const current = this.stringings.find((s) => s.id === stringingId);
      if (!current) return;
      const next = { ...current, checks: current.checks.filter((c) => c.id !== checkId) };
      await db.stringings.put(toPlain(next));
      this.stringings = this.stringings.map((s) => (s.id === stringingId ? next : s));
    },

    async removeStringing(id: string) {
      await db.stringings.delete(id);
      this.stringings = this.stringings.filter((s) => s.id !== id);
    },
  },
});
