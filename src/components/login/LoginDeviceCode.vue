<template>
  <div aria-live="polite">
    <h2
      class="mb-[12px] mt-[16px] text-[28px] font-semibold leading-[1.15] tracking-[-0.035em] text-white"
    >
      Продолжи в браузере
    </h2>
    <p class="m-0 text-[15px] leading-[1.6] text-[#b3b3b3]">
      Войди в аккаунт Яндекса и введи одноразовый код:
    </p>

    <!-- Code card -->
    <div
      class="my-[20px] flex min-h-[84px] items-center gap-[8px] rounded-[10px] border border-solid border-[#5f5f5f] bg-[#1a1a1a] px-[16px] py-[16px] flex-nowrap"
    >
      <span
        class="min-w-0 flex-1 select-all break-all text-center text-[28px] font-semibold leading-[1.2] tabular-nums tracking-[3px] text-white sm:text-[32px]"
        >{{ userCode }}</span
      >
      <button
        type="button"
        class="grid h-[44px] w-[44px] flex-none cursor-pointer place-items-center rounded-[8px] border-0 border-none bg-[#292929] text-white transition-colors hover:bg-[#383838] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none"
        :aria-label="copied ? 'Код скопирован' : 'Скопировать код'"
        :title="copied ? 'Скопировано' : 'Скопировать код'"
        @click="$emit('copy')"
      >
        <Icon :name="copied ? 'mingcute:check-line' : 'mingcute:copy-2-line'" :size="20" />
      </button>
    </div>

    <!-- Status / copy badge -->
    <div
      role="status"
      class="flex items-center justify-center gap-[10px] text-[14px] text-[#b3b3b3] flex-nowrap"
    >
      <q-spinner
        size="16px"
        class="motion-reduce:animate-none motion-reduce:[&_*]:!animate-none text-white"
      />
      <span :class="{ 'text-white font-medium': copied }">{{
        copied ? "Код скопирован в буфер! Ждём подтверждения…" : "Ждём подтверждения входа…"
      }}</span>
    </div>

    <!-- Primary browser action buttons -->
    <div class="mt-[24px] flex flex-col gap-[10px]">
      <button
        type="button"
        class="flex min-h-[50px] w-full flex-nowrap cursor-pointer items-center justify-center gap-[10px] rounded-[10px] border-0 border-none bg-white px-[20px] py-[12px] text-center text-[15px] font-semibold text-black transition-colors hover:bg-[#dedede] active:bg-[#c9c9c9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none"
        @click="$emit('copy-and-open')"
      >
        <Icon name="mingcute:external-link-line" :size="20" />
        <span>Скопировать код и открыть браузер</span>
      </button>

      <button
        type="button"
        class="flex min-h-[44px] w-full flex-nowrap cursor-pointer items-center justify-center gap-[8px] rounded-[8px] border border-solid border-[#444] bg-[#222] px-[16px] py-[10px] text-[14px] text-white transition-colors hover:bg-[#2c2c2c] active:bg-[#333] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none"
        @click="$emit('open')"
      >
        <span>Открыть страницу входа</span>
      </button>
    </div>

    <!-- Fallback URL card with copy button -->
    <div v-if="verifyUrl" class="mt-[20px] rounded-[8px] bg-[#191919] p-[14px] border border-[#2d2d2d]">
      <div class="flex items-center justify-between gap-[8px] mb-[6px]">
        <span class="text-[13px] text-[#a3a3a3]">
          Если браузер не открылся:
        </span>
        <button
          type="button"
          class="inline-flex items-center gap-[4px] px-[8px] py-[4px] rounded-[6px] bg-[#2a2a2a] text-[12px] text-white border-0 cursor-pointer hover:bg-[#383838]"
          :title="urlCopied ? 'Ссылка скопирована' : 'Скопировать ссылку'"
          @click="$emit('copy-url')"
        >
          <Icon :name="urlCopied ? 'mingcute:check-line' : 'mingcute:copy-2-line'" :size="14" />
          <span>{{ urlCopied ? "Скопировано" : "Скопировать ссылку" }}</span>
        </button>
      </div>
      <a
        :href="verifyUrl"
        class="block break-all text-[13px] text-white underline opacity-90 hover:opacity-100"
        @click.prevent="$emit('open')"
      >
        {{ verifyUrl }}
      </a>
    </div>

    <button
      type="button"
      class="mt-[20px] min-h-[42px] w-full cursor-pointer rounded-[8px] border border-solid border-[#444] bg-transparent px-[16px] py-[8px] text-[14px] text-[#aaa] transition-colors hover:bg-[#252525] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
      @click="$emit('cancel')"
    >
      Отменить вход
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  userCode: string;
  verifyUrl: string;
  copied: boolean;
  urlCopied?: boolean;
}>();

defineEmits<{
  copy: [];
  "copy-url": [];
  open: [];
  "copy-and-open": [];
  cancel: [];
}>();
</script>
