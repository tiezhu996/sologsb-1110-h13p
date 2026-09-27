import Dexie, { type Table } from 'dexie';
import type { WoodBoard } from '../types/wood-board';
import type { SoundChamber } from '../types/sound-chamber';
import type { LacquerLayer } from '../types/lacquer-layer';
import type { Stringing, ToneCheck } from '../types/stringing';
import { normalizeDefects } from '../types/stringing';

/** IndexedDB 库名（浏览器本地存储，无后端） */
export const DB_NAME = 'gbguqin-db';

/** 当前 schema 版本，与 db.version(n) 对应 */
export const SCHEMA_VERSION = 3;

class GuqinDB extends Dexie {
  boards!: Table<WoodBoard, string>;
  chambers!: Table<SoundChamber, string>;
  lacquers!: Table<LacquerLayer, string>;
  stringings!: Table<Stringing, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super(DB_NAME);

    // v1：建表声明索引
    this.version(1).stores({
      boards: 'id, boardNo, guqinNo, part, species, grain, receivedAt',
      chambers: 'id, guqinNo, postPos, carvedAt',
      lacquers: 'id, guqinNo, seq, appliedAt',
      stringings: 'id, guqinNo, stringType, strungAt',
      meta: 'key',
    });

    // v2：髹漆表增加 (guqinNo+seq) 复合索引，便于按遍次排序查询；并回填历史 layerThickness。
    // 升级前请在顶栏「导出备份」导出 JSON。
    this.version(2)
      .stores({
        boards: 'id, boardNo, guqinNo, part, species, grain, receivedAt',
        chambers: 'id, guqinNo, postPos, carvedAt',
        lacquers: 'id, guqinNo, seq, [guqinNo+seq], appliedAt',
        stringings: 'id, guqinNo, stringType, strungAt',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('lacquers')
          .toCollection()
          .modify((row: LacquerLayer) => {
            if (!row.layerThickness && row.totalThickness) {
              row.layerThickness = row.totalThickness;
            }
          });
      });

    // v3：上弦记录改为「上弦信息 + 历次试音笔账」。
    // 老记录的顶层评语当作最新一笔试音，noteVersions 里的旧评语按 savedAt 补成更早各笔；
    // 老毛病里的「无」归一为空毛病（无毛病不再挂「无」字标）。
    this.version(3)
      .stores({
        boards: 'id, boardNo, guqinNo, part, species, grain, receivedAt',
        chambers: 'id, guqinNo, postPos, carvedAt',
        lacquers: 'id, guqinNo, seq, [guqinNo+seq], appliedAt',
        stringings: 'id, guqinNo, stringType, strungAt',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('stringings')
          .toCollection()
          .modify((row: Stringing & LegacyStringingV2) => {
            if (Array.isArray(row.checks) && row.checks.length > 0) {
              delete row.sanNote;
              delete row.anNote;
              delete row.fanNote;
              delete row.nineVirtues;
              delete row.defects;
              delete row.noteVersions;
              return;
            }

            const checks: ToneCheck[] = [];
            (row.noteVersions ?? []).forEach((v, i) => {
              checks.push({
                id: v.id || `check-mig-${i}`,
                checkedAt: v.savedAt,
                checker: row.operator ?? '',
                sanNote: v.sanNote ?? '',
                anNote: v.anNote ?? '',
                fanNote: v.fanNote ?? '',
                nineVirtues: v.nineVirtues ?? '',
                defects: [],
              });
            });
            checks.push({
              id: `check-mig-current-${row.id}`,
              checkedAt: row.strungAt,
              checker: row.operator ?? '',
              sanNote: row.sanNote ?? '',
              anNote: row.anNote ?? '',
              fanNote: row.fanNote ?? '',
              nineVirtues: row.nineVirtues ?? '',
              defects: normalizeDefects(row.defects),
            });
            checks.sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
            row.checks = checks;

            delete row.sanNote;
            delete row.anNote;
            delete row.fanNote;
            delete row.nineVirtues;
            delete row.defects;
            delete row.noteVersions;
          });
      });
  }
}

/** v2 及以前的上弦记录字段（迁移完成后删除） */
interface LegacyStringingV2 {
  sanNote?: string;
  anNote?: string;
  fanNote?: string;
  nineVirtues?: string;
  defects?: string[];
  noteVersions?: Array<{
    id?: string;
    savedAt: string;
    sanNote: string;
    anNote: string;
    fanNote: string;
    nineVirtues: string;
  }>;
}

export const db = new GuqinDB();

export async function getMeta(key: string): Promise<string | undefined> {
  const row = await db.meta.get(key);
  return row?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}
