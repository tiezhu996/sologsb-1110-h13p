<script setup lang="ts">
import { computed, ref } from 'vue';
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
  isStringingPassed,
  latestCheck,
  remainingDefects,
  type StringDefect,
  type StringType,
  type Stringing,
  type ToneCheck,
  type ToneDraft,
} from '../types/stringing';

const route = useRoute();
const stringingStore = useStringingStore();
const boardStore = useBoardStore();

/** 上弦信息弹窗：dialogVisible 控制开关，editingId 为空表示新登记 */
const setupDialogVisible = ref(false);
const editingId = ref('');
/** 正在追加试音的上弦记录 id */
const checkDialogVisible = ref(false);
const checkTargetId = ref('');
const setupFormRef = ref<FormInstance>();
const checkFormRef = ref<FormInstance>();

interface SetupForm {
  guqinNo: string;
  stringType: StringType;
  nut: string;
  stringGap: number;
  strungAt: string;
  operator: string;
}

const setupForm = ref<SetupForm>(emptySetupForm());

interface CheckForm {
  checkedAt: string;
  checker: string;
  defects: StringDefect[];
}

const checkForm = ref<CheckForm>(emptyCheckForm());
const tone = ref<ToneDraft>({ sanNote: '', anNote: '', fanNote: '', nineVirtues: '' });

const setupRules: FormRules = {
  guqinNo: [{ required: true, message: '请输入琴号', trigger: 'blur' }],
  operator: [{ required: true, message: '请输入上弦人', trigger: 'blur' }],
};
const checkRules: FormRules = {
  checker: [{ required: true, message: '请输入试音人', trigger: 'blur' }],
};

function emptySetupForm(): SetupForm {
  return {
    guqinNo: '',
    stringType: '丝弦',
    nut: '红木雁足 + 丝绒扣',
    stringGap: 17,
    strungAt: new Date().toISOString().slice(0, 10),
    operator: '周砚秋',
  };
}

function emptyCheckForm(): CheckForm {
  return {
    checkedAt: new Date().toISOString().slice(0, 10),
    checker: '周砚秋',
    defects: [],
  };
}

function sampleTone(): ToneDraft {
  return {
    sanNote: '散音宽厚，一弦如钟。',
    anNote: '按音走手顺滑，无抗指。',
    fanNote: '泛音清亮，五六徽干净。',
    nineVirtues: `九德：${NINE_VIRTUES.join('、')}，以奇、古、透为先。`,
  };
}

const stringTypeParam = computed(() => (typeof route.query.stringType === 'string' ? route.query.stringType : ''));
const defectParam = computed(() => (typeof route.query.defect === 'string' ? route.query.defect : ''));
const keyword = computed(() => (typeof route.query.kw === 'string' ? route.query.kw : ''));

const visible = computed(() =>
  stringingStore.search(keyword.value).filter((item) => {
    if (stringTypeParam.value && item.stringType !== stringTypeParam.value) return false;
    // 缺陷筛选只认最近一笔：还挂着该毛病才算
    if (defectParam.value && !remainingDefects(item).includes(defectParam.value as StringDefect)) return false;
    return true;
  }),
);

function checksNewestFirst(stringing: Stringing): ToneCheck[] {
  return [...stringing.checks].reverse();
}

function openCreate() {
  editingId.value = '';
  setupForm.value = { ...emptySetupForm(), guqinNo: boardStore.guqinNos[0] ?? 'Q-2506' };
  setupDialogVisible.value = true;
}

function openEdit(stringing: Stringing) {
  editingId.value = stringing.id;
  setupForm.value = {
    guqinNo: stringing.guqinNo,
    stringType: stringing.stringType,
    nut: stringing.nut,
    stringGap: stringing.stringGap,
    strungAt: stringing.strungAt.slice(0, 10),
    operator: stringing.operator,
  };
  setupDialogVisible.value = true;
}

function openAddCheck(stringing: Stringing) {
  checkTargetId.value = stringing.id;
  checkDialogVisible.value = true;
  checkForm.value = { ...emptyCheckForm(), checker: stringing.operator || '周砚秋' };
  tone.value = sampleTone();
}

async function submitSetup() {
  const ok = await setupFormRef.value?.validate().catch(() => false);
  if (!ok) return;
  const payload = {
    guqinNo: setupForm.value.guqinNo,
    stringType: setupForm.value.stringType,
    nut: setupForm.value.nut,
    stringGap: Number(setupForm.value.stringGap) || 0,
    strungAt: new Date(`${setupForm.value.strungAt}T09:00:00`).toISOString(),
    operator: setupForm.value.operator,
  };
  if (editingId.value) {
    await stringingStore.updateStringing(editingId.value, payload);
    ElMessage.success('已保存上弦信息，历次试音笔账未改动');
  } else {
    await stringingStore.addStringing(payload);
    ElMessage.success(`已登记 ${payload.guqinNo} 的上弦记录，可随时「追加试音」`);
  }
  setupDialogVisible.value = false;
}

async function submitCheck() {
  const ok = await checkFormRef.value?.validate().catch(() => false);
  if (!ok) return;
  const added = await stringingStore.addCheck(checkTargetId.value, {
    checkedAt: new Date(`${checkForm.value.checkedAt}T09:00:00`).toISOString(),
    checker: checkForm.value.checker,
    defects: checkForm.value.defects,
    sanNote: tone.value.sanNote,
    anNote: tone.value.anNote,
    fanNote: tone.value.fanNote,
    nineVirtues: tone.value.nineVirtues,
  });
  if (!added) return;
  ElMessage.success(added.defects.length ? `已记下本笔试音：还挂 ${added.defects.join('、')}` : '已记下本笔试音：毛病去净，上弦过关');
  checkDialogVisible.value = false;
  checkTargetId.value = '';
}

async function removeCheck(stringing: Stringing, check: ToneCheck) {
  const confirmed = await ElMessageBox.confirm(`作废 ${formatDate(check.checkedAt)} ${check.checker} 的这笔试音？其他各笔不动。`, '作废确认', {
    type: 'warning',
  })
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await stringingStore.removeCheck(stringing.id, check.id);
  ElMessage.success('该笔试音已作废，其余笔账照原样保留');
}

async function remove(stringing: Stringing) {
  const confirmed = await ElMessageBox.confirm(`确认删除 ${stringing.guqinNo} 的上弦记录及其 ${stringing.checks.length} 笔试音？`, '删除确认', {
    type: 'warning',
  })
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await stringingStore.removeStringing(stringing.id);
  ElMessage.success('已删除');
}
</script>

<template>
  <div>
    <h2 class="page-title">上弦记录与试音笔账</h2>
    <p class="page-desc">
      上弦信息只登记一次；师傅每回听一次音就「追加试音」一笔，记下日期、试音人、散音/按音/泛音三段评语与本笔毛病，以前各笔照原样留着。
      上弦是否过关只看最近一笔：毛病去净才算过，还挂着打板/抗指/沙音则列明剩余项。
    </p>

    <div class="toolbar">
      <el-button type="primary" @click="openCreate">登记上弦记录</el-button>
      <el-tag type="info" effect="plain">九德：{{ NINE_VIRTUES.join(' · ') }}</el-tag>
      <el-tag v-if="stringingStore.defectCount" type="warning" effect="plain">最近一笔仍挂毛病 {{ stringingStore.defectCount }} 条</el-tag>
    </div>

    <FilterBar
      :fields="[
        { key: 'stringType', label: '弦材质', options: STRING_TYPES, width: 110 },
        { key: 'defect', label: '最近一笔毛病', options: STRING_DEFECTS, width: 140 },
      ]"
      keyword-placeholder="检索试音人 / 散音 / 按音 / 泛音 / 九德文字"
      :result-count="visible.length"
      :total-count="stringingStore.stringings.length"
    />

    <EmptyPanel v-if="visible.length === 0" description="没有符合条件的上弦记录" action-text="登记上弦记录" @action="openCreate" />

    <el-card v-else shadow="never" class="block">
      <el-table :data="visible" size="small" border row-key="id">
        <el-table-column type="expand">
          <template #default="scope">
            <div class="check-history">
              <div class="history-head">
                <span>试音笔账（共 {{ scope.row.checks.length }} 笔，按时间倒序，旧账不改）</span>
                <el-button size="small" type="primary" plain @click="openAddCheck(scope.row)">追加试音一笔</el-button>
              </div>
              <el-empty v-if="scope.row.checks.length === 0" :image-size="48" description="尚未试音，先追加第一笔" />
              <div v-for="check in checksNewestFirst(scope.row)" :key="check.id" class="check-item">
                <div class="check-meta">
                  <el-tag size="small" :type="check.defects.length ? 'danger' : 'success'" effect="plain">
                    {{ check.defects.length ? '挂毛病' : '无毛病' }}
                  </el-tag>
                  <span class="check-date">{{ formatDate(check.checkedAt) }}</span>
                  <span class="checker">试音人：{{ check.checker }}</span>
                  <el-tag v-for="defect in check.defects" :key="defect" type="danger" size="small" class="defect-tag">{{ defect }}</el-tag>
                  <el-button link type="danger" size="small" class="check-remove" @click="removeCheck(scope.row, check)">作废此笔</el-button>
                </div>
                <div class="check-notes">
                  <div><span class="note-label">散音</span>{{ check.sanNote || '—' }}</div>
                  <div><span class="note-label">按音</span>{{ check.anNote || '—' }}</div>
                  <div><span class="note-label">泛音</span>{{ check.fanNote || '—' }}</div>
                  <div><span class="note-label">九德</span>{{ check.nineVirtues || '—' }}</div>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="guqinNo" label="琴号" width="100" />
        <el-table-column prop="stringType" label="弦材质" width="80" />
        <el-table-column prop="nut" label="雁足与绒扣" min-width="150" show-overflow-tooltip />
        <el-table-column prop="stringGap" label="弦距(mm)" width="85" />
        <el-table-column prop="operator" label="上弦人" width="90" />
        <el-table-column label="上弦日期" width="100">
          <template #default="scope">{{ formatDate(scope.row.strungAt) }}</template>
        </el-table-column>
        <el-table-column label="最近试音" min-width="150">
          <template #default="scope">
            <template v-if="latestCheck(scope.row)">
              <div>{{ formatDate(latestCheck(scope.row)!.checkedAt) }}</div>
              <div class="muted">{{ latestCheck(scope.row)!.checker }} · 共 {{ scope.row.checks.length }} 笔</div>
            </template>
            <span v-else class="muted">尚未试音</span>
          </template>
        </el-table-column>
        <el-table-column label="最近一笔评语" min-width="220">
          <template #default="scope">
            <template v-if="latestCheck(scope.row)">
              <div class="note-line"><span class="note-label">散</span>{{ latestCheck(scope.row)!.sanNote || '—' }}</div>
              <div class="note-line"><span class="note-label">按</span>{{ latestCheck(scope.row)!.anNote || '—' }}</div>
              <div class="note-line"><span class="note-label">泛</span>{{ latestCheck(scope.row)!.fanNote || '—' }}</div>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="本笔毛病" width="150">
          <template #default="scope">
            <template v-if="!latestCheck(scope.row)">
              <el-tag type="info" size="small" effect="plain">未试音</el-tag>
            </template>
            <template v-else-if="remainingDefects(scope.row).length">
              <el-tag v-for="defect in remainingDefects(scope.row)" :key="defect" type="danger" size="small" class="defect-tag">{{ defect }}</el-tag>
            </template>
            <el-tag v-else type="success" size="small">无</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="过关" width="150">
          <template #default="scope">
            <el-tag v-if="isStringingPassed(scope.row)" type="success" size="small" effect="dark">上弦过关</el-tag>
            <div v-else-if="latestCheck(scope.row)" class="pending">
              <el-tag type="danger" size="small" effect="plain">未过关</el-tag>
              <div class="pending-detail">剩：{{ remainingDefects(scope.row).join('、') }}</div>
            </div>
            <el-tag v-else type="info" size="small" effect="plain">待试音</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="openAddCheck(scope.row)">追加试音</el-button>
            <el-button link type="primary" @click="openEdit(scope.row)">改上弦信息</el-button>
            <el-button link type="danger" @click="remove(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 登记 / 编辑上弦信息（不含试音评语） -->
    <el-dialog v-model="setupDialogVisible" :title="editingId ? '编辑上弦信息' : '登记上弦记录'" width="640px">
      <el-form ref="setupFormRef" :model="setupForm" :rules="setupRules" label-width="120px">
        <el-form-item label="琴号" prop="guqinNo">
          <el-input v-model="setupForm.guqinNo" placeholder="如：Q-2506" maxlength="20" style="width: 200px" />
        </el-form-item>
        <el-form-item label="弦材质">
          <el-select v-model="setupForm.stringType" style="width: 160px">
            <el-option v-for="type in STRING_TYPES" :key="type" :label="type" :value="type" />
          </el-select>
        </el-form-item>
        <el-form-item label="雁足与绒扣">
          <el-input v-model="setupForm.nut" placeholder="如：红木雁足 + 丝绒扣" maxlength="40" style="width: 300px" />
        </el-form-item>
        <el-form-item label="弦距(mm)">
          <el-input-number v-model="setupForm.stringGap" :min="10" :max="30" :step="0.5" :precision="1" placeholder="弦距" />
        </el-form-item>
        <el-form-item label="上弦日期">
          <el-date-picker v-model="setupForm.strungAt" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="上弦人" prop="operator">
          <el-input v-model="setupForm.operator" placeholder="如：周砚秋" maxlength="16" style="width: 200px" />
        </el-form-item>
        <el-alert type="info" :closable="false" show-icon>
          试音评语不在这里改。保存后请在该行「追加试音」，每回听音各留一笔，旧笔照原样保留。
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="setupDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitSetup">保存</el-button>
      </template>
    </el-dialog>

    <!-- 追加试音一笔 -->
    <el-dialog v-model="checkDialogVisible" title="追加试音一笔" width="820px" @closed="checkTargetId = ''">
      <el-alert type="warning" :closable="false" show-icon class="check-tip">
        本笔单独留底，不改以前的试音记录；进度表里上弦是否过关，以这一笔（若为最近一笔）为准。
      </el-alert>
      <el-form ref="checkFormRef" :model="checkForm" :rules="checkRules" label-width="100px">
        <el-form-item label="试音日期">
          <el-date-picker v-model="checkForm.checkedAt" type="date" value-format="YYYY-MM-DD" placeholder="选择试音日期" />
        </el-form-item>
        <el-form-item label="试音人" prop="checker">
          <el-input v-model="checkForm.checker" placeholder="如：周砚秋" maxlength="16" style="width: 200px" />
        </el-form-item>
        <el-form-item label="本笔毛病">
          <el-checkbox-group v-model="checkForm.defects">
            <el-checkbox v-for="defect in STRING_DEFECTS" :key="defect" :label="defect" :value="defect">{{ defect }}</el-checkbox>
          </el-checkbox-group>
          <div class="defect-hint">勾了具体毛病就不再挂「无」；一样毛病都不勾，即表示本笔无毛病（过关）。</div>
        </el-form-item>
      </el-form>

      <ToneTextEditor v-model="tone" />

      <template #footer>
        <el-button @click="checkDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCheck">记下这一笔</el-button>
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
  color: #a3968a;
  font-size: 12px;
}
.pending-detail {
  margin-top: 4px;
  font-size: 12px;
  color: #c62828;
}
.note-line {
  font-size: 12px;
  color: #5d4d3d;
  line-height: 1.7;
}
.note-label {
  display: inline-block;
  width: 26px;
  color: #8a7a68;
}
.check-history {
  padding: 8px 16px 12px 48px;
  background: #faf6f0;
}
.history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #4a3728;
  margin-bottom: 8px;
}
.check-item {
  border-left: 3px solid #d9c7ad;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: #fff;
  border-radius: 0 6px 6px 0;
}
.check-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.check-date {
  font-weight: 600;
  color: #4a3728;
}
.checker {
  font-size: 12px;
  color: #8a7a68;
}
.check-remove {
  margin-left: auto;
}
.check-notes {
  font-size: 12px;
  color: #5d4d3d;
  line-height: 1.8;
}
.check-notes .note-label {
  color: #8a7a68;
}
.check-tip {
  margin-bottom: 12px;
}
.defect-hint {
  font-size: 12px;
  color: #8a7a68;
  line-height: 1.6;
}
</style>
