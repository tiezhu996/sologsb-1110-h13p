import Dexie, { type Table } from 'dexie';
import type { WoodBoard } from '../types/wood-board';
import type { SoundChamber } from '../types/sound-chamber';
import type { LacquerLayer } from '../types/lacquer-layer';
import { normalizeDefects, sortTrials, type StringDefect, type Stringing, type ToneTrial } from '../types/stringing';
import { uid } from './id';

/** IndexedDB 库名（浏览器本地存储，无后端） */
export const DB_NAME = 'gbguqin-db';

/** 当前 schema 版本，与 db.version(n) 对应 */
export const SCHEMA_VERSION = 3;

/** v2 及以前的评语历史版本（迁移用） */
interface LegacyToneVersion {
  id: string;
  savedAt: string;
  sanNote: string;
  anNote: string;
  fanNote: string;
}

/** v2 及以前的上弦记录：三段评语与缺陷直接挂在记录上，整条覆盖改写（迁移用） */
interface LegacyStringing {
  id: string;
  guqinNo: string;
  operator: string;
  strungAt: string;
  sanNote?: string;
  anNote?: string;
  fanNote?: string;
  defects?: StringDefect[];
  noteVersions?: LegacyToneVersion[];
  trials?: ToneTrial[];
}

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

    // v3：上弦记录改为「每次试音各留一笔」。旧记录的三段评语与缺陷转为最新一笔试音，
    // 评语历史版本转为更早的试音笔（保留原日期），文字内容原样保留，不再整条覆盖。
    // 升级前请在顶栏「导出备份」导出 JSON。
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
          .modify((row: LegacyStringing) => {
            if (Array.isArray(row.trials)) return;
            const versions = Array.isArray(row.noteVersions) ? row.noteVersions : [];
            // 当前评语是最后一次保存时写下的，日期取最近一个版本的存档时间（无版本则取上弦日）
            const current: ToneTrial = {
              id: uid('trial'),
              testedAt: versions[0]?.savedAt ?? row.strungAt,
              tester: row.operator,
              sanNote: row.sanNote ?? '',
              anNote: row.anNote ?? '',
              fanNote: row.fanNote ?? '',
              defects: normalizeDefects(row.defects ?? []),
            };
            const history: ToneTrial[] = versions.map((v) => ({
              id: v.id || uid('trial'),
              testedAt: v.savedAt ?? row.strungAt,
              tester: row.operator,
              sanNote: v.sanNote ?? '',
              anNote: v.anNote ?? '',
              fanNote: v.fanNote ?? '',
              defects: [],
            }));
            row.trials = sortTrials([current, ...history]);
            delete row.sanNote;
            delete row.anNote;
            delete row.fanNote;
            delete row.defects;
            delete row.noteVersions;
          });
      });
  }
}

export const db = new GuqinDB();

export async function getMeta(key: string): Promise<string | undefined> {
  const row = await db.meta.get(key);
  return row?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}
