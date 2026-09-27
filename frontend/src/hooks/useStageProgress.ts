import { computed } from 'vue';
import { useBoardStore } from '../stores/boardStore';
import { useChamberStore } from '../stores/chamberStore';
import { useLacquerStore } from '../stores/lacquerStore';
import { useStringingStore } from '../stores/stringingStore';
import { cumulativeThickness } from '../utils/layer';
import { isStringingPassed, latestCheck, remainingDefects, type Stringing } from '../types/stringing';
import { formatDate } from '../utils/layer';

export type StageKey = 'select' | 'carve' | 'lacquer' | 'string';

export interface StageItem {
  key: StageKey;
  label: string;
  done: boolean;
  detail: string;
  /** 缺失项列里展示的说法（默认与 label 相同） */
  missingLabel?: string;
}

export interface StageProgress {
  guqinNo: string;
  species: string;
  stages: StageItem[];
  /** 阶段推进比（0~100） */
  ratio: number;
  /** 缺失项 */
  missing: string[];
  cumulativeMm: number;
}

export const STAGE_LABELS: Record<StageKey, string> = {
  select: '选材',
  carve: '掏膛',
  lacquer: '灰胎',
  string: '上弦',
};

/** 灰胎完工目标累计厚度（mm） */
const TARGET_MM = 1.0;

/** 上弦阶段明细：区分未上弦 / 待试音 / 未过关（列剩余毛病）/ 已过关 */
function stringStageDetail(stringing: Stringing | undefined): string {
  if (!stringing) return '尚未上弦';
  const latest = latestCheck(stringing);
  const base = `${stringing.stringType}，弦距 ${stringing.stringGap}mm`;
  if (!latest) return `${base}；已上弦，尚未试音（共 0 笔）`;
  const remain = remainingDefects(stringing);
  const head = `${base}；最近试音 ${formatDate(latest.checkedAt)} ${latest.checker}`;
  if (remain.length === 0) return `${head}；毛病去净，过关（共 ${stringing.checks.length} 笔）`;
  return `${head}；未过关，剩 ${remain.join('、')}（共 ${stringing.checks.length} 笔）`;
}

/** 缺失项列的说法：未上弦 / 上弦待试音 / 上弦未过关+剩余毛病 */
function stringStageMissingLabel(stringing: Stringing | undefined): string {
  if (!stringing) return STAGE_LABELS.string;
  const latest = latestCheck(stringing);
  if (!latest) return `${STAGE_LABELS.string}待试音`;
  const remain = remainingDefects(stringing);
  return remain.length ? `${STAGE_LABELS.string}未过关（剩${remain.join('、')}）` : STAGE_LABELS.string;
}

/**
 * 按选材/掏膛/灰胎/上弦计算每张琴的阶段推进比与缺失项。
 * 选材：面板与底板配对齐全；掏膛：有槽腹记录；灰胎：累计厚度达标；
 * 上弦：有试音笔账且最近一笔无打板/抗指/沙音毛病，毛病未去净时在缺失项列明剩余毛病。
 */
export function useStageProgress() {
  const boardStore = useBoardStore();
  const chamberStore = useChamberStore();
  const lacquerStore = useLacquerStore();
  const stringingStore = useStringingStore();

  const guqinNos = computed(() => {
    const set = new Set<string>();
    boardStore.boards.forEach((b) => set.add(b.guqinNo));
    chamberStore.chambers.forEach((c) => set.add(c.guqinNo));
    lacquerStore.layers.forEach((l) => set.add(l.guqinNo));
    stringingStore.stringings.forEach((s) => set.add(s.guqinNo));
    return Array.from(set).sort();
  });

  const progressList = computed<StageProgress[]>(() =>
    guqinNos.value.map((guqinNo) => {
      const boards = boardStore.boards.filter((b) => b.guqinNo === guqinNo);
      const panel = boards.find((b) => b.part === '面板');
      const base = boards.find((b) => b.part === '底板');
      const chamber = chamberStore.chambers.find((c) => c.guqinNo === guqinNo);
      const layers = lacquerStore.layers.filter((l) => l.guqinNo === guqinNo);
      const total = cumulativeThickness(layers);
      const stringing = stringingStore.stringings.find((s) => s.guqinNo === guqinNo);
      const species = panel?.species ?? base?.species ?? '';

      const stages: StageItem[] = [
        {
          key: 'select',
          label: STAGE_LABELS.select,
          done: Boolean(panel && base),
          detail: panel && base ? `${panel.species}面板 + ${base.species}底板，阴干 ${Math.max(panel.dryYears, base.dryYears)} 年` : '面板或底板缺失',
        },
        {
          key: 'carve',
          label: STAGE_LABELS.carve,
          done: Boolean(chamber),
          detail: chamber ? `槽腹 ${chamber.chamberDepth}mm，纳音 ${chamber.nayinThickness}mm` : '尚未掏膛',
        },
        {
          key: 'lacquer',
          label: STAGE_LABELS.lacquer,
          done: total >= TARGET_MM,
          detail: layers.length ? `${layers.length} 遍，累计 ${total.toFixed(2)}mm / 目标 ${TARGET_MM}mm` : '尚未髹漆',
        },
        {
          key: 'string',
          label: STAGE_LABELS.string,
          done: stringing ? isStringingPassed(stringing) : false,
          detail: stringStageDetail(stringing),
          missingLabel: stringStageMissingLabel(stringing),
        },
      ];

      const doneCount = stages.filter((s) => s.done).length;
      return {
        guqinNo,
        species,
        stages,
        ratio: Math.round((doneCount / stages.length) * 100),
        missing: stages.filter((s) => !s.done).map((s) => s.missingLabel ?? s.label),
        cumulativeMm: Number(total.toFixed(2)),
      };
    }),
  );

  const summary = computed(() => {
    const base: Record<StageKey, number> = { select: 0, carve: 0, lacquer: 0, string: 0 };
    progressList.value.forEach((item) => {
      item.stages.forEach((stage) => {
        if (stage.done) base[stage.key] += 1;
      });
    });
    const total = progressList.value.length || 1;
    return {
      counts: base,
      total: progressList.value.length,
      completed: progressList.value.filter((item) => item.ratio === 100).length,
      averageRatio: Math.round(progressList.value.reduce((sum, item) => sum + item.ratio, 0) / total),
    };
  });

  return { progressList, summary, guqinNos };
}
