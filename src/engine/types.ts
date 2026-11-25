export interface IngredientUse { ingredientId: string; amount: number }
export interface OptionDef {
  id: string; name: string; pricePoisha: number;
  ingredients: IngredientUse[]; // empty + unlimited flag handled by stock map
}
export interface GroupDef {
  id: string; name: string; min: number; max: number; step: number;
  maxDistinct: number; maxPerOption: number;
  options: OptionDef[];
}
export type Rule =
  | { id: string; type: 'requires'; optionId: string; anyOf: string[]; message: string }
  | { id: string; type: 'excludes'; optionId: string; excluded: string[]; message: string }
  | { id: string; type: 'overrideLimit'; optionId: string; groupId: string; field: 'max' | 'min' | 'maxDistinct' | 'maxPerOption'; value: number; message: string };
export interface Menu {
  id: string; name: string; basePricePoisha: number;
  groups: GroupDef[]; rules: Rule[];
  stock: Record<string, number | null>; // null = unlimited
  ingredientNames: Record<string, string>;
}
export type Config = Record<string, Record<string, number>>; // groupId -> optionId -> qty
export interface Violation { ruleId: string; groupId?: string; optionId?: string; message: string }
export interface CartLine { lineId: string; config: Config; qty: number; idempotencyKey: string; reservedUntil: number | null; expired: boolean }
export interface PriceBreakdown {
  unitSubtotal: number; p2Discount: number; p1Discount: number; lineUnitTotal: number; lineTotal: number;
}
export interface CartPrice {
  lines: PriceBreakdown[]; subtotal: number;
  cartDiscount: number; discountCode: 'C1' | 'C2' | null; couponRejected?: string;
  vat: number; payable: number; // payable in poisha, rounded to whole BDT (multiple of 100)
}
export interface OrderLine { config: Config; qty: number; lineTotal: number; unitSubtotal: number }
export interface Order {
  orderId: string; createdAt: number; lines: OrderLine[];
  subtotal: number; discount: number; discountCode: 'C1' | 'C2' | null;
  vat: number; total: number; paymentMethod: string; couponCode?: string | null;
}
