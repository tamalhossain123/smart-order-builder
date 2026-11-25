import type { Config, GroupDef, Menu, Rule, Violation } from './types';

export function optionQty(config: Config, optionId: string): number {
  for (const g of Object.values(config)) if (g[optionId]) return g[optionId];
  return 0;
}
export function hasOption(config: Config, optionId: string): boolean { return optionQty(config, optionId) > 0; }

export function findOption(menu: Menu, optionId: string) {
  for (const g of menu.groups) { const o = g.options.find((x) => x.id === optionId); if (o) return { group: g, option: o }; }
  return null;
}
export function groupOfOption(menu: Menu, optionId: string): GroupDef | null {
  return menu.groups.find((g) => g.options.some((o) => o.id === optionId)) ?? null;
}

/** Effective group limits after applying overrideLimit rules (override wins). */
export function effectiveLimits(menu: Menu, config: Config, group: GroupDef) {
  const lim = { min: group.min, max: group.max, step: group.step, maxDistinct: group.maxDistinct, maxPerOption: group.maxPerOption };
  for (const r of menu.rules) {
    if (r.type === 'overrideLimit' && r.groupId === group.id && hasOption(config, r.optionId)) {
      (lim as any)[r.field] = r.value;
    }
  }
  return lim;
}

/** Part A: pure rules engine. Returns ALL violations, never stops at the first. */
export function validate(config: Config, menu: Menu, rules: Rule[] = menu.rules): Violation[] {
  const out: Violation[] = [];
  for (const group of menu.groups) {
    const lim = effectiveLimits(menu, config, group);
    const sel = config[group.id] ?? {};
    const entries = Object.entries(sel).filter(([, q]) => q > 0);
    const total = entries.reduce((s, [, q]) => s + q, 0);
    if (total < lim.min) out.push({ ruleId: `group-min:${group.id}`, groupId: group.id, message: `${group.name}: select at least ${lim.min}` });
    if (total > lim.max) out.push({ ruleId: `group-max:${group.id}`, groupId: group.id, message: `${group.name}: select at most ${lim.max}` });
    // step applies to the group total (Appendix A: Eggs min 2, max 6, step 2 = total egg items in steps of 2)
    if (lim.step > 1 && total % lim.step !== 0) out.push({ ruleId: `group-step:${group.id}`, groupId: group.id, message: `${group.name}: quantity must be in steps of ${lim.step}` });
    if (entries.length > lim.maxDistinct) out.push({ ruleId: `group-distinct:${group.id}`, groupId: group.id, message: `${group.name}: at most ${lim.maxDistinct} different options` });
    for (const [optId, q] of entries) {
      const opt = group.options.find((o) => o.id === optId);
      if (!opt) { out.push({ ruleId: `unknown-option:${optId}`, groupId: group.id, optionId: optId, message: `Unknown option ${optId}` }); continue; }
      if (q > lim.maxPerOption) out.push({ ruleId: `option-max:${optId}`, groupId: group.id, optionId: optId, message: `${opt.name}: at most ${lim.maxPerOption} per option` });
    }
  }
  for (const r of rules) {
    if (r.type === 'requires' && hasOption(config, r.optionId)) {
      if (!r.anyOf.some((id) => hasOption(config, id))) out.push({ ruleId: r.id, optionId: r.optionId, message: r.message });
    }
    if (r.type === 'excludes' && hasOption(config, r.optionId)) {
      for (const ex of r.excluded) if (hasOption(config, ex)) out.push({ ruleId: r.id, optionId: r.optionId, message: r.message });
    }
    if (r.type === 'overrideLimit' && hasOption(config, r.optionId)) {
      const group = menu.groups.find((g) => g.id === r.groupId)!;
      const total = Object.values(config[group.id] ?? {}).reduce((s, q) => s + q, 0);
      if (r.field === 'max' && total > r.value) out.push({ ruleId: r.id, optionId: r.optionId, groupId: group.id, message: r.message });
    }
  }
  return out;
}
