import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import {
  latestTrial,
  normalizeDefects,
  remainingDefects,
  sortTrials,
  type StringType,
  type Stringing,
  type ToneTrial,
  type TrialInput,
} from '../types/stringing';

export interface StringingInput {
  guqinNo: string;
  stringType: StringType;
  nut: string;
  stringGap: number;
  nineVirtues: string;
  strungAt?: string;
  operator: string;
  /** 上弦当次试音（登记记录时一并留下第一笔） */
  firstTrial: TrialInput;
}

interface StringingState {
  stringings: Stringing[];
  hydrated: boolean;
}

/** 上弦与试音记录（纯文本评语，不做音频处理；试音一笔一笔追加，往次原样保留） */
export const useStringingStore = defineStore('stringing', {
  state: (): StringingState => ({ stringings: [], hydrated: false }),

  getters: {
    byGuqin(state) {
      return (guqinNo: string): Stringing | undefined => state.stringings.find((s) => s.guqinNo === guqinNo);
    },
    /** 琴号 / 九德 / 各笔试音文字与试音人的检索 */
    search(state) {
      return (keyword: string): Stringing[] => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return state.stringings;
        return state.stringings.filter((s) =>
          [
            s.guqinNo,
            s.nineVirtues,
            s.operator,
            ...s.trials.flatMap((t) => [t.sanNote, t.anNote, t.fanNote, t.tester, t.defects.join(' ')]),
          ]
            .join(' ')
            .toLowerCase()
            .includes(kw),
        );
      };
    },
    /** 最新一笔试音仍挂着毛病的记录数 */
    defectCount(state): number {
      return state.stringings.filter((s) => remainingDefects(latestTrial(s)).length > 0).length;
    },
  },

  actions: {
    async hydrate() {
      this.stringings = await db.stringings.orderBy('strungAt').reverse().toArray();
      this.hydrated = true;
    },

    async addStringing(input: StringingInput): Promise<Stringing> {
      const strungAt = input.strungAt ?? new Date().toISOString();
      const firstTrial: ToneTrial = {
        id: uid('trial'),
        testedAt: input.firstTrial.testedAt ?? strungAt,
        tester: input.firstTrial.tester.trim(),
        sanNote: input.firstTrial.sanNote.trim(),
        anNote: input.firstTrial.anNote.trim(),
        fanNote: input.firstTrial.fanNote.trim(),
        defects: normalizeDefects(input.firstTrial.defects),
      };
      const stringing: Stringing = {
        id: uid('stringing'),
        guqinNo: input.guqinNo.trim(),
        stringType: input.stringType,
        nut: input.nut.trim(),
        stringGap: Number(input.stringGap) || 0,
        nineVirtues: input.nineVirtues.trim(),
        strungAt,
        operator: input.operator.trim(),
        trials: [firstTrial],
      };
      await db.stringings.put(toPlain(stringing));
      this.stringings = [stringing, ...this.stringings];
      return stringing;
    },

    /** 更新上弦记录本身（琴号、弦、九德等）；试音笔不在此改动 */
    async updateStringing(id: string, patch: Partial<Omit<StringingInput, 'firstTrial'>>) {
      const current = this.stringings.find((s) => s.id === id);
      if (!current) return;
      const next: Stringing = {
        ...current,
        guqinNo: patch.guqinNo?.trim() ?? current.guqinNo,
        stringType: patch.stringType ?? current.stringType,
        nut: patch.nut?.trim() ?? current.nut,
        stringGap: patch.stringGap !== undefined ? Number(patch.stringGap) : current.stringGap,
        nineVirtues: patch.nineVirtues?.trim() ?? current.nineVirtues,
        strungAt: patch.strungAt ?? current.strungAt,
        operator: patch.operator?.trim() ?? current.operator,
      };
      await db.stringings.put(toPlain(next));
      this.stringings = this.stringings.map((s) => (s.id === id ? next : s));
    },

    /** 记一笔试音：只追加，往次的笔原样保留 */
    async addTrial(stringingId: string, input: TrialInput): Promise<ToneTrial | undefined> {
      const current = this.stringings.find((s) => s.id === stringingId);
      if (!current) return undefined;
      const trial: ToneTrial = {
        id: uid('trial'),
        testedAt: input.testedAt ?? new Date().toISOString(),
        tester: input.tester.trim(),
        sanNote: input.sanNote.trim(),
        anNote: input.anNote.trim(),
        fanNote: input.fanNote.trim(),
        defects: normalizeDefects(input.defects),
      };
      const next: Stringing = { ...current, trials: sortTrials([trial, ...current.trials]) };
      await db.stringings.put(toPlain(next));
      this.stringings = this.stringings.map((s) => (s.id === stringingId ? next : s));
      return trial;
    },

    async removeStringing(id: string) {
      await db.stringings.delete(id);
      this.stringings = this.stringings.filter((s) => s.id !== id);
    },
  },
});
