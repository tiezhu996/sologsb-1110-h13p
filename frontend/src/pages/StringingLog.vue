<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import FilterBar from '../components/common/FilterBar.vue';
import EmptyPanel from '../components/common/EmptyPanel.vue';
import ToneTextEditor from '../components/common/ToneTextEditor.vue';
import { useStringingStore } from '../stores/stringingStore';
import { useBoardStore } from '../stores/boardStore';
import { formatDate } from '../utils/layer';
import {
  NINE_VIRTUES,
  STRING_DEFECTS,
  STRING_TYPES,
  latestTrial,
  type StringDefect,
  type StringType,
  type Stringing,
  type ToneDraft,
} from '../types/stringing';

const route = useRoute();
const stringingStore = useStringingStore();
const boardStore = useBoardStore();

const recordDialogVisible = ref(false);
const trialDialogVisible = ref(false);
const historyDialogVisible = ref(false);
const editingId = ref('');
const trialTargetId = ref('');
const historyId = ref('');
const formRef = ref<FormInstance>();

interface RecordForm {
  guqinNo: string;
  stringType: StringType;
  nut: string;
  stringGap: number;
  nineVirtues: string;
  strungAt: string;
  operator: string;
}

interface TrialMeta {
  testedAt: string;
  tester: string;
  defects: StringDefect[];
}

const today = () => new Date().toISOString().slice(0, 10);

const form = ref<RecordForm>({
  guqinNo: '',
  stringType: '丝弦',
  nut: '红木雁足 + 丝绒扣',
  stringGap: 17,
  nineVirtues: '',
  strungAt: today(),
  operator: '周砚秋',
});

/** 试音笔的日期 / 试音人 / 缺陷（登记记录的首笔与「记一笔试音」共用） */
const trialMeta = ref<TrialMeta>({ testedAt: today(), tester: '', defects: ['无'] });
const tone = ref<ToneDraft>({ sanNote: '', anNote: '', fanNote: '' });

const rules: FormRules = {
  guqinNo: [{ required: true, message: '请输入琴号', trigger: 'blur' }],
  operator: [{ required: true, message: '请输入上弦人', trigger: 'blur' }],
};

/** 勾了具体毛病（打板/抗指/沙音）就摘掉「无」；勾「无」则清掉具体毛病 */
watch(
  () => trialMeta.value.defects,
  (val, old) => {
    if (val.includes('无') && !(old ?? []).includes('无')) {
      trialMeta.value.defects = ['无'];
    } else if (val.length > 1 && val.includes('无')) {
      trialMeta.value.defects = val.filter((d) => d !== '无');
    }
  },
);

const stringTypeParam = computed(() => (typeof route.query.stringType === 'string' ? route.query.stringType : ''));
const defectParam = computed(() => (typeof route.query.defect === 'string' ? route.query.defect : ''));
const keyword = computed(() => (typeof route.query.kw === 'string' ? route.query.kw : ''));

const visible = computed(() =>
  stringingStore.search(keyword.value).filter((item) => {
    if (stringTypeParam.value && item.stringType !== stringTypeParam.value) return false;
    // 缺陷筛选看最新一笔试音：还挂着什么毛病、或已干净
    if (defectParam.value && !(latestTrial(item)?.defects ?? []).includes(defectParam.value as StringDefect)) return false;
    return true;
  }),
);

const trialTarget = computed(() => stringingStore.stringings.find((s) => s.id === trialTargetId.value));
const historyRecord = computed(() => stringingStore.stringings.find((s) => s.id === historyId.value));

function resetTrial(testedAt: string, tester: string) {
  trialMeta.value = { testedAt, tester, defects: ['无'] };
  tone.value = { sanNote: '', anNote: '', fanNote: '' };
}

function openCreate() {
  editingId.value = '';
  form.value = {
    guqinNo: boardStore.guqinNos[0] ?? 'Q-2506',
    stringType: '丝弦',
    nut: '红木雁足 + 丝绒扣',
    stringGap: 17,
    nineVirtues: `九德：${NINE_VIRTUES.join('、')}，以奇、古、透为先。`,
    strungAt: today(),
    operator: '周砚秋',
  };
  resetTrial(today(), form.value.operator);
  tone.value = {
    sanNote: '散音宽厚，一弦如钟。',
    anNote: '按音走手顺滑，无抗指。',
    fanNote: '泛音清亮，五六徽干净。',
  };
  recordDialogVisible.value = true;
}

function openEdit(stringing: Stringing) {
  editingId.value = stringing.id;
  form.value = {
    guqinNo: stringing.guqinNo,
    stringType: stringing.stringType,
    nut: stringing.nut,
    stringGap: stringing.stringGap,
    nineVirtues: stringing.nineVirtues,
    strungAt: stringing.strungAt.slice(0, 10),
    operator: stringing.operator,
  };
  recordDialogVisible.value = true;
}

function openTrial(stringing: Stringing) {
  trialTargetId.value = stringing.id;
  resetTrial(today(), latestTrial(stringing)?.tester ?? stringing.operator);
  trialDialogVisible.value = true;
}

function openHistory(stringing: Stringing) {
  historyId.value = stringing.id;
  historyDialogVisible.value = true;
}

function trialPayload() {
  return {
    testedAt: new Date(`${trialMeta.value.testedAt}T09:00:00`).toISOString(),
    tester: trialMeta.value.tester,
    defects: trialMeta.value.defects,
    sanNote: tone.value.sanNote,
    anNote: tone.value.anNote,
    fanNote: tone.value.fanNote,
  };
}

function validTrial(): boolean {
  if (!trialMeta.value.tester.trim()) {
    ElMessage.warning('请填写试音人');
    return false;
  }
  return true;
}

async function submitRecord() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  const payload = {
    guqinNo: form.value.guqinNo,
    stringType: form.value.stringType,
    nut: form.value.nut,
    stringGap: Number(form.value.stringGap) || 0,
    nineVirtues: form.value.nineVirtues,
    strungAt: new Date(`${form.value.strungAt}T09:00:00`).toISOString(),
    operator: form.value.operator,
  };
  if (editingId.value) {
    await stringingStore.updateStringing(editingId.value, payload);
    ElMessage.success('已保存上弦记录');
  } else {
    if (!validTrial()) return;
    await stringingStore.addStringing({ ...payload, firstTrial: trialPayload() });
    ElMessage.success(`已登记 ${payload.guqinNo} 的上弦记录与当次试音`);
  }
  recordDialogVisible.value = false;
}

async function submitTrial() {
  if (!trialTarget.value) return;
  if (!validTrial()) return;
  await stringingStore.addTrial(trialTarget.value.id, trialPayload());
  ElMessage.success(`已为 ${trialTarget.value.guqinNo} 记下一笔试音，往次记录原样保留`);
  trialDialogVisible.value = false;
}

async function remove(stringing: Stringing) {
  const confirmed = await ElMessageBox.confirm(
    `确认删除 ${stringing.guqinNo} 的上弦记录？其下 ${stringing.trials.length} 笔试音将一并删除。`,
    '删除确认',
    { type: 'warning' },
  )
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await stringingStore.removeStringing(stringing.id);
  ElMessage.success('已删除');
}
</script>

<template>
  <div>
    <h2 class="page-title">上弦记录与试音</h2>
    <p class="page-desc">
      上弦后师傅隔几天听一回，每次试音各留一笔（日期、试音人、散音/按音/泛音三段评语），打板、抗指、沙音标在当笔上；
      往次的笔原样保留，是否过关看最新一笔。纯文本记录，不做音频文件与波形处理。
    </p>

    <div class="toolbar">
      <el-button type="primary" @click="openCreate">登记上弦记录</el-button>
      <el-tag type="info" effect="plain">九德：{{ NINE_VIRTUES.join(' · ') }}</el-tag>
      <el-tag v-if="stringingStore.defectCount" type="warning" effect="plain">最新试音仍挂毛病 {{ stringingStore.defectCount }} 张</el-tag>
    </div>

    <FilterBar
      :fields="[
        { key: 'stringType', label: '弦材质', options: STRING_TYPES, width: 110 },
        { key: 'defect', label: '当前缺陷', options: STRING_DEFECTS, width: 110 },
      ]"
      keyword-placeholder="检索琴号 / 试音人 / 各笔散音 / 按音 / 泛音文字"
      :result-count="visible.length"
      :total-count="stringingStore.stringings.length"
    />

    <EmptyPanel v-if="visible.length === 0" description="没有符合条件的上弦记录" action-text="登记上弦记录" @action="openCreate" />

    <el-card v-else shadow="never" class="block">
      <el-table :data="visible" size="small" border>
        <el-table-column prop="guqinNo" label="琴号" width="100" />
        <el-table-column prop="stringType" label="弦材质" width="90" />
        <el-table-column prop="nut" label="雁足与绒扣" width="170" />
        <el-table-column prop="stringGap" label="弦距(mm)" width="90" />
        <el-table-column label="上弦日期" width="110">
          <template #default="scope">{{ formatDate(scope.row.strungAt) }}</template>
        </el-table-column>
        <el-table-column prop="operator" label="上弦人" width="90" />
        <el-table-column label="试音" width="70">
          <template #default="scope">{{ scope.row.trials.length }} 笔</template>
        </el-table-column>
        <el-table-column label="最近试音" width="180">
          <template #default="scope">
            <span v-if="latestTrial(scope.row)">{{ formatDate(latestTrial(scope.row)!.testedAt) }} · {{ latestTrial(scope.row)!.tester }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="当前缺陷" width="150">
          <template #default="scope">
            <template v-if="latestTrial(scope.row)">
              <el-tag
                v-for="defect in latestTrial(scope.row)!.defects"
                :key="defect"
                :type="defect === '无' ? 'success' : 'danger'"
                size="small"
                class="defect-tag"
              >
                {{ defect }}
              </el-tag>
              <span v-if="!latestTrial(scope.row)!.defects.length" class="muted">未标记</span>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="openTrial(scope.row)">记一笔试音</el-button>
            <el-button link type="primary" @click="openHistory(scope.row)">试音履历</el-button>
            <el-button link type="primary" @click="openEdit(scope.row)">编辑</el-button>
            <el-button link type="danger" @click="remove(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="recordDialogVisible" :title="editingId ? '编辑上弦记录' : '登记上弦记录（含当次试音）'" width="820px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="琴号" prop="guqinNo">
          <el-input v-model="form.guqinNo" placeholder="如：Q-2506" maxlength="20" style="width: 200px" />
        </el-form-item>
        <el-form-item label="弦材质">
          <el-select v-model="form.stringType" style="width: 160px">
            <el-option v-for="type in STRING_TYPES" :key="type" :label="type" :value="type" />
          </el-select>
        </el-form-item>
        <el-form-item label="雁足与绒扣">
          <el-input v-model="form.nut" placeholder="如：红木雁足 + 丝绒扣" maxlength="40" style="width: 300px" />
        </el-form-item>
        <el-form-item label="弦距(mm)">
          <el-input-number v-model="form.stringGap" :min="10" :max="30" :step="0.5" :precision="1" placeholder="弦距" />
        </el-form-item>
        <el-form-item label="上弦日期">
          <el-date-picker v-model="form.strungAt" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="上弦人" prop="operator">
          <el-input v-model="form.operator" placeholder="如：周砚秋" maxlength="16" style="width: 200px" />
        </el-form-item>
        <el-form-item label="九德文字简述">
          <el-input v-model="form.nineVirtues" type="textarea" :rows="2" maxlength="120" show-word-limit placeholder="九德文字简述" />
        </el-form-item>
      </el-form>

      <template v-if="!editingId">
        <el-divider content-position="left">当次试音（第一笔）</el-divider>
        <el-form label-width="120px">
          <el-form-item label="试音日期">
            <el-date-picker v-model="trialMeta.testedAt" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
          </el-form-item>
          <el-form-item label="试音人" required>
            <el-input v-model="trialMeta.tester" placeholder="如：周砚秋" maxlength="16" style="width: 200px" />
          </el-form-item>
          <el-form-item label="缺陷标记">
            <el-checkbox-group v-model="trialMeta.defects">
              <el-checkbox v-for="defect in STRING_DEFECTS" :key="defect" :label="defect" :value="defect">{{ defect }}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
        <ToneTextEditor v-model="tone" />
      </template>
      <p v-else class="edit-note">试音一笔一笔追加，不在此改动；请用「记一笔试音」留下新的一笔。</p>

      <template #footer>
        <el-button @click="recordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRecord">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="trialDialogVisible" :title="`记一笔试音 · ${trialTarget?.guqinNo ?? ''}`" width="820px">
      <el-form label-width="120px">
        <el-form-item label="试音日期">
          <el-date-picker v-model="trialMeta.testedAt" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="试音人" required>
          <el-input v-model="trialMeta.tester" placeholder="如：周砚秋" maxlength="16" style="width: 200px" />
        </el-form-item>
        <el-form-item label="缺陷标记">
          <el-checkbox-group v-model="trialMeta.defects">
            <el-checkbox v-for="defect in STRING_DEFECTS" :key="defect" :label="defect" :value="defect">{{ defect }}</el-checkbox>
          </el-checkbox-group>
          <div class="field-hint">勾了打板 / 抗指 / 沙音就不再挂「无」；一样没有则留「无」。</div>
        </el-form-item>
      </el-form>
      <ToneTextEditor v-model="tone" />
      <template #footer>
        <el-button @click="trialDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitTrial">记下这一笔</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyDialogVisible" :title="`试音履历 · ${historyRecord?.guqinNo ?? ''}`" width="760px">
      <template v-if="historyRecord">
        <p class="history-summary">
          {{ historyRecord.stringType }}，弦距 {{ historyRecord.stringGap }}mm，{{ formatDate(historyRecord.strungAt) }} 由 {{ historyRecord.operator }} 上弦；
          共 {{ historyRecord.trials.length }} 笔试音，最新在前，往次原样保留。
        </p>
        <el-timeline class="history-timeline">
          <el-timeline-item
            v-for="(trial, index) in historyRecord.trials"
            :key="trial.id"
            :timestamp="`${formatDate(trial.testedAt)} · 试音人 ${trial.tester}`"
            :type="index === 0 ? 'primary' : undefined"
            :hollow="index !== 0"
          >
            <div class="trial-defects">
              <el-tag v-if="index === 0" type="primary" size="small" effect="dark" class="defect-tag">最新一笔</el-tag>
              <el-tag
                v-for="defect in trial.defects"
                :key="defect"
                :type="defect === '无' ? 'success' : 'danger'"
                size="small"
                class="defect-tag"
              >
                {{ defect }}
              </el-tag>
              <span v-if="!trial.defects.length" class="muted">缺陷未标记</span>
            </div>
            <div class="trial-note"><span class="note-label">散音</span>{{ trial.sanNote || '—' }}</div>
            <div class="trial-note"><span class="note-label">按音</span>{{ trial.anNote || '—' }}</div>
            <div class="trial-note"><span class="note-label">泛音</span>{{ trial.fanNote || '—' }}</div>
          </el-timeline-item>
        </el-timeline>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  color: #4a3728;
}
.page-desc {
  margin: 0 0 12px;
  color: #8a7a68;
  font-size: 13px;
}
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.block {
  border-radius: 8px;
}
.defect-tag {
  margin-right: 4px;
}
.muted {
  color: #b3a48f;
  font-size: 12px;
}
.edit-note {
  margin: 0;
  color: #8a7a68;
  font-size: 13px;
}
.field-hint {
  font-size: 12px;
  color: #8a7a68;
  line-height: 1.4;
}
.history-summary {
  margin: 0 0 12px;
  color: #8a7a68;
  font-size: 13px;
}
.history-timeline {
  padding-left: 4px;
}
.trial-defects {
  margin-bottom: 6px;
}
.trial-note {
  font-size: 13px;
  color: #4a3728;
  line-height: 1.7;
}
.note-label {
  display: inline-block;
  width: 40px;
  color: #8a7a68;
}
</style>
