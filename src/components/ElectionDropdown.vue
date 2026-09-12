<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  options: { type: Array, required: true },
  value: { type: String, required: true },
});
const emit = defineEmits(["select"]);

const root = ref(null);
const trigger = ref(null);
const optionElements = ref([]);
const open = ref(false);
const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === props.value),
);
const selectedOption = computed(
  () => props.options[selectedIndex.value] || props.options[0],
);
const activeIndex = ref(Math.max(0, selectedIndex.value));
const labelId = `${props.id}-label`;
const valueId = `${props.id}-value`;
const menuId = `${props.id}-options`;

function setOptionRef(element, index) {
  if (element) optionElements.value[index] = element;
}
function focusOption(index) {
  if (!props.options.length) return;
  activeIndex.value = (index + props.options.length) % props.options.length;
  nextTick(() => optionElements.value[activeIndex.value]?.focus());
}
function openDropdown(index = selectedIndex.value) {
  if (!props.options.length) return;
  open.value = true;
  activeIndex.value = Math.max(0, index);
  nextTick(() => optionElements.value[activeIndex.value]?.focus());
}
function closeDropdown(focusTrigger = false) {
  open.value = false;
  if (focusTrigger) nextTick(() => trigger.value?.focus());
}
function selectOption(option) {
  emit("select", option.value);
  closeDropdown(true);
}
function selectNative(event) {
  emit("select", event.target.value);
}
function toggleDropdown() {
  open.value ? closeDropdown() : openDropdown();
}
function handleTriggerKeydown(event) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    openDropdown(selectedIndex.value);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    openDropdown(selectedIndex.value - 1);
  } else if (event.key === "Escape" && open.value) {
    event.preventDefault();
    closeDropdown();
  }
}
function handleOptionKeydown(event, index) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusOption(index + 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    focusOption(index - 1);
  } else if (event.key === "Home") {
    event.preventDefault();
    focusOption(0);
  } else if (event.key === "End") {
    event.preventDefault();
    focusOption(props.options.length - 1);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectOption(props.options[index]);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeDropdown(true);
  } else if (event.key === "Tab") {
    closeDropdown();
  }
}
function handleOutsidePointer(event) {
  if (open.value && !root.value?.contains(event.target)) closeDropdown();
}

watch(
  () => props.value,
  () => {
    if (selectedIndex.value >= 0) activeIndex.value = selectedIndex.value;
  },
);
onMounted(() => document.addEventListener("pointerdown", handleOutsidePointer));
onUnmounted(() =>
  document.removeEventListener("pointerdown", handleOutsidePointer),
);
</script>

<template>
  <div ref="root" class="dropdown">
    <span :id="labelId" class="dropdown-label">{{ label }}</span>
    <div class="dropdown-custom">
      <button
        ref="trigger"
        type="button"
        class="dropdown-trigger"
        :aria-labelledby="`${labelId} ${valueId}`"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="menuId"
        @click="toggleDropdown"
        @keydown="handleTriggerKeydown"
      >
        <span :id="valueId">{{ selectedOption?.label }}</span>
        <span class="dropdown-arrow" aria-hidden="true">▾</span>
      </button>
      <div
        v-if="open"
        :id="menuId"
        class="dropdown-menu"
        role="listbox"
        :aria-labelledby="labelId"
      >
        <div
          v-for="(option, index) in options"
          :id="`${menuId}-${option.value}`"
          :key="option.value"
          :ref="(element) => setOptionRef(element, index)"
          class="dropdown-option"
          role="option"
          tabindex="-1"
          :aria-selected="option.value === value"
          @click="selectOption(option)"
          @keydown="handleOptionKeydown($event, index)"
        >
          {{ option.label }}
        </div>
      </div>
    </div>
    <select
      :id="id"
      class="dropdown-native"
      :value="value"
      :aria-label="label"
      @change="selectNative"
    >
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.dropdown {
  position: relative;
}
.dropdown-custom {
  display: block;
}
.dropdown-label {
  display: block;
  margin-bottom: 7px;
  font-size: 10px;
  font-weight: 700;
}
.dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 41px;
  padding: 8px 11px;
  color: #263d34;
  border: 1px solid #d9dfd2;
  border-radius: 5px;
  background: #fff;
  font-size: 12px;
  text-align: left;
}
.dropdown-arrow {
  margin-left: 12px;
  color: #70806d;
  font-size: 15px;
  line-height: 1;
}
.dropdown-menu {
  position: absolute;
  z-index: 4;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  max-height: 280px;
  overflow: auto;
  padding: 4px;
  border: 1px solid #d9dfd2;
  border-radius: 5px;
  background: #fff;
  box-shadow: 0 8px 24px #203b3426;
}
.dropdown-option {
  min-height: 37px;
  padding: 9px 8px;
  border-radius: 3px;
  color: #263d34;
  font-size: 12px;
  cursor: pointer;
}
.dropdown-option:hover,
.dropdown-option:focus-visible {
  outline: 0;
  background: #eef0eb;
}
.dropdown-option[aria-selected="true"] {
  color: #fff;
  background: #203b34;
}
.dropdown-native {
  display: none;
  width: 100%;
  height: 44px;
  padding: 0 30px 0 11px;
  color: #263d34;
  border: 1px solid #d9dfd2;
  border-radius: 5px;
  background: #fff;
  font-size: 16px;
}
@media (max-width: 760px) {
  .dropdown-custom {
    display: none;
  }
  .dropdown-label {
    font-size: 11px;
  }
  .dropdown-native {
    display: block;
  }
}
</style>
