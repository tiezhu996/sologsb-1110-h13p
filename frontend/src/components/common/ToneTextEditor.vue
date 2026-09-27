<script setup lang="ts">
import type { ToneDraft } from '../../types/stringing';

const props = defineProps<{
  modelValue: ToneDraft;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: ToneDraft): void }>();

function patch(key: keyof ToneDraft, value: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}
</script>

<template>
  <div class="tone-editor">
    <el-form label-position="top">
      <el-form-item label="散音评语（纯文本）">
        <el-input :model-value="modelValue.sanNote" type="textarea" :rows="2" maxlength="120" show-word-limit placeholder="散音评语" @input="(v: string) => patch('sanNote', v)" />
      </el-form-item>
      <el-form-item label="按音评语（纯文本）">
        <el-input :model-value="modelValue.anNote" type="textarea" :rows="2" maxlength="120" show-word-limit placeholder="按音评语" @input="(v: string) => patch('anNote', v)" />
      </el-form-item>
      <el-form-item label="泛音评语（纯文本）">
        <el-input :model-value="modelValue.fanNote" type="textarea" :rows="2" maxlength="120" show-word-limit placeholder="泛音评语" @input="(v: string) => patch('fanNote', v)" />
      </el-form-item>
      <el-form-item label="九德文字简述">
        <el-input :model-value="modelValue.nineVirtues" type="textarea" :rows="2" maxlength="120" show-word-limit placeholder="九德文字简述" @input="(v: string) => patch('nineVirtues', v)" />
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.tone-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
