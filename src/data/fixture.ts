import type { Menu } from '../engine/types';
// Appendix A fixture: "Build Your Breakfast". All ids/names/limits live ONLY here
// (served by the mock API); engine and components are fully data-driven.
// Option ids are the lowercase names used in the seed file. Prices in poisha.
export const MENU: Menu = {
  id: 'build-your-breakfast',
  name: 'Build Your Breakfast',
  basePricePoisha: 25000,
  ingredientNames: {
    egg: 'egg', sausage: 'sausage', bacon: 'bacon', tofu: 'tofu', croissant: 'croissant',
    paratha: 'paratha', toast: 'toast', hashbrown: 'hashbrown', mushroom: 'mushroom',
    beans: 'beans', cheese: 'cheese', hollandaise: 'hollandaise',
  },
  stock: {
    egg: 10, sausage: 4, bacon: 3, tofu: 5, croissant: 2, paratha: 10, toast: 20,
    hashbrown: 6, mushroom: 6, beans: 8, cheese: 4, hollandaise: 5,
    ketchup: null, chili: null,
  },
  groups: [
    { id: 'bread', name: 'Bread', min: 1, max: 1, step: 1, maxDistinct: 1, maxPerOption: 1, options: [
      { id: 'toast', name: 'Toast', pricePoisha: 0, ingredients: [{ ingredientId: 'toast', amount: 1 }] },
      { id: 'paratha', name: 'Paratha', pricePoisha: 2000, ingredients: [{ ingredientId: 'paratha', amount: 1 }] },
      { id: 'croissant', name: 'Croissant', pricePoisha: 6000, ingredients: [{ ingredientId: 'croissant', amount: 1 }] },
    ]},
    { id: 'eggs', name: 'Eggs', min: 2, max: 6, step: 2, maxDistinct: 3, maxPerOption: 6, options: [
      { id: 'fried', name: 'Fried Egg', pricePoisha: 3000, ingredients: [{ ingredientId: 'egg', amount: 1 }] },
      { id: 'scrambled', name: 'Scrambled Eggs', pricePoisha: 3500, ingredients: [{ ingredientId: 'egg', amount: 1 }] },
      { id: 'omelette', name: 'Omelette', pricePoisha: 7000, ingredients: [{ ingredientId: 'egg', amount: 2 }] },
    ]},
    { id: 'protein', name: 'Protein', min: 1, max: 3, step: 1, maxDistinct: 3, maxPerOption: 3, options: [
      { id: 'sausage', name: 'Chicken Sausage', pricePoisha: 6000, ingredients: [{ ingredientId: 'sausage', amount: 1 }] },
      { id: 'bacon', name: 'Beef Bacon', pricePoisha: 9000, ingredients: [{ ingredientId: 'bacon', amount: 1 }] },
      { id: 'tofu', name: 'Tofu', pricePoisha: 5000, ingredients: [{ ingredientId: 'tofu', amount: 1 }] },
    ]},
    { id: 'extras', name: 'Extras', min: 0, max: 4, step: 1, maxDistinct: 4, maxPerOption: 4, options: [
      { id: 'hashbrown', name: 'Hash Brown', pricePoisha: 4000, ingredients: [{ ingredientId: 'hashbrown', amount: 1 }] },
      { id: 'mushroom', name: 'Mushroom', pricePoisha: 3000, ingredients: [{ ingredientId: 'mushroom', amount: 1 }] },
      { id: 'beans', name: 'Baked Beans', pricePoisha: 2500, ingredients: [{ ingredientId: 'beans', amount: 1 }] },
      { id: 'cheese', name: 'Cheese', pricePoisha: 3500, ingredients: [{ ingredientId: 'cheese', amount: 1 }] },
    ]},
    { id: 'sauce', name: 'Sauce', min: 0, max: 2, step: 1, maxDistinct: 2, maxPerOption: 1, options: [
      { id: 'ketchup', name: 'Ketchup', pricePoisha: 0, ingredients: [] },
      { id: 'hollandaise', name: 'Hollandaise', pricePoisha: 2500, ingredients: [{ ingredientId: 'hollandaise', amount: 1 }] },
      { id: 'chili', name: 'Chili Sauce', pricePoisha: 1000, ingredients: [] },
    ]},
  ],
  rules: [
    { id: 'R1', type: 'requires', optionId: 'hollandaise', anyOf: ['scrambled', 'omelette'], message: 'Hollandaise requires Scrambled Eggs or Omelette' },
    { id: 'R2', type: 'excludes', optionId: 'tofu', excluded: ['sausage', 'bacon'], message: 'Tofu cannot be combined with Chicken Sausage or Beef Bacon' },
    { id: 'R3', type: 'overrideLimit', optionId: 'croissant', groupId: 'extras', field: 'max', value: 2, message: 'Croissant limits Extras to a maximum of 2' },
    { id: 'R4', type: 'excludes', optionId: 'chili', excluded: ['hollandaise'], message: 'Chili Sauce cannot be combined with Hollandaise' },
  ],
};
